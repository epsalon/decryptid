// "vs AI" panel: a full game against AI opponents on a random board.
//
// The engine deals the board and every seat's secret clue (newMatch). The
// rules of play live here: two rounds of setup cubes, then turns of asking
// or searching, a penalty cube after a "no" or a failed search, and a win
// when a search gets a disc from everyone. AI seats decide with the same
// advisors as the self-play simulator, seeing only their own clue.

import { PLAYERS, ruleLabel } from './state.js';
import { hexRef, linkHexRefs } from './hexref.js';

// Difficulty levels map to the self-play policies (see sim.Policies).
export const DIFFICULTY = {
  easy: { label: 'Easy', lambda: 0.5, searchAt: 1, winValue: 0, random: true, hint: 'asks random questions' },
  normal: { label: 'Normal', lambda: 0.5, searchAt: 1, winValue: 0, hint: 'asks good questions, searches only when certain' },
  hard: { label: 'Hard', lambda: 0.5, winValue: 16, hint: 'the strongest policy found in self-play' },
};

const AI_DELAY = 700; // ms between AI moves, so they can be followed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const name = (p) => PLAYERS[p - 1].name;
const dot = (p) => `<span class="dot" style="background:${PLAYERS[p - 1].color}"></span>`;

// matchActive reports whether a match is running (and so editing the
// game by hand is locked).
export const matchActive = (state) => !!state.match && state.match.phase !== 'over';

