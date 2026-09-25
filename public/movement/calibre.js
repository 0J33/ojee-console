/* ============================================================
   The watch.

   Not a diagram of one and not a dial: a whole wristwatch with an
   exhibition case. Turn it and you get the dial — hours, minutes, a running
   seconds register; turn it further and you get the display back, with the
   movement under the crystal and the winding weight sweeping across it.

   It is built the way everything else in this console is built: solid
   bodies in the ground colour with their edges drawn in light. The solids
   are there to OCCLUDE — a wheel behind a bridge is hidden by it, the dial
   hides the movement behind it — and that hidden-line removal is what makes
   a wireframe read as a thing rather than as a diagram of a thing. Nothing
   is lit; the colour of a line says what a part is made of and what it does.

   Two things it does that a watch does not:

   * **The seconds hand jumps on the true second.** The register at six is
     the console's clock, and its hand moves when `timesync.now()` crosses a
     second — not when an animation frame happens to land. A clock that is a
     second out is a clock that is wrong.

   * **The barrel carries the alerts.** The mainspring is what everything
     downstream runs on, so when something needs attention the ratchet over
     the barrel takes the status colour and breathes. It is the one part of
     the movement allowed to mean something.
   ============================================================ */

import * as THREE from 'three';
import {
  C, mk, edges, poly, segs, ring, occluder, node, pulseRing, V,
} from './kit.js';

/* ---- what the movement is made of ----------------------------------
   The case and the dial are steel and white: they are the outside of the
   object and they read as metal. Everything INSIDE the back is cyan.

   That is not only a preference. A brass movement made the whole back amber
   — and amber is the colour this console uses to say something needs
   attention. A field of it behind the one part that is allowed to mean that
   leaves the meaning with nowhere to land. In cyan the movement is the
   console's own material, and the barrel going amber is the only warm thing
   on the screen. */
const INNER = {
  wheel: C.beat,        // the going train, the barrel, the balance
  frame: 0x2a7f8c,      // bridges and the plate under them: cyan, held back
  fine: 0x4fd6e0,       // the escapement, where the detail is
  jewel: C.ruby,        // the bearings, and the only red in the object
};

/* ---- printed text ---------------------------------------------------
   A day and a date are PRINTED on a wheel, not drawn in wire, so they are
   set in the console's own mono face on a small canvas and hung on a plane.
   It is the one place in this object where a line is not the answer. */
