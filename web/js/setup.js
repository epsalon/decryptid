// Setup panel: players, mode, map tiles, structures, import/export.

import { structuresFor, setupProblems, defaultGame } from './state.js';

const label = (s) => `${s.color[0].toUpperCase()}${s.color.slice(1)} ${s.type}`;
const same = (a, b) => a.type === b.type && a.color === b.color;

export class SetupPanel {
  constructor(root, store, engine, toast) {
    this.root = root;
    this.store = store;
    this.engine = engine;
    this.toast = toast;
    this.placing = null; // structure {type, color} waiting for a hex tap
  }

  // overlay marks the hex of the structure being placed.
  overlay() {
    const o = new Map();
    const b = this.placing && this.store.state.game.spec.buildings.find((b) => same(b, this.placing));
    if (b) o.set(`${b.x},${b.y}`, { kind: 'select' });
    return o;
  }

  // onHex handles a board tap while this panel is shown.
  onHex(x, y) {
    const game = this.store.state.game;
    const here = game.spec.buildings.find((b) => b.x === x && b.y === y);
    if (!this.placing) {
      if (here) this.placing = { type: here.type, color: here.color };
      this.render();
      return;
    }
    if (here && !same(here, this.placing)) {
      this.toast(`${label(here)} is already there.`);
      return;
    }
    const s = this.placing;
    this.store.update((st) => {
      const bs = st.game.spec.buildings.filter((b) => !same(b, s));
      bs.push({ x, y, type: s.type, color: s.color });
      st.game.spec.buildings = bs;
    });
    // Move on to the next structure that still needs a spot.
    const placed = this.store.state.game.spec.buildings;
    this.placing = structuresFor(game).find((n) => !placed.some((b) => same(b, n))) ?? null;
    this.render();
  }

