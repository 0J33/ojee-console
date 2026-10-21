/* ============================================================
   movement/models/health — the Google Fitbit Air.

   Drawn from Google's own band-design drawings (D-0001799540, sheets
   1-3, published with the custom-band guidelines in June 2026), not
   from photographs:

   The PEBBLE is 33.5 x 14.36 mm across its body and about 7.8 mm
   tall, and it is not a plain pill. Seen from the side it waists in:
   a domed upper body, a groove, then a wider lip flange (with the case
   seam on it) that is what the sleeve clips over, and under that the
   rounded sensor face that sits on the skin. Its underside curves to
   the wrist. No screen, no button; one status LED on a long side,
   centred, just under the dome.

   The SLEEVE is the band's frame, not a cradle under the pebble. The
   pebble is pressed into it from below and its domed top shows through
   an oval window 32.76 mm long. The sleeve is curved along its length
   to sit on the wrist. One end is round, with two pin holes on top and
   a slot in the end face where the strap's end clips in; the other is
   square, with the strap wrapped round a hinge barrel. A small cutout
   in one side wall is where the LED shows.

   The BAND is the Performance Loop: a woven strap, a little narrower
   than the sleeve, closed with hook-and-loop. Its free end goes through
   a ring under the wrist and folds back over itself, ending in a tab.

   Drawn the way every object here is: see-through line art over an
   occluder, seen a little from above so the loop reads as a loop and
   the pebble's dome shows in its window. The band's rims carry the
   module's status, as the router's outline and fleet's plinth do.

   What the health module reports in `summary.model`:

     bpm       the last heart rate it read (resting HR when that is
               stale): the pebble beats at it, a lub-dub, its body
               brightening and its outline leaving the window
     steps     0..1 of the day's step target: a brighter run along the
               band's front edge, starting at the sleeve
     battery   percent, as of its last sync: at 20 or below the LED,
               in its cutout, is red
     connected / demo   a band that is not connected beats nothing
     status    ok / warn / err

   Reduced motion: no beat; the pebble holds at its resting brightness.

   How it is built: everything that follows the wrist is laid out flat
   in band coordinates (s along the strap from the top of the wrist,
   w across it, h out from the strap's outer face, all in millimetres)
   and bent onto the wrist loop by `at()`. The sleeve's frame and the
   pebble are bent the same way, which is what curves their undersides
   to the wrist as the drawings show.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, ring, occluder as occluderOneSided, mk,
} from '../kit.js';

/* Every solid here is bent onto the wrist after it is made, which turns
   some of its faces inside out; drawn from both sides, it hides what is
   behind it whichever way they now face. */
const occluder = (geo) => { const m = occluderOneSided(geo); m.material.side = THREE.DoubleSide; return m; };

const MM = 1 / 20;                // world units: 1 = 20 mm
const RX = 1.5;                   // the strap's outer face, across the wrist
const RY = 1.15;                  // and top to bottom
const CY = -0.2;                  // the loop's centre
const T = 1.8;                    // strap thickness, mm (a woven loop is thick)
const BW = 16.5;                  // strap width, mm: a little under the sleeve's 18
const LOW_BATTERY = 20;           // the module's own default alert threshold

/* ---- the pebble, from sheet 1 ----
   Rings of its outline, bottom to top: [height above the skin, length,
   width], mm. The widths at the body (14.36) and length (33.5) are the
   drawing's; the rest are read off its side and end elevations. */
const PEBBLE = [
  [0.0, 28.6, 9.6],     // sensor face
  [0.45, 32.0, 13.0],
  [1.1, 34.4, 15.2],
  [1.8, 35.1, 16.0],    // the lip, widest: the case seam
  [2.35, 34.5, 15.3],
  [2.9, 33.0, 13.6],    // the groove the sleeve clips into
  [3.6, 33.2, 13.95],
  [4.6, 33.5, 14.36],   // the body
  [5.8, 33.0, 13.8],
  [6.7, 31.6, 12.4],    // where it leaves the sleeve's window
  [7.35, 30.0, 10.9],
  [7.75, 28.0, 9.0],    // the polished plateau's edge
  [7.85, 25.0, 6.0],
];
const SKIN = -T;                  // the sensor face sits at the strap's inner face
const LED_H = 5.6;                // LED, up the long side, centred

