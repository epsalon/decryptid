import { t } from './i18n.js';

// App state: the game (same JSON shape as Go's game.Game) plus UI state.
// Saved to localStorage on every change.

const KEY = 'decryptid.v1';

// Player colors of the physical set, in seat order (game.PlayerColors): the
// Greek letter order of the clue books. Each has a letter for its swatch; the
// names are only for the saved game and the terminal.
export const PLAYERS = [
  { name: 'red', color: '#d63a2f', letter: 'α' },
  { name: 'green', color: '#34a853', letter: 'β' },
  { name: 'cyan', color: '#22b8cf', letter: 'γ' },
  { name: 'yellow', color: '#f2c12e', letter: 'δ' },
  { name: 'purple', color: '#8e4ec6', letter: 'ε' },
];

// Seats are turn order; colors are just who sits there. game.colors lists
// each seat's color (same as Go's Game.Colors).
export const seatColors = (game) => (game.colors ?? PLAYERS.slice(0, game.players).map((p) => p.name));

// seat describes seat p (1-based): its color name, hex color, letter, and slot
// (index in PLAYERS, which fixes where its discs sit in a hex).
export function seat(game, p) {
  const name = seatColors(game)[p - 1];
  const slot = PLAYERS.findIndex((c) => c.name === name);
  if (slot < 0) return { name: t('common.player', { n: p }), color: '#999', letter: String(p), slot: (p - 1) % PLAYERS.length }; // no such seat
  return { name, color: PLAYERS[slot].color, letter: PLAYERS[slot].letter, slot };
}

// boardKey identifies a game's board and players, ignoring the markers.
export const boardKey = (game) => JSON.stringify([game.spec, game.advanced, seatColors(game)]);

// swatch is a color dot carrying the seat's letter.
export const swatch = (color, letter) => `<span class="dot seat-dot" style="background:${color}">${letter}</span>`;

// seatLabel is a seat's swatch: its letter, with no color name.
export const seatLabel = (game, p) => {
  const s = seat(game, p);
  return swatch(s.color, s.letter);
};

// letterOf is a player color's letter, for a color name from the game.
export const letterOf = (name) => PLAYERS.find((c) => c.name === name)?.letter ?? name;

// seatOrder lists the seat numbers (1-based) in Greek letter order, the order
// the chips and lists show. Seat numbers stay turn order, so a seat's button
// still acts on that seat.
export const seatOrder = (game) => Array.from({ length: game.players }, (_, i) => i + 1)
  .sort((a, b) => seat(game, a).slot - seat(game, b).slot || a - b);

// seatName is seat p's letter as plain text, for messages.
export const seatName = (game, p) => seat(game, p).letter;

export const STRUCTURE_COLORS = ['white', 'blue', 'green', 'black'];
export const STRUCTURE_TYPES = ['stone', 'shed'];

export function defaultGame() {
  return {
    spec: {
      tiles: [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }, { id: 6 }]],
      buildings: [],
    },
    players: 5,
    colors: ['yellow', 'red', 'green', 'cyan', 'purple'],
    advanced: false,
    markers: [],
    known: {},
  };
}

// structuresFor lists the structures a game needs, as {type, color}.
export function structuresFor(game) {
  const colors = game.advanced ? STRUCTURE_COLORS : STRUCTURE_COLORS.slice(0, 3);
  return colors.flatMap((color) => STRUCTURE_TYPES.map((type) => ({ type, color })));
}

// setupProblems returns what's missing before the game can be analyzed.
export function setupProblems(game) {
  const problems = [];
  if (seatColors(game).length < 3) problems.push(t('setup.problem.players'));
  const ids = game.spec.tiles.flat().map((tile) => tile.id);
  if (new Set(ids).size !== 6) problems.push(t('setup.problem.tiles'));
  const missing = structuresFor(game).filter(
    (s) => !game.spec.buildings.some((b) => b.type === s.type && b.color === s.color),
  );
  if (missing.length) {
    problems.push(t('setup.problem.structures', { count: missing.length }));
  }
  return problems;
}

