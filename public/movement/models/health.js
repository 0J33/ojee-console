/* ============================================================
   movement/models/health — the Google Fitbit Air.

   A tracker with no screen at all: a small capsule "pebble",
   35 x 17 x 8.3 mm, held in a woven loop band about the width of
   the pebble. Nothing on it lights and nothing on it is printed, so
   the object is the pebble on its loop and nothing else — drawn the
   way every object here is, see-through line art over an occluder,
   steel and rhodium, seen a little from above so the loop reads as
   a loop and the pebble's top as a capsule.

   What the health module reports in `summary.model`:

     bpm       the last heart rate it read (resting HR when that is
               stale): the pebble beats at it — a lub-dub, its outline
               brightening and a capsule-shaped ring leaving it
     steps     0..1 of the day's step target: a brighter run along the
               band's front edge, from the pebble round
     connected / demo   a band that is not connected beats nothing
     status    ok / warn / err: the band's rims carry it, nothing else

   Reduced motion: no beat; the pebble's outline holds at its resting
   brightness.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, edges, occluder, mk,
} from '../kit.js';

/* World units: 1 = 20 mm. A wrist loop is roughly 60 x 46 mm inside. */
const RX = 1.5;                 // the loop, outer, across
const RY = 1.15;                // the loop, outer, top to bottom
const CY = -0.2;                // the loop's centre
const T = 0.07;                 // the band's thickness
const BW = 0.95;                // the band's width (into the screen)
const PL = 1.75;                // pebble length (35 mm), along the band
const PW = 0.85;                // pebble width (17 mm)
const PH = 0.42;                // pebble height (8.3 mm)
const PY = CY + RY - 0.18;      // the pebble's underside, seated in the loop

const ellipse = (rx, ry, z, seg = 96, a0 = 0, a1 = Math.PI * 2) => {
  const pts = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push(V(Math.cos(a) * rx, CY + Math.sin(a) * ry, z));
  }
  return pts;
};