  render() {
    const { game } = this.store.state;
    const problems = setupProblems(game);
    this.root.innerHTML = `
      <div class="field"><span>Players</span>
        <div class="seg">${[3, 4, 5].map((n) => `<button data-players="${n}" class="${game.players === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Mode</span>
        <div class="seg">
          <button data-mode="basic" class="${game.advanced ? '' : 'on'}">Basic</button>
          <button data-mode="advanced" class="${game.advanced ? 'on' : ''}">Advanced</button>
        </div>
      </div>
      <h3>Map tiles</h3>
      <p class="hint">Copy the layout from the official app. ⟲ marks a tile that is upside down.</p>
      <div class="tiles">
        ${game.spec.tiles.flatMap((row, r) => row.map((t, c) => `
          <div class="tile">
            <select data-slot="${r},${c}" aria-label="Tile in row ${r + 1}, column ${c + 1}">
              ${[1, 2, 3, 4, 5, 6].map((id) => `<option value="${id}" ${t.id === id ? 'selected' : ''}>Tile ${id}</option>`).join('')}
            </select>
            <button data-flip="${r},${c}" class="flip ${t.flipped ? 'on' : ''}" title="Rotated 180°">⟲</button>
          </div>`)).join('')}
      </div>
      <h3>Structures</h3>
      <p class="hint">Tap a structure, then its hex on the board.</p>
      <div class="structs">
        ${structuresFor(game).map((s) => {
          const b = game.spec.buildings.find((b) => same(b, s));
          const on = this.placing && same(this.placing, s);
          return `<button data-struct="${s.type},${s.color}" class="struct ${on ? 'on' : ''}">
            <span class="icon ${s.type} ${s.color}"></span>${label(s)}
            <span class="where">${b ? `${b.x},${b.y}` : on ? 'tap a hex' : '—'}</span></button>`;
        }).join('')}
      </div>
      <p class="status ${problems.length ? 'warn' : 'ok'}">${problems.length ? problems.join(' ') : '✓ Board ready.'}</p>
      <div class="actions">
        <button data-act="random">Random board</button>
        <button data-act="import">Import…</button>
        <button data-act="export">Export…</button>
        <button data-act="reset" class="danger">New game</button>
      </div>`;
    this.bind();
  }

  bind() {
    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-players]').forEach((b) => (b.onclick = () => this.store.update((s) => {
      s.game.players = +b.dataset.players;
      s.game.markers = s.game.markers.filter((m) => m.player <= s.game.players);
      if (s.me > s.game.players) s.me = 1;
    })));
    q('[data-mode]').forEach((b) => (b.onclick = () => this.store.update((s) => {
      s.game.advanced = b.dataset.mode === 'advanced';
      if (!s.game.advanced) s.game.spec.buildings = s.game.spec.buildings.filter((x) => x.color !== 'black');
      s.game.known = {}; // a known rule may not exist in the new mode
    })));
    q('[data-slot]').forEach((sel) => (sel.onchange = () => this.store.update((s) => {
      const [r, c] = sel.dataset.slot.split(',').map(Number);
      const id = +sel.value;
      const tiles = s.game.spec.tiles;
      // Keep each tile used once: swap with the slot that had it.
      for (const row of tiles) for (const t of row) if (t.id === id) t.id = tiles[r][c].id;
      tiles[r][c].id = id;
    })));
    q('[data-flip]').forEach((b) => (b.onclick = () => this.store.update((s) => {
      const [r, c] = b.dataset.flip.split(',').map(Number);
      const t = s.game.spec.tiles[r][c];
      t.flipped = !t.flipped;
    })));
    q('[data-struct]').forEach((b) => (b.onclick = () => {
      const [type, color] = b.dataset.struct.split(',');
      this.placing = this.placing && same(this.placing, { type, color }) ? null : { type, color };
      this.store.update(() => {}); // redraw the board overlay
    }));
    q('[data-act]').forEach((b) => (b.onclick = () => this[b.dataset.act]()));
  }

  async random() {
    const { game } = this.store.state;
    const g = await this.engine.call('randomSetup', { players: game.players, advanced: game.advanced, seed: Date.now() % 1e9 });
    this.placing = null;
    this.store.update((s) => {
      s.game = { ...g, markers: [], known: {} };
    });
  }

  reset() {
    if (!confirm('Start a new game? This clears the board and all markers.')) return;
    this.placing = null;
    this.store.update((s) => {
      const keep = s.game;
      s.game = defaultGame();
      s.game.players = keep.players;
      s.game.advanced = keep.advanced;
    });
  }

  async export() {
    const text = await this.engine.call('format', { game: this.store.state.game });
    textDialog('Export game', 'This is the same format the command-line tool reads.', text, [
      ['Copy', async (t) => { await navigator.clipboard.writeText(t); this.toast('Copied.'); }],
      ['Download', (t) => download('cryptid-game.txt', t)],
    ]);
  }

  import() {
    textDialog('Import game', 'Paste a game file (as exported, or written for the command-line tool).', '', [
      ['Load', async (t) => {
        const g = await this.engine.call('parse', { text: t });
        this.placing = null;
        this.store.update((s) => {
          s.game = { markers: [], known: {}, ...g };
          const known = Object.keys(s.game.known);
          if (known.length === 1) s.me = +known[0];
        });
        this.toast('Game loaded.');
      }],
    ], true);
  }
}

// textDialog shows a modal with a text area and action buttons. Each action
// gets the text; if it throws, the error is shown and the dialog stays open.
function textDialog(title, hint, text, actions, editable = false) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog"><h3>${title}</h3><p class="hint">${hint}</p>
    <textarea rows="14" spellcheck="false" ${editable ? '' : 'readonly'}></textarea>
    <p class="error"></p>
    <div class="actions">${actions.map((a, i) => `<button type="button" data-i="${i}">${a[0]}</button>`).join('')}
    <button value="close">Close</button></div></form>`;
  d.querySelector('textarea').value = text;
  d.querySelectorAll('[data-i]').forEach((b) => (b.onclick = async () => {
    try {
      await actions[+b.dataset.i][1](d.querySelector('textarea').value);
      if (editable) d.close();
    } catch (e) {
      d.querySelector('.error').textContent = e.message;
    }
  }));
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d);
  d.showModal();
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
