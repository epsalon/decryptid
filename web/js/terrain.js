// Terrain and animal territories only change with the tiles, so they are
// fetched from the engine only then. Structures are drawn from the game
// state directly, so placing or moving one redraws at once, without
// waiting for the engine; markers and overlays are redrawn on every change.
//
// The worker answers one request at a time, so a page that also asks for
// slow analysis must call request() before it: otherwise a changed tile
// would only be redrawn after that analysis, which takes a few hundred ms
// on a fresh 5-player advanced board.

export class Terrain {
  constructor(engine) {
    this.engine = engine;
    this.hexes = []; // the terrain of the tiles in `have`
    this.have = '';
    this.req = { key: '', done: null }; // the request in flight
  }

  static key = (game) => JSON.stringify(game.spec.tiles);

  // request starts fetching the terrain for game's tiles, unless it has it.
  request(game) {
    const key = Terrain.key(game);
    if (key === this.have || key === this.req.key) return;
    const bare = { ...game, spec: { tiles: game.spec.tiles, buildings: [] }, markers: [] };
    this.req = {
      key,
      done: this.engine.latest('board', 'board', { game: bare }).then((h) => {
        if (h === undefined) return; // superseded by a newer change
        this.hexes = h;
        this.have = key;
      }, (err) => {
        this.req.key = ''; // retry on the next request
        throw err;
      }),
    };
  }

  // ready resolves to the terrain for game's tiles, or null if the tiles
  // changed again meanwhile (a newer draw will show them).
  async ready(game) {
    const key = Terrain.key(game);
    if (key !== this.have) {
      await this.req.done;
      if (key !== this.have) return null;
    }
    return this.hexes;
  }
}