// rulesGrouped groups engine rule names for a <select>, keeping each
// name's number (1-based index), which game files may refer to.
export function ruleGroups(names) {
  const groups = new Map();
  names.forEach((name, i) => {
    const base = name.replace(/^Not /, '');
    const within = base.match(/^Distance (\d)/);
    let g = within ? t('rule.group.within', { n: +within[1] }) : t('rule.group.on');
    if (name.startsWith('Not ')) g = t('rule.group.not', { group: g });
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ name, number: i + 1 });
  });
  return groups;
}

// ruleLabel is the display form of an engine rule name. Engine names are
// fixed English ("Distance 1 from Water"); the label is built from their
// parts, so it can be translated.
export function ruleLabel(name) {
  const key = (s) => s.toLowerCase().replace(/ /g, '');
  let m;
  if ((m = name.match(/^Not (.*)$/))) return t('rule.not', { rule: ruleLabel(m[1]) });
  if ((m = name.match(/^On (\w+) or (\w+)$/))) return t('rule.on', { a: t(`terrain.${key(m[1])}`), b: t(`terrain.${key(m[2])}`) });
  if ((m = name.match(/^Distance (\d) from either animal territory$/))) return t('rule.nearAnyAnimal', { n: +m[1] });
  if ((m = name.match(/^Distance (\d) from (\w+) territory$/))) return t('rule.nearAnimal', { n: +m[1], animal: t(`animal.${key(m[2])}`) });
  if ((m = name.match(/^Distance (\d) from (Standing Stone|Abandoned Shed)$/))) {
    return t('rule.nearStructure', { n: +m[1], structure: t(`structure.${m[2] === 'Standing Stone' ? 'stone' : 'shed'}.name`) });
  }
  if ((m = name.match(/^Distance (\d) from (\w+) structure$/))) return t('rule.nearColor', { n: +m[1], color: t(`structureColor.${key(m[2])}`) });
  if ((m = name.match(/^Distance (\d) from (\w+)$/))) return t('rule.nearTerrain', { n: +m[1], terrain: t(`terrain.${key(m[2])}`) });
  return name;
}

const MAX_HISTORY = 200;

// setMarkers replaces the markers, recording the old ones for undo.
export function setMarkers(state, markers) {
  state.history.past.push(state.game.markers);
  if (state.history.past.length > MAX_HISTORY) state.history.past.shift();
  state.history.future = [];
  state.game.markers = markers;
}

export function undo(state) {
  if (!state.history.past.length) return false;
  state.history.future.push(state.game.markers);
  state.game.markers = state.history.past.pop();
  return true;
}

export function redo(state) {
  if (!state.history.future.length) return false;
  state.history.past.push(state.game.markers);
  state.game.markers = state.history.future.pop();
  return true;
}

// withDefaults fills in fields that older saved states may lack.
function withDefaults(s) {
  s.game.markers ??= [];
  s.game.known ??= {};
  s.me ??= 0; // spectator: knows no clue
  s.game.colors ??= seatColors(s.game);
  s.ui = { tab: 'setup', coords: false, tool: { player: 1, cube: false }, overlay: 'viable', hideClue: false, adviceMode: 'turn', lambda: 0.5, winValue: 16, matchHints: false, language: 'auto', ...s.ui };
  s.ui.winValue ??= 16; // (older saved states had a search threshold instead)
  s.ui.matchOpts ??= { players: 4, advanced: true, difficulty: 'hard', seat: 0, color: 'yellow' };
  s.ui.matchOpts.color ??= 'yellow';
  s.match ??= null;
  s.history ??= { past: [], future: [] };
  return s;
}

// A Store keeps one game in localStorage under its own key, so the solver
// and the clue validator (validate.html) never see each other's state.
export class Store {
  constructor(key = KEY) {
    this.key = key;
    this.state = withDefaults(load(key) ?? { game: defaultGame() });
    this.listeners = [];
  }
  subscribe(fn) {
    this.listeners.push(fn);
  }
  // update applies fn to the state, saves, and notifies listeners.
  update(fn) {
    fn(this.state);
    save(this.key, this.state);
    for (const l of this.listeners) l(this.state);
  }
}

function load(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    return s && s.game && s.game.spec ? s : null;
  } catch {
    return null;
  }
}

function save(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); the app still works.
  }
}
