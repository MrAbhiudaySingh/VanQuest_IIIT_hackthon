// Grid navigation built from the same collision rectangles the physics uses.
// A cell is walkable if the player's foot hitbox, centred on the cell, touches no
// solid rect. Paths: A* (8-way, no corner cutting) → line-of-sight smoothing.
// Pure JS (no Phaser) so it is unit-testable.
export const CELL = 8;
const BODY = { w: 10, h: 6 };   // must match the player's physics body (feet box)

export class NavGrid {
  constructor(widthPx, heightPx, rects, body = BODY) {
    this.body = body;
    this.cols = Math.ceil(widthPx / CELL);
    this.rows = Math.ceil(heightPx / CELL);
    this.wpx = widthPx; this.hpx = heightPx;
    this.rects = rects;
    // spatial index: 32px buckets → the rects touching them, so clearAt checks only neighbours
    this.bw = Math.ceil(widthPx / 32); this.bh = Math.ceil(heightPx / 32);
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    for (const o of rects)
      for (let by = Math.max(0, Math.floor(o.y / 32)); by <= Math.min(this.bh - 1, Math.floor((o.y + o.h) / 32)); by++)
        for (let bx = Math.max(0, Math.floor(o.x / 32)); bx <= Math.min(this.bw - 1, Math.floor((o.x + o.w) / 32)); bx++)
          this.buckets[by * this.bw + bx].push(o);
    this.walk = new Uint8Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++)
      for (let cx = 0; cx < this.cols; cx++)
        this.walk[cy * this.cols + cx] = this.clearAt(cx * CELL + CELL / 2, cy * CELL + CELL / 2) ? 1 : 0;
    this.label();
  }

  // feet at (x, y): body spans x±w/2, y−h..y
  clearAt(x, y) {
    const l = x - this.body.w / 2, r = x + this.body.w / 2, t = y - this.body.h, b = y;
    if (l < 0 || t < 0 || r > this.wpx || b > this.hpx) return false;
    for (let by = Math.floor(t / 32); by <= Math.min(this.bh - 1, Math.floor(b / 32)); by++)
      for (let bx = Math.floor(l / 32); bx <= Math.min(this.bw - 1, Math.floor(r / 32)); bx++)
        for (const o of this.buckets[by * this.bw + bx]) if (l < o.x + o.w && r > o.x && t < o.y + o.h && b > o.y) return false;
    return true;
  }

  // connected components, so "is it reachable?" is O(1)
  label() {
    this.comp = new Int32Array(this.cols * this.rows).fill(-1);
    let id = 0;
    for (let i = 0; i < this.walk.length; i++) {
      if (!this.walk[i] || this.comp[i] >= 0) continue;
      const stack = [i]; this.comp[i] = id;
      while (stack.length) {
        const c = stack.pop();
        for (const n of this.neighbours(c)) if (this.comp[n] < 0) { this.comp[n] = id; stack.push(n); }
      }
      id++;
    }
  }

  cellOf(x, y) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.cols + cx;
  }
  centre(c) { return { x: (c % this.cols) * CELL + CELL / 2, y: Math.floor(c / this.cols) * CELL + CELL / 2 }; }

  *neighbours(c) {
    const x = c % this.cols, y = (c / this.cols) | 0, W = this.cols;
    const ok = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < this.rows && this.walk[yy * W + xx];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(x + dx, y + dy)) yield (y + dy) * W + x + dx;
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      if (ok(x + dx, y + dy) && ok(x + dx, y) && ok(x, y + dy)) yield (y + dy) * W + x + dx;
  }

  // The start cell may be "unwalkable" when the player stands right against a wall
  // (its centre is inside the wall's margin); use the nearest walkable neighbour.
  startCell(x, y) {
    const c = this.cellOf(x, y);
    if (this.walk[c]) return c;
    return this.nearestWalkable(c, () => true, 3);
  }

  // BFS outward from cell c (through any cells) to the first walkable cell passing test.
  nearestWalkable(c, test, maxRing = 40) {
    const seen = new Set([c]); let ring = [c];
    for (let r = 0; r <= maxRing && ring.length; r++) {
      let best = null, bestD = Infinity;
      const p = this.centre(c);
      for (const n of ring) if (this.walk[n] && test(n)) {
        const q = this.centre(n), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best !== null) return best;
      const next = [];
      for (const n of ring) {
        const x = n % this.cols, y = (n / this.cols) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= this.cols || yy >= this.rows) continue;
          const m = yy * this.cols + xx;
          if (!seen.has(m)) { seen.add(m); next.push(m); }
        }
      }
      ring = next;
    }
    return null;
  }

  // Returns { points: [{x,y}...], adjusted: bool } or null if nothing reachable.
  // If the target is blocked/unreachable, the closest reachable cell is used instead.
  findPath(fromX, fromY, toX, toY) {
    const s = this.startCell(fromX, fromY);
    if (s === null) return null;
    let g = this.cellOf(toX, toY), adjusted = false;
    if (!this.walk[g] || this.comp[g] !== this.comp[s]) {
      g = this.nearestWalkable(g, n => this.comp[n] === this.comp[s]);
      adjusted = true;
      if (g === null) return null;
    }
    const goal = adjusted ? this.centre(g) : { x: toX, y: toY };
    if (adjusted || !this.clearAt(goal.x, goal.y)) Object.assign(goal, this.centre(g));
    const cells = this.astar(s, g);
    if (!cells) return null;
    // always at least [start, goal] — even when both are in the same cell
    const pts = [{ x: fromX, y: fromY }, ...cells.slice(1, -1).map(c => this.centre(c)), goal];
    return { points: this.smooth(pts), adjusted };
  }

  astar(s, g) {
    if (s === g) return [s];
    const W = this.cols, gx = g % W, gy = (g / W) | 0;
    const h = c => { const dx = Math.abs(c % W - gx), dy = Math.abs(((c / W) | 0) - gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const gs = new Float64Array(this.walk.length).fill(Infinity), from = new Int32Array(this.walk.length).fill(-1);
    const open = new MinHeap(); gs[s] = 0; open.push(s, h(s));
    const closed = new Uint8Array(this.walk.length);
    while (open.size) {
      const c = open.pop();
      if (c === g) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const cx = c % W, cy = (c / W) | 0;
      for (const n of this.neighbours(c)) {
        const step = (n % W !== cx && ((n / W) | 0) !== cy) ? Math.SQRT2 : 1;
        const t = gs[c] + step;
        if (t < gs[n]) { gs[n] = t; from[n] = c; open.push(n, t + h(n)); }
      }
    }
    if (from[g] < 0) return null;
    const out = [g];
    for (let c = g; c !== s; c = from[c]) out.push(from[c]);
    return out.reverse();
  }

  // Is the straight segment a→b clear for the body? Sampled every 2px.
  lineClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 2));
    for (let i = 0; i <= n; i++) if (!this.clearAt(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
    return true;
  }

  // Greedy string-pulling, linear: from the last kept point, extend as far as the
  // straight line stays clear, then keep the point before the first blocked one.
  smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = pts[0];
    for (let k = 2; k < pts.length; k++) {
      if (!this.lineClear(anchor, pts[k])) { anchor = pts[k - 1]; out.push(anchor); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const a = this.k, b = this.p; let i = a.length; a.push(k); b.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (b[j] <= b[i]) break; [a[i], a[j]] = [a[j], a[i]]; [b[i], b[j]] = [b[j], b[i]]; i = j; }
  }
  pop() {
    const a = this.k, b = this.p, top = a[0], lk = a.pop(), lp = b.pop();
    if (a.length) {
      a[0] = lk; b[0] = lp; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; [b[i], b[m]] = [b[m], b[i]]; i = m;
      }
    }
    return top;
  }
}
