/* ============================================================
   movement/models/health — the Google Fitbit Air.

   A tracker with no screen and no buttons: a narrow pill-shaped
   "pebble", 34.9 x 17 x 8.3 mm, domed and polished on top, snapped
   into the "sleeve" of its band from below. The band it ships with
   is the Performance Loop — a woven textile strap, about as wide as
   the pebble, closed with a micro-adjustable stainless-steel buckle.
   The only thing on the pebble that ever lights is one status LED
   on its side: dark while it is worn, solid red when the battery is
   critically low (white only while it charges, which nothing here
   reports). Sensors and the gold charging contacts are underneath,
   against the skin, and out of sight from where this is seen.

   Drawn the way every object here is: see-through line art over an
   occluder, seen a little from above so the loop reads as a loop and
   the pebble's top as a dome. The band's rims carry the module's
   status, as the router's outline and fleet's plinth do.

   What the health module reports in `summary.model`:

     bpm       the last heart rate it read (resting HR when that is
               stale): the pebble beats at it — a lub-dub, its girth
               brightening and a pill-shaped ring leaving it
     steps     0..1 of the day's step target: a brighter run along the
               band's front edge, from the sleeve round
     battery   percent, as of its last sync: at 20 or below the LED is red
     connected / demo   a band that is not connected beats nothing
     status    ok / warn / err

   Reduced motion: no beat; the pebble's outline holds at its resting
   brightness.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, ring, occluder, mk,
} from '../kit.js';

/* World units: 1 = 20 mm. A wrist loop is roughly 60 x 46 mm inside. */
const RX = 1.5;                 // the loop, outer, across
const RY = 1.15;                // the loop, outer, top to bottom
const CY = -0.2;                // the loop's centre
const T = 0.07;                 // the band's thickness
const BW = 0.9;                 // the band's width (into the screen), a touch over the pebble's
const PL = 1.745;               // pebble length (34.9 mm), along the band
const PW = 0.85;                // pebble width (17 mm)
const PH = 0.415;               // pebble height (8.3 mm)
const PY = CY + RY - 0.12;      // the pebble's underside, seated in the sleeve
const LOW_BATTERY = 20;         // the module's own default alert threshold

const ellipse = (rx, ry, z, seg = 96, a0 = 0, a1 = Math.PI * 2) => {
  const pts = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push(V(Math.cos(a) * rx, CY + Math.sin(a) * ry, z));
  }
  return pts;
};

/** A pill outline (stadium), l by w, as a THREE.Shape. */
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
const stadiumPts = (l, w, y, seg = 16) => stadium(l, w).getPoints(seg).map((p) => V(p.x, y, p.y));

