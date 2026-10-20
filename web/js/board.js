// SVG board drawing. Hex geometry comes from Honeycomb: flat-top hexes
// with odd columns shifted down ("odd-q", offset -1), matching the engine.

import { defineHex, Grid, Orientation, rectangle } from '../vendor/honeycomb-grid.mjs';

const S = 30; // hex radius in SVG units
const HexShape = defineHex({ dimensions: S, orientation: Orientation.FLAT, offset: -1, origin: 'topLeft' });
const grid = new Grid(HexShape, rectangle({ width: 12, height: 9 }));
const PAD = 4;
// Inset of the territory outline, as a fraction of the hex radius.
const TERRITORY = 0.76;

const TERRAIN = {
  forest: { fill: '#4f8a3c', glyph: '♣' },
  swamp: { fill: '#7b5e93', glyph: '≈' },
  mountain: { fill: '#9b9b9b', glyph: '▲' },
  desert: { fill: '#e3c16f', glyph: '∴' },
  water: { fill: '#4b8fcb', glyph: '~' },
};
const STRUCTURE_FILL = { white: '#f7f7f7', blue: '#2563eb', green: '#16a34a', black: '#1f1f1f' };

const NS = 'http://www.w3.org/2000/svg';
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Hex corners relative to the hex center, scaled by f.
const first = grid.getHex({ col: 0, row: 0 });
const corners = first.corners.map((c) => [c.x - first.x, c.y - first.y]);
const points = (f = 1) => corners.map(([x, y]) => `${(x * f).toFixed(2)},${(y * f).toFixed(2)}`).join(' ');
const regular = (n, r, rot = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

// Board renders into an <svg> and reports taps on hexes.
export class Board {
  constructor(svg, onHex) {
    this.svg = svg;
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${grid.pixelWidth + 2 * PAD} ${grid.pixelHeight + 2 * PAD}`);
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-x]');
      if (g) onHex(+g.dataset.x, +g.dataset.y);
    });
  }

  // spotlight dims the board except hex (x, y) and rings it, until called
  // with null. It survives re-renders.
  spotlight(x, y = 0) {
    this.spot = x == null ? null : { x, y };
    this.applySpotlight();
  }

  applySpotlight() {
    this.svg.querySelector('.spot-ring')?.remove();
    this.svg.querySelector('.hex.spot')?.classList.remove('spot');
    this.svg.classList.toggle('spotlit', !!this.spot);
    if (!this.spot) return;
    const g = this.svg.querySelector(`[data-x="${this.spot.x}"][data-y="${this.spot.y}"]`);
    if (!g) return;
    g.classList.add('spot');
    const ring = el('g', { class: 'spot-ring', transform: g.getAttribute('transform') }, this.svg.lastElementChild);
    el('polygon', { points: points(1.08), class: 'spot-outer' }, ring);
    el('polygon', { points: points(1.08), class: 'spot-inner' }, ring);
  }

  // setCursor shows the keyboard cursor on hex (x, y), or hides it (null).
  // Like the spotlight, it survives re-renders.
  setCursor(x, y = 0) {
    this.cursor = x == null ? null : { x, y };
    this.applyCursor();
  }

  applyCursor() {
    this.svg.querySelector('.cursor-ring')?.remove();
    if (!this.cursor) return;
    const g = this.svg.querySelector(`[data-x="${this.cursor.x}"][data-y="${this.cursor.y}"]`);
    if (!g) return;
    const ring = el('g', { class: 'cursor-ring', transform: g.getAttribute('transform') }, this.svg.lastElementChild);
    el('polygon', { points: points(0.96), class: 'cursor-outer' }, ring);
    el('polygon', { points: points(0.96), class: 'cursor-inner' }, ring);
  }

  // render draws hexes (from the engine's 'board' op) with the game's
  // markers. overlay maps "x,y" to {viable, kind, label}: viable hexes are
  // lightened and, if any hex is viable, all others hatched and darkened (CSS
  // classes possible and ruled); kind adds an inner ring of that style, and
  // label a badge. Brightness doesn't show likelihood; the Play tab's bars do. opts.coords shows x,y;
  // opts.tiles (the setup's tile slots) labels each slot with its tile number
  // and outlines the tiles.
  render(hexes, markers = [], overlay = new Map(), opts = {}) {
    this.svg.replaceChildren();
    const defs = el('defs', {}, this.svg);
    const pat = el('pattern', {
      id: 'ruled-out-hatch',
      width: '8',
      height: '8',
      patternTransform: 'rotate(45 0 0)',
      patternUnits: 'userSpaceOnUse',
    }, defs);
    el('line', { x1: '0', y1: '0', x2: '0', y2: '8', stroke: '#000', 'stroke-width': '1.5' }, pat);

    const root = el('g', {}, this.svg);
    const byHex = new Map();
    for (const m of markers) {
      const k = `${m.x},${m.y}`;
      if (!byHex.has(k)) byHex.set(k, { discs: [], cube: 0 });
      if (m.cube) byHex.get(k).cube = m.player;
      else byHex.get(k).discs.push(m.player);
    }
    const hasViable = Array.from(overlay.values()).some((o) => o.viable);
    const labels = opts.tiles ? tileLabels(opts.tiles) : null;
    for (const h of hexes) {
      const center = grid.getHex({ col: h.x, row: h.y });
      const key = `${h.x},${h.y}`;
      const o = overlay.get(key);
      const state = o?.viable ? ' possible' : hasViable ? ' ruled' : '';
      const g = el('g', { 'data-x': h.x, 'data-y': h.y, transform: `translate(${center.x},${center.y})`, class: `hex${h.structure ? ' has-structure' : ''}${state}` }, root);
      const t = TERRAIN[h.terrain];
      el('polygon', { points: points(), fill: t.fill, class: 'hex-bg' }, g);
      if (state === ' ruled') el('polygon', { points: points(), class: 'ruled-out' }, g);
      el('text', { x: -S * 0.52, y: -S * 0.6, class: 'glyph' }, g).textContent = t.glyph;
      if (h.animal) el('polygon', { points: points(TERRITORY), class: `territory ${h.animal}` }, g);
      const tile = labels?.get(key);
      if (tile) {
        // Drawn before the structure, so it never hides one; with a
        // structure here, it moves aside towards the slot's outer corner.
        const dx = h.structure ? (tile.flipped ? 1 : -1) * S * 0.55 : 0;
        el('text', { x: dx, class: `tile-label${h.structure ? ' beside' : ''}` }, g).textContent = tile.id;
      }
      if (h.structure) drawStructure(g, h.structure, h.color);
      const pieces = byHex.get(key);
      if (pieces) drawPieces(g, pieces, opts.seats);
      if (opts.coords) el('text', { y: S * 0.74, class: 'coord' }, g).textContent = key;
      if (o?.kind) el('polygon', { points: points(o.viable ? 0.6 : 0.92), class: `ring ${o.kind}` }, g);
      if (o) {
        if (o.label != null) {
          el('circle', { cx: S * 0.45, cy: -S * 0.45, r: S * 0.34, class: `badge ${o.kind}` }, g);
          el('text', { x: S * 0.45, y: -S * 0.45, class: 'badge-text' }, g).textContent = o.label;
        }
      }
    }
    if (opts.tiles) drawTileBorders(root);
    this.applySpotlight();
    this.applyCursor();
  }
}

// Structure outlines around (0, 0): a standing stone is an octagon, a shed
// a little house.
const STRUCTURE_POINTS = {
  stone: regular(8, S * 0.34, Math.PI / 8),
  shed: '-10,10 10,10 10,-2 0,-12 -10,-2',
};

function drawStructure(g, type, color) {
  el('polygon', { points: STRUCTURE_POINTS[type], fill: STRUCTURE_FILL[color], class: `structure ${color}` }, g);
}

// structureIcon is an inline SVG of a structure, drawn exactly as on the
// board, for use outside it (setup chips, the drag ghost).
export function structureIcon(type, color, size = 16) {
  return `<svg class="structure-icon" width="${size}" height="${size}" viewBox="-13 -13 26 26" aria-hidden="true">
    <polygon points="${STRUCTURE_POINTS[type]}" fill="${STRUCTURE_FILL[color]}" class="structure ${color}"/></svg>`;
}

// drawPieces puts each color's disc in a fixed spot around the hex
// (pentagon corners, yellow at the bottom), so pieces are recognizable by
// position as well as color. The cube goes in the middle, over any
// structure. seats[p-1] is seat p's {color, slot}.
function drawPieces(g, { discs, cube }, seats) {
  for (const p of discs) {
    const a = Math.PI / 2 + (seats[p - 1].slot * 2 * Math.PI) / 5;
    el('circle', { cx: S * 0.52 * Math.cos(a), cy: S * 0.52 * Math.sin(a), r: S * 0.27, fill: seats[p - 1].color, class: 'disc' }, g);
  }
  if (cube) {
    const s = S * 0.5;
    el('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: 2, fill: seats[cube - 1].color, class: 'cube' }, g);
  }
}

// tileLabels maps each slot's corner hex ("x,y") to its tile: the number
// sits where it is printed on the physical tile, top-left, or bottom-right
// when the tile is rotated 180°. Slots are 6 columns by 3 rows.
function tileLabels(tiles) {
  const out = new Map();
  tiles.forEach((row, r) => row.forEach((t, c) => {
    const x = t.flipped ? 6 * c + 5 : 6 * c;
    const y = t.flipped ? 3 * r + 2 : 3 * r;
    out.set(`${x},${y}`, t);
  }));
  return out;
}

// drawTileBorders outlines the six map tiles: a thick line on every hex
// edge between two hexes in different tile slots (6 columns by 3 rows).
function drawTileBorders(root) {
  const slot = (x, y) => `${Math.floor(x / 6)},${Math.floor(y / 3)}`;
  const layer = el('g', { class: 'tile-borders' }, root);
  for (const hex of grid) {
    const { col: x, row: y } = hex;
    // Odd-q neighbors to the right and below (each edge once).
    const below = [[x, y + 1], ...(x % 2 ? [[x + 1, y], [x + 1, y + 1]] : [[x + 1, y - 1], [x + 1, y]])];
    for (const [nx, ny] of below) {
      if (nx > 11 || ny < 0 || ny > 8 || slot(x, y) === slot(nx, ny)) continue;
      const n = grid.getHex({ col: nx, row: ny });
      // The shared edge joins this hex's two corners nearest the neighbor.
      const [a, b] = [...hex.corners]
        .sort((p, q) => Math.hypot(p.x - n.x, p.y - n.y) - Math.hypot(q.x - n.x, q.y - n.y));
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'tile-border' }, layer);
    }
  }
}
