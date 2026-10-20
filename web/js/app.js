// Entry point: wires the store, the engine and the panels together, and
// keeps the solver's analysis of the current game up to date.

import { Engine } from './engine.js';
import { Store, setupProblems, seat } from './state.js';
import { Board } from './board.js';
import { SetupPanel } from './setup.js';
import { MePanel } from './me.js';
import { PlayPanel } from './play.js';
import { AdvicePanel } from './advice.js';
import { Terrain } from './terrain.js';
import { MatchPanel, matchActive, dropStaleMatch } from './match.js';
import { installHexRefs, dropStaleHexRef } from './hexref.js';
import { installKeys } from './keys.js';
import { initI18n, setLanguage, savedLanguage, saveLanguage, t, LANGUAGES } from './i18n.js';

const $ = (id) => document.getElementById(id);

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// app is the context shared by the panels.
const app = {
  store: new Store(),
  engine: new Engine(),
  toast,
  // analysis is the engine's summary of the current game: viable hexes and
  // each player's possible clues. blocked explains why there is none.
  analysis: { key: '', summary: null, error: null, pending: false, blocked: null },
  rules: {}, // advanced (bool) -> rule names, once fetched

  // rulesFor returns the rule names for a mode, fetching them on first use.
  rulesFor(advanced) {
    if (!(advanced in this.rules)) {
      this.rules[advanced] = null;
      this.engine.call('rules', { advanced }).then((r) => {
        this.rules[advanced] = r;
        render();
      });
    }
    return this.rules[advanced];
  },

  // viableOverlay highlights the hexes the cryptid may be on, weighted by
  // how many worlds put it there.
  viableOverlay() {
    const o = new Map();
    const s = this.analysis.summary;
    if (!s || this.store.state.ui.overlay !== 'viable') return o;
    const max = s.locations[0]?.worlds || 1;
    for (const l of s.locations) o.set(`${l.x},${l.y}`, { viable: true, weight: l.worlds / max });
    return o;
  },
};

// Translations load before anything is rendered.
// (Saved states from before the shared key kept it in ui.language.)
const language = savedLanguage(app.store.state.ui.language);
await initI18n(language);
$('engine-status').textContent = t('app.loading');

const panels = {
  setup: { title: 'tab.setup', panel: new SetupPanel($('tab-body'), app.store, app.engine, toast) },
  me: { title: 'tab.me', panel: new MePanel($('tab-body'), app) },
  play: { title: 'tab.play', panel: new PlayPanel($('tab-body'), app) },
  advice: { title: 'tab.advice', panel: new AdvicePanel($('tab-body'), app) },
  match: { title: 'tab.match', panel: new MatchPanel($('tab-body'), app) },
};
const current = () => panels[app.store.state.ui.tab] ?? panels.setup;
const board = new Board($('board'), (x, y) => current().panel.onHex(x, y));
installHexRefs(board);
installKeys(app, board, (x, y) => current().panel.onHex(x, y));

function renderTabs() {
  $('tabs').innerHTML = Object.entries(panels)
    .map(([k, p]) => `<button role="tab" data-tab="${k}" aria-selected="${k === app.store.state.ui.tab}">${t(p.title)}</button>`)
    .join('');
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => app.store.update((s) => (s.ui.tab = b.dataset.tab))));
}

// analyze asks the engine for a fresh summary whenever the game changes.
function analyze() {
  const { game } = app.store.state;
  const a = app.analysis;
  const problems = setupProblems(game);
  if (matchActive(app.store.state) && !app.store.state.ui.matchHints) {
    Object.assign(a, { key: '', summary: null, error: null, pending: false, blocked: t('play.hintsOff') });
    return;
  }
  if (problems.length) {
    Object.assign(a, { key: '', summary: null, error: null, pending: false, blocked: t('play.finishSetup', { problems: problems.join(' ') }) });
    return;
  }
  const key = JSON.stringify(game);
  if (key === a.key) return;
  Object.assign(a, { key, pending: true, blocked: null });
  app.engine.latest('summary', 'summary', { game }).then(
    (summary) => {
      if (summary === undefined) return; // a newer request is on its way
      Object.assign(a, { summary, error: null, pending: false });
      render();
    },
    (err) => {
      if (a.key !== key) return;
      Object.assign(a, { summary: null, error: err.message, pending: false });
      render();
    },
  );
}

// The terrain is requested before the summary: see terrain.js.
const terrain = new Terrain(app.engine);

async function renderBoard() {
  if (!(await terrain.ready(app.store.state.game))) return;
  const { game, ui } = app.store.state;
  const at = new Map(game.spec.buildings.map((b) => [`${b.x},${b.y}`, b]));
  const hexes = terrain.hexes.map((h) => {
    const b = at.get(`${h.x},${h.y}`);
    return b ? { ...h, structure: b.type, color: b.color } : h;
  });
  const tiles = ui.tab === 'setup' ? game.spec.tiles : null; // tile numbers only while setting up
  const seats = Array.from({ length: game.players }, (_, i) => seat(game, i + 1));
  board.render(hexes, game.markers, current().panel.overlay(), { coords: ui.coords, tiles, seats });
}

function render() {
  dropStaleMatch(app.store.state);
  // Lets structures on the board grab touches for dragging, only in setup.
  document.body.classList.toggle('setup-mode', app.store.state.ui.tab === 'setup' && !matchActive(app.store.state));
  terrain.request(app.store.state.game); // before analyze(): see terrain.js
  analyze();
  renderTabs();
  current().panel.render();
  renderBoard().catch((e) => toast(e.message));
  dropStaleHexRef();
}

// Language: the browser's by default, or chosen in the footer.
$('language').innerHTML = [['auto', t('footer.automatic')], ...Object.entries(LANGUAGES)]
  .map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
$('language').value = language;
$('language').onchange = async (e) => {
  await setLanguage(e.target.value);
  saveLanguage(e.target.value);
  render();
};

app.rerender = render;
app.store.subscribe(render);
$('coords').checked = !!app.store.state.ui.coords;
$('coords').onchange = (e) => app.store.update((s) => (s.ui.coords = e.target.checked));

// Keyboard shortcuts for the Play tab: Ctrl/Cmd+Z to undo, +Shift to redo.
document.addEventListener('keydown', (e) => {
  if (app.store.state.ui.tab !== 'play' || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  document.querySelector(`[data-act="${e.shiftKey ? 'redo' : 'undo'}"]`)?.click();
});

render();
app.engine.ready
  .then(() => {
    $('engine-status').textContent = '';
    if (matchActive(app.store.state)) panels.match.panel.advance(); // resume after a reload
  })
  .catch((e) => ($('engine-status').textContent = t('app.engineFailed', { error: e.message })));