/** The pebble's plan: a stadium, PL by PW. */
function stadium(l, w) {
  const r = w / 2; const s = new THREE.Shape();
  s.moveTo(-l / 2 + r, -r);
  s.lineTo(l / 2 - r, -r);
  s.absarc(l / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-l / 2 + r, r);
  s.absarc(-l / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}
/** The same outline as a clean point loop: no zero-length segment where the
    arcs meet the straights, which an extrusion turns into a visible seam. */
function cleanStadium(l, w, seg = 18) {
  const pts = [];
  for (const p of stadium(l, w).getPoints(seg)) {
    const last = pts[pts.length - 1];
    if (!last || last.distanceTo(p) > 1e-4) pts.push(p);
  }
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
  return new THREE.Shape(pts);
}
const stadiumPts = (l, w, y, seg = 14) => stadium(l, w).getPoints(seg).map((p) => V(p.x, y, p.y));

export function build(opts = {}) {
  const [group, sp] = mk(0, 0.34);
  group.userData.sway = [0.04, 0.38, 0.02];
  group.userData.swayPeriod = 12;
  group.userData.swayPhase = 0.9;
  group.userData.hitR = 2.0;
  const parts = group.userData.parts;

  /* ---- the band: a woven loop ---- */
  const ring2 = new THREE.Shape();
  ring2.absellipse(0, CY, RX, RY, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, CY, RX - T, RY - T, 0, Math.PI * 2, true, 0);
  ring2.holes.push(hole);
  const bandGeo = new THREE.ExtrudeGeometry(ring2, { depth: BW, bevelEnabled: false, curveSegments: 64 });
  bandGeo.translate(0, 0, -BW / 2);
  sp.add(occluder(bandGeo));

  const rimFront = poly(ellipse(RX, RY, BW / 2), C.steel, 0.85);
  const rimBack = poly(ellipse(RX, RY, -BW / 2), C.steel, 0.55);
  const rimInF = poly(ellipse(RX - T, RY - T, BW / 2), C.rhodium, 0.6);
  const rimInB = poly(ellipse(RX - T, RY - T, -BW / 2), C.rhodium, 0.35);
  sp.add(rimFront, rimBack, rimInF, rimInB);

  /* The weave: short ribs across the band, every few degrees, faint — a
     textile loop, not a smooth strap. Skipped under the pebble. */
  const ribs = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    const x = Math.cos(a) * RX; const y = CY + Math.sin(a) * RY;
    if (y > PY - 0.05 && Math.abs(x) < PL / 2 + 0.05) continue;
    ribs.push(V(x, y, -BW / 2 + 0.03), V(x, y, BW / 2 - 0.03));
  }
  sp.add(segs(ribs, C.rhodium, 0.22));

  /* The loop's tail: where a performance loop doubles back on itself under
     the wrist — a short second layer of band with its square end. */
  const tailA0 = Math.PI * 1.32; const tailA1 = Math.PI * 1.62;
  const tail = [
    ...ellipse(RX + 0.05, RY + 0.05, BW / 2 - 0.06, 16, tailA0, tailA1),
  ];
  const tailBack = ellipse(RX + 0.05, RY + 0.05, -BW / 2 + 0.06, 16, tailA0, tailA1);
  const end = tail[tail.length - 1]; const endB = tailBack[tailBack.length - 1];
  sp.add(poly(tail, C.rhodium, 0.6), poly(tailBack, C.rhodium, 0.4), segs([end, endB, tail[0], tailBack[0]], C.rhodium, 0.6));

  /* Step progress: a brighter run along the front rim, starting at the
     pebble and going round clockwise as seen. */
  const progGroup = new THREE.Group();
  sp.add(progGroup);
  let prog = null;
  function setProgress(f) {
    if (prog) { progGroup.remove(prog); prog.geometry.dispose(); }
    prog = null;
    if (!(f > 0.01)) return;
    const a0 = Math.PI / 2 - 0.42;                 // just right of the pebble
    const pts = ellipse(RX + 0.004, RY + 0.004, BW / 2 + 0.004, Math.max(4, Math.round(80 * f)), a0, a0 - (Math.PI * 2 - 0.84) * Math.min(1, f));
    prog = poly(pts, C.brass, 0.9);
    progGroup.add(prog);
  }

  /* ---- the pebble ---- */
  const bev = 0.11;
  const pGeo = new THREE.ExtrudeGeometry(cleanStadium(PL - bev * 2, PW - bev * 2), {
    depth: PH - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 18,
  });
  pGeo.rotateX(-Math.PI / 2);                     // extrude upward
  pGeo.translate(0, PY + bev, 0);
  sp.add(occluder(pGeo));
  const shell = edges(pGeo.clone(), C.steel, 0.85, 24);
  sp.add(shell);
  // The top's flat, as a faint inset line — screenless, unmarked.
  const top = poly(stadiumPts(PL - 0.34, PW - 0.3, PY + PH + 0.002), C.rhodium, 0.45, true);
  sp.add(top);

  /* The beat: a capsule-shaped ring leaving the pebble's top. */
  const beatRing = poly(stadiumPts(PL, PW, PY + PH * 0.55), C.beat, 0);
  sp.add(beatRing);

  parts.pebble = shell;
  parts.band = rimFront;

  /* ---- state ---- */
  const st = { status: 'off', bpm: 0, live: false };
  const REST = 0.85;

  function setState(s) {
    const o = (s && typeof s === 'object') ? s : {};
    st.status = STATUS_HEX[o.status] ? o.status : 'off';
    st.live = !!(o.connected || o.demo) && st.status !== 'off';
    const bpm = Number(o.bpm);
    st.bpm = Number.isFinite(bpm) && bpm > 0 ? Math.max(35, Math.min(190, bpm)) : 60;
    const rim = st.status === 'warn' || st.status === 'err' ? STATUS_HEX[st.status] : C.steel;
    rimFront.material.color.setHex(rim);
    rimBack.material.color.setHex(rim);
    const dim = st.live ? 1 : 0.5;
    rimFront.material.opacity = 0.85 * dim;
    shell.material.opacity = REST * dim;
    setProgress(st.live ? Number(o.steps) || 0 : 0);
  }

  let phase = 0;
  group.userData.tick = (t, dt, p, env) => {
    if (!st.live || (env && env.reduced)) {
      beatRing.material.opacity = 0;
      return;
    }
    phase = (phase + (dt * st.bpm) / 60) % 1;
    // Lub at 0, dub at 0.28: the outline flares twice, the ring leaves once.
    const flare = Math.max(Math.exp(-phase * 22), 0.6 * Math.exp(-Math.abs(phase - 0.28) * 26));
    shell.material.opacity = Math.min(1, REST + 0.15 * flare);
    shell.material.color.setHex(flare > 0.35 ? C.beat : C.steel);
    const k = Math.min(1, phase / 0.7);
    beatRing.scale.set(1 + 0.55 * k, 1, 1 + 0.9 * k);
    beatRing.material.opacity = phase < 0.7 ? 0.55 * (1 - k) : 0;
  };

  setState(opts.state ?? null);
  return { group, setState };
}
