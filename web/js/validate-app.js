// Entry point of the clue validator (validate.html). A separate page with
// its own saved state (see validate.js), so it shares nothing with the
// solver but the engine, the board drawing and the chosen language.

import { Engine } from './engine.js';
import { Store, seat } from './state.js';
import { Board } from './board.js';
import { SetupPanel } from './setup.js';
import { Terrain } from './terrain.js';
import { Validator, ValidateMarkers, ValidateClues } from './validate.js';
import { installHexRefs, dropStaleHexRef } from './hexref.js';
import { initI18n, setLanguage, savedLanguage, saveLanguage, t, LANGUAGES } from './i18n.js';

const $ = (id) => document.getElementById(id);

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

const store = new Store('decryptid.validate.v1'); // not the solver's key
store.state.validate ??= { key: '', clues: {} }; // entered clues, never displayed
const engine = new Engine();
const app = { store, engine, toast, rerender: () => render() };

const language = savedLanguage(); // the one thing shared with the solver
await initI18n(language);
$('engine-status').textContent = t('app.loading');

const validator = new Validator(app);
const panels = {
  setup: { title: 'tab.setup', panel: new SetupPanel($('tab-body'), store, engine, toast) },
  markers: { title: 'validate.tab.markers', panel: new ValidateMarkers($('tab-body'), validator) },
  clues: { title: 'validate.tab.clues', panel: new ValidateClues($('tab-body'), validator) },
};
const current = () => panels[store.state.ui.tab] ?? panels.setup;
const board = new Board($('board'), (x, y) => current().panel.onHex(x, y));
installHexRefs(board);
const terrain = new Terrain(engine);

function renderTabs() {
  $('tabs').innerHTML = Object.entries(panels)
    .map(([k, p]) => `<button role="tab" data-tab="${k}" aria-selected="${k === store.state.ui.tab}">${t(p.title)}</button>`)
    .join('');
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => store.update((s) => (s.ui.tab = b.dataset.tab))));
}

async function renderBoard() {
  if (!(await terrain.ready(store.state.game))) return;
  const { game, ui } = store.state;
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
  document.body.classList.toggle('setup-mode', store.state.ui.tab === 'setup');
  terrain.request(store.state.game);
  validator.request(false);
  renderTabs();
  current().panel.render();
  renderBoard().catch((e) => toast(e.message));
  dropStaleHexRef();
}

$('language').innerHTML = [['auto', t('footer.automatic')], ...Object.entries(LANGUAGES)]
  .map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
$('language').value = language;
$('language').onchange = async (e) => {
  await setLanguage(e.target.value);
  saveLanguage(e.target.value);
  render();
};
$('coords').checked = !!store.state.ui.coords;
$('coords').onchange = (e) => store.update((s) => (s.ui.coords = e.target.checked));
store.subscribe(render);

render();
engine.ready
  .then(() => ($('engine-status').textContent = ''))
  .catch((e) => ($('engine-status').textContent = t('app.engineFailed', { error: e.message })));