/* ---- the sleeve, from sheet 2 ---- */
const SLV_W = 18.0;               // outer width
const SLV_ROUND = 20.0;           // centre to the tip of the round end
const SLV_SQUARE = 19.5;          // centre to the square end
const WIN_L = 32.76;              // the window, as dimensioned
const WIN_W = 12.6;               // the pebble where it comes through it
const SLV_H0 = SKIN + 1.2;        // the sleeve's underside: over the lip
const SLV_H1 = SKIN + 6.7;        // its top: the pebble's dome stands proud of it
const HINGE_R = 1.7;              // the barrel the strap wraps round

/* ---- the loop ----
   A wrist is wider than it is deep and flatter on top than an ellipse:
   bent onto an ellipse, a 41 mm sleeve curled down at both ends and the
   pebble read as a bean. A superellipse (exponent SQ) keeps the top as
   flat as the drawings' sleeve section and still rounds the sides. It is
   sampled once, with its arc length, so straps can be laid out in mm. */
const SQ = 2.7;
const M = 4096;
const PX = new Float64Array(M + 1); const PY = new Float64Array(M + 1);
const NX = new Float64Array(M + 1); const NY = new Float64Array(M + 1);
const LEN = new Float64Array(M + 1);
{
  const e = 2 / SQ;
  const pw = (v) => Math.sign(v) * Math.abs(v) ** e;
  for (let i = 0; i <= M; i += 1) {
    const t = (i / M) * Math.PI * 2;            // from the top, clockwise as seen
    PX[i] = RX * pw(Math.sin(t)); PY[i] = CY + RY * pw(Math.cos(t));
    if (i) LEN[i] = LEN[i - 1] + Math.hypot(PX[i] - PX[i - 1], PY[i] - PY[i - 1]);
  }
  for (let i = 0; i <= M; i += 1) {
    const a = (i - 1 + M) % M; const b = (i + 1) % M;
    const tx = PX[b] - PX[a]; const ty = PY[b] - PY[a];
    const n = Math.hypot(tx, ty) || 1;
    NX[i] = -ty / n; NY[i] = tx / n;             // outward, for a clockwise walk
  }
}
const PER = LEN[M];
const HALF = PER / 2;

/** Band coordinates (mm) to the world: s along the strap from the top of
    the wrist (positive to the right), w across it, h out from its outer face. */
function at(s, w, h) {
  const sw = (((s * MM) % PER) + PER) % PER;
  let lo = 0; let hi = M;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LEN[m] < sw) lo = m; else hi = m; }
  const f = (sw - LEN[lo]) / Math.max(1e-12, LEN[hi] - LEN[lo]);
  const x = PX[lo] + (PX[hi] - PX[lo]) * f; const y = PY[lo] + (PY[hi] - PY[lo]) * f;
  let nx = NX[lo] + (NX[hi] - NX[lo]) * f; let ny = NY[lo] + (NY[hi] - NY[lo]) * f;
  const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
  return V(x + nx * h * MM, y + ny * h * MM, w * MM);
}
const bendGeo = (geo) => {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const v = at(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

/** A stadium (pill) outline, l by w, as [s, w] pairs, evenly spaced so it
    bends smoothly. */
function stadium(l, w, n = 64) {
  const r = w / 2; const a = l / 2 - r;
  const per = 4 * a + 2 * Math.PI * r;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let d = (i / n) * per;
    if (d < 2 * a) { out.push([-a + d, -r]); continue; }
    d -= 2 * a;
    if (d < Math.PI * r) { const t = -Math.PI / 2 + d / r; out.push([a + Math.cos(t) * r, Math.sin(t) * r]); continue; }
    d -= Math.PI * r;
    if (d < 2 * a) { out.push([a - d, r]); continue; }
    d -= 2 * a;
    const t = Math.PI / 2 + d / r; out.push([-a + Math.cos(t) * r, Math.sin(t) * r]);
  }
  return out;
}
/** The sleeve's plan: round at +s, square (with small radii) at -s. */
function sleevePlan(n = 96) {
  const r = SLV_W / 2; const c = 2.2;            // corner radius at the square end
  const pts = [];
  const line = (a, b, k) => { for (let i = 0; i < k; i += 1) pts.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]); };
  const ax = SLV_ROUND - r;
  line([-SLV_SQUARE + c, -r], [ax, -r], 18);
  for (let i = 0; i < 28; i += 1) { const t = -Math.PI / 2 + (Math.PI * i) / 28; pts.push([ax + Math.cos(t) * r, Math.sin(t) * r]); }
  line([ax, r], [-SLV_SQUARE + c, r], 18);
  for (let i = 0; i < 6; i += 1) { const t = Math.PI / 2 + (Math.PI / 2) * (i / 6); pts.push([-SLV_SQUARE + c + Math.cos(t) * c, r - c + Math.sin(t) * c]); }
  line([-SLV_SQUARE, r - c], [-SLV_SQUARE, -r + c], 10);
  for (let i = 0; i < 6; i += 1) { const t = Math.PI + (Math.PI / 2) * (i / 6); pts.push([-SLV_SQUARE + c + Math.cos(t) * c, -r + c + Math.sin(t) * c]); }
  return pts.slice(0, n * 4);
}

