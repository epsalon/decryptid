// "Play" panel: record discs and cubes as they are placed, and see what
// the solver makes of them.

import { setMarkers, undo, redo, ruleLabel, seat, seatLabel, seatColors } from './state.js';
import { hexRef } from './hexref.js';
import { typing } from './keys.js';

export class PlayPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  // onKey handles the Play tab's keyboard shortcuts: a colour's first letter
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
    const colour = KEYS[e.key.toLowerCase()];
    if (!colour) return;
    const p = seatColors(game).indexOf(colour) + 1;
    if (!p) {
      this.app.toast(`${colour} isn't playing.`);
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

  // onHex places or removes the selected marker. Taps toggle, and follow the
  // rules: at most one cube per hex, nothing new on a cubed hex, and one
  // piece per player per hex.
  onHex(x, y) {
    const { game, ui, match } = this.app.store.state;
    if (match && match.phase !== 'over') {
      this.app.toast('During a match, moves are made in the vs AI tab.');
      return;
    }
    const { player, cube } = ui.tool;
    const here = game.markers.filter((m) => m.x === x && m.y === y);
    const mine = here.find((m) => m.player === player);
    const otherCube = here.find((m) => m.cube && m.player !== player);
    const name = seat(game, player).name;
    let markers;
    if (mine && !!mine.cube === cube) {
      markers = game.markers.filter((m) => m !== mine); // tap again to remove
    } else if (otherCube) {
      this.app.toast(`${seat(game, otherCube.player).name} has a cube there; nothing more can go on that hex.`);
      return;
    } else {
      markers = game.markers.filter((m) => m !== mine);
      markers.push(cube ? { player, x, y, cube: true } : { player, x, y });
      if (mine) this.app.toast(`Replaced ${name}'s ${mine.cube ? 'cube' : 'disc'}.`);
    }
    this.app.store.update((s) => setMarkers(s, markers));
  }

  render() {
    const { game, ui, me, history } = this.app.store.state;
    const { summary, error, pending, blocked } = this.app.analysis;
    const tool = ui.tool;
    if (tool.player > game.players) tool.player = 1;

    let status;
    if (blocked) status = `<p class="status warn">${blocked}</p>`;
    else if (error) status = `<p class="status warn">⚠ ${error}. Check the last marker you entered.</p>`;
    else if (!summary) status = `<p class="status muted">Analysing…</p>`;
    else {
      const n = summary.locations.length;
      const view = game.known[me] ? 'with your clue' : 'from the markers alone — set your clue in <b>Me</b> to narrow it down';
      status = `<p class="status ${n === 1 ? 'ok' : ''}">${n === 1 ? '★ Found it' : `The cryptid is on one of <b>${n}</b> hexes`} (${view}).${pending ? ' <span class="muted">Updating…</span>' : ''}</p>`;
    }

    const total = summary?.worlds || 1;
    const top = (summary?.locations ?? []).slice(0, 8);
    this.root.innerHTML = `
      ${status}
      <h3>Place</h3>
      <div class="chips">${Array.from({ length: game.players }, (_, i) => `
        <button data-tool-player="${i + 1}" class="chip ${tool.player === i + 1 ? 'on' : ''}">
          ${seatLabel(game, i + 1)}${i + 1 === me ? ' (you)' : ''}</button>`).join('')}
      </div>
      <div class="field">
        <div class="seg">
          <button data-cube="0" class="${tool.cube ? '' : 'on'}">● Disc</button>
          <button data-cube="1" class="${tool.cube ? 'on' : ''}">■ Cube</button>
        </div>
        <div class="seg">
          <button data-act="undo" ${history.past.length ? '' : 'disabled'}>↶ Undo</button>
          <button data-act="redo" ${history.future.length ? '' : 'disabled'}>↷ Redo</button>
        </div>
      </div>
      <p class="hint">Tap a hex to place; tap again to remove. ${game.markers.length} marker${game.markers.length === 1 ? '' : 's'} on the board.</p>
      <p class="hint keys">Keys: <kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd> pick a colour's cube
        (with <kbd>Shift</kbd>, its disc) · <kbd>Space</kbd> disc/cube · arrows + <kbd>Enter</kbd> place ·
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>?</kbd> all keys</p>
      <label class="check"><input type="checkbox" id="show-viable" ${ui.overlay === 'viable' ? 'checked' : ''}> Highlight possible hexes <span class="muted">(thicker outline = likelier)</span></label>
      ${summary ? `
      <h3>Likeliest hexes</h3>
      <ol class="locs">${top.map((l) => `<li><span>${hexRef(l.x, l.y)}</span><span class="bar"><i style="width:${(100 * l.worlds) / summary.locations[0].worlds}%"></i></span><span>${pct(l.worlds / total)}</span></li>`).join('')}</ol>
      ${summary.locations.length > top.length ? `<p class="hint">…and ${summary.locations.length - top.length} more.</p>` : ''}
      <h3>Possible clues</h3>
      ${summary.playerRules.map((rs, i) => `
        <details><summary>${seatLabel(game, i + 1)}${i + 1 === me ? ' (you)' : ''}: ${rs.length} clue${rs.length === 1 ? '' : 's'}</summary>
          <ul class="clues">${rs.slice(0, 12).map((r) => `<li><span>${ruleLabel(r.rule)}</span><span>${pct(r.worlds / total)}</span></li>`).join('')}
          ${rs.length > 12 ? `<li class="muted">…and ${rs.length - 12} more</li>` : ''}</ul></details>`).join('')}` : ''}`;

    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-tool-player]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.tool.player = +b.dataset.toolPlayer))));
    q('[data-cube]').forEach((b) => (b.onclick = () => this.app.store.update((s) => (s.ui.tool.cube = b.dataset.cube === '1'))));
    q('[data-act="undo"]').forEach((b) => (b.onclick = () => this.app.store.update((s) => undo(s))));
    q('[data-act="redo"]').forEach((b) => (b.onclick = () => this.app.store.update((s) => redo(s))));
    this.root.querySelector('#show-viable').onchange = (e) =>
      this.app.store.update((s) => (s.ui.overlay = e.target.checked ? 'viable' : 'none'));
  }
}

// Shortcut keys: each colour's first letter.
const KEYS = { y: 'yellow', r: 'red', g: 'green', c: 'cyan', p: 'purple' };

const pct = (p) => (p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
