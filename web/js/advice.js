// "Advice" panel: the AI's recommendation for my turn, and where to put
// my cube (at setup, or as a penalty after a "no").

import { setMarkers, seatLabel } from './state.js';
import { matchActive } from './match.js';
import { hexRef } from './hexref.js';

const pct = (p) => (p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const bits = (b) => b.toFixed(2);
const TOP = 6;

// moves merges questions and searches into one ranking by score.
const moves = (d) =>
  [...d.questions.slice(0, TOP).map((q) => ({ kind: 'ask', ...q })), ...(d.searches ?? []).map((s) => ({ kind: 'search', ...s }))]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP + 2);

export class AdvicePanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    // The latest advice, for the game state it was computed for.
    this.advice = { key: '', result: null, error: null, pending: false };
  }

  // request fetches advice when the game, seat, mode or settings change.
  request() {
    const { game, me, ui } = this.app.store.state;
    const mode = ui.adviceMode;
    const key = JSON.stringify([game, me, mode, ui.lambda, ui.winValue]);
    const a = this.advice;
    if (key === a.key) return;
    a.key = key;
    a.pending = true;
    const op = mode === 'cube' ? 'adviseCube' : 'adviseTurn';
    this.app.engine.latest('advice', op, { game, player: me, lambda: ui.lambda, winValue: ui.winValue }).then(
      (result) => {
        if (result === undefined || a.key !== key) return;
        Object.assign(a, { result: { mode, data: result }, error: null, pending: false });
        this.app.rerender();
      },
      (err) => {
        if (a.key !== key) return;
        Object.assign(a, { result: null, error: err.message, pending: false });
        this.app.rerender();
      },
    );
  }

  // blocker explains why advice can't be given yet, or returns null.
  blocker() {
    const { game, me } = this.app.store.state;
    if (!me) return 'You are a spectator: pick your colour and clue in the <b>Me</b> tab to get advice.';
    if (this.app.analysis.blocked) return this.app.analysis.blocked;
    if (!game.known[me]) return 'Set your clue in the <b>Me</b> tab first: advice depends on what only you know.';
    return null;
  }

  overlay() {
    const o = this.app.viableOverlay();
    const r = this.advice.result;
    if (this.blocker() || !r) return o;
    const mark = (x, y, kind, label) => {
      const k = `${x},${y}`;
      if (!o.has(k) || o.get(k).label == null) o.set(k, { ...o.get(k), kind, label });
    };
    if (r.mode === 'cube') {
      r.data.slice(0, TOP).forEach((c, i) => mark(c.x, c.y, 'cube-spot', i + 1));
    } else {
      const { ask, search } = r.data;
      if (search) mark(search.x, search.y, 'best', '1');
      if (ask) mark(ask.x, ask.y, 'best', '1');
      moves(r.data).forEach((m, i) => mark(m.x, m.y, m.kind, i + 1));
    }
    return o;
  }

  onHex(x, y) {
    if (matchActive(this.app.store.state)) {
      this.app.toast('During a match, moves are made in the vs AI tab.');
      return;
    }
    const r = this.advice.result;
    if (r?.mode === 'cube' && r.data.some((c) => c.x === x && c.y === y)) {
      this.placeCube(x, y);
    } else {
      this.app.toast('Use Play to place markers; here you can place your recommended cube.');
    }
  }

  // record adds a marker (an answer to my question, or my cube) and, after
  // a "no", switches to penalty-cube advice, as the rules require.
  record(marker, then) {
    this.app.store.update((s) => {
      setMarkers(s, [...s.game.markers, marker]);
      if (then) s.ui.adviceMode = then;
    });
  }

  placeCube(x, y) {
    const { me } = this.app.store.state;
    this.record({ player: me, x, y, cube: true }, 'turn');
    this.app.toast(`Placed your cube on ${x},${y}.`);
  }

  render() {
    const { ui } = this.app.store.state;
    const block = this.blocker();
    if (!block) this.request();
    const a = this.advice;
    const r = a.result;
    const mode = ui.adviceMode;

    let body;
    if (block) body = `<p class="status warn">${block}</p>`;
    else if (a.error) body = `<p class="status warn">⚠ ${a.error}</p>`;
    else if (!r || r.mode !== mode) body = `<p class="status muted">Thinking…</p>`;
    else body = mode === 'cube' ? this.cubeBody(r.data) : this.turnBody(r.data);

    this.root.innerHTML = `
      <div class="field">
        <div class="seg">
          <button data-mode="turn" class="${mode === 'turn' ? 'on' : ''}">My turn</button>
          <button data-mode="cube" class="${mode === 'cube' ? 'on' : ''}">Place a cube</button>
        </div>
        ${a.pending && r ? '<span class="muted">Updating…</span>' : ''}
      </div>
      ${body}
      <details class="settings"><summary>Settings</summary>
        <label class="slider">Avoid helping others (λ) <b>${ui.lambda.toFixed(2)}</b>
          <input type="range" id="lambda" min="0" max="1.5" step="0.05" value="${ui.lambda}"></label>
        <label class="slider">Value of a win <b>${ui.winValue} bits</b>
          <input type="range" id="win-value" min="1" max="40" step="1" value="${ui.winValue}"></label>
        <p class="hint">Moves are scored as value × chance of winning + what you learn − λ × what others learn.
          Defaults (λ 0.5, win 16 bits) won most often in AI-vs-AI self-play.</p>
      </details>`;

    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-mode]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.adviceMode = b.dataset.mode))));
    q('[data-answer]').forEach((b) => (b.onclick = () => {
      const ask = r.data.ask;
      const cube = b.dataset.answer === 'cube';
      this.record({ player: ask.player, x: ask.x, y: ask.y, ...(cube ? { cube: true } : {}) }, cube ? 'cube' : null);
      if (cube) this.app.toast('A "no" costs you a cube: here is where to put it.');
    }));
    q('[data-place]').forEach((b) => (b.onclick = () => {
      const [x, y] = b.dataset.place.split(',').map(Number);
      this.placeCube(x, y);
    }));
    const slider = (id, field) => {
      const el = this.root.querySelector(id);
      el.onchange = () => this.app.store.update((s) => (s.ui[field] = +el.value));
    };
    slider('#lambda', 'lambda');
    slider('#win-value', 'winValue');
  }

  turnBody(d) {
    const name = (p) => seatLabel(this.app.store.state.game, p);
    let rec;
    if (d.search) {
      rec = `<div class="rec"><div class="rec-action">Search <b>${hexRef(d.search.x, d.search.y)}</b></div>
        <div class="muted">${pct(d.search.p)} chance the cryptid is there; if not, expected to teach you ${bits(d.search.gain)} bits and give others ${bits(d.search.leak)}.
        Place your disc, then each player answers in turn; record their answers in <b>Play</b>.</div></div>`;
    } else if (d.ask) {
      rec = `<div class="rec"><div class="rec-action">Ask ${name(d.ask.player)} about <b>${hexRef(d.ask.x, d.ask.y)}</b></div>
        <div class="muted">${pct(d.ask.pYes)} chance of a disc. Expected to teach you ${bits(d.ask.gain)} bits and give others ${bits(d.ask.leak)}.</div>
        ${matchActive(this.app.store.state) ? '' : `<div class="actions answer"><span>They placed:</span>
          <button data-answer="disc">● Disc</button><button data-answer="cube">■ Cube</button></div>`}</div>`;
    } else {
      rec = '<p class="status warn">No legal action.</p>';
    }
    const ms = moves(d);
    return `
      <p class="status">Cryptid is on one of <b>${d.locations}</b> hexes from your view (${bits(d.entropy)} bits of uncertainty).</p>
      ${rec}
      <h3>Best moves</h3>
      <table class="advice"><thead><tr><th>#</th><th>Move</th><th>Hex</th>
        <th title="Chance this move wins the game">Win</th><th title="Chance of a disc (questions)">Disc</th>
        <th title="Bits you learn (if it doesn't win)">Gain</th><th title="Bits others learn">Leak</th><th title="Overall score">Score</th></tr></thead>
      <tbody>${ms.map((m, i) => `<tr class="${m.kind}"><td>${i + 1}</td>
        <td>${m.kind === 'search' ? '<b>Search</b>' : `Ask ${name(m.player)}`}</td><td>${hexRef(m.x, m.y)}</td>
        <td>${m.kind === 'search' ? pct(m.p) : '–'}</td><td>${m.kind === 'ask' ? pct(m.pYes) : '–'}</td>
        <td>${bits(m.gain)}</td><td>${bits(m.leak)}</td><td>${m.score.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  }

  cubeBody(cubes) {
    if (!cubes.length) return '<p class="status warn">Nowhere legal to place a cube.</p>';
    const top = cubes.slice(0, TOP);
    return `
      <p class="hint">Hexes your clue rules out, least revealing first. Bits = how much the cube would tell the other players.</p>
      <table class="advice"><thead><tr><th>#</th><th>Hex</th><th>Bits</th><th></th></tr></thead>
      <tbody>${top.map((c, i) => `<tr><td>${i + 1}</td><td>${hexRef(c.x, c.y)}</td><td>${bits(c.bits)}</td>
        <td>${matchActive(this.app.store.state) ? '' : `<button data-place="${c.x},${c.y}">Place</button>`}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Worst option: ${hexRef(cubes.at(-1).x, cubes.at(-1).y)} at ${bits(cubes.at(-1).bits)} bits. Tap a numbered hex to place there.</p>`;
  }
}
