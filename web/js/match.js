// "vs AI" panel: a full game against AI opponents on a random board.
//
// The engine deals the board and every seat's secret clue (newMatch). The
// rules of play live here: two rounds of setup cubes, then turns of asking
// or searching, a penalty cube after a "no" or a failed search, and a win
// when a search gets a disc from everyone. AI seats decide with the same
// advisors as the self-play simulator, seeing only their own clue.

import { PLAYERS, ruleLabel, boardKey, seatLabel, seatName, swatch } from './state.js';
import { t } from './i18n.js';
import { hexRef, linkHexRefs } from './hexref.js';
import { typing } from './keys.js';

// Difficulty levels map to the self-play policies (see sim.Policies).
export const DIFFICULTY = {
  easy: { lambda: 0.5, searchAt: 1, winValue: 0, random: true },
  normal: { lambda: 0.5, searchAt: 1, winValue: 0 },
  hard: { lambda: 0.5, winValue: 16 },
};

const AI_DELAY = 700; // ms between AI moves, so they can be followed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Seats are turn order; names and dots come from the current game's colors.
let currentGame = () => null;
const name = (p) => seatName(currentGame(), p);
const dot = (p) => seatLabel(currentGame(), p);
const ordinal = (n) => t('match.position', { count: n, ordinal: true });

// The log stores message keys and values, not text, so it shows in the
// current language: {k: 'ask', p, j, hex, yes}, etc. (Old logs were text.)
const logLine = (e) =>
  typeof e === 'string' ? e : t(`match.log.${e.k}`, { ...e, p: e.p && name(e.p), j: e.j && name(e.j), mode: e.mode && t(`setup.${e.mode}`).toLowerCase() });

// matchActive reports whether a match is running (and so editing the
// game by hand is locked).
export const matchActive = (state) => !!state.match && state.match.phase !== 'over';

// dropStaleMatch forgets a finished match once the game has moved on (the
// setup was edited, or another game loaded), so its log and reveal never
// refer to seats or a board that are gone.
export function dropStaleMatch(state) {
  const m = state.match;
  if (!m || m.phase !== 'over') return;
  const fits = m.board ? m.board === boardKey(state.game) : m.rules?.length === state.game.players && m.seat <= state.game.players;
  if (!fits) state.match = null;
}

