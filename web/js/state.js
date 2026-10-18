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

// Seats are turn order; colours are just who sits there. game.colors lists
// each seat's colour (same as Go's Game.Colors).
export const seatColors = (game) => (game.colors ?? PLAYERS.slice(0, game.players).map((p) => p.name));

// seat describes seat p (1-based): its colour name, hex colour, and slot
// (index in PLAYERS, which fixes where its discs sit in a hex).
export function seat(game, p) {
  const name = seatColors(game)[p - 1];
  const slot = PLAYERS.findIndex((c) => c.name === name);
  if (slot < 0) return { name: `player ${p}`, color: '#999', slot: (p - 1) % PLAYERS.length }; // no such seat
  return { name, color: PLAYERS[slot].color, slot };
}

// boardKey identifies a game's board and players, ignoring the markers.
export const boardKey = (game) => JSON.stringify([game.spec, game.advanced, seatColors(game)]);

// seatLabel is a coloured dot plus the seat's colour name.
export const seatLabel = (game, p) => {
  const s = seat(game, p);
  return `<span class="dot" style="background:${s.color}"></span>${s.name}`;
};

export const STRUCTURE_COLORS = ['white', 'blue', 'green', 'black'];
export const STRUCTURE_TYPES = ['stone', 'shed'];

export function defaultGame() {
  return {
    spec: {
      tiles: [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }, { id: 6 }]],
      buildings: [],
    },
    players: 4,
    colors: ['yellow', 'red', 'green', 'cyan'],
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
  if (seatColors(game).length < 3) problems.push('Choose at least 3 colours (Cryptid needs 3–5 players).');
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
  s.me ??= 0; // spectator: knows no clue
  s.game.colors ??= seatColors(s.game);
  s.ui = { tab: 'setup', coords: false, tool: { player: 1, cube: false }, overlay: 'viable', hideClue: false, adviceMode: 'turn', lambda: 0.5, winValue: 16, matchHints: false, ...s.ui };
  s.ui.winValue ??= 16; // (older saved states had a search threshold instead)
  s.ui.matchOpts ??= { players: 4, advanced: true, difficulty: 'hard', seat: 0, color: 'yellow' };
  s.ui.matchOpts.color ??= 'yellow';
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
