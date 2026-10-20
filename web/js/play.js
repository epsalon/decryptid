// "Play" panel: record discs and cubes as they are placed, and see what
// the solver makes of them.

import { setMarkers, undo, redo, ruleLabel, seatLabel, seatColors, seatName, colorName } from './state.js';
import { t } from './i18n.js';
import { hexRef } from './hexref.js';
import { typing } from './keys.js';

// tapMarker works out what tapping hex (x, y) does with the selected tool.
// Taps toggle, and follow the rules: at most one cube per hex, and one piece
// per player per hex. A disc may go on a cubed hex, since what is known is
// not always entered in play order, and a new cube replaces the one there.
// It returns the new markers (null if nothing changes) and a message to
// show (or null).
export function tapMarker(game, { player, cube }, x, y) {
  const here = game.markers.filter((m) => m.x === x && m.y === y);
  const mine = here.find((m) => m.player === player);
  const otherCube = cube ? here.find((m) => m.cube && m.player !== player) : null;
  if (mine && !!mine.cube === cube) {
    return { markers: game.markers.filter((m) => m !== mine), message: null }; // tap again to remove
  }
  const markers = game.markers.filter((m) => m !== mine && m !== otherCube);
  markers.push(cube ? { player, x, y, cube: true } : { player, x, y });
  let message = null;
  if (otherCube) message = t('play.cubed', { player: seatName(game, otherCube.player) });
  else if (mine) message = t(mine.cube ? 'play.replacedCube' : 'play.replacedDisc', { player: seatName(game, player) });
  return { markers, message };
}

export class PlayPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  // onKey handles the Play tab's keyboard shortcuts: a color's first letter
  // selects its cube (with Shift, its disc), and Space
  // switches between disc and cube. Undo/redo is handled in app.js.
  onKey(e) {
    const { ui, game, match } = this.app.store.state;
    if (ui.tab !== 'play' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (typing(e)) return;
    if (match && match.phase !== 'over') return;
    if (e.key === ' ') {
      e.preventDefault(); // don't scroll the page
      this.app.store.update((s) => (s.ui.tool.cube = !s.ui.tool.cube));
      return;
    }
    const color = KEYS[e.key.toLowerCase()];
    if (!color) return;
    const p = seatColors(game).indexOf(color) + 1;
    if (!p) {
      this.app.toast(t('play.notPlaying', { color: colorName(color) }));
      return;
    }
    e.preventDefault();
    this.app.store.update((s) => {
      s.ui.tool.player = p;
      s.ui.tool.cube = !e.shiftKey;
    });
  }

  overlay() {
    return this.app.viableOverlay();
  }

  // onHex places or removes the selected marker.
  onHex(x, y) {
    const { game, ui, match } = this.app.store.state;
    if (match && match.phase !== 'over') {
      this.app.toast(t('play.inMatch'));
      return;
    }
    const { markers, message } = tapMarker(game, ui.tool, x, y);
    if (message) this.app.toast(message);
    if (markers) this.app.store.update((s) => setMarkers(s, markers));
  }

  render() {
    const { game, ui, me, history } = this.app.store.state;
    const { summary, error, pending, blocked } = this.app.analysis;
    const tool = ui.tool;
    if (tool.player > game.players) tool.player = 1;

    let status;
    if (blocked) status = `<p class="status warn">${blocked}</p>`;
    else if (error) status = `<p class="status warn">⚠ ${t('play.error', { error })}</p>`;
    else if (!summary) status = `<p class="status muted">${t('play.analyzing')}</p>`;
    else {
      const n = summary.locations.length;
      const view = game.known[me] ? t('play.withClue') : t('play.markersOnly');
      const found = n === 1 ? t('play.found', { view }) : t('play.onOneOf', { count: n, view });
      status = n
        ? `<p class="status ${n === 1 ? 'ok' : ''}">${found}${pending ? ` <span class="muted">${t('common.updating')}</span>` : ''}</p>`
        : `<p class="status warn">${t('play.noWorld')}</p>`;
    }

    const total = summary?.worlds || 1;
    const top = (summary?.locations ?? []).slice(0, 8);
    this.root.innerHTML = `
      ${status}
      <h3>${t('play.place')}</h3>
      <div class="chips">${Array.from({ length: game.players }, (_, i) => `
        <button data-tool-player="${i + 1}" class="chip ${tool.player === i + 1 ? 'on' : ''}">
          ${seatLabel(game, i + 1)}${i + 1 === me ? ` ${t('common.you')}` : ''}</button>`).join('')}
      </div>
      <div class="field">
        <div class="seg">
          <button data-cube="0" class="${tool.cube ? '' : 'on'}">● ${t('common.disc')}</button>
          <button data-cube="1" class="${tool.cube ? 'on' : ''}">■ ${t('common.cube')}</button>
        </div>
        <div class="seg">
          <button data-act="undo" ${history.past.length ? '' : 'disabled'}>↶ ${t('play.undo')}</button>
          <button data-act="redo" ${history.future.length ? '' : 'disabled'}>↷ ${t('play.redo')}</button>
        </div>
      </div>
      <p class="hint">${t('play.tapHint', { count: game.markers.length })}</p>
      <label class="check"><input type="checkbox" id="show-viable" ${ui.overlay === 'viable' ? 'checked' : ''}> ${t('play.highlight')}</label>
      ${summary ? `
      <h3>${t('play.likeliest')}</h3>
      <ol class="locs">${top.map((l) => `<li><span>${hexRef(l.x, l.y)}</span><span class="bar"><i style="width:${(100 * l.worlds) / summary.locations[0].worlds}%"></i></span><span>${pct(l.worlds / total)}</span></li>`).join('')}</ol>
      ${summary.locations.length > top.length ? `<p class="hint">${t('common.andMore', { count: summary.locations.length - top.length })}</p>` : ''}
      <h3>${t('play.possibleClues')}</h3>
      ${summary.playerRules.map((rs, i) => `
        <details><summary>${seatLabel(game, i + 1)}${i + 1 === me ? ` ${t('common.you')}` : ''}: ${t('play.clueCount', { count: rs.length })}</summary>
          <ul class="clues">${rs.slice(0, 12).map((r) => `<li><span>${ruleLabel(r.rule)}</span><span>${pct(r.worlds / total)}</span></li>`).join('')}
          ${rs.length > 12 ? `<li class="muted">${t('common.andMore', { count: rs.length - 12 })}</li>` : ''}</ul></details>`).join('')}` : ''}`;

    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-tool-player]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.tool.player = +b.dataset.toolPlayer))));
    q('[data-cube]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.tool.cube = b.dataset.cube === '1'))));
    q('[data-act="undo"]').forEach((b) => (b.onclick = () => this.app.store.update((s) => undo(s))));
    q('[data-act="redo"]').forEach((b) => (b.onclick = () => this.app.store.update((s) => redo(s))));
    this.root.querySelector('#show-viable').onchange = (e) =>
      this.app.store.update((s) => (s.ui.overlay = e.target.checked ? 'viable' : 'none'));
  }
}

// Shortcut keys: each color's first letter.
const KEYS = { y: 'yellow', r: 'red', g: 'green', c: 'cyan', p: 'purple' };

const pct = (p) => (p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