const curve = (pts2, h, close = true) => {
  const out = pts2.map(([s, w]) => at(s, w, h));
  return close ? [...out, out[0]] : out;
};

/** A closed surface through rings of equal length (bottom to top), capped. */
function loft(rings) {
  const n = rings[0].length;
  const pos = []; const idx = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let k = 0; k < rings.length - 1; k += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = k * n + i; const b = k * n + ((i + 1) % n);
      const c = a + n; const d = b + n;
      idx.push(a, b, d, a, d, c);
    }
  }
  const cap = (k, flip) => {
    const ctr = new THREE.Vector3();
    for (const p of rings[k]) ctr.add(p);
    ctr.multiplyScalar(1 / n);
    const ci = pos.length / 3; pos.push(ctr.x, ctr.y, ctr.z);
    for (let i = 0; i < n; i += 1) {
      const a = k * n + i; const b = k * n + ((i + 1) % n);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  cap(0, true); cap(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A strap of rectangular section laid along the loop from s0 to s1 (mm),
    between heights h0 and h1 and half-width hw. */
function strap(s0, s1, h0, h1, hw, step = 1.5) {
  const k = Math.max(2, Math.ceil(Math.abs(s1 - s0) / step));
  const rings = [];
  for (let i = 0; i <= k; i += 1) {
    const s = s0 + ((s1 - s0) * i) / k;
    rings.push([at(s, -hw, h0), at(s, hw, h0), at(s, hw, h1), at(s, -hw, h1)]);
  }
  return loft(rings);
}

export function build(opts = {}) {
  const [group, sp] = mk(0, 0.8);   // from above enough that the dome shows in its window
  group.userData.sway = [0.04, 0.38, 0.02];
  group.userData.swayPeriod = 12;
  group.userData.swayPhase = 0.9;
  group.userData.hitR = 2.0;
  const parts = group.userData.parts;
  const hw = BW / 2;

  /* ---- the strap, round the wrist from the sleeve's round end to its
     hinge. A woven loop: thick, soft-edged, faintly ribbed. ---- */
  const S_START = SLV_ROUND - 1.5;               // tucked under the round end's clip
  const S_END = PER / MM - (SLV_SQUARE + 0.6);   // round to the hinge barrel
  sp.add(occluder(strap(S_START, S_END, -T, 0, hw)));
  const along = (h, w, a = S_START, b = S_END, k = 220) => {
    const out = [];
    for (let i = 0; i <= k; i += 1) out.push(at(a + ((b - a) * i) / k, w, h));
    return out;
  };
  const rimFront = poly(along(0, hw), STATUS_HEX.off, 0.85);
  const rimBack = poly(along(0, -hw), STATUS_HEX.off, 0.5);
  const rimInF = poly(along(-T, hw), C.rhodium, 0.5);
  const rimInB = poly(along(-T, -hw), C.rhodium, 0.3);
  sp.add(rimFront, rimBack, rimInF, rimInB);

  /* ---- the hook-and-loop closure, under the wrist ----
     A ring on the strap; the free end goes through it and lies back along
     the outside for a few centimetres, ending in a rounded tab. */
  const S_RING = (PER * 0.66) / MM;              // low on the left side, where it shows in profile
  const FOLD = 46;                               // how far the end lies back, mm
  const ringPts = [];
  const rw = hw + 1.2; const rh0 = -0.4; const rh1 = 3.4;
  for (const [w, h] of [[-rw, rh0], [rw, rh0], [rw, rh1], [-rw, rh1], [-rw, rh0]]) ringPts.push(at(S_RING, w, h));
  for (const [w, h] of [[-rw, rh0], [rw, rh0], [rw, rh1], [-rw, rh1], [-rw, rh0]]) ringPts.push(at(S_RING + 2.4, w, h));
  sp.add(poly(ringPts.slice(0, 5), C.steel, 0.8), poly(ringPts.slice(5), C.steel, 0.55));
  sp.add(segs([0, 1, 2, 3].flatMap((i) => [ringPts[i], ringPts[i + 5]]), C.steel, 0.55));
  sp.add(occluder(strap(S_RING, S_RING + 2.4, rh0, rh1, rw)));
  // The folded-back end: a second layer outside the first, its edges, and
  // a tab with a rounded end and a pull lip.
  const f0 = S_RING - 0.6; const f1 = S_RING - FOLD;
  sp.add(occluder(strap(f1, f0, 0.15, T + 0.15, hw - 0.4)));
  const foldF = along(T + 0.15, hw - 0.4, f0, f1 + 6, 40);
  const foldB = along(T + 0.15, -(hw - 0.4), f0, f1 + 6, 40);
  const tab = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = Math.PI / 2 - (Math.PI * i) / 16;
    tab.push(at(f1 + 6 - Math.cos(t) * 6, Math.sin(t) * (hw - 0.4), T + 0.15));
  }
  sp.add(poly([...foldF, ...tab, ...foldB.reverse()], C.rhodium, 0.75));
  sp.add(poly(along(T * 0.45 + 0.15, hw - 0.4, f0, f1 + 6, 30), C.rhodium, 0.3));
  // The hook side's texture: a fine hatch near the tab.
  const hook = [];
  for (let s = f1 + 8; s < f1 + 22; s += 1.1) hook.push(at(s, -(hw - 2), T + 0.17), at(s, hw - 2, T + 0.17));
  sp.add(segs(hook, C.rhodium, 0.14));

  /* The weave: short ribs across the strap, faint, every few millimetres. */
  const ribs = [];
  for (let s = S_START + 3; s < S_END - 2; s += 3.2) {
    if (s > f1 - 1 && s < S_RING + 3.5) continue;        // under the fold and the ring
    ribs.push(at(s, -hw + 0.6, 0.02), at(s, hw - 0.6, 0.02));
  }
  sp.add(segs(ribs, C.rhodium, 0.2));

  /* Step progress: a brighter run along the front rim, from the sleeve's
     round end, round the loop. */
  const progGroup = new THREE.Group();
  sp.add(progGroup);
  let prog = null;
  function setProgress(fr) {
    if (prog) { progGroup.remove(prog); prog.geometry.dispose(); }
    prog = null;
    if (!(fr > 0.01)) return;
    const f = Math.min(1, fr);
    prog = poly(along(0.05, hw + 0.05, S_START, S_START + (S_END - S_START) * f, Math.max(4, Math.round(200 * f))), C.brass, 0.9);
    progGroup.add(prog);
  }

  /* ---- the sleeve ---- */
  const plan = sleevePlan();
  const win = stadium(WIN_L, WIN_W, 72);
  const slvShape = new THREE.Shape(plan.map(([s, w]) => new THREE.Vector2(s, w)));
  slvShape.holes.push(new THREE.Path(win.map(([s, w]) => new THREE.Vector2(s, w)).reverse()));
  const slvGeo = new THREE.ExtrudeGeometry(slvShape, { depth: SLV_H1 - SLV_H0, bevelEnabled: false, curveSegments: 4 });
  slvGeo.translate(0, 0, SLV_H0);
  // Inset a hair so its own edges are drawn over it, not hidden by it.
  slvGeo.scale(0.985, 0.97, 1);
  sp.add(occluder(bendGeo(slvGeo)));
  const topH = SLV_H1;
  sp.add(poly(curve(plan, topH), C.steel, 0.85));              // the top's outer edge
  sp.add(poly(curve(plan, topH - 0.9), C.rhodium, 0.35));      // where it rounds over
  sp.add(poly(curve(plan, SLV_H0), C.rhodium, 0.55));          // the underside's edge
  sp.add(poly(curve(win, topH), C.steel, 0.8));                // the window
  sp.add(poly(curve(stadium(WIN_L + 1.6, WIN_W + 1.6, 72), topH), C.rhodium, 0.3)); // its chamfer
  // The square end's corners, down the frame's height.
  const cornerLines = [];
  for (const w of [-SLV_W / 2, SLV_W / 2]) cornerLines.push(at(-SLV_SQUARE + 0.3, w, SLV_H0), at(-SLV_SQUARE + 0.3, w, topH));
  sp.add(segs(cornerLines, C.rhodium, 0.45));
  // Two pin holes on top of the round end, and the clip slot in its end face.
  for (const w of [-4.6, 4.6]) {
    const hole = [];
    for (let i = 0; i <= 20; i += 1) { const t = (i / 20) * Math.PI * 2; hole.push(at(SLV_ROUND - 4.2 + Math.cos(t) * 1.0, w + Math.sin(t) * 1.0, topH + 0.01)); }
    sp.add(poly(hole, C.rhodium, 0.7));
  }
  const slot = [];
  for (const [w, h] of [[-5, SLV_H0 + 1.1], [5, SLV_H0 + 1.1], [5, SLV_H0 + 2.3], [-5, SLV_H0 + 2.3], [-5, SLV_H0 + 1.1]]) slot.push(at(SLV_ROUND + 0.05, w, h));
  sp.add(poly(slot, C.rhodium, 0.5));
  // The laser mark beside the holes: three short strokes, nothing legible.
  sp.add(segs([-1.3, 0, 1.3].flatMap((w) => [at(SLV_ROUND - 4.4, w - 0.4, topH + 0.01), at(SLV_ROUND - 4.4, w + 0.4, topH + 0.01)]), C.rhodium, 0.35));

  /* The hinge barrel at the square end, and the strap wrapped round it. */
  const hs = -SLV_SQUARE - HINGE_R + 0.6; const hh = SLV_H0 + HINGE_R - 0.4;
  const barrel = (w) => { const out = []; for (let i = 0; i <= 24; i += 1) { const t = (i / 24) * Math.PI * 2; out.push(at(hs + Math.cos(t) * HINGE_R, w, hh + Math.sin(t) * HINGE_R)); } return out; };
  sp.add(poly(barrel(hw + 0.5), C.steel, 0.7), poly(barrel(-hw - 0.5), C.steel, 0.45));
  sp.add(segs([at(hs, -hw - 0.5, hh + HINGE_R), at(hs, hw + 0.5, hh + HINGE_R), at(hs - HINGE_R, -hw - 0.5, hh), at(hs - HINGE_R, hw + 0.5, hh)], C.steel, 0.5));
  {
    const cyl = new THREE.CylinderGeometry(HINGE_R * 0.97, HINGE_R * 0.97, BW + 1, 20, 1);
    // A cylinder's axis is y, which in band coordinates is w: across the strap.
    cyl.translate(hs, 0, hh);
    const p = cyl.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const v = at(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v.x, v.y, v.z); }
    sp.add(occluder(cyl));
  }

  /* The LED's cutout in the front side wall, centred, and the LED in it.
     Dark unless the battery is low, as on the real one. */
  const ledPos = at(0, SLV_W / 2 + 0.05, SKIN + LED_H);
  const cut = [];
  for (let i = 0; i <= 18; i += 1) { const t = (i / 18) * Math.PI * 2; cut.push(at(Math.cos(t) * 0.9, SLV_W / 2 + 0.05, SKIN + LED_H + Math.sin(t) * 0.9)); }
  sp.add(poly(cut, C.rhodium, 0.6));
  const led = node(0.03, C.bad, 0);
  led.position.copy(ledPos);
  const ledHalo = ring(0.07, C.bad, 0, 'z', 24);
  ledHalo.position.copy(ledPos);
  sp.add(led, ledHalo);

  /* ---- the pebble ---- */
  const rings = PEBBLE.map(([h, l, w]) => stadium(l, w, 64).map(([s, ww]) => at(s, ww, SKIN + h)));
  const pGeo = loft(rings);
  // A hair inside its own contour lines, so it hides what is behind it and
  // never the lines drawn on it.
  const ctr = at(0, 0, SKIN + 4);
  pGeo.translate(-ctr.x, -ctr.y, -ctr.z); pGeo.scale(0.985, 0.985, 0.985); pGeo.translate(ctr.x, ctr.y, ctr.z);
  sp.add(occluder(pGeo));
  const ringAt = (k, c, o) => poly([...rings[k], rings[k][0]], c, o);
  const lip = ringAt(3, C.rhodium, 0.5);                       // the seam, under the sleeve's edge
  const lipLow = poly(stadium(34.9, 15.8, 64).map(([s, w]) => at(s, w, SKIN + 1.55)).concat([at(-34.9 / 2 + 7.9, -7.9, SKIN + 1.55)]), C.rhodium, 0.25);
  const sensor = ringAt(0, C.rhodium, 0.35);
  const body = ringAt(9, C.steel, 0.85);                       // where the dome leaves the window
  const shoulder = ringAt(10, C.rhodium, 0.5);
  const plateau = ringAt(11, C.steel, 0.6);                    // the polished top's edge
  sp.add(lip, lipLow, sensor, body, shoulder, plateau);
  // The sensor window underneath: an oval, not a circle (it faces the skin).
  sp.add(poly(stadium(14, 7.5, 40).map(([s, w]) => at(s, w, SKIN - 0.01)).concat([at(-14 / 2 + 3.75, -3.75, SKIN - 0.01)]), C.rhodium, 0.2));
  // The polish on the crest: one short highlight, nothing printed.
  sp.add(poly([at(-8, -1.6, SKIN + 7.9), at(5, -1.6, SKIN + 7.9)], C.steel, 0.35));

  /* The beat: the dome's outline leaving the window and spreading. */
  const beatRing = poly([...rings[9], rings[9][0]], C.beat, 0);
  const beatPivot = new THREE.Group();
  const pc = at(0, 0, SKIN + 6.7);
  beatPivot.position.copy(pc);
  beatRing.position.set(-pc.x, -pc.y, -pc.z);
  beatPivot.add(beatRing);
  sp.add(beatPivot);

  parts.pebble = body;
  parts.band = rimFront;
  parts.led = led;

  /* ---- state ---- */
  const st = { status: 'off', bpm: 0, live: false, low: false };
  const REST = 0.85;

  function setState(s) {
    const o = (s && typeof s === 'object') ? s : {};
    st.status = STATUS_HEX[o.status] ? o.status : 'off';
    st.live = !!(o.connected || o.demo) && st.status !== 'off';
    const bpm = Number(o.bpm);
    st.bpm = Number.isFinite(bpm) && bpm > 0 ? Math.max(35, Math.min(190, bpm)) : 60;
    const hex = STATUS_HEX[st.status];
    rimFront.material.color.setHex(hex);
    rimBack.material.color.setHex(hex);
    const dim = st.live ? 1 : 0.5;
    rimFront.material.opacity = 0.85 * dim;
    rimBack.material.opacity = 0.5 * dim;
    body.material.opacity = REST * dim;
    const battery = Number(o.battery);
    st.low = st.live && o.battery != null && Number.isFinite(battery) && battery <= LOW_BATTERY;
    led.material.opacity = st.low ? 0.95 : 0;
    ledHalo.material.opacity = st.low ? 0.6 : 0;
    setProgress(st.live ? Number(o.steps) || 0 : 0);
  }

  let phase = 0;
  group.userData.tick = (t, dt, p, env) => {
    if (!st.live || (env && env.reduced)) {
      beatRing.material.opacity = 0;
      body.material.color.setHex(C.steel);
      plateau.material.color.setHex(C.steel);
      return;
    }
    phase = (phase + (dt * st.bpm) / 60) % 1;
    // Lub at 0, dub at 0.28: the dome brightens twice, the ring leaves once.
    const flare = Math.max(Math.exp(-phase * 22), 0.6 * Math.exp(-Math.abs(phase - 0.28) * 26));
    body.material.opacity = Math.min(1, REST + 0.15 * flare);
    const hot = flare > 0.35 ? C.beat : C.steel;
    body.material.color.setHex(hot);
    plateau.material.color.setHex(hot);
    const k = Math.min(1, phase / 0.7);
    beatPivot.scale.setScalar(1 + 0.32 * k);
    beatRing.material.opacity = phase < 0.7 ? 0.55 * (1 - k) : 0;
  };

  setState(opts.state ?? null);
  return { group, setState };
}
