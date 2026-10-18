// SVG board drawing. Hex geometry comes from Honeycomb: flat-top hexes
// with odd columns shifted down ("odd-q", offset -1), matching the engine.

import { defineHex, Grid, Orientation, rectangle } from '../vendor/honeycomb-grid.mjs';
import { PLAYERS } from './state.js';

const S = 30; // hex radius in SVG units
const HexShape = defineHex({ dimensions: S, orientation: Orientation.FLAT, offset: -1, origin: 'topLeft' });
const grid = new Grid(HexShape, rectangle({ width: 12, height: 9 }));
const PAD = 4;

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

// Hex corners relative to the hex centre, scaled by f.
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

  // render draws hexes (from the engine's 'board' op) with the game's
  // markers. overlay maps "x,y" to {kind, label}; opts.coords shows x,y.
  render(hexes, markers = [], overlay = new Map(), opts = {}) {
    this.svg.replaceChildren();
    const root = el('g', {}, this.svg);
    const byHex = new Map();
    for (const m of markers) {
      const k = `${m.x},${m.y}`;
      if (!byHex.has(k)) byHex.set(k, { discs: [], cube: 0 });
      if (m.cube) byHex.get(k).cube = m.player;
      else byHex.get(k).discs.push(m.player);
    }
    for (const h of hexes) {
      const center = grid.getHex({ col: h.x, row: h.y });
      const key = `${h.x},${h.y}`;
      const g = el('g', { 'data-x': h.x, 'data-y': h.y, transform: `translate(${center.x},${center.y})`, class: 'hex' }, root);
      const t = TERRAIN[h.terrain];
      el('polygon', { points: points(), fill: t.fill, class: 'hex-bg' }, g);
      el('text', { x: -S * 0.5, y: -S * 0.42, class: 'glyph' }, g).textContent = t.glyph;
      if (h.animal) el('polygon', { points: points(0.84), class: `territory ${h.animal}` }, g);
      if (h.structure) drawStructure(g, h.structure, h.color);
      const pieces = byHex.get(key);
      if (pieces) drawPieces(g, pieces);
      if (opts.coords) el('text', { y: S * 0.74, class: 'coord' }, g).textContent = key;
      const o = overlay.get(key);
      if (o) {
        el('polygon', { points: points(0.92), class: `ring ${o.kind}` }, g);
        if (o.label != null) {
          el('circle', { cx: S * 0.5, cy: -S * 0.5, r: S * 0.24, class: `badge ${o.kind}` }, g);
          el('text', { x: S * 0.5, y: -S * 0.5, class: 'badge-text' }, g).textContent = o.label;
        }
      }
    }
  }
}

function drawStructure(g, type, color) {
  const attrs = { fill: STRUCTURE_FILL[color], class: `structure ${color}` };
  if (type === 'stone') el('polygon', { points: regular(8, S * 0.34, Math.PI / 8), ...attrs }, g);
  else el('polygon', { points: '-10,10 10,10 10,-2 0,-12 -10,-2', ...attrs }, g); // a shed: a little house
}

function drawPieces(g, { discs, cube }) {
  discs.sort((a, b) => a - b);
  discs.forEach((p, i) => {
    const x = (i - (discs.length - 1) / 2) * S * 0.3;
    el('circle', { cx: x, cy: S * 0.52, r: S * 0.14, fill: PLAYERS[p - 1].color, class: 'disc' }, g);
  });
  if (cube) {
    const s = S * 0.34;
    el('rect', { x: -s / 2, y: -S * 0.62 - s / 2, width: s, height: s, fill: PLAYERS[cube - 1].color, class: 'cube' }, g);
  }
}
