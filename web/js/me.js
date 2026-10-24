// "Me" panel: which color is mine (or none: a spectator), and my secret clue.

import { ruleGroups, ruleLabel, seatLabel, seatColors } from './state.js';
import { t } from './i18n.js';
import { hasClueNumbers, clueNumberField, onClueNumber } from './cluenumbers.js';

export class MePanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
  }

  overlay() {
    return this.app.viableOverlay();
  }

  onHex() {
    this.app.toast(t('me.useplay'));
  }

  render() {
    const { game, me, ui, match } = this.app.store.state;
    if (match && match.phase !== 'over') {
      this.root.innerHTML = `<p class="status">${t('me.locked')}</p>`;
      return;
    }
    const rules = this.app.rulesFor(game.advanced);
    const clue = game.known[me] ?? '';
    const seats = Array.from({ length: game.players }, (_, i) => i + 1);
    this.root.innerHTML = `
      <h3>${t('me.youAre')}</h3>
      <div class="chips">
        <button data-me="0" class="chip ${me === 0 ? 'on' : ''}">👁 ${t('me.spectator')}</button>
        ${seats.map((p) => `<button data-me="${p}" class="chip ${me === p ? 'on' : ''}">${seatLabel(game, p)}</button>`).join('')}
      </div>
      ${me === 0 ? `<p class="hint">${t('me.spectatorHint')}</p>` : `
      <h3>${t('me.clue')}</h3>
      <p class="hint">${t('me.clueHint')}</p>
      <div class="clue-row">
        <select id="clue" class="${ui.hideClue ? 'hidden-clue' : ''}" ${rules ? '' : 'disabled'}>
          <option value="">${t('me.notSet')}</option>
          ${rules ? [...ruleGroups(rules)].map(([g, rs]) => `<optgroup label="${g}">${rs.map((r) =>
            `<option value="${r.name}" ${r.name === clue ? 'selected' : ''}>${ruleLabel(r.name)}</option>`).join('')}</optgroup>`).join('') : ''}
        </select>
        ${rules && hasClueNumbers(seatColors(game)[me - 1]) ? clueNumberField('clue-number') : ''}
      </div>
      <label class="check"><input type="checkbox" id="hide-clue" ${ui.hideClue ? 'checked' : ''}> ${t('me.hideClue')}</label>`}`;
    this.root.querySelectorAll('[data-me]').forEach((b) => (b.onclick = () => this.app.store.update((s) => {
      const clue = s.game.known[s.me];
      s.me = +b.dataset.me;
      s.game.known = clue && s.me ? { [s.me]: clue } : {};
    })));
    this.root.querySelector('#clue')?.addEventListener('change', (e) => this.app.store.update((s) => {
      s.game.known = e.target.value ? { [s.me]: e.target.value } : {};
    }));
    const number = this.root.querySelector('#clue-number');
    const select = this.root.querySelector('#clue');
    if (number) onClueNumber(number, seatColors(game)[me - 1], (msg) => this.app.toast(msg),
      (name) => !!select.querySelector(`option[value="${name}"]`),
      (name) => {
        select.value = name;
        select.dispatchEvent(new Event('change'));
      });
    this.root.querySelector('#hide-clue')?.addEventListener('change', (e) => this.app.store.update((s) => (s.ui.hideClue = e.target.checked)));
  }
}
