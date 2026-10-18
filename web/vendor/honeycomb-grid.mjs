// honeycomb-grid 4.1.5 (MIT, https://github.com/flauwekeul/honeycomb), vendored unmodified. See honeycomb-grid.LICENSE.
const l = (r) => Number.isFinite(r) && !Number.isNaN(r), p = (r) => typeof r == "object" && r !== null, wt = (r) => p(r) && l(r.q) && l(r.r), V = (r) => typeof r == "function", S = (r) => p(r) && l(r.col) && l(r.row), Z = (r) => p(r) && l(r.x) && l(r.y), H = (r) => Array.isArray(r) && l(r[0]) && l(r[1]), P = (r, t) => t + r * (t & 1) >> 1;
function X(r, t) {
  return (r % t + t) % t;
}
const D = (r, t) => X(r + t, 8), E = ([r, t, e = -r - t]) => ({ q: r, r: t, s: e });
function C({ q: r, r: t, s: e }) {
  const n = l(r), s = l(t), o = l(e);
  if (n && s && o)
    return { q: r, r: t, s: e };
  if (n && s)
    return { q: r, r: t, s: -r - t };
  if (n && o)
    return { q: r, r: -r - e, s: e };
  if (s && o)
    return { q: -t - e, r: t, s: e };
  throw new TypeError(
    `Can't determine three cube coordinates from less than two coordinates. Received: { q: ${r}, r: ${t}, s: ${e} }.`
  );
}
var x = /* @__PURE__ */ ((r) => (r.FLAT = "FLAT", r.POINTY = "POINTY", r))(x || {});
function G(r, t) {
  if (p(r) && r.xRadius > 0 && r.yRadius > 0)
    return r;
  if (p(r) && r.width > 0 && r.height > 0) {
    const { width: e, height: n } = r;
    return t === x.POINTY ? { xRadius: e / Math.sqrt(3), yRadius: n / 2 } : { xRadius: e / 2, yRadius: n / Math.sqrt(3) };
  }
  if (r > 0)
    return { xRadius: r, yRadius: r };
  throw new TypeError(
    `Invalid dimensions: ${JSON.stringify(
      r
    )}. Dimensions must be expressed as an Ellipse ({ xRadius: number, yRadius: number }), a Rectangle ({ width: number, height: number }) or a number.`
  );
}
function tt(r, t) {
  if (Z(r))
    return r;
  if (!t)
    throw new TypeError(
      `Supply a bounding box ({ width: number, height: number }). Received: ${JSON.stringify(t)}`
    );
  if (r === "topLeft")
    return { x: t.width * -0.5, y: t.height * -0.5 };
  throw new TypeError(
    `Invalid origin: ${JSON.stringify(
      r
    )}. Origin must be expressed as a Point ({ x: number, y: number }) or the string 'topLeft'.`
  );
}
class $ {
  static get settings() {
    const { dimensions: t, orientation: e, origin: n, offset: s } = this.prototype;
    return { dimensions: t, orientation: e, origin: n, offset: s };
  }
  /**
   * This returns a point relative to the __top left corner__ of the hex with coordinates `[0, 0]`, ignoring any `origin` you may have set.
   *
   * @deprecated This probably doesn't do what you expect. If you want the center coordinates of a hex, use `hex.x` and `hex.y` instead.
   * See https://github.com/flauwekeul/honeycomb/discussions/95#discussioncomment-5158862.
   */
  get center() {
    const { width: t, height: e, x: n, y: s } = this;
    return { x: t / 2 - n, y: e / 2 - s };
  }
  get col() {
    return W(this).col;
  }
  // todo: add to docs that this always returns corners relative to Hex(0, 0)
  get corners() {
    const { orientation: t, width: e, height: n, x: s, y: o } = this;
    return t === x.POINTY ? rt(e, n, s, o) : et(e, n, s, o);
  }
  get dimensions() {
    return T.dimensions;
  }
  get height() {
    const {
      orientation: t,
      dimensions: { yRadius: e }
    } = this;
    return t === x.POINTY ? e * 2 : e * Math.sqrt(3);
  }
  get isFlat() {
    return this.orientation === x.FLAT;
  }
  get isPointy() {
    return this.orientation === x.POINTY;
  }
  get orientation() {
    return T.orientation;
  }
  get origin() {
    return T.origin;
  }
  get offset() {
    return T.offset;
  }
  get row() {
    return W(this).row;
  }
  get width() {
    const {
      orientation: t,
      dimensions: { xRadius: e }
    } = this;
    return t === x.POINTY ? e * Math.sqrt(3) : e * 2;
  }
  get x() {
    return J(this).x;
  }
  get y() {
    return J(this).y;
  }
  get s() {
    return -this.q - this.r;
  }
  q;
  r;
  constructor(t = [0, 0]) {
    const { q: e, r: n } = N(this, t);
    this.q = e, this.r = n;
  }
  clone(t = this) {
    return new this.constructor(t);
  }
  equals(t) {
    return st(this, S(t) ? U(this, t) : t);
  }
  toString() {
    return `${this.constructor.name}(${this.q},${this.r})`;
  }
  translate(t) {
    return ut(this, t);
  }
}
const T = {
  dimensions: { xRadius: 1, yRadius: 1 },
  orientation: x.POINTY,
  origin: { x: 0, y: 0 },
  offset: -1
}, rt = (r, t, e, n) => [
  { x: e + r * 0.5, y: n - t * 0.25 },
  { x: e + r * 0.5, y: n + t * 0.25 },
  { x: e, y: n + t * 0.5 },
  { x: e - r * 0.5, y: n + t * 0.25 },
  { x: e - r * 0.5, y: n - t * 0.25 },
  { x: e, y: n - t * 0.5 }
], et = (r, t, e, n) => [
  { x: e + r * 0.25, y: n - t * 0.5 },
  { x: e + r * 0.5, y: n },
  { x: e + r * 0.25, y: n + t * 0.5 },
  { x: e - r * 0.25, y: n + t * 0.5 },
  { x: e - r * 0.5, y: n },
  { x: e - r * 0.25, y: n - t * 0.5 }
];
function nt(r) {
  const { dimensions: t, orientation: e, origin: n, offset: s } = { ...T, ...r };
  return class extends $ {
    get dimensions() {
      return G(t, e);
    }
    get orientation() {
      return e;
    }
    get origin() {
      return tt(n, this);
    }
    get offset() {
      return s;
    }
  };
}
function st(r, t) {
  if (S(r) && S(t))
    return r.col === t.col && r.row === t.row;
  if (Object.hasOwn(r, "col") || Object.hasOwn(t, "col"))
    throw new Error(
      `Can't compare coordinates where one are offset coordinates. Either pass two offset coordinates or two axial/cube coordinates. Received: ${JSON.stringify(
        r
      )} and ${JSON.stringify(t)}`
    );
  const e = H(r) ? E(r) : r, n = H(t) ? E(t) : t;
  return e.q === n.q && e.r === n.r;
}
const ot = (r, t, e) => ({
  col: r + P(e, t),
  row: t
}), it = (r, t, e) => ({
  col: r,
  row: t + P(e, r)
}), W = ({ q: r, r: t, offset: e, isPointy: n }) => n ? ot(r, t, e) : it(r, t, e), J = ({ orientation: r, dimensions: { xRadius: t, yRadius: e }, origin: { x: n, y: s }, q: o, r: i }) => r === x.POINTY ? {
  x: t * Math.sqrt(3) * (o + i / 2) - n,
  y: e * 3 / 2 * i - s
} : {
  x: t * 3 / 2 * o - n,
  y: e * Math.sqrt(3) * (i + o / 2) - s
}, z = (r, t, e) => {
  const n = r - P(e, t), s = t, o = -n - s;
  return { q: n, r: s, s: o };
}, j = (r, t, e) => {
  const n = r, s = t - P(e, r), o = -n - s;
  return { q: n, r: s, s: o };
}, U = ({ offset: r, orientation: t }, { col: e, row: n }) => t === x.POINTY ? z(e, n, r) : j(e, n, r), L = (r) => {
  const { q: t, r: e, s: n } = C(r);
  let s = Math.round(t), o = Math.round(e), i = Math.round(n);
  const c = Math.abs(t - s), u = Math.abs(e - o), h = Math.abs(n - i);
  return c > u && c > h ? s = -o - i : u > h ? o = -s - i : i = -s - o, { q: s, r: o, s: i };
}, ct = ({ dimensions: { xRadius: r, yRadius: t }, origin: e, orientation: n }, { x: s, y: o }) => (s += e.x, o += e.y, n === x.POINTY ? L({ q: Math.sqrt(3) * s / (3 * r) - o / (3 * t), r: 2 / 3 * (o / t) }) : L({ q: 2 / 3 * (s / r), r: Math.sqrt(3) * o / (3 * t) - s / (3 * r) }));
function N(r, t) {
  return H(t) ? E(t) : S(t) ? U(r, t) : C(t);
}
function ut(r, t) {
  const { q: e, r: n, s } = C(r), { q: o, r: i, s: c } = C(t), u = { q: e + o, r: n + i, s: s + c };
  return r instanceof $ ? r.clone(u) : u;
}
function R(r, t, e) {
  const { q: n, r: s, s: o } = N(r, t), { q: i, r: c, s: u } = N(r, e);
  return Math.max(Math.abs(n - i), Math.abs(s - c), Math.abs(o - u));
}
var F = /* @__PURE__ */ ((r) => (r.CLOCKWISE = "CLOCKWISE", r.COUNTERCLOCKWISE = "COUNTERCLOCKWISE", r))(F || {}), a = /* @__PURE__ */ ((r) => (r[r.N = 0] = "N", r[r.NE = 1] = "NE", r[r.E = 2] = "E", r[r.SE = 3] = "SE", r[r.S = 4] = "S", r[r.SW = 5] = "SW", r[r.W = 6] = "W", r[r.NW = 7] = "NW", r))(a || {});
const ht = [
  null,
  // ambiguous
  { q: 1, r: -1 },
  // NE
  { q: 1, r: 0 },
  // E
  { q: 0, r: 1 },
  // SE
  null,
  // ambiguous
  { q: -1, r: 1 },
  // SW
  { q: -1, r: 0 },
  // W
  { q: 0, r: -1 }
  // NW
], ft = [
  { q: 0, r: -1 },
  // N
  { q: 1, r: -1 },
  // NE
  null,
  // ambiguous
  { q: 1, r: 0 },
  // SE
  { q: 0, r: 1 },
  // S
  { q: -1, r: 1 },
  // SW
  null,
  // ambiguous
  { q: -1, r: 0 }
  // NW
], at = ({ offset: r, q: t, r: e, col: n, row: s }, o) => {
  if (o === a.S || o === a.N) {
    const c = o === a.S ? s + 1 : s - 1;
    return z(n, c, r);
  }
  const i = ht[o];
  return { q: t + i.q, r: e + i.r };
}, lt = ({ offset: r, q: t, r: e, col: n, row: s }, o) => {
  if (o === a.E || o === a.W) {
    const c = o === a.E ? n + 1 : n - 1;
    return j(c, s, r);
  }
  const i = ft[o];
  return { q: t + i.q, r: e + i.r };
}, I = (r, t) => r.clone(r.isPointy ? at(r, t) : lt(r, t));
function b(r) {
  return Array.isArray(r) ? function(e, n) {
    const s = [];
    let o = n;
    for (const i of r)
      for (const c of i(e, o))
        s.push(o = c);
    return s;
  } : r;
}
const Tt = (...r) => (t) => r.map(t);
function v(r) {
  return gt(r) ? xt(r) : dt(r);
}
function gt(r) {
  return r.direction in a;
}
function xt({ start: r, direction: t, length: e }) {
  return function(s, o) {
    const i = [];
    let u = s(r ?? o);
    !r && o && (u = I(u, t));
    for (let h = 0; h < e; h++)
      i.push(u), u = I(u, t);
    return i;
  };
}
function dt({ start: r, stop: t }) {
  return function(n, s) {
    const o = [], i = n(r ?? s), c = B(i), u = B(N(i, t)), h = mt(c, u), f = R(i, i, t), y = 1 / Math.max(f, 1);
    let m = !r && s ? 1 : 0;
    for (m; m <= f; m++) {
      const O = L(h(y * m));
      o.push(n(O));
    }
    return o;
  };
}
function B({ q: r, r: t, s: e }) {
  return { q: r + 1e-6, r: t + 1e-6, s: e + -2e-6 };
}
function mt(r, t) {
  return (e) => {
    const n = r.q * (1 - e) + t.q * e, s = r.r * (1 - e) + t.r * e;
    return { q: n, r: s };
  };
}
const pt = (r) => (t, e) => [I(t(e), r)];
function _(r, t, { includeSource: e = !0 } = {}) {
  return function(s, o) {
    const i = [];
    for (const c of b(r)(s, o)) {
      e && i.push(c);
      for (const u of b(t)(s, c))
        i.push(u);
    }
    return i;
  };
}
function St(r, t) {
  return function(n, s) {
    const {
      width: o,
      height: i,
      start: c,
      direction: u = a.E
    } = t ? qt(r, t, n()) : r, h = c ?? s ?? [0, 0], f = _(
      v({ start: h, direction: D(u, 2), length: i }),
      v({ direction: u, length: o - 1 })
    )(n, h);
    return !c && s ? f.slice(1) : f;
  };
}
function qt(r, t, { isPointy: e, offset: n }) {
  const { col: s, row: o } = K(r, e, n), { col: i, row: c } = K(t, e, n), u = s < i ? "A" : "B", h = o < c ? "A" : "B", f = u + h, { swapWidthHeight: y, direction: m } = yt[f], O = Math.abs(s - i) + 1, g = Math.abs(o - c) + 1;
  return {
    width: y ? g : O,
    height: y ? O : g,
    start: r,
    direction: m
  };
}
function K(r, t, e) {
  if (S(r))
    return r;
  const { q: n, r: s } = H(r) ? E(r) : C(r);
  return W({ q: n, r: s, isPointy: t, offset: e });
}
const yt = {
  AA: {
    swapWidthHeight: !1,
    direction: a.E
  },
  AB: {
    swapWidthHeight: !0,
    direction: a.N
  },
  BA: {
    swapWidthHeight: !0,
    direction: a.S
  },
  BB: {
    swapWidthHeight: !1,
    direction: a.W
  }
};
function Ct(r, t) {
  return b(Array.from({ length: r }, () => b(t)));
}
function Ot(r) {
  const { center: t, rotation: e = F.CLOCKWISE } = r;
  return function(s, o) {
    const i = e.toUpperCase(), c = [];
    let { radius: u } = r;
    const h = l(u);
    let f;
    h ? f = s(t).translate({ q: u, s: -u }) : (f = s(r.start ?? o), u = R(f, t, f));
    const { q: y, r: m, s: O } = N(f, t);
    let g = s({ q: y, r: m - u, s: O + u });
    if (i === F.CLOCKWISE)
      for (let d = 0; d < 6; d++)
        for (let w = 0; w < u; w++) {
          const { q: A, r: M } = Q[d];
          g = s({ q: g.q + A, r: g.r + M }), c.push(g);
        }
    else
      for (let d = 5; d >= 0; d--)
        for (let w = 0; w < u; w++) {
          const { q: A, r: M } = Q[d];
          g = s({ q: g.q - A, r: g.r - M }), c.push(g);
        }
    const k = h ? !1 : !r.start && o, Y = c.findIndex((d) => d.equals(f));
    return c.slice(Y + (k ? 1 : 0)).concat(c.slice(0, Y));
  };
}
const Q = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 }
];
function Nt({ radius: r, start: t, rotation: e }) {
  return function(s, o) {
    const i = t ?? o ?? [0, 0], c = !t && o ? r : r + 1;
    return _(v({ start: t, direction: a.N, length: c }), Ot({ center: i, rotation: e }))(s, o);
  };
}
class q {
  static fromIterable(t) {
    const e = t[Symbol.iterator]().next().value;
    if (!e)
      throw new TypeError(`Can't create grid from empty iterable: ${JSON.stringify(t)}`);
    return new q(e.constructor, t);
  }
  static fromJSON({ hexSettings: t, coordinates: e }, n) {
    if (n) {
      const o = e.map(n), i = o.length > 0 ? o[0].constructor : n({ q: 0, r: 0 }, 0, [{ q: 0, r: 0 }]).constructor;
      return new q(i, o);
    }
    const s = nt(t);
    return new q(
      s,
      e.map((o) => new s(o))
    );
  }
  get size() {
    return this.#r.size;
  }
  get pixelWidth() {
    if (this.size === 0)
      return 0;
    const { isPointy: t, width: e } = this.hexPrototype, n = this.toArray(), {
      0: s,
      length: o,
      [o - 1]: i
    } = t ? n.sort((c, u) => u.s - c.s || c.q - u.q) : n.sort((c, u) => c.q - u.q);
    return i.x - s.x + e;
  }
  get pixelHeight() {
    if (this.size === 0)
      return 0;
    const { isPointy: t, height: e } = this.hexPrototype, n = this.toArray(), {
      0: s,
      length: o,
      [o - 1]: i
    } = t ? n.sort((c, u) => c.r - u.r) : n.sort((c, u) => u.s - c.s || c.r - u.r);
    return i.y - s.y + e;
  }
  [Symbol.iterator]() {
    return this.#r.values();
  }
  get hexPrototype() {
    return this.#t.prototype;
  }
  #t;
  #r = /* @__PURE__ */ new Map();
  constructor(t, e = []) {
    if (t instanceof q) {
      this.#t = t.#t, this.setHexes(t);
      return;
    }
    this.#t = t, this.setHexes(this.#n(e));
  }
  createHex(t) {
    return new this.#t(t);
  }
  getHex(t) {
    const e = this.createHex(t);
    return this.#r.get(e.toString());
  }
  hasHex(t) {
    return this.#r.has(t.toString());
  }
  setHexes(t) {
    for (const e of t) {
      const n = e instanceof $ ? e : new this.#t(e);
      this.#e(n);
    }
    return this;
  }
  filter(t) {
    const e = new q(this.#t);
    for (const n of this)
      t(n) && e.#e(n);
    return e;
  }
  map(t) {
    const e = new q(this.#t);
    for (const n of this)
      e.#e(t(n));
    return e;
  }
  traverse(t, { bail: e = !1 } = {}) {
    const n = new q(this.#t);
    for (const s of this.#n(t)) {
      const o = this.getHex(s);
      if (o)
        n.#e(o);
      else if (e)
        return n;
    }
    return n;
  }
  forEach(t) {
    for (const e of this)
      t(e);
    return this;
  }
  reduce(t, e) {
    if (e === void 0) {
      let s, o, i;
      for (const c of this)
        o = i, i = c, o && (s = t(o, i));
      return s;
    }
    let n = e;
    for (const s of this)
      n = t(n, s);
    return n;
  }
  toArray() {
    return Array.from(this);
  }
  // todo: add to docs that hexSettings don't include any custom properties
  toJSON() {
    const { dimensions: t, orientation: e, origin: n, offset: s } = this.hexPrototype;
    return { hexSettings: { dimensions: t, orientation: e, origin: n, offset: s }, coordinates: this.toArray() };
  }
  toString() {
    return `${this.constructor.name}(${this.size})`;
  }
  pointToHex(t, { allowOutside: e = !0 } = {}) {
    const n = ct(this.hexPrototype, t), s = this.getHex(n);
    return e ? s ?? this.createHex(n) : s;
  }
  distance(t, e, { allowOutside: n = !0 } = {}) {
    if (n)
      return R(this.hexPrototype, t, e);
    const s = this.getHex(t), o = this.getHex(e);
    if (!(!s || !o))
      return R(this.hexPrototype, s, o);
  }
  neighborOf(t, e, { allowOutside: n = !0 } = {}) {
    const s = I(this.createHex(t), e), o = this.getHex(s);
    return n ? o ?? s : o;
  }
  #e(t) {
    this.#r.set(t.toString(), t);
  }
  #n(t) {
    return this.#s(t) ? this.#o(t) : Array.isArray(t) && this.#s(t[0]) ? this.#o(b(t)) : t;
  }
  #s(t) {
    return V(t);
  }
  #o(t) {
    return t(this.createHex.bind(this));
  }
}
export {
  a as Direction,
  q as Grid,
  $ as Hex,
  x as Orientation,
  F as Rotation,
  C as completeCube,
  b as concat,
  G as createHexDimensions,
  tt as createHexOrigin,
  T as defaultHexSettings,
  nt as defineHex,
  R as distance,
  st as equals,
  Tt as fromCoordinates,
  W as hexToOffset,
  J as hexToPoint,
  wt as isAxial,
  S as isOffset,
  Z as isPoint,
  H as isTuple,
  v as line,
  pt as move,
  I as neighborOf,
  P as offsetFromZero,
  U as offsetToCube,
  j as offsetToCubeFlat,
  z as offsetToCubePointy,
  ct as pointToCube,
  St as rectangle,
  Ct as repeat,
  _ as repeatWith,
  Ot as ring,
  L as round,
  Nt as spiral,
  N as toCube,
  ut as translate,
  E as tupleToCube
};
