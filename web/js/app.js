// Entry point: wires the store, the engine and the panels together, and
// keeps the solver's analysis of the current game up to date.

import { Engine } from './engine.js';
import { Store, setupProblems } from './state.js';
import { Board } from './board.js';
import { SetupPanel } from './setup.js';
import { MePanel } from './me.js';
import { PlayPanel } from './play.js';
import { AdvicePanel } from './advice.js';

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

  // viableOverlay highlights the hexes the cryptid may be on, tinted by
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

const panels = {
  setup: { title: 'Setup', panel: new SetupPanel($('tab-body'), app.store, app.engine, toast) },
  me: { title: 'Me', panel: new MePanel($('tab-body'), app) },
  play: { title: 'Play', panel: new PlayPanel($('tab-body'), app) },
  advice: { title: 'Advice', panel: new AdvicePanel($('tab-body'), app) },
};
const current = () => panels[app.store.state.ui.tab] ?? panels.setup;
const board = new Board($('board'), (x, y) => current().panel.onHex(x, y));

function renderTabs() {
  $('tabs').innerHTML = Object.entries(panels)
    .map(([k, p]) => `<button role="tab" data-tab="${k}" aria-selected="${k === app.store.state.ui.tab}">${p.title}</button>`)
    .join('');
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => app.store.update((s) => (s.ui.tab = b.dataset.tab))));
}

// analyze asks the engine for a fresh summary whenever the game changes.
function analyze() {
  const { game } = app.store.state;
  const a = app.analysis;
  const problems = setupProblems(game);
  if (problems.length) {
    Object.assign(a, { key: '', summary: null, error: null, pending: false, blocked: `Finish the setup first: ${problems.join(' ')}` });
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

// The board layout only changes with the setup, so it is fetched from the
// engine only then; markers and overlays are redrawn on every change.
let hexes = [];
let hexesFor = '';
async function renderBoard() {
  const { game, ui } = app.store.state;
  const key = JSON.stringify([game.spec, game.advanced]);
  if (key !== hexesFor) {
    const h = await app.engine.latest('board', 'board', { game });
    if (h === undefined) return; // superseded by a newer change
    hexes = h;
    hexesFor = key;
  }
  board.render(hexes, game.markers, current().panel.overlay(), { coords: ui.coords });
}

function render() {
  analyze();
  renderTabs();
  current().panel.render();
  renderBoard().catch((e) => toast(e.message));
}

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
  .then(() => ($('engine-status').textContent = ''))
  .catch((e) => ($('engine-status').textContent = `Engine failed to load: ${e.message}`));
