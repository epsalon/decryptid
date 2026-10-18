// "Me" panel: which colour is mine (or none: a spectator), and my secret clue.

import { ruleGroups, ruleLabel, seatLabel } from './state.js';

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
    const { game, me, ui, match } = this.app.store.state;
    if (match && match.phase !== 'over') {
      this.root.innerHTML = '<p class="status">In a match against the AI your seat and clue are dealt to you: see the <b>vs AI</b> tab.</p>';
      return;
    }
    const rules = this.app.rulesFor(game.advanced);
    const clue = game.known[me] ?? '';
    const seats = Array.from({ length: game.players }, (_, i) => i + 1);
    this.root.innerHTML = `
      <h3>You are</h3>
      <div class="chips">
        <button data-me="0" class="chip ${me === 0 ? 'on' : ''}">👁 Spectator</button>
        ${seats.map((p) => `<button data-me="${p}" class="chip ${me === p ? 'on' : ''}">${seatLabel(game, p)}</button>`).join('')}
      </div>
      ${me === 0 ? `<p class="hint">As a spectator you know no clue: the board shows what can be deduced from the
        markers alone. Pick your colour to enter your clue and get advice.</p>` : `
      <h3>Your clue</h3>
      <p class="hint">Used only on this device, to work out what you know that others don't.</p>
      <select id="clue" class="${ui.hideClue ? 'hidden-clue' : ''}" ${rules ? '' : 'disabled'}>
        <option value="">— not set —</option>
        ${rules ? [...ruleGroups(rules)].map(([g, rs]) => `<optgroup label="${g}">${rs.map((r) =>
          `<option value="${r.name}" ${r.name === clue ? 'selected' : ''}>${ruleLabel(r.name)}</option>`).join('')}</optgroup>`).join('') : ''}
      </select>
      <label class="check"><input type="checkbox" id="hide-clue" ${ui.hideClue ? 'checked' : ''}> Hide my clue (blurred until tapped)</label>`}`;
    this.root.querySelectorAll('[data-me]').forEach((b) => (b.onclick = () => this.app.store.update((s) => {
      const clue = s.game.known[s.me];
      s.me = +b.dataset.me;
      s.game.known = clue && s.me ? { [s.me]: clue } : {};
    })));
    this.root.querySelector('#clue')?.addEventListener('change', (e) => this.app.store.update((s) => {
      s.game.known = e.target.value ? { [s.me]: e.target.value } : {};
    }));
    this.root.querySelector('#hide-clue')?.addEventListener('change', (e) => this.app.store.update((s) => (s.ui.hideClue = e.target.checked)));
  }
}