function printed(text, colour = '#dffcff', px = 46) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = colour;
  g.font = `500 ${px}px "Geist Mono", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function printedPlane(w, h, text, colour) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: printed(text, colour), transparent: true, depthWrite: false,
    }),
  );
  m.userData.set = (next) => {
    m.material.map.dispose();
    m.material.map = printed(next, colour);
    m.material.needsUpdate = true;
  };
  return m;
}

/* ---- the primitive this whole object is made of --------------------
   A part is a solid in the ground colour with its edges drawn over it. The
   solid writes depth and hides whatever is behind it; the edges are the
   only thing you actually see. */
function part(geo, colour = C.rhodium, opacity = 0.8, thresh = 1) {
  const g = new THREE.Group();
  g.add(occluder(geo));
  g.add(edges(geo, colour, opacity, thresh));
  return g;
}

/** A disc lying in the XY plane, solid, with its rim drawn. */
function plate(r, z, colour, opacity, seg = 72) {
  const g = part(new THREE.CircleGeometry(r, seg), colour, opacity);
  g.position.z = z;
  return g;
}

/** A flat annulus — a bezel, a case back, a chapter ring. */
function annulus(r0, r1, z, colour, opacity, seg = 72) {
  const g = part(new THREE.RingGeometry(r0, r1, seg), colour, opacity);
  g.position.z = z;
  return g;
}

/* ---- wheels ---------------------------------------------------------
   A watch wheel is a rim of teeth, a hub, and the crossings between them —
   the spokes, cut away so the wheel is light enough for a spring to move.
   The teeth are ogival: they rise, hold and fall, because a square tooth
   binds. */

function toothAt(p) {
  const ease = (x) => x * x * (3 - 2 * x);
  if (p < 0.09) return ease(p / 0.09);
  if (p < 0.33) return 1;
  if (p < 0.43) return 1 - ease((p - 0.33) / 0.1);
  return 0;
}

/** The outline of a toothed wheel, as points. */
function toothed(rTip, teeth) {
  const depth = rTip * (teeth > 26 ? 0.09 : 0.17);
  const rRoot = rTip - depth;
  const pts = [];
  const seg = Math.max(teeth * 8, 128);
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const p = ((a * teeth) / (Math.PI * 2)) % 1;
    const r = rRoot + depth * toothAt(p);
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/**
 * A wheel: the toothed rim drawn, a solid behind it so it occludes what is
 * underneath, and the crossings drawn across it.
 */
function wheelPart(rTip, teeth, colour = C.brass, arms = 4) {
  const g = new THREE.Group();
  const outline = toothed(rTip, teeth);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  const solid = occluder(new THREE.ShapeGeometry(shape, 2));
  solid.position.z = -0.004;
  g.add(solid);
  g.add(poly(outline, colour, 0.85, true));

  const rRim = rTip * 0.8;
  const rHub = rTip * 0.2;
  g.add(ring(rRim, colour, 0.5));
  g.add(ring(rHub, colour, 0.6));
  const spokes = [];
  for (let k = 0; k < arms; k += 1) {
    const a = (k / arms) * Math.PI * 2;
    const w = 0.035 * (rTip / 0.4);
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    for (const sgn of [1, -1]) {
      spokes.push(
        V(Math.cos(a) * rHub + nx * sgn, Math.sin(a) * rHub + ny * sgn, 0),
        V(Math.cos(a) * rRim + nx * sgn, Math.sin(a) * rRim + ny * sgn, 0),
      );
    }
  }
  if (arms > 0) g.add(segs(spokes, colour, 0.4));
  return g;
}

/** A flat spiral, drawn: the hairspring, and the mainspring in the barrel. */
function spiral(turns, r0, r1, colour, opacity, steps = 240) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return poly(pts, colour, opacity);
}

/** The outline of a bridge, drawn ALONG the pivots it spans rather than as
    a slab over them — which is why a real movement's wheels are visible. */
function bridgeShape(path, halfWidth) {
  const P = path.map(([x, y]) => new THREE.Vector2(x, y));
  const normals = P.map((_, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    const d = new THREE.Vector2().subVectors(b, a).normalize();
    return new THREE.Vector2(-d.y, d.x);
  });
  const w = (i) => (typeof halfWidth === 'function' ? halfWidth(i / (P.length - 1)) : halfWidth);
  const cap = (centre, n, sign, width) => {
    const out = [];
    const a0 = Math.atan2(n.y * sign, n.x * sign);
    for (let k = 1; k < 9; k += 1) {
      const a = a0 - Math.PI * (k / 9) * sign;
      out.push(new THREE.Vector2(centre.x + Math.cos(a) * width, centre.y + Math.sin(a) * width));
    }
    return out;
  };
  const pts = [];
  P.forEach((pt, i) => pts.push(new THREE.Vector2(pt.x + normals[i].x * w(i), pt.y + normals[i].y * w(i))));
  pts.push(...cap(P[P.length - 1], normals[P.length - 1], 1, w(P.length - 1)));
  for (let i = P.length - 1; i >= 0; i -= 1) {
    pts.push(new THREE.Vector2(P[i].x - normals[i].x * w(i), P[i].y - normals[i].y * w(i)));
  }
  pts.push(...cap(P[0], normals[0], -1, w(0)));
  return pts;
}

function bridge(path, halfWidth, z, colour = C.steel) {
  const pts = bridgeShape(path, halfWidth);
  const g = new THREE.Group();
  g.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(pts), 1)));
  g.add(poly(pts.map((p) => V(p.x, p.y, 0)), colour, 0.85, true));
  g.position.z = z;
  return g;
}

/** A screw: a disc with its slot. */
function screw(r, colour = INNER.fine) {
  const g = part(new THREE.CircleGeometry(r, 14), colour, 0.85);
  g.add(segs([V(-r * 0.78, 0, 0.002), V(r * 0.78, 0, 0.002)], colour, 0.95));
  return g;
}

/** A jewel: the ruby, and the rim of the chaton around it. */
function stone(r) {
  const g = new THREE.Group();
  g.add(occluder(new THREE.CircleGeometry(r * 1.5, 12)));
  g.add(ring(r * 1.5, INNER.fine, 0.6));
  g.add(node(r, C.ruby, 0.95));
  return g;
}

/* ---- the layout ----------------------------------------------------
   Centre distances are the sums of the radii that actually mesh: a wheel
   drives the NEXT wheel's pinion, never its wheel, which is why the pinions
   are so small and why a train can cross a movement in four steps. */
const CASE_R = 1.4;
const DIAL_R = 1.26;
const MOV_R = 1.16;

const L = {
  barrel: { x: -0.50, y: 0.42, r: 0.46, teeth: 60 },
  centre: { x: 0.02, y: 0.08, r: 0.40, teeth: 48 },
  third: { x: 0.44, y: 0.34, r: 0.30, teeth: 36 },
  fourth: { x: 0.66, y: -0.02, r: 0.24, teeth: 30 },
  escape: { x: 0.44, y: -0.36, r: 0.20, teeth: 15 },
  fork: { x: 0.10, y: -0.56 },
  balance: { x: -0.46, y: -0.62, r: 0.46 },
};

export function build(o = {}) {
  const now = o.now || (() => Date.now());
  const [group, sp] = mk(0, -0.12);
  // Only the watch answers the crown. The module objects keep turning — the
  // crown holds the MOVEMENT still, which is what it says it does.
  group.userData.lockable = true;
  // It turns, the way every other object in this console turns. The crown is
  // what brings it back to facing you, and nothing else does.
  group.userData.spin = [0, 0.17, 0];
  group.userData.hitR = 2.1;
  const parts = group.userData.parts;

  /* ================= the case ================= */
  const band = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.5, 96, 1, true);
  band.rotateX(Math.PI / 2);
  sp.add(part(band, C.steel, 0.55, 30));

  sp.add(annulus(DIAL_R, CASE_R, 0.25, C.steel, 0.75));
  sp.add(annulus(MOV_R, CASE_R, -0.25, C.steel, 0.7));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const s = screw(0.045, C.steel);
    s.position.set(Math.cos(a) * (CASE_R * 0.92), Math.sin(a) * (CASE_R * 0.92), -0.252);
    s.rotation.z = a;
    sp.add(s);
  }

  // The crown at three, with its knurl.
  const crown = new THREE.Group();
  const crownBody = new THREE.CylinderGeometry(0.115, 0.115, 0.14, 20, 1, true);
  crownBody.rotateZ(Math.PI / 2);
  crown.add(part(crownBody, C.steel, 0.7, 30));
  const knurl = [];
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2;
    knurl.push(
      V(-0.07, Math.cos(a) * 0.116, Math.sin(a) * 0.116),
      V(0.07, Math.cos(a) * 0.116, Math.sin(a) * 0.116),
    );
  }
  crown.add(segs(knurl, C.steel, 0.4));
  // At FOUR o'clock, not three: it is the whole reason this case looks the
  // way it does from the side, and it keeps the crown out from under a wrist.
  const crownAngle = -Math.PI / 6;
  crown.position.set(Math.cos(crownAngle) * (CASE_R + 0.07), Math.sin(crownAngle) * (CASE_R + 0.07), 0);
  crown.rotation.z = crownAngle;
  sp.add(crown);
  parts.crown = crown;

  /* Lugs: the four horns a strap goes through, two at twelve and two at six.
     They run OUT of the case, parallel, tapering slightly and turning down at
     the tip the way a lug does so a strap can sit against a wrist. Drawn as
     splayed diagonals they read as a broken thing, which is what the first
     cut of them was. */
  /* Lugs, to the proportions a 37mm watch on an 18mm strap actually has.
     The case radius here is 18.5mm, so one millimetre is 0.076 of a unit:

       strap between them   18mm  ->  inner faces at x = +-0.68
       each horn            3.5mm ->  outer faces at x = +-0.94
       lug to lug           44mm  ->  tips at y = +-1.66

     Which puts them on the case's SHOULDERS, where lugs are. Drawn near the
     centre line instead they read as two fins on top of a disc, which is
     what the first two cuts of this were — the width between them is the
     measurement that makes a watch look like a watch, and it is the one I
     had wrong. */
  const LUG_IN = 0.68;
  const LUG_OUT = 0.94;
  for (const sy of [1, -1]) {
    for (const sx of [1, -1]) {
      /* The lug BEGINS at the case, and its root is the case's own curve.
         Run into the case instead and you get a horn drawn across the inside
         of a watch — which is what you see whenever the object is tilted far
         enough to look over the bezel. Clipping it here rather than hiding it
         with another solid also means there is nothing to leak. */
      const yIn = Math.sqrt(Math.max(0, CASE_R * CASE_R - LUG_IN * LUG_IN));
      const yOut = Math.sqrt(Math.max(0, CASE_R * CASE_R - LUG_OUT * LUG_OUT));
      const aIn = Math.atan2(yIn, LUG_IN);
      const aOut = Math.atan2(yOut, LUG_OUT);
      const lug = new THREE.Shape();
      lug.moveTo(sx * LUG_IN, sy * yIn);
      // along the rim, a hair inside it so the two never leave a seam
      for (let k = 1; k <= 6; k += 1) {
        const a = aIn + ((aOut - aIn) * k) / 6;
        lug.lineTo(sx * Math.cos(a) * (CASE_R - 0.012), sy * Math.sin(a) * (CASE_R - 0.012));
      }
      lug.lineTo(sx * (LUG_OUT - 0.02), sy * 1.5);
      lug.lineTo(sx * (LUG_OUT - 0.08), sy * 1.64);   // the tip, chamfered
      lug.lineTo(sx * (LUG_IN + 0.06), sy * 1.66);
      lug.lineTo(sx * (LUG_IN + 0.01), sy * 1.52);
      lug.closePath();
      const geo = new THREE.ExtrudeGeometry(lug, { depth: 0.32, bevelEnabled: false, curveSegments: 2 });
      geo.translate(0, 0, -0.16);
      sp.add(part(geo, C.steel, 0.5, 20));
    }
  }
  // The spring bar across each pair, which is what actually holds a strap.
  for (const sy of [1, -1]) {
    const bar = new THREE.CylinderGeometry(0.026, 0.026, LUG_IN * 2 + 0.12, 10);
    bar.rotateZ(Math.PI / 2);
    const b = part(bar, C.steel, 0.45, 30);
    b.position.set(0, sy * 1.5, 0);
    sp.add(b);
  }

  /* ================= the dial, at the front ================= */
  const face = new THREE.Group();
  face.position.z = 0.2;
  face.add(plate(DIAL_R, 0, C.steel, 0.65, 96));
  // Guilloche: concentric turning on the dial, faint, so the face is not a
  // hole. Four rings, not forty — texture that reads as content is wrong.
  for (const r of [0.46, 0.74, 1.02, 1.24]) face.add(ring(r, C.rhodium, 0.22));

  const ticks = [];
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const len = i % 5 === 0 ? 0.1 : 0.05;
    ticks.push(
      V(Math.cos(a) * DIAL_R * 0.94, Math.sin(a) * DIAL_R * 0.94, 0.002),
      V(Math.cos(a) * (DIAL_R * 0.94 - len), Math.sin(a) * (DIAL_R * 0.94 - len), 0.002),
    );
  }
  face.add(segs(ticks, C.steel, 0.65));
  /* Applied batons, each with lume set into it. The lume is the only thing
     on this object that is meant to look like it is emitting rather than
     reflecting, and it is the reason a watch is legible in a dark room — so
     it is drawn bright, in the green every luminous dial has been since
     they stopped using radium. */
  for (let i = 0; i < 12; i += 1) {
    // Three o'clock has no index and no lume: the day and date are cut
    // through the dial there, and a watch does not print a marker over its
    // own window.
    if (i === 3) continue;
    const a = Math.PI / 2 - (i / 12) * Math.PI * 2;
    const r = DIAL_R * 0.73;
    const marker = part(new THREE.PlaneGeometry(0.15, 0.055), C.hot, 0.8);
    marker.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.004);
    marker.rotation.z = a;
    if (i === 0) marker.scale.set(1, 2.6, 1);
    face.add(marker);

    const lume = new THREE.Mesh(
      new THREE.PlaneGeometry(0.105, i === 0 ? 0.105 : 0.03),
      new THREE.MeshBasicMaterial({ color: C.ok, transparent: true, opacity: 0.85 }),
    );
    lume.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.006);
    lume.rotation.z = a;
    face.add(lume);
  }
  // The pip above twelve, which is how you find the top of a dial in the
  // dark without reading anything.
  const pip = node(0.042, C.ok, 0.9);
  pip.position.set(0, DIAL_R * 0.88, 0.006);
  face.add(pip);

  /* The day-date at three. It is the one feature you would name this watch
     by from across a room: two apertures cut side by side in the dial, the
     day on the left and the date on the right, each with a printed wheel
     showing through it. */
  const win = new THREE.Group();
  win.position.set(DIAL_R * 0.62, 0, 0.004);
  const winW = 0.56;
  const winH = 0.2;
  // The aperture: a hole, so the dial is cut away and the wheel shows.
  win.add(poly([
    V(-winW / 2, -winH / 2, 0.002), V(winW / 2, -winH / 2, 0.002),
    V(winW / 2, winH / 2, 0.002), V(-winW / 2, winH / 2, 0.002),
  ], C.hot, 0.7, true));
  win.add(segs([V(-winW / 2 + 0.28, -winH / 2, 0.002), V(-winW / 2 + 0.28, winH / 2, 0.002)], C.hot, 0.4));
  const dayText = printedPlane(0.26, 0.15, 'FRI', '#dffcff');
  dayText.position.set(-0.14, 0, 0.006);
  win.add(dayText);
  const dateText = printedPlane(0.24, 0.15, '25', '#dffcff');
  dateText.position.set(0.13, 0, 0.006);
  win.add(dateText);
  face.add(win);
  parts.dayText = dayText;
  parts.dateText = dateText;

  /* The hands. A watch hand is a body with an outline — the solid is what
     lets it pass over a marker and hide it. */
  const hand = (len, w, colour) => {
    const outline = [
      V(-0.08, -w, 0.001), V(len * 0.8, -w * 0.5, 0.001), V(len, 0, 0.001),
      V(len * 0.8, w * 0.5, 0.001), V(-0.08, w, 0.001),
    ];
    const s = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.Group();
    g.add(occluder(new THREE.ShapeGeometry(s, 1)));
    g.add(poly(outline, colour, 0.95, true));
    return g;
  };
  const hourHand = hand(0.66, 0.062, C.hot);
  hourHand.position.z = 0.008;
  const minHand = hand(1.06, 0.046, C.hot);
  minHand.position.z = 0.012;
  // Lume down the middle of each hand, inset from the polished edge.
  const lumeBar = (len, w) => new THREE.Mesh(
    new THREE.PlaneGeometry(len, w),
    new THREE.MeshBasicMaterial({ color: C.ok, transparent: true, opacity: 0.8 }),
  );
  const hourLume = lumeBar(0.46, 0.055);
  hourLume.position.set(0.26, 0, 0.003);
  hourHand.add(hourLume);
  const minLume = lumeBar(0.8, 0.04);
  minLume.position.set(0.32, 0, 0.003);
  minHand.add(minLume);
  face.add(hourHand, minHand);

  /* Centre seconds, in the colour reserved for the live second — a thin
     sweep with the counterweight every seconds hand carries to balance it
     about the pivot. It JUMPS: this is the console's clock. */
  const secHand = new THREE.Group();
  secHand.add(poly([V(-0.28, 0, 0.018), V(DIAL_R * 0.9, 0, 0.018)], C.beat, 1));
  const tail = node(0.055, C.beat, 0.8);
  tail.position.set(-0.24, 0, 0.018);
  secHand.add(tail);
  face.add(secHand);
  const cap = node(0.045, C.blued, 0.9);
  cap.position.z = 0.022;
  face.add(cap);
  parts.hourHand = hourHand;
  parts.minHand = minHand;
  parts.secHand = secHand;
  sp.add(face);

  /* ================= the movement, at the back =================
     Authored looking AT it, then turned to face the other way, so the
     layout above reads the way a watchmaker would draw it. */
  const back = new THREE.Group();
  back.rotation.y = Math.PI;
  back.position.z = -0.1;
  sp.add(back);

  back.add(plate(MOV_R, -0.08, INNER.frame, 0.6, 96));
  // Perlage: a few turned circles at the plate's edge, where a movement's
  // finishing actually shows. A full field of them at this size is not a
  // finish, it is noise over the parts that matter.
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2;
    const c = ring(0.13, INNER.frame, 0.22);
    c.position.set(Math.cos(a) * (MOV_R - 0.16), Math.sin(a) * (MOV_R - 0.16), -0.078);
    back.add(c);
  }

  /* ---- the barrel: the mainspring, and where alerts live ---- */
  const B = L.barrel;
  const barrel = new THREE.Group();
  barrel.position.set(B.x, B.y, -0.03);
  barrel.add(wheelPart(B.r, B.teeth, INNER.wheel, 0));
  barrel.add(spiral(3.6, B.r * 0.2, B.r * 0.82, INNER.wheel, 0.45));
  const ratchet = wheelPart(B.r * 0.54, 20, INNER.fine, 0);
  ratchet.position.z = 0.03;
  barrel.add(ratchet);
  const ratchetPulse = pulseRing(B.r * 0.56, B.r * 0.95, C.warn, 0.02);
  ratchetPulse.mesh.position.z = 0.035;
  barrel.add(ratchetPulse.mesh);
  const click = screw(0.05);
  click.position.z = 0.05;
  barrel.add(click);
  back.add(barrel);
  parts.barrel = barrel;
  parts.ratchet = ratchet;
  parts.ratchetPulse = ratchetPulse;

  /* ---- the going train ---- */
  const train = [];
  for (const key of ['centre', 'third', 'fourth']) {
    const w = L[key];
    const g = wheelPart(w.r, w.teeth, INNER.wheel);
    g.position.set(w.x, w.y, -0.035);
    back.add(g);
    train.push(g);
    const pin = wheelPart(w.r * 0.26, 8, INNER.fine, 0);
    pin.position.set(w.x, w.y, -0.06);
    back.add(pin);
  }

  const E = L.escape;
  const escape = wheelPart(E.r, E.teeth, INNER.fine, 3);
  escape.position.set(E.x, E.y, -0.035);
  back.add(escape);
  parts.escape = escape;

  /* ---- the escapement ---- */
  const F = L.fork;
  const fork = new THREE.Group();
  for (const path of [[[-0.34, 0.0], [-0.02, 0.02], [0.3, 0.2]], [[-0.02, 0.02], [0.28, -0.18]]]) {
    const pts = bridgeShape(path, 0.045);
    fork.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(pts), 1)));
    fork.add(poly(pts.map((p) => V(p.x, p.y, 0)), INNER.fine, 0.85, true));
  }
  for (const [px, py] of [[0.3, 0.2], [0.28, -0.18]]) {
    const pallet = node(0.035, C.ruby, 0.95);
    pallet.position.set(px, py, 0.004);
    fork.add(pallet);
  }
  fork.position.set(F.x, F.y, -0.012);
  back.add(fork);
  parts.fork = fork;

  /* ---- the balance: the part that decides what a second is ---- */
  const G = L.balance;
  const balance = new THREE.Group();
  balance.position.set(G.x, G.y, 0.02);
  balance.add(ring(G.r, INNER.wheel, 0.9));
  balance.add(ring(G.r * 0.93, INNER.wheel, 0.45));
  const arms = [];
  for (let i = 0; i < 2; i += 1) {
    const a = (i * Math.PI) / 2;
    arms.push(V(Math.cos(a) * G.r, Math.sin(a) * G.r, 0), V(-Math.cos(a) * G.r, -Math.sin(a) * G.r, 0));
  }
  balance.add(segs(arms, INNER.wheel, 0.65));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const s = node(0.038, INNER.wheel, 0.85);
    s.position.set(Math.cos(a) * G.r, Math.sin(a) * G.r, 0);
    balance.add(s);
  }
  const roller = node(0.03, C.ruby, 0.95);
  roller.position.set(G.r * 0.24, 0, -0.02);
  balance.add(roller);
  back.add(balance);
  parts.balance = balance;

  const hair = spiral(4.8, 0.06, G.r * 0.62, INNER.fine, 0.6);
  hair.position.set(G.x, G.y, -0.005);
  back.add(hair);
  parts.hair = hair;

  /* ---- the bridges, over the top ---- */
  back.add(bridge([
    [0.1, 0.92], [L.third.x, L.third.y], [L.fourth.x, L.fourth.y], [E.x, E.y], [F.x + 0.1, F.y + 0.08],
  ], (t) => 0.23 - t * 0.07, 0.05, INNER.frame));
  back.add(bridge([[-1.14, 0.78], [B.x, B.y], [-0.16, 0.8]], (t) => 0.21 - Math.abs(t - 0.5) * 0.08, 0.05, INNER.frame));
  back.add(bridge([[-1.16, -0.92], [-0.84, -0.78], [G.x, G.y]], (t) => 0.23 - t * 0.06, 0.09, INNER.frame));

  const index = poly([V(G.x + 0.02, G.y + 0.04, 0.1), V(G.x + 0.3, G.y + 0.22, 0.1)], INNER.fine, 0.75);
  back.add(index);
  // The going train reads brighter than the plate it sits on.

  for (const [x, y, z, r] of [
    [L.centre.x, L.centre.y, 0.056, 0.04],
    [L.third.x, L.third.y, 0.056, 0.036],
    [L.fourth.x, L.fourth.y, 0.056, 0.034],
    [E.x, E.y, 0.056, 0.032],
    [F.x + 0.1, F.y + 0.08, 0.056, 0.03],
    [G.x, G.y, 0.096, 0.042],
    [B.x, B.y, 0.056, 0.04],
  ]) {
    const j = stone(r);
    j.position.set(x, y, z);
    back.add(j);
  }
  for (const [x, y, z] of [
    [0.1, 0.92, 0.056], [F.x + 0.1, F.y + 0.08, 0.058],
    [-1.14, 0.78, 0.056], [-0.16, 0.8, 0.056],
    [-1.16, -0.92, 0.096], [-0.84, -0.78, 0.096],
  ]) {
    const s = screw(0.045);
    s.position.set(x, y, z);
    back.add(s);
  }

  /* ---- the weight ----
     The rotor: a segment of heavy metal on the same axis as the hands, free
     to swing. It is the first thing you see through a display back and the
     last thing anybody expects to be doing anything, so it sweeps the way a
     real one does — carried round by the wrist, never driven. */
  const rotor = new THREE.Group();
  rotor.position.z = 0.14;
  const rOut = MOV_R * 0.99;
  const rIn = 0.34;
  const seg = new THREE.Shape();
  seg.absarc(0, 0, rOut, Math.PI * 0.02, Math.PI * 0.98, false);
  seg.absarc(0, 0, rIn, Math.PI * 0.98, Math.PI * 0.02, true);
  seg.closePath();
  const segPts = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = Math.PI * (0.02 + 0.96 * (i / 48));
    segPts.push(V(Math.cos(a) * rOut, Math.sin(a) * rOut, 0));
  }
  for (let i = 48; i >= 0; i -= 1) {
    const a = Math.PI * (0.02 + 0.96 * (i / 48));
    segPts.push(V(Math.cos(a) * rIn, Math.sin(a) * rIn, 0));
  }
  rotor.add(occluder(new THREE.ShapeGeometry(seg, 12)));
  rotor.add(poly(segPts, INNER.wheel, 0.9, true));
  const ribs = [];
  for (let i = 1; i < 5; i += 1) {
    const a = Math.PI * (0.06 + 0.88 * (i / 5));
    ribs.push(V(Math.cos(a) * rIn, Math.sin(a) * rIn, 0.002), V(Math.cos(a) * rOut, Math.sin(a) * rOut, 0.002));
  }
  rotor.add(segs(ribs, INNER.frame, 0.5));
  // The heavy rim, in brass: the mass is all at the edge, which is the
  // entire point of the thing.
  rotor.add(ring(rOut * 0.93, INNER.wheel, 0.75));
  rotor.add(ring(rOut * 0.86, INNER.frame, 0.35));
  rotor.add(ring(rIn, INNER.fine, 0.7));
  rotor.add(node(0.05, C.ruby, 0.9));
  back.add(rotor);
  parts.rotor = rotor;

  /* The movement's layout was drawn against a larger case, and parts of it —
     the ends of two bridges, their screws — reached past the caseback's
     opening and showed outside the watch. Rather than nudge a dozen
     coordinates and have it drift again the next time the case changes, the
     whole thing is measured and scaled to fit the opening it goes in. That is
     also how a movement works: it is a size, and a case is built round it. */
  {
    const box = new THREE.Box3().setFromObject(back);
    let far = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) far = Math.max(far, Math.hypot(x, y));
    }
    if (far > 0) back.scale.setScalar(Math.min(1, (MOV_R * 0.97) / far));
  }

  /* ---- motion ---------------------------------------------------------
     The hands come from the clock, the train turns at the ratios its tooth
     counts give it, and the balance beats three times a second — 21,600
     vibrations an hour, the rate this movement is drawn as running at, and
     the rate the seconds hand steps in time with. */
  let beat = 0;
  let lastSecond = -1;
  let lastDay = -1;
  /* The weight is a pendulum, and the only honest way to move it is to let
     gravity do it.

     `spin` is the rotor's OWN angle, in the movement's frame, and it is what
     gets integrated. Gravity pulls on it toward whatever counts as down
     inside the plane it turns in; turning the watch moves that direction and
     the weight has to catch up. Measuring the angle relative to down instead
     — which the first cut did — makes the weight track the case exactly, with
     no lag and no overshoot: a rotor with no mass at all. */
  let spin = 0.3;
  let spinV = 0;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const EX = new THREE.Vector3();
  const EY = new THREE.Vector3();
  const MAT = new THREE.Matrix4();


  group.userData.tick = (t, dt, p, env) => {
    const slow = env && env.reduced ? 0.3 : 1;
    const d = new Date(now());

    /* The seconds hand SWEEPS, because this is a mechanical watch and a
       mechanical seconds hand does not tick once a second — it steps once a
       beat. Six a second, which is the 21,600 vibrations an hour this
       movement is drawn as running at, and which the balance below beats in
       time with. It is still the true second: the step is quantised off
       `now()`, not off an animation frame, so the hand is never between two
       seconds by more than a sixth of one. */
    const beatsPerSec = 6;
    const ticks = Math.floor((d.getTime() / 1000) * beatsPerSec) % (60 * beatsPerSec);
    if (ticks !== lastSecond) {
      lastSecond = ticks;
      p.secHand.rotation.z = Math.PI / 2 - (ticks / (60 * beatsPerSec)) * Math.PI * 2;
    }
    const day = d.getDate();
    if (day !== lastDay) {
      lastDay = day;
      p.dateText.userData.set(String(day));
      p.dayText.userData.set(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]);
    }
    const mins = d.getMinutes() + d.getSeconds() / 60;
    const hours = (d.getHours() % 12) + mins / 60;
    p.minHand.rotation.z = Math.PI / 2 - (mins / 60) * Math.PI * 2;
    p.hourHand.rotation.z = Math.PI / 2 - (hours / 12) * Math.PI * 2;

    if (!(env && env.locked)) {
      const dd = dt * slow;
      barrel.rotation.z += dd * 0.06;
      train.forEach((w, i) => { w.rotation.z += (i % 2 ? -1 : 1) * dd * (0.5 + i * 0.9); });
      escape.rotation.z -= dd * 3.2;

      beat += dd * Math.PI * 2 * (env && env.reduced ? 0.6 : 3);
      p.fork.rotation.z = Math.sin(beat) * 0.16;
      p.balance.rotation.z = Math.sin(beat) * 2.3;
      const breathe = 1 + Math.cos(beat) * 0.04;
      p.hair.scale.set(breathe, breathe, 1);
      p.hair.rotation.z = Math.sin(beat) * 0.55;

      /* The weight. Its plane's own axes in the world tell us which way is
         down INSIDE that plane, and how much of gravity is in it at all: face
         on, all of it; edge on, none, and the weight simply coasts. */
      // The rotor's PARENT, not the rotor. Reading the axes off the rotor
      // itself folds its own angle into the measurement, and the equation
      // then solves for an angle relative to itself — which is a rotor that
      // sits still, or spins, depending on the sign of the error.
      // The world matrix is also a frame stale at this point in the loop,
      // so it is brought up to date first.
      const frame = p.rotor.parent;
      frame.updateWorldMatrix(true, false);
      MAT.copy(frame.matrixWorld);
      EX.setFromMatrixColumn(MAT, 0).normalize();
      EY.setFromMatrixColumn(MAT, 1).normalize();
      const gx = DOWN.dot(EX);
      const gy = DOWN.dot(EY);
      const pull = Math.hypot(gx, gy);
      const down = Math.atan2(gy, gx);
      /* A damped pendulum, integrated on the rotor's own angle. The mass
         sits at the middle of the segment, a quarter turn from the angle the
         group is drawn at, so that is what gravity acts on.

         The two constants are the whole character of the thing. The first is
         how hard gravity pulls it back: lower reads as HEAVIER, because a
         heavy rotor is slow to be turned and slow to come back — this one
         takes about five seconds to swing. The second is damping, kept light
         so it carries well past the bottom and takes half a dozen swings to
         settle. A weight that stops dead at the bottom is a weight with no
         mass at all. */
      const mass = spin + Math.PI / 2;
      spinV += (-1.6 * pull * Math.sin(mass - down) - 0.34 * spinV) * dd;
      spin += spinV * dd;
      p.rotor.rotation.z = spin;
    }

    if (p.alertLevel) p.ratchetPulse.at((t * 0.55) % 1);
    else p.ratchetPulse.mesh.material.opacity = 0;
  };

  /* ---- what needs attention, on the mainspring ---- */
  parts.alertLevel = null;
  const ALERT = { warn: C.warn, err: C.bad };
  function setAlert(level) {
    parts.alertLevel = ALERT[level] ? level : null;
    const colour = parts.alertLevel ? ALERT[level] : INNER.fine;
    parts.ratchet.traverse((n) => {
      if (n.material && n.material.isLineBasicMaterial) n.material.color.setHex(colour);
    });
    parts.ratchetPulse.mesh.material.color.setHex(colour);
    if (!parts.alertLevel) parts.ratchetPulse.mesh.material.opacity = 0;
  }
  setAlert(o.alert);

  /* The crown, held: the watch comes back to face you. A locked movement
     stopped wherever it happened to be would be locked at an angle, which is
     not what "hold it still so I can read it" means. */
  group.userData.rest = () => {
    const y = sp.rotation.y;
    const target = Math.round(y / (Math.PI * 2)) * Math.PI * 2;
    sp.rotation.y += (target - y) * 0.12;
    if (Math.abs(target - sp.rotation.y) < 0.002) sp.rotation.y = target;
  };

  return { group, setAlert };
}