export class MatchPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.masks = null; // per seat, which hexes its clue allows
    this.masksFor = null; // match id the masks belong to
    this.busy = false; // an AI move is in progress
    this.thinking = 0; // seat currently thinking
    this.action = 'ask'; // the human's chosen action: 'ask' or 'search'
    this.target = 0; // whom the human will ask
  }

  get match() {
    return this.app.store.state.match;
  }

  // need says who must act next and how: {who, what: 'cube' | 'turn'}.
  need() {
    const m = this.match;
    if (!m || m.phase === 'over') return null;
    if (m.phase === 'setup') return { who: m.setupQueue[0], what: 'cube' };
    if (m.phase === 'penalty') return { who: m.penaltyFor, what: 'cube' };
    return { who: m.current, what: 'turn' };
  }

  async ensureMasks() {
    const m = this.match;
    if (this.masksFor === m.id) return;
    this.masks = await this.app.engine.call('masks', { game: this.app.store.state.game, rules: m.rules });
    this.masksFor = m.id;
  }

  allows(p, x, y) {
    return this.masks[p - 1][y * 12 + x];
  }

  // update changes the match (and game) state and saves it.
  update(fn) {
    this.app.store.update((s) => fn(s.match, s.game));
  }

  log(text) {
    this.update((m) => m.log.unshift(text));
  }

  piecesAt(x, y) {
    return this.app.store.state.game.markers.filter((m) => m.x === x && m.y === y);
  }

  async start(opts) {
    const r = await this.app.engine.call('newMatch', { players: opts.players, advanced: opts.advanced, seed: Date.now() % 1e9 });
    const n = opts.players;
    const seat = opts.seat || 1 + Math.floor(Math.random() * n);
    const queue = [...Array(n).keys()].map((i) => i + 1);
    this.app.store.update((s) => {
      s.game = { ...r.game, markers: [], known: { [seat]: r.rules[seat - 1] } };
      s.me = seat;
      s.history = { past: [], future: [] };
      s.match = {
        id: Date.now(),
        seat,
        difficulty: opts.difficulty,
        rules: r.rules,
        location: r.location,
        phase: 'setup',
        setupQueue: [...queue, ...queue],
        current: 1,
        penaltyFor: 0,
        turn: 1,
        log: [`New ${n}-player ${r.game.advanced ? 'advanced' : 'basic'} game. You are ${name(seat)}.`],
        winner: 0,
        last: null,
      };
    });
    this.masksFor = null;
    await this.ensureMasks();
    this.advance();
  }

  // advance plays AI moves until the human must act or the game ends.
  async advance() {
    if (this.busy || !this.match) return;
    this.busy = true;
    const id = this.match.id;
    try {
      await this.ensureMasks();
      for (;;) {
        const n = this.need();
        if (!n || n.who === this.match.seat) break;
        this.thinking = n.who;
        this.app.rerender();
        await sleep(AI_DELAY);
        if (this.match?.id !== id) return; // a new match started meanwhile
        if (n.what === 'cube') await this.aiCube(n.who);
        else await this.aiTurn(n.who);
      }
    } catch (e) {
      this.app.toast(`AI error: ${e.message}`);
    } finally {
      this.busy = false;
      this.thinking = 0;
      this.app.rerender();
    }
  }

  // view is the game as seat p sees it: every marker, and only its own clue.
  view(p) {
    return { ...this.app.store.state.game, known: { [p]: this.match.rules[p - 1] } };
  }

  async aiCube(p) {
    const opts = await this.app.engine.call('adviseCube', { game: this.view(p), player: p });
    if (!opts.length) throw new Error(`${name(p)} has nowhere to place a cube`);
    const o = DIFFICULTY[this.match.difficulty].random ? opts[Math.floor(Math.random() * opts.length)] : opts[0];
    this.placeCube(p, o.x, o.y);
  }

  async aiTurn(p) {
    const d = DIFFICULTY[this.match.difficulty];
    const r = await this.app.engine.call('adviseTurn', { game: this.view(p), player: p, lambda: d.lambda, searchAt: d.searchAt ?? 0.15, winValue: d.winValue });
    if (r.search) return this.search(p, r.search.x, r.search.y);
    let q = r.ask;
    if (q && d.random) q = r.questions[Math.floor(Math.random() * r.questions.length)];
    if (q) return this.ask(p, q.player, q.x, q.y);
    this.log(`${name(p)} passes.`);
    this.endTurn();
  }

  placeCube(p, x, y) {
    this.update((m, g) => {
      g.markers.push({ player: p, x, y, cube: true });
      m.last = { x, y };
      m.log.unshift(`${name(p)} places a ${m.phase === 'setup' ? 'setup' : 'penalty'} cube on ${x},${y}.`);
      if (m.phase === 'setup') {
        m.setupQueue.shift();
        if (!m.setupQueue.length) m.phase = 'turn';
      } else {
        m.phase = 'turn';
        nextTurn(m, g);
      }
    });
  }

  // answer has seat p mark (x, y) truthfully and reports whether it was a disc.
  answer(p, x, y) {
    const yes = this.allows(p, x, y);
    this.update((m, g) => g.markers.push(yes ? { player: p, x, y } : { player: p, x, y, cube: true }));
    return yes;
  }

  ask(p, j, x, y) {
    const yes = this.answer(j, x, y);
    this.update((m) => {
      m.last = { x, y };
      m.log.unshift(`${name(p)} asks ${name(j)} about ${x},${y}: ${yes ? 'disc' : 'cube'}.`);
    });
    this.afterAction(p, yes);
  }

  search(p, x, y) {
    if (!this.piecesAt(x, y).some((m) => m.player === p)) {
      this.update((m, g) => g.markers.push({ player: p, x, y }));
    }
    this.update((m) => {
      m.last = { x, y };
      m.log.unshift(`${name(p)} searches ${x},${y}.`);
    });
    const n = this.app.store.state.game.players;
    for (let i = 1; i < n; i++) {
      const k = ((p - 1 + i) % n) + 1;
      if (this.piecesAt(x, y).some((m) => m.player === k && !m.cube)) continue;
      if (!this.answer(k, x, y)) {
        this.log(`${name(k)} places a cube: the search fails.`);
        return this.afterAction(p, false);
      }
    }
    this.update((m) => {
      m.phase = 'over';
      m.winner = p;
      m.log.unshift(`${name(p)} found the cryptid on ${x},${y} and wins!`);
    });
  }

  // afterAction ends the turn, or first asks for a penalty cube after a "no".
  afterAction(p, ok) {
    if (ok) return this.endTurn();
    this.update((m) => {
      m.phase = 'penalty';
      m.penaltyFor = p;
    });
  }

  endTurn() {
    this.update((m, g) => nextTurn(m, g));
  }

  giveUp() {
    if (!confirm('Give up and reveal everyone\'s clue?')) return;
    this.update((m) => {
      m.phase = 'over';
      m.log.unshift('You gave up.');
    });
  }

  // onHex handles the human's taps: their setup or penalty cube, or the
  // hex for their question or search.
  onHex(x, y) {
    const m = this.match;
    const n = this.need();
    if (!m || !n) return this.app.toast(m ? 'The game is over.' : 'Start a match first.');
    if (n.who !== m.seat || this.busy) return this.app.toast(`Wait for ${name(n.who)}.`);
    const here = this.piecesAt(x, y);
    if (here.some((p) => p.cube)) return this.app.toast('That hex has a cube: no one may use it.');
    const me = m.seat;
    if (n.what === 'cube') {
      if (this.allows(me, x, y)) return this.app.toast('Your clue allows that hex. Cubes go where your clue rules the cryptid out.');
      this.placeCube(me, x, y);
    } else if (this.action === 'search') {
      if (!this.allows(me, x, y)) return this.app.toast('You can only search a hex your clue allows.');
      this.search(me, x, y);
    } else {
      if (!this.target) return this.app.toast('First choose whom to ask.');
      if (here.some((p) => p.player === this.target)) return this.app.toast(`${name(this.target)} already has a piece there.`);
      this.ask(me, this.target, x, y);
    }
    this.advance();
  }

  overlay() {
    const o = this.app.viableOverlay();
    const m = this.match;
    if (!m) return o;
    if (m.last) o.set(`${m.last.x},${m.last.y}`, { ...o.get(`${m.last.x},${m.last.y}`), kind: 'select' });
    if (m.phase === 'over') {
      const k = `${m.location.x},${m.location.y}`;
      o.set(k, { ...o.get(k), kind: 'best', label: '★' });
    }
    return o;
  }

  render() {
    const m = this.match;
    const { ui, game } = this.app.store.state;
    if (!m) return this.renderStart();
    const n = this.need();
    const mine = n && n.who === m.seat;
    let status;
    if (m.phase === 'over') {
      status = `<div class="rec"><div class="rec-action">${m.winner ? `${dot(m.winner)} ${m.winner === m.seat ? 'You win!' : `${name(m.winner)} wins.`}` : 'Game over.'}</div>
        <div class="muted">The cryptid was on ${hexRef(m.location.x, m.location.y)} (★).</div></div>
        <h3>Everyone's clues</h3><ul class="clues">${m.rules.map((r, i) => `<li><span>${dot(i + 1)} ${name(i + 1)}${i + 1 === m.seat ? ' (you)' : ''}</span><span>${ruleLabel(r)}</span></li>`).join('')}</ul>`;
    } else if (!mine) {
      status = `<p class="status">${dot(n.who)} ${name(n.who)} is ${n.what === 'cube' ? 'placing a cube' : 'taking a turn'}…</p>`;
    } else if (n.what === 'cube') {
      status = `<div class="rec"><div class="rec-action">Place a ${m.phase === 'setup' ? 'setup' : 'penalty'} cube</div>
        <div class="muted">Tap a hex your clue rules out. The Advice tab can suggest the least revealing spot.</div></div>`;
    } else {
      const others = [...Array(game.players).keys()].map((i) => i + 1).filter((p) => p !== m.seat);
      status = `<div class="rec"><div class="rec-action">Your turn</div>
        <div class="seg"><button data-action="ask" class="${this.action === 'ask' ? 'on' : ''}">Ask</button><button data-action="search" class="${this.action === 'search' ? 'on' : ''}">Search</button></div>
        ${this.action === 'ask'
          ? `<p class="hint">Ask whom? Then tap a hex.</p><div class="chips">${others.map((p) => `<button data-target="${p}" class="chip ${this.target === p ? 'on' : ''}">${dot(p)}${name(p)}</button>`).join('')}</div>`
          : '<p class="hint">Tap a hex your clue allows. If everyone else places a disc, you win.</p>'}</div>`;
    }
    this.root.innerHTML = `
      <p class="hint">You are ${dot(m.seat)} <b>${name(m.seat)}</b> · ${DIFFICULTY[m.difficulty].label} AI ·
        clue: <span class="${ui.hideClue ? 'hidden-clue' : ''}" tabindex="0">${ruleLabel(m.rules[m.seat - 1])}</span></p>
      ${status}
      <label class="check"><input type="checkbox" id="hints" ${ui.matchHints ? 'checked' : ''}> Solver hints (highlighting and the Advice tab)</label>
      <h3>Log <span class="muted">(newest first)</span></h3>
      <ul class="log">${m.log.slice(0, 12).map((l) => `<li>${linkHexRefs(l)}</li>`).join('')}</ul>
      <div class="actions">${m.phase === 'over' ? '<button data-act="new">New match</button>' : '<button data-act="giveup" class="danger">Give up</button>'}</div>`;
    const q = (s) => this.root.querySelectorAll(s);
    q('[data-action]').forEach((b) => (b.onclick = () => { this.action = b.dataset.action; this.render(); }));
    q('[data-target]').forEach((b) => (b.onclick = () => { this.target = +b.dataset.target; this.render(); }));
    q('[data-act="giveup"]').forEach((b) => (b.onclick = () => this.giveUp()));
    q('[data-act="new"]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.match = null))));
    this.root.querySelector('#hints').onchange = (e) => this.app.store.update((s) => (s.ui.matchHints = e.target.checked));
  }

  renderStart() {
    const o = this.app.store.state.ui.matchOpts;
    this.root.innerHTML = `
      <p>Play a full game against AI opponents on a random board. Your clue is dealt to you; the AIs see only their own.</p>
      <div class="field"><span>Players</span><div class="seg">${[3, 4, 5].map((n) => `<button data-o="players" data-v="${n}" class="${o.players === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="field"><span>Mode</span><div class="seg">
        <button data-o="advanced" data-v="0" class="${o.advanced ? '' : 'on'}">Basic</button>
        <button data-o="advanced" data-v="1" class="${o.advanced ? 'on' : ''}">Advanced</button></div></div>
      <div class="field"><span>AI</span><div class="seg">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-o="difficulty" data-v="${k}" class="${o.difficulty === k ? 'on' : ''}" title="${d.hint}">${d.label}</button>`).join('')}</div></div>
      <p class="hint">${DIFFICULTY[o.difficulty].label}: ${DIFFICULTY[o.difficulty].hint}.</p>
      <div class="field"><span>Your seat</span><div class="seg">
        <button data-o="seat" data-v="0" class="${o.seat ? '' : 'on'}">Random</button>
        ${[...Array(o.players).keys()].map((i) => `<button data-o="seat" data-v="${i + 1}" class="${o.seat === i + 1 ? 'on' : ''}">${dot(i + 1)}</button>`).join('')}</div></div>
      <p class="hint">Seat 1 (yellow) moves first. ${o.players === 3 && !o.advanced ? 'Three-player basic games are often decided on the first turn.' : ''}</p>
      <div class="actions"><button data-act="start" class="primary">Start match</button></div>
      <p class="hint">This replaces the game in the other tabs.</p>`;
    this.root.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => this.app.store.update((s) => {
      const v = b.dataset.v;
      const k = b.dataset.o;
      s.ui.matchOpts[k] = k === 'difficulty' ? v : k === 'advanced' ? v === '1' : +v;
      if (s.ui.matchOpts.seat > s.ui.matchOpts.players) s.ui.matchOpts.seat = 0;
    })));
    this.root.querySelector('[data-act="start"]').onclick = (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Dealing…';
      this.start(o).catch((err) => this.app.toast(err.message));
    };
  }
}

// nextTurn passes the turn to the next seat.
function nextTurn(m, g) {
  m.current = (m.current % g.players) + 1;
  m.turn++;
}
