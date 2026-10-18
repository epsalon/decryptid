// App state: the game (same JSON shape as Go's game.Game) plus UI state.
// Saved to localStorage on every change.

const KEY = 'decryptid.v1';

// Player colours of the physical set, in seat order (game.PlayerColors).
export const PLAYERS = [
  { name: 'yellow', color: '#f2c12e' },
  { name: 'red', color: '#d63a2f' },
  { name: 'green', color: '#34a853' },
  { name: 'cyan', color: '#22b8cf' },
  { name: 'purple', color: '#8e4ec6' },
];

export const STRUCTURE_COLORS = ['white', 'blue', 'green', 'black'];
export const STRUCTURE_TYPES = ['stone', 'shed'];

export function defaultGame() {
  return {
    spec: {
      tiles: [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }, { id: 6 }]],
      buildings: [],
    },
    players: 4,
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

// setupProblems returns what's missing before the game can be analysed.
export function setupProblems(game) {
  const problems = [];
  const ids = game.spec.tiles.flat().map((t) => t.id);
  if (new Set(ids).size !== 6) problems.push('Each of the 6 map tiles must be used once.');
  const missing = structuresFor(game).filter(
    (s) => !game.spec.buildings.some((b) => b.type === s.type && b.color === s.color),
  );
  if (missing.length) {
    problems.push(`Place ${missing.length} more structure${missing.length > 1 ? 's' : ''}.`);
  }
  return problems;
}

// rulesGrouped groups engine rule names for a <select>, keeping each
// name's number (1-based index), which game files may refer to.
export function ruleGroups(names) {
  const groups = new Map();
  names.forEach((name, i) => {
    const base = name.replace(/^Not /, '');
    const g = /^On /.test(base) ? 'On one of two terrains' : base.replace(/ from .*/, '').replace('Distance', 'Within');
    const key = (name.startsWith('Not ') ? 'Not: ' : '') + g;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ name, number: i + 1 });
  });
  return groups;
}

// ruleLabel is a friendlier display form of an engine rule name.
export const ruleLabel = (name) => name.replace(/Distance (\d) from/, 'Within $1 of');

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
  s.me ??= 1;
  s.ui = { tab: 'setup', coords: false, tool: { player: 1, cube: false }, overlay: 'viable', hideClue: false, adviceMode: 'turn', lambda: 0.5, winValue: 16, matchHints: false, ...s.ui };
  s.ui.winValue ??= 16; // (older saved states had a search threshold instead)
  s.ui.matchOpts ??= { players: 4, advanced: true, difficulty: 'hard', seat: 0 };
  s.match ??= null;
  s.history ??= { past: [], future: [] };
  return s;
}

export class Store {
  constructor() {
    this.state = withDefaults(load() ?? { game: defaultGame() });
    this.listeners = [];
  }
  subscribe(fn) {
    this.listeners.push(fn);
  }
  // update applies fn to the state, saves, and notifies listeners.
  update(fn) {
    fn(this.state);
    save(this.state);
    for (const l of this.listeners) l(this.state);
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.game && s.game.spec ? s : null;
  } catch {
    return null;
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); the app still works.
  }
}
