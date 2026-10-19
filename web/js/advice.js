// "Advice" panel: the AI's recommendation for my turn, and where to put
// my cube (at setup, or as a penalty after a "no").

import { setMarkers, seatLabel } from './state.js';
import { matchActive } from './match.js';
import { hexRef } from './hexref.js';
import { t } from './i18n.js';

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
    if (!me) return t('advice.spectator');
    if (this.app.analysis.blocked) return this.app.analysis.blocked;
    if (!game.known[me]) return t('advice.needClue');
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
      this.app.toast(t('play.inMatch'));
      return;
    }
    const r = this.advice.result;
    if (r?.mode === 'cube' && r.data.some((c) => c.x === x && c.y === y)) {
      this.placeCube(x, y);
    } else {
      this.app.toast(t('advice.usePlay'));
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
    this.app.toast(t('advice.placed', { hex: `${x},${y}` }));
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
    else if (!r || r.mode !== mode) body = `<p class="status muted">${t('advice.thinking')}</p>`;
    else body = mode === 'cube' ? this.cubeBody(r.data) : this.turnBody(r.data);

    this.root.innerHTML = `
      <div class="field">
        <div class="seg">
          <button data-mode="turn" class="${mode === 'turn' ? 'on' : ''}">${t('advice.myTurn')}</button>
          <button data-mode="cube" class="${mode === 'cube' ? 'on' : ''}">${t('advice.placeCube')}</button>
        </div>
        ${a.pending && r ? `<span class="muted">${t('common.updating')}</span>` : ''}
      </div>
      ${body}
      <details class="settings"><summary>${t('advice.settings')}</summary>
        <label class="slider">${t('advice.lambda')} <b>${ui.lambda.toFixed(2)}</b>
          <input type="range" id="lambda" min="0" max="1.5" step="0.05" value="${ui.lambda}"></label>
        <label class="slider">${t('advice.winValue')} <b>${t('advice.bits', { n: ui.winValue })}</b>
          <input type="range" id="win-value" min="1" max="40" step="1" value="${ui.winValue}"></label>
        <p class="hint">${t('advice.settingsHint')}</p>
      </details>`;

    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-mode]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.adviceMode = b.dataset.mode))));
    q('[data-answer]').forEach((b) => (b.onclick = () => {
      const ask = r.data.ask;
      const cube = b.dataset.answer === 'cube';
      this.record({ player: ask.player, x: ask.x, y: ask.y, ...(cube ? { cube: true } : {}) }, cube ? 'cube' : null);
      if (cube) this.app.toast(t('advice.penalty'));
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
      rec = `<div class="rec"><div class="rec-action">${t('advice.searchAt', { hex: `<b>${hexRef(d.search.x, d.search.y)}</b>` })}</div>
        <div class="muted">${t('advice.searchWhy', { p: pct(d.search.p), gain: bits(d.search.gain), leak: bits(d.search.leak) })}</div></div>`;
    } else if (d.ask) {
      rec = `<div class="rec"><div class="rec-action">${t('advice.askAbout', { player: name(d.ask.player), hex: `<b>${hexRef(d.ask.x, d.ask.y)}</b>` })}</div>
        <div class="muted">${t('advice.askWhy', { p: pct(d.ask.pYes), gain: bits(d.ask.gain), leak: bits(d.ask.leak) })}</div>
        ${matchActive(this.app.store.state) ? '' : `<div class="actions answer"><span>${t('advice.theyPlaced')}</span>
          <button data-answer="disc">● ${t('common.disc')}</button><button data-answer="cube">■ ${t('common.cube')}</button></div>`}</div>`;
    } else {
      rec = `<p class="status warn">${t('advice.noAction')}</p>`;
    }
    const ms = moves(d);
    return `
      <p class="status">${t('advice.status', { count: d.locations, bits: bits(d.entropy) })}</p>
      ${rec}
      <h3>${t('advice.bestMoves')}</h3>
      <table class="advice"><thead><tr><th>#</th><th>${t('advice.col.move')}</th><th>${t('advice.col.hex')}</th>
        <th title="${t('advice.col.winTip')}">${t('advice.col.win')}</th><th title="${t('advice.col.discTip')}">${t('advice.col.disc')}</th>
        <th title="${t('advice.col.gainTip')}">${t('advice.col.gain')}</th><th title="${t('advice.col.leakTip')}">${t('advice.col.leak')}</th><th title="${t('advice.col.scoreTip')}">${t('advice.col.score')}</th></tr></thead>
      <tbody>${ms.map((m, i) => `<tr class="${m.kind}"><td>${i + 1}</td>
        <td>${m.kind === 'search' ? `<b>${t('advice.search')}</b>` : t('advice.ask', { player: name(m.player) })}</td><td>${hexRef(m.x, m.y)}</td>
        <td>${m.kind === 'search' ? pct(m.p) : '–'}</td><td>${m.kind === 'ask' ? pct(m.pYes) : '–'}</td>
        <td>${bits(m.gain)}</td><td>${bits(m.leak)}</td><td>${m.score.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  }

  cubeBody(cubes) {
    if (!cubes.length) return `<p class="status warn">${t('advice.noCube')}</p>`;
    const top = cubes.slice(0, TOP);
    const worst = cubes.at(-1);
    return `
      <p class="hint">${t('advice.cubeHint')}</p>
      <table class="advice"><thead><tr><th>#</th><th>${t('advice.col.hex')}</th><th>${t('advice.col.bits')}</th><th></th></tr></thead>
      <tbody>${top.map((c, i) => `<tr><td>${i + 1}</td><td>${hexRef(c.x, c.y)}</td><td>${bits(c.bits)}</td>
        <td>${matchActive(this.app.store.state) ? '' : `<button data-place="${c.x},${c.y}">${t('advice.place')}</button>`}</td></tr>`).join('')}</tbody></table>
      <p class="hint">${t('advice.worst', { hex: hexRef(worst.x, worst.y), bits: bits(worst.bits) })}</p>`;
  }
}
