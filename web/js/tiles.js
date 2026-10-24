// "Tiles" panel: for each map tile, how likely the cryptid is there, and which
// rules each player could hold in the worlds that put it there. Nothing is
// drawn on the board, so it shows no more than the Advice tab does.

import { setupProblems, seatLabel, ruleLabel } from './state.js';
import { t } from './i18n.js';

const pct = (p) => (p === 0 ? '0%' : p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const TOP = 3; // rules shown per player, most likely first

export class TilesPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    // The latest result, for the game it was computed for.
    this.req = { key: '', result: null, error: null };
  }

  overlay() {
    return this.app.viableOverlay();
  }

  onHex() {
    this.app.toast(t('me.useplay'));
  }

  request() {
    const { game } = this.app.store.state;
    const key = JSON.stringify(game);
    const r = this.req;
    if (key === r.key) return;
    r.key = key;
    this.app.engine.latest('tiles', 'tiles', { game }).then(
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
    const cards = result.map((tc) => {
      const name = t('setup.tile', { id: game.spec.tiles[Math.floor(tc.tile / 2)][tc.tile % 2].id });
      const share = result.reduce((n, x) => n + x.worlds, 0) ? tc.worlds / result.reduce((n, x) => n + x.worlds, 0) : 0;
      const players = tc.worlds ? tc.players.map((rs, i) => {
        const shown = rs.slice(0, TOP).map((r) => `<li><span>${ruleLabel(r.rule)}</span><span>${pct(r.worlds / tc.worlds)}</span></li>`).join('');
        const more = rs.length > TOP ? `<li class="muted">${t('common.andMore', { count: rs.length - TOP })}</li>` : '';
        return rs.length ? `<div class="tile-player">${seatLabel(game, i + 1)}<ul class="clues">${shown}${more}</ul></div>` : '';
      }).join('') : '';
      return `<section class="tile-card">
        <h4>${name} <span class="muted">${pct(share)}</span></h4>
        ${tc.worlds ? players : `<p class="hint">${t('tiles.none')}</p>`}
      </section>`;
    });
    this.root.innerHTML = `
      <p class="hint">${t('tiles.intro')}</p>
      <div class="tile-grid">${cards.join('')}</div>`;
  }
}
