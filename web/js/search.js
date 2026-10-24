// "Search" panel: tap a hex on the board to see how likely the cryptid is
// there. Each player's rules are shown per player, or as whole clue sets, one
// rule per player. The selected hex is ringed on the board, and the possible
// hexes are always highlighted here. Nothing beyond that is revealed, as on
// the Advice tab.

import { setupProblems, seat, seatLabel, ruleLabel, PLAYERS } from './state.js';
import { t } from './i18n.js';

const pct = (p) => (p === 0 ? '0%' : p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);

// swatch is a seat's color dot, with its letter (as on the Play tab's keys)
// so that it reads without color.
const swatch = (game, p) => {
  const s = seat(game, p);
  const named = PLAYERS.some((c) => c.name === s.name);
  const letter = named ? s.name[0].toUpperCase() : String(p);
  return `<span class="dot seat-dot" style="background:${s.color}">${letter}</span>`;
};

export class SearchPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.sel = null; // {x, y} of the hex the user tapped
    this.view = 'players'; // or 'sets': whole clue sets instead of per player
    // The latest result, for the game and hex it was computed for.
    this.req = { key: '', result: null, error: null };
  }

  overlay() {
    const o = this.app.viableOverlay(true);
    if (this.sel) {
      const k = `${this.sel.x},${this.sel.y}`;
      o.set(k, { ...o.get(k), kind: 'select' });
    }
    return o;
  }

  onHex(x, y) {
    this.sel = { x, y };
    this.app.rerender();
  }

  request() {
    const { game } = this.app.store.state;
    const { x, y } = this.sel;
    const key = JSON.stringify({ game, x, y });
    const r = this.req;
    if (key === r.key) return;
    r.key = key;
    this.app.engine.latest('search', 'hex', { game, x, y }).then(
      (result) => {
        if (result === undefined || r.key !== key) return;
        Object.assign(r, { result, error: null });
        this.app.rerender();
      },
      (err) => {
        if (r.key !== key) return;
        Object.assign(r, { result: null, error: err.message });
        this.app.rerender();
      },
    );
  }

  render() {
    const { game } = this.app.store.state;
    const problems = setupProblems(game);
    if (problems.length) {
      this.root.innerHTML = `<p class="status warn">${t('play.finishSetup', { problems: problems.join(' ') })}</p>`;
      return;
    }
    if (!this.sel) {
      this.root.innerHTML = `<p class="hint">${t('search.intro')}</p>`;
      return;
    }
    this.request();
    const { result, error } = this.req;
    if (error) {
      this.root.innerHTML = `<p class="status warn">⚠ ${error}</p>`;
      return;
    }
    if (!result) {
      this.root.innerHTML = `<p class="status muted">${t('play.analyzing')}</p>`;
      return;
    }
    const share = result.total ? result.worlds / result.total : 0;
    const toggle = `
      <div class="seg">
        <button data-view="players" class="${this.view === 'players' ? 'on' : ''}">${t('search.byPlayer')}</button>
        <button data-view="sets" class="${this.view === 'sets' ? 'on' : ''}">${t('search.clueSets')}</button>
      </div>`;
    this.root.innerHTML = `
      <section class="search-detail">
        <h4>${t('search.hex', { x: result.x, y: result.y })} <span class="muted">${pct(share)}</span></h4>
        ${result.worlds ? toggle + (this.view === 'players' ? this.playersView(game, result) : this.setsView(game, result)) : `<p class="hint">${t('search.none')}</p>`}
      </section>`;
    this.root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => {
      this.view = b.dataset.view;
      this.app.rerender();
    }));
  }

  // playersView lists each player's rules, with the share of the hex's
  // worlds in which they hold each one.
  playersView(game, result) {
    return result.players.map((rs, i) => {
      const lis = rs.map((r) => `<li><span>${ruleLabel(r.rule)}</span><span>${pct(r.worlds / result.worlds)}</span></li>`).join('');
      return rs.length ? `<div class="search-player">${seatLabel(game, i + 1)}<ul class="clues">${lis}</ul></div>` : '';
    }).join('');
  }

  // setsView lists the combinations of rules that put the cryptid here. Each
  // group of interchangeable players is shown as one unit: its swatches, then
  // its rules unordered, since their seating is not part of the set.
  setsView(game, result) {
    const lis = result.sets.map((s) => {
      const groups = result.groups.map((g) => {
        const dots = g.map((i) => swatch(game, i + 1)).join('');
        const rules = g.map((i) => ruleLabel(s.rules[i])).join(' · ');
        return `<span class="set-group"><span class="set-seats">${dots}</span><span>${rules}</span></span>`;
      });
      return `<li><span>${groups.join(' ')}</span><span>${pct(s.worlds / result.worlds)}</span></li>`;
    }).join('');
    return `<ul class="clues search-sets">${lis}</ul>`;
  }
}
