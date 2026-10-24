// Setup panel: players, mode, map tiles, structures, import/export.

import { structuresFor, setupProblems, defaultGame, PLAYERS, seatColors, swatch } from './state.js';
import { t } from './i18n.js';
import { structureIcon } from './board.js';
import { hexRef } from './hexref.js';

const label = (s) => t('structure.label', { color: t(`structureColor.${s.color}`), type: t(`structure.${s.type}.short`) });
const same = (a, b) => a.type === b.type && a.color === b.color;

export class SetupPanel {
  // clues, if given, is where known rules live instead of game.known (the
  // clue validator keeps them apart): {get() -> {seat: rule}, set(state, known),
  // onExport()}.
  constructor(root, store, engine, toast, clues = null) {
    this.root = root;
    this.store = store;
    this.engine = engine;
    this.toast = toast;
    this.clues = clues;
    this.placing = null; // structure {type, color} waiting for a hex tap
    this.drag = null; // structure being dragged, see installDrag
    this.installDrag();
  }

  locked() {
    const m = this.store.state.match;
    return this.store.state.ui.tab !== 'setup' || (m && m.phase !== 'over');
  }

  // installDrag lets structures be dragged from their chips or from the
  // board onto a hex. Pointer events cover mouse, touch and pen; a press
  // that moves less than a few pixels stays a tap, so tap-to-place works.
  installDrag() {
    const hexUnder = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('#board [data-x]');
    let target = null;
    const setTarget = (g) => {
      if (g === target) return;
      target?.classList.remove('drop-target');
      target = g;
      target?.classList.add('drop-target');
    };
    // Auto-scroll while the pointer is near the top or bottom of the window,
    // so a structure can be carried from the list below the board (on a
    // phone they're never on screen together) up to the board.
    let scroller = 0;
    let last = null;
    const EDGE = 70;
    const scroll = () => {
      scroller = 0;
      if (!this.drag?.ghost || !last) return;
      const v = last.clientY < EDGE ? -1 : last.clientY > innerHeight - EDGE ? 1 : 0;
      if (!v) return;
      scrollBy(0, v * 12);
      setTarget(hexUnder(last));
      scroller = requestAnimationFrame(scroll);
    };
    const end = () => {
      cancelAnimationFrame(scroller);
      scroller = 0;
      this.drag?.ghost?.remove();
      setTarget(null);
      this.drag = null;
    };
    document.addEventListener('pointerdown', (e) => {
      if (this.locked() || e.button > 0) return;
      const chip = e.target.closest('[data-struct], [data-dock]');
      // On a phone the list below the board is not a drag source: it would
      // fight with scrolling, and is off screen while carrying (the tray
      // under the board does the job). Tapping its chips still works.
      if (chip?.dataset.struct && matchMedia('(max-width: 959px)').matches) return;
      const hex = e.target.closest('#board [data-x]');
      let s;
      if (chip) {
        const [type, color] = (chip.dataset.struct ?? chip.dataset.dock).split(',');
        s = { type, color };
      } else if (hex) {
        const b = this.store.state.game.spec.buildings.find((b) => b.x === +hex.dataset.x && b.y === +hex.dataset.y);
        if (!b) return;
        s = { type: b.type, color: b.color };
      } else return;
      this.drag = { s, fromBoard: !chip, x0: e.clientX, y0: e.clientY, ghost: null };
    });
    // On touch screens the browser starts scrolling as soon as a finger
    // moves, and touch-action doesn't reach the SVG shapes of structures on
    // the board. Cancelling the first touchmove while a structure is held
    // keeps the gesture ours.
    document.addEventListener('touchmove', (e) => {
      if (this.drag && e.cancelable) e.preventDefault();
    }, { passive: false });
    // The browser's own drag-and-drop (of an icon, or of selected text) would
    // cancel our pointer events mid-drag, so refuse it while we hold a structure.
    document.addEventListener('dragstart', (e) => {
      if (this.drag) e.preventDefault();
    });
    document.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (!d.ghost) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
        d.ghost = document.createElement('div');
        d.ghost.className = 'drag-ghost';
        d.ghost.innerHTML = structureIcon(d.s.type, d.s.color, 32);
        document.body.appendChild(d.ghost);
      }
      e.preventDefault();
      d.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      setTarget(hexUnder(e));
      d.ghost.classList.toggle('off', d.fromBoard && !target); // letting go here takes it off the board
      last = { clientX: e.clientX, clientY: e.clientY };
      if (!scroller) scroller = requestAnimationFrame(scroll);
    });
    document.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (!d) return;
      const g = d.ghost && hexUnder(e);
      const dragged = !!d.ghost;
      end();
      if (!dragged) return; // a tap: the click handlers take it from here
      // The click that follows a drag must not also count as a tap.
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
      if (g) this.drop(d.s, +g.dataset.x, +g.dataset.y);
      else if (d.fromBoard) this.remove(d.s); // dragged off the board
    });
    document.addEventListener('pointercancel', end);
  }

  // remove takes structure s off the board, back to the ones still to place.
  remove(s) {
    this.store.update((st) => {
      st.game.spec.buildings = st.game.spec.buildings.filter((b) => !same(b, s));
    });
    this.render();
  }

  // drop puts structure s on hex (x, y). If another structure is there, the
  // two swap places when s was already on the board; otherwise it's refused.
  drop(s, x, y) {
    const bs = this.store.state.game.spec.buildings;
    const here = bs.find((b) => b.x === x && b.y === y);
    const from = bs.find((b) => same(b, s));
    if (here && same(here, s)) return;
    if (here && !from) {
      this.toast(t('setup.occupied', { structure: label(here) }));
      return;
    }
    this.store.update((st) => {
      const list = st.game.spec.buildings.filter((b) => !same(b, s));
      if (here) {
        const other = list.find((b) => same(b, here));
        Object.assign(other, { x: from.x, y: from.y }); // swap places
      }
      list.push({ x, y, type: s.type, color: s.color });
      st.game.spec.buildings = list;
    });
    if (this.placing && same(this.placing, s)) {
      const placed = this.store.state.game.spec.buildings;
      this.placing = structuresFor(this.store.state.game).find((n) => !placed.some((b) => same(b, n))) ?? null;
    }
    this.render();
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
    if (this.store.state.match && this.store.state.match.phase !== 'over') return;
    const game = this.store.state.game;
    const here = game.spec.buildings.find((b) => b.x === x && b.y === y);
    if (!this.placing) {
      if (here) this.placing = { type: here.type, color: here.color };
      this.render();
      return;
    }
    if (here && !same(here, this.placing)) {
      this.toast(t('setup.occupied', { structure: label(here) }));
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
    if (this.store.state.match && this.store.state.match.phase !== 'over') {
      this.root.innerHTML = `<p class="status">${t('setup.locked')}</p>`;
      return;
    }
    const problems = setupProblems(game);
    this.root.innerHTML = `
      <h3>${t('setup.players')}</h3>
      <p class="hint">${t('setup.playersHint')}</p>
      <div class="chips">${PLAYERS.map((c) => {
        const i = seatColors(game).indexOf(c.name);
        return `<button data-color="${c.name}" class="chip ${i >= 0 ? 'on' : ''}" aria-pressed="${i >= 0}">
          ${swatch(c.color, c.letter)}</button>`;
      }).join('')}</div>
      <div class="field"><span>${t('setup.mode')}</span>
        <div class="seg">
          <button data-mode="basic" class="${game.advanced ? '' : 'on'}">${t('setup.basic')}</button>
          <button data-mode="advanced" class="${game.advanced ? 'on' : ''}">${t('setup.advanced')}</button>
        </div>
      </div>
      <h3>${t('setup.tiles')}</h3>
      <p class="hint">${t('setup.tilesHint')}</p>
      <div class="tiles">
        ${game.spec.tiles.flatMap((row, r) => row.map((tile, c) => `
          <div class="tile">
            <select data-slot="${r},${c}" aria-label="${t('setup.tileSlot', { row: r + 1, col: c + 1 })}">
              ${[1, 2, 3, 4, 5, 6].map((id) => `<option value="${id}" ${tile.id === id ? 'selected' : ''}>${t('setup.tile', { id })}</option>`).join('')}
            </select>
            <button data-flip="${r},${c}" class="flip ${tile.flipped ? 'on' : ''}" title="${t('setup.rotated')}">⟲</button>
          </div>`)).join('')}
      </div>
      <h3>${t('setup.structures')}</h3>
      <p class="hint">${t('setup.structuresHint')}</p>
      <div class="structs">
        ${structuresFor(game).map((s) => {
          const b = game.spec.buildings.find((b) => same(b, s));
          const on = this.placing && same(this.placing, s);
          return `<button data-struct="${s.type},${s.color}" class="struct ${on ? 'on' : ''}">
            ${structureIcon(s.type, s.color, 18)}${label(s)}
            <span class="where">${b ? hexRef(b.x, b.y, false) : on ? t('setup.tapHex') : '—'}</span></button>`;
        }).join('')}
      </div>
      <p class="status ${problems.length ? 'warn' : 'ok'}">${problems.length ? problems.join(' ') : t('setup.ready')}</p>
      <div class="actions">
        <button data-act="random">${t('setup.random')}</button>
        <button data-act="import">${t('setup.import')}</button>
        <button data-act="export">${t('setup.export')}</button>
        <button data-act="reset" class="danger">${t('setup.newGame')}</button>
      </div>`;
    this.bind();
  }

  // pick selects structure s for tap-to-place (or deselects it if it was).
  pick(type, color) {
    this.placing = this.placing && same(this.placing, { type, color }) ? null : { type, color };
    this.store.update(() => {}); // redraw the board overlay
  }

  // renderDock shows the structures not yet on the board in a tray right
  // under it (#struct-dock, only on narrow screens), so that on a phone they
  // can be dragged without scrolling between the list and the board. It is
  // empty outside the Setup tab.
  renderDock() {
    const dock = document.getElementById('struct-dock');
    if (!dock) return;
    const { game } = this.store.state;
    const todo = this.locked() ? [] : structuresFor(game).filter((s) => !game.spec.buildings.some((b) => same(b, s)));
    dock.hidden = !todo.length;
    dock.innerHTML = todo.length ? `
      <div class="dock-hint">${t('setup.dockHint')}</div>
      <div class="dock-row">${todo.map((s) => `<button data-dock="${s.type},${s.color}" class="dock-struct ${this.placing && same(this.placing, s) ? 'on' : ''}"
        title="${label(s)}" aria-label="${label(s)}">${structureIcon(s.type, s.color, 30)}</button>`).join('')}</div>` : '';
    dock.querySelectorAll('[data-dock]').forEach((b) => (b.onclick = () => this.pick(...b.dataset.dock.split(','))));
  }

  bind() {
    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-color]').forEach((b) => (b.onclick = () => this.toggleColor(b.dataset.color)));
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
      for (const row of tiles) for (const tile of row) if (tile.id === id) tile.id = tiles[r][c].id;
      tiles[r][c].id = id;
    })));
    q('[data-flip]').forEach((b) => (b.onclick = () => this.store.update((s) => {
      const [r, c] = b.dataset.flip.split(',').map(Number);
      const t = s.game.spec.tiles[r][c];
      t.flipped = !t.flipped;
    })));
    q('[data-struct]').forEach((b) => (b.onclick = () => this.pick(...b.dataset.struct.split(','))));
    q('[data-act]').forEach((b) => (b.onclick = () => this[b.dataset.act]()));
  }

  // toggleColor adds or removes a color. Order doesn't matter at the table,
  // so seats follow the fixed color order; markers, known clues and "me"
  // move with their color. Fewer than 3 is allowed while choosing; the
  // setup check then asks for more.
  toggleColor(name) {
    this.store.update((s) => {
      const g = s.game;
      const old = seatColors(g);
      const on = new Set(old);
      if (on.has(name)) on.delete(name);
      else on.add(name);
      const colors = PLAYERS.map((c) => c.name).filter((c) => on.has(c));
      const moved = (p) => colors.indexOf(old[p - 1]) + 1; // 0 if its color left
      g.markers = g.markers.map((m) => ({ ...m, player: moved(m.player) })).filter((m) => m.player);
      g.known = Object.fromEntries(Object.entries(g.known).map(([p, r]) => [moved(+p), r]).filter(([p]) => p));
      s.me = s.me ? moved(s.me) : 0;
      s.ui.tool.player = moved(s.ui.tool.player) || 1;
      s.history = { past: [], future: [] }; // undo steps refer to the old seats
      g.colors = colors;
      g.players = colors.length;
    });
  }

  async random() {
    const { game } = this.store.state;
    if (seatColors(game).length < 3) return this.toast(t('setup.needColors'));
    if (game.markers.length && !confirm(t('setup.confirmRandom'))) return;
    const g = await this.engine.call('randomSetup', { players: game.players, advanced: game.advanced, seed: Date.now() % 1e9 });
    this.placing = null;
    this.store.update((s) => {
      s.game = { ...g, colors: seatColors(s.game), markers: [], known: {} };
      this.clues?.set(s, {}); // a new board starts with no clues
    });
  }

  reset() {
    if (!confirm(t('setup.confirmNew'))) return;
    this.placing = null;
    this.store.update((s) => {
      const keep = s.game;
      s.game = defaultGame();
      s.game.players = keep.players;
      s.game.colors = seatColors(keep);
      s.game.advanced = keep.advanced;
      this.clues?.set(s, {}); // a new game starts with no clues
    });
  }

  async export() {
    this.clues?.onExport?.(); // first, while still inside the click that asked for it
    const { game } = this.store.state;
    const known = this.clues ? this.clues.get() : game.known;
    const text = await this.engine.call('format', { game: { ...game, known } });
    textDialog(t('setup.exportTitle'), t('setup.exportHint'), text, [
      [t('setup.copy'), async (text) => { await navigator.clipboard.writeText(text); this.toast(t('setup.copied')); }],
      [t('setup.download'), (text) => download('cryptid-game.txt', text)],
    ]);
  }

  import() {
    textDialog(t('setup.importTitle'), t('setup.importHint'), '', [
      [t('setup.load'), async (text) => {
        const g = await this.engine.call('parse', { text });
        this.placing = null;
        this.store.update((s) => {
          s.game = { markers: [], known: {}, ...g };
          s.game.colors = seatColors(s.game);
          if (this.clues) {
            this.clues.set(s, s.game.known); // every known rule, kept out of the game
            s.game.known = {};
            return;
          }
          const known = Object.keys(s.game.known);
          if (known.length === 1) s.me = +known[0];
          else if (s.me > s.game.players) s.me = 0;
        });
        this.toast(t('setup.loaded'));
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
    <button value="close">${t('common.close')}</button></div></form>`;
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