export function build(opts = {}) {
  const [group, sp] = mk(0, 0.8);   // from above enough that the pebble shows its pill and dome
  group.userData.sway = [0.04, 0.38, 0.02];
  group.userData.swayPeriod = 12;
  group.userData.swayPhase = 0.9;
  group.userData.hitR = 2.0;
  const parts = group.userData.parts;

  /* ---- the band: the woven Performance Loop ---- */
  const loop = new THREE.Shape();
  loop.absellipse(0, CY, RX, RY, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, CY, RX - T, RY - T, 0, Math.PI * 2, true, 0);
  loop.holes.push(hole);
  const bandGeo = new THREE.ExtrudeGeometry(loop, { depth: BW, bevelEnabled: false, curveSegments: 64 });
  bandGeo.translate(0, 0, -BW / 2);
  sp.add(occluder(bandGeo));

  // The rims carry the status; the inner ones are structure.
  const rimFront = poly(ellipse(RX, RY, BW / 2), STATUS_HEX.off, 0.85);
  const rimBack = poly(ellipse(RX, RY, -BW / 2), STATUS_HEX.off, 0.5);
  const rimInF = poly(ellipse(RX - T, RY - T, BW / 2), C.rhodium, 0.6);
  const rimInB = poly(ellipse(RX - T, RY - T, -BW / 2), C.rhodium, 0.35);
  sp.add(rimFront, rimBack, rimInF, rimInB);

  /* The weave: short ribs across the band, every few degrees, faint — a
     textile strap, not a smooth one. Skipped under the sleeve and the
     buckle. */
  const BUCKLE_A = -Math.PI / 2;                  // under the wrist
  const ribs = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    const x = Math.cos(a) * RX; const y = CY + Math.sin(a) * RY;
    if (y > PY - 0.1 && Math.abs(x) < PL / 2 + 0.12) continue;
    if (Math.abs(a - (BUCKLE_A + Math.PI * 2)) < 0.14 || Math.abs(a - BUCKLE_A) < 0.14) continue;
    ribs.push(V(x, y, -BW / 2 + 0.03), V(x, y, BW / 2 - 0.03));
  }
  sp.add(segs(ribs, C.rhodium, 0.22));

  /* ---- the buckle: stainless steel, under the wrist ----
     A rectangular frame round the band with its bar across the middle,
     and the strap's free end lying back along the outside after it — the
     micro-adjustable part of the loop. */
  const by = CY - RY - 0.035;                     // just outside the band
  const bx = 0.17; const bz = BW / 2 + 0.07;
  const buckle = [
    V(-bx, by, -bz), V(bx, by, -bz), V(bx, by, -bz), V(bx, by, bz),
    V(bx, by, bz), V(-bx, by, bz), V(-bx, by, bz), V(-bx, by, -bz),
    V(0, by - 0.012, -bz), V(0, by - 0.012, bz),               // the bar
    V(-bx, by, -bz), V(-bx, by + 0.11, -bz),                    // the frame's depth
    V(-bx, by, bz), V(-bx, by + 0.11, bz),
    V(bx, by, -bz), V(bx, by + 0.11, -bz),
    V(bx, by, bz), V(bx, by + 0.11, bz),
  ];
  sp.add(segs(buckle, C.steel, 0.85));
  const endA0 = BUCKLE_A + 0.13; const endA1 = BUCKLE_A + 0.52;
  const endF = ellipse(RX + 0.05, RY + 0.05, BW / 2 - 0.05, 14, endA0, endA1);
  const endB = ellipse(RX + 0.05, RY + 0.05, -BW / 2 + 0.05, 14, endA0, endA1);
  const tip = [endF[endF.length - 1], endB[endB.length - 1]];
  sp.add(poly(endF, C.rhodium, 0.6), poly(endB, C.rhodium, 0.4), segs(tip, C.rhodium, 0.6));

  /* Step progress: a brighter run along the front rim, starting at the
     sleeve and going round clockwise as seen. */
  const progGroup = new THREE.Group();
  sp.add(progGroup);
  let prog = null;
  function setProgress(f) {
    if (prog) { progGroup.remove(prog); prog.geometry.dispose(); }
    prog = null;
    if (!(f > 0.01)) return;
    const a0 = Math.PI / 2 - 0.5;                  // just right of the sleeve
    const pts = ellipse(RX + 0.004, RY + 0.004, BW / 2 + 0.004, Math.max(4, Math.round(80 * f)), a0, a0 - (Math.PI * 2 - 1.0) * Math.min(1, f));
    prog = poly(pts, C.brass, 0.9);
    progGroup.add(prog);
  }

  /* ---- the sleeve: the band's cradle the pebble snaps into ----
     A pill-shaped collar a little bigger than the pebble, its wall rising
     a third of the way up the pebble's side. */
  const SL = PL + 0.12; const SW = PW + 0.12;
  sp.add(poly(stadiumPts(SL, SW, PY - 0.01), C.rhodium, 0.7, true));
  sp.add(poly(stadiumPts(SL, SW, PY + PH * 0.32), C.steel, 0.7, true));

  /* ---- the pebble ----
     Pill in plan, domed on top: a deep, many-stepped bevel gives the
     occluder its rounded shoulders, and the shape is told by contour
     lines rather than by facet edges — the girth where it is widest, two
     rings stepping in up the dome, and the crest where it is polished. */
  const bev = 0.16;
  const pGeo = new THREE.ExtrudeGeometry(cleanStadium(PL - bev * 2, PW - bev * 2), {
    depth: PH - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 8, curveSegments: 18,
  });
  pGeo.rotateX(-Math.PI / 2);                     // extrude upward: PY .. PY + PH
  pGeo.translate(0, bev, 0);
  // A hair inside its own contour lines, so it hides what is behind the
  // pebble and never the lines drawn on it.
  pGeo.scale(0.97, 0.97, 0.94);
  pGeo.translate(0, PY, 0);
  sp.add(occluder(pGeo));

  /* Contours on the bevel's quarter round: at angle f up the shoulder the
     outline is inset bev*(1 - cos f) and sits bev*sin f above the wall. */
  const wallTop = PY + PH - bev;
  const contour = (f) => {
    const inset = bev * (1 - Math.cos(f));
    return stadiumPts(PL - inset * 2, PW - inset * 2, wallTop + bev * Math.sin(f));
  };
  const gy = PY + PH / 2;                         // the girth: widest
  const shell = poly(stadiumPts(PL, PW, gy), C.steel, 0.85, true);
  sp.add(shell);
  const dome1 = poly(contour(Math.PI * 0.25), C.rhodium, 0.55, true);
  const dome2 = poly(contour(Math.PI * 0.5 - 0.001), C.rhodium, 0.4, true);
  sp.add(dome1, dome2);
  // The polished crest: one short highlight along the top, nothing printed.
  const crest = poly([V(-PL * 0.26, PY + PH + 0.004, -0.06), V(PL * 0.18, PY + PH + 0.004, -0.06)], C.steel, 0.4);
  sp.add(crest);

  /* The status LED, on the pebble's side at its outer end. Dark unless the
     battery is low, as on the real one. */
  const led = node(0.04, C.bad, 0);
  led.scale.x = 0.45;
  led.position.set(PL / 2 + 0.002, gy, 0);
  const ledHalo = ring(0.085, C.bad, 0, 'x', 24);
  ledHalo.position.copy(led.position);
  sp.add(led, ledHalo);

  /* The beat: a pill-shaped ring leaving the pebble's girth. */
  const beatRing = poly(stadiumPts(PL, PW, gy), C.beat, 0, true);
  sp.add(beatRing);

  parts.pebble = shell;
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
    shell.material.opacity = REST * dim;
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
      shell.material.color.setHex(C.steel);
      return;
    }
    phase = (phase + (dt * st.bpm) / 60) % 1;
    // Lub at 0, dub at 0.28: the girth flares twice, the ring leaves once.
    const flare = Math.max(Math.exp(-phase * 22), 0.6 * Math.exp(-Math.abs(phase - 0.28) * 26));
    shell.material.opacity = Math.min(1, REST + 0.15 * flare);
    shell.material.color.setHex(flare > 0.35 ? C.beat : C.steel);
    const k = Math.min(1, phase / 0.7);
    beatRing.scale.set(1 + 0.45 * k, 1, 1 + 0.9 * k);
    beatRing.material.opacity = phase < 0.7 ? 0.55 * (1 - k) : 0;
  };

  setState(opts.state ?? null);
  return { group, setState };
}
