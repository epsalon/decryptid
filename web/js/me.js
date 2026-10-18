// "Me" panel: which seat is mine, and my secret clue.

import { PLAYERS, ruleGroups, ruleLabel } from './state.js';

export class MePanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
  }

  overlay() {
    return this.app.viableOverlay();
  }

  onHex() {
    this.app.toast('Switch to Play to place discs and cubes.');
  }

  render() {
    const { game, me, ui } = this.app.store.state;
    const rules = this.app.rulesFor(game.advanced);
    const clue = game.known[me] ?? '';
    this.root.innerHTML = `
      <h3>You are</h3>
      <div class="chips">${PLAYERS.slice(0, game.players).map((p, i) => `
        <button data-me="${i + 1}" class="chip ${me === i + 1 ? 'on' : ''}">
          <span class="dot" style="background:${p.color}"></span>${p.name}</button>`).join('')}
      </div>
      <h3>Your clue</h3>
      <p class="hint">Used only on this device, to work out what you know that others don't.</p>
      <select id="clue" class="${ui.hideClue ? 'hidden-clue' : ''}" ${rules ? '' : 'disabled'}>
        <option value="">— not set —</option>
        ${rules ? [...ruleGroups(rules)].map(([g, rs]) => `<optgroup label="${g}">${rs.map((r) =>
          `<option value="${r.name}" ${r.name === clue ? 'selected' : ''}>${ruleLabel(r.name)}</option>`).join('')}</optgroup>`).join('') : ''}
      </select>
      <label class="check"><input type="checkbox" id="hide-clue" ${ui.hideClue ? 'checked' : ''}> Hide my clue (blurred until tapped)</label>`;
    this.root.querySelectorAll('[data-me]').forEach((b) => (b.onclick = () => this.app.store.update((s) => {
      const clue = s.game.known[s.me];
      s.me = +b.dataset.me;
      s.game.known = clue ? { [s.me]: clue } : {};
    })));
    this.root.querySelector('#clue').onchange = (e) => this.app.store.update((s) => {
      s.game.known = e.target.value ? { [s.me]: e.target.value } : {};
    });
    this.root.querySelector('#hide-clue').onchange = (e) => this.app.store.update((s) => (s.ui.hideClue = e.target.checked));
  }
}
