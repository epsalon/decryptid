// Entry point: wires the store, the engine and the panels together.

import { Engine } from './engine.js';
import { Store } from './state.js';
import { Board } from './board.js';
import { SetupPanel } from './setup.js';

const store = new Store();
const engine = new Engine();
const $ = (id) => document.getElementById(id);

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

const panels = {
  setup: { title: 'Setup', panel: new SetupPanel($('tab-body'), store, engine, toast) },
};

const board = new Board($('board'), (x, y) => current().panel.onHex(x, y));
const current = () => panels[store.state.ui.tab] ?? panels.setup;

function renderTabs() {
  $('tabs').innerHTML = Object.entries(panels)
    .map(([k, p]) => `<button role="tab" data-tab="${k}" aria-selected="${k === store.state.ui.tab}">${p.title}</button>`)
    .join('');
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => store.update((s) => (s.ui.tab = b.dataset.tab))));
}

// The board layout only changes with the setup, so it is fetched from the
// engine only then; markers and overlays are redrawn on every change.
let hexes = [];
let hexesFor = '';
async function renderBoard() {
  const { game, ui } = store.state;
  const key = JSON.stringify([game.spec, game.advanced]);
  if (key !== hexesFor) {
    const h = await engine.latest('board', 'board', { game });
    if (h === undefined) return; // superseded by a newer change
    hexes = h;
    hexesFor = key;
  }
  board.render(hexes, game.markers, current().panel.overlay(), { coords: ui.coords });
}

function render() {
  renderTabs();
  current().panel.render();
  renderBoard().catch((e) => toast(e.message));
}

store.subscribe(render);
$('coords').checked = !!store.state.ui.coords;
$('coords').onchange = (e) => store.update((s) => (s.ui.coords = e.target.checked));

render();
engine.ready
  .then(() => ($('engine-status').textContent = ''))
  .catch((e) => ($('engine-status').textContent = `Engine failed to load: ${e.message}`));