export class MatchPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    currentGame = () => app.store.state.game;
    document.addEventListener('keydown', (e) => this.onKey(e));
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

  log(entry) {
    this.update((m) => m.log.unshift(entry));
  }

  piecesAt(x, y) {
    return this.app.store.state.game.markers.filter((m) => m.x === x && m.y === y);
  }

  async start(opts) {
    const r = await this.app.engine.call('newMatch', { players: opts.players, advanced: opts.advanced, seed: Date.now() % 1e9 });
    const n = opts.players;
    const seat = opts.seat || 1 + Math.floor(Math.random() * n);
    // My color at my seat; the AIs get other colors at random.
    const others = PLAYERS.map((c) => c.name).filter((c) => c !== opts.color).sort(() => Math.random() - 0.5);
    const colors = others.slice(0, n - 1);
    colors.splice(seat - 1, 0, opts.color);
    const queue = [...Array(n).keys()].map((i) => i + 1);
    this.app.store.update((s) => {
      s.game = { ...r.game, colors, markers: [], known: { [seat]: r.rules[seat - 1] } };
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
        log: [{ k: 'start', n, mode: r.game.advanced ? 'advanced' : 'basic', p: seat }],
        winner: 0,
        last: null,
        board: null, // set below, once the game is in place
      };
      s.match.board = boardKey(s.game);
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
      this.app.toast(t('match.aiError', { error: e.message }));
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
    this.log({ k: 'pass', p });
    this.endTurn();
  }

  placeCube(p, x, y) {
    this.update((m, g) => {
      g.markers.push({ player: p, x, y, cube: true });
      m.last = { x, y };
      m.log.unshift({ k: m.phase === 'setup' ? 'setupCube' : 'penaltyCube', p, hex: `${x},${y}` });
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
      m.log.unshift({ k: yes ? 'askDisc' : 'askCube', p, j, hex: `${x},${y}` });
    });
    this.afterAction(p, yes);
  }

  search(p, x, y) {
    if (!this.piecesAt(x, y).some((m) => m.player === p)) {
      this.update((m, g) => g.markers.push({ player: p, x, y }));
    }
    this.update((m) => {
      m.last = { x, y };
      m.log.unshift({ k: 'search', p, hex: `${x},${y}` });
    });
    const n = this.app.store.state.game.players;
    for (let i = 1; i < n; i++) {
      const k = ((p - 1 + i) % n) + 1;
      if (this.piecesAt(x, y).some((m) => m.player === k && !m.cube)) continue;
      if (!this.answer(k, x, y)) {
        this.log({ k: 'searchFails', p: k });
        return this.afterAction(p, false);
      }
    }
    this.update((m) => {
      m.phase = 'over';
      m.winner = p;
      m.log.unshift({ k: 'win', p, hex: `${x},${y}` });
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
    if (!confirm(t('match.confirmGiveUp'))) return;
    this.update((m) => {
      m.phase = 'over';
      m.log.unshift({ k: 'gaveUp' });
    });
  }

  // onKey: on my turn, A asks and S searches; a color's letter picks whom
  // to ask. The hex comes from a tap or the board cursor (arrows + Enter).
  onKey(e) {
    const m = this.match;
    const n = this.need();
    if (this.app.store.state.ui.tab !== 'match' || !n || n.who !== m.seat || n.what !== 'turn') return;
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 's') {
      this.action = k === 'a' ? 'ask' : 'search';
    } else {
      const color = { y: 'yellow', r: 'red', g: 'green', c: 'cyan', b: 'cyan', p: 'purple' }[k];
      const p = color && Array.from({ length: this.app.store.state.game.players }, (_, i) => i + 1).find((q) => name(q) === color);
      if (!p || p === m.seat) return;
      this.action = 'ask';
      this.target = p;
    }
    e.preventDefault();
    this.render();
  }

  // onHex handles the human's taps: their setup or penalty cube, or the
  // hex for their question or search.
  onHex(x, y) {
    const m = this.match;
    const n = this.need();
    if (!m || !n) return this.app.toast(t(m ? 'match.over' : 'match.startFirst'));
    if (n.who !== m.seat || this.busy) return this.app.toast(t('match.waitFor', { player: name(n.who) }));
    const here = this.piecesAt(x, y);
    if (here.some((p) => p.cube)) return this.app.toast(t('match.cubed'));
    const me = m.seat;
    if (n.what === 'cube') {
      if (this.allows(me, x, y)) return this.app.toast(t('match.cubeAllowed'));
      this.placeCube(me, x, y);
    } else if (this.action === 'search') {
      if (!this.allows(me, x, y)) return this.app.toast(t('match.searchNotAllowed'));
      this.search(me, x, y);
    } else {
      if (!this.target) return this.app.toast(t('match.chooseWhom'));
      if (here.some((p) => p.player === this.target)) return this.app.toast(t('match.hasPiece', { player: name(this.target) }));
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
      const result = m.winner ? `${dot(m.winner)} ${m.winner === m.seat ? t('match.youWin') : t('match.wins', { player: name(m.winner) })}` : t('match.gameOver');
      status = `<div class="rec"><div class="rec-action">${result}</div>
        <div class="muted">${t('match.wasOn', { hex: hexRef(m.location.x, m.location.y) })}</div></div>
        <h3>${t('match.everyonesClues')}</h3><ul class="clues">${m.rules.map((r, i) => `<li><span>${dot(i + 1)}${i + 1 === m.seat ? ` ${t('common.you')}` : ''}</span><span>${ruleLabel(r)}</span></li>`).join('')}</ul>`;
    } else if (!mine) {
      status = `<p class="status">${dot(n.who)} ${t(n.what === 'cube' ? 'match.placingCube' : 'match.takingTurn', { player: name(n.who) })}</p>`;
    } else if (n.what === 'cube') {
      status = `<div class="rec"><div class="rec-action">${t(m.phase === 'setup' ? 'match.placeSetupCube' : 'match.placePenaltyCube')}</div>
        <div class="muted">${t('match.cubeHint')}</div></div>`;
    } else {
      const others = [...Array(game.players).keys()].map((i) => i + 1).filter((p) => p !== m.seat);
      status = `<div class="rec"><div class="rec-action">${t('match.yourTurn')}</div>
        <div class="seg"><button data-action="ask" class="${this.action === 'ask' ? 'on' : ''}">${t('advice.askShort')}</button><button data-action="search" class="${this.action === 'search' ? 'on' : ''}">${t('advice.search')}</button></div>
        <p class="hint keys">${t('match.keys')}</p>
        ${this.action === 'ask'
          ? `<p class="hint">${t('match.askWhom')}</p><div class="chips">${others.map((p) => `<button data-target="${p}" class="chip ${this.target === p ? 'on' : ''}">${dot(p)}${name(p)}</button>`).join('')}</div>`
          : `<p class="hint">${t('match.searchHint')}</p>`}</div>`;
    }
    this.root.innerHTML = `
      <p class="hint">${t('match.youAre', { dot: dot(m.seat), player: name(m.seat), level: t(`match.level.${m.difficulty}`) })}
        <span class="${ui.hideClue ? 'hidden-clue' : ''}" tabindex="0">${ruleLabel(m.rules[m.seat - 1])}</span></p>
      ${status}
      <label class="check"><input type="checkbox" id="hints" ${ui.matchHints ? 'checked' : ''}> ${t('match.hints')}</label>
      <h3>${t('match.log.title')}</h3>
      <ul class="log">${m.log.slice(0, 12).map((e) => `<li>${linkHexRefs(logLine(e))}</li>`).join('')}</ul>
      <div class="actions">${m.phase === 'over' ? `<button data-act="new">${t('match.newMatch')}</button>` : `<button data-act="giveup" class="danger">${t('match.giveUp')}</button>`}</div>`;
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
      <p>${t('match.intro')}</p>
      <div class="field"><span>${t('match.players')}</span><div class="seg">${[3, 4, 5].map((n) => `<button data-o="players" data-v="${n}" class="${o.players === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="field"><span>${t('setup.mode')}</span><div class="seg">
        <button data-o="advanced" data-v="0" class="${o.advanced ? '' : 'on'}">${t('setup.basic')}</button>
        <button data-o="advanced" data-v="1" class="${o.advanced ? 'on' : ''}">${t('setup.advanced')}</button></div></div>
      <div class="field"><span>${t('match.ai')}</span><div class="seg">${Object.keys(DIFFICULTY).map((k) => `<button data-o="difficulty" data-v="${k}" class="${o.difficulty === k ? 'on' : ''}" title="${t(`match.levelHint.${k}`)}">${t(`match.level.${k}`)}</button>`).join('')}</div></div>
      <p class="hint">${t(`match.level.${o.difficulty}`)}: ${t(`match.levelHint.${o.difficulty}`)}.</p>
      <h3>${t('match.yourColor')}</h3>
      <div class="chips">${PLAYERS.map((c) => `<button data-o="color" data-v="${c.name}" class="chip ${o.color === c.name ? 'on' : ''}">
        ${swatch(c.color, c.letter)}</button>`).join('')}</div>
      <div class="field"><span>${t('match.youPlay')}</span><div class="seg">
        <button data-o="seat" data-v="0" class="${o.seat ? '' : 'on'}">${t('match.random')}</button>
        ${[...Array(o.players).keys()].map((i) => `<button data-o="seat" data-v="${i + 1}" class="${o.seat === i + 1 ? 'on' : ''}">${ordinal(i + 1)}</button>`).join('')}</div></div>
      <p class="hint">${t('match.othersRandom')} ${o.players === 3 && !o.advanced ? t('match.threeBasic') : ''}</p>
      <div class="actions"><button data-act="start" class="primary">${t('match.start')}</button></div>
      <p class="hint">${t('match.replaces')}</p>`;
    this.root.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => this.app.store.update((s) => {
      const v = b.dataset.v;
      const k = b.dataset.o;
      s.ui.matchOpts[k] = k === 'difficulty' || k === 'color' ? v : k === 'advanced' ? v === '1' : +v;
      if (s.ui.matchOpts.seat > s.ui.matchOpts.players) s.ui.matchOpts.seat = 0;
    })));
    this.root.querySelector('[data-act="start"]').onclick = (e) => {
      e.target.disabled = true;
      e.target.textContent = t('match.dealing');
      this.start(o).catch((err) => this.app.toast(err.message));
    };
  }
}

// nextTurn passes the turn to the next seat.
function nextTurn(m, g) {
  m.current = (m.current % g.players) + 1;
  m.turn++;
}
