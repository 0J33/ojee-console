/* ============================================================
   movement/models/home — the Home module as a complication.

   The module is a Haier split air conditioner, so the object is the
   unit and the house is only what it is bolted to. That is the whole
   hierarchy: the house stays rhodium at context opacity and never
   changes colour, while the unit carries status, the louvres carry
   power, and the air carries mode.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, mk, poly, segs, edges, ring, node, disc, occluder, V,
} from '../kit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* Every dimension below is derived from the body, so the unit, the pad
   and the openings stay in proportion if the body is ever retuned. */
const BW = 1.5; const BH = 0.9; const BD = 1.1;      // body: width, height, depth
const RY = 1.45; const RW = 0.82; const RD = 0.62;   // ridge height, roof half width and depth
const FZ = BD / 2 + 0.002;                           // the plane the front openings are drawn on
const UX = BW / 2 + 0.11; const UY = 0.6;            // the split unit's centre, high on the flank
const UH = 0.26; const UL = 0.84; const UD = 0.22;   // unit height, length along Z, depth off the wall
const MY = UY - UH / 2 - 0.02;                       // the louvre line, just under the unit

/* The roof as a solid, only so the far slope does not show through the
   near one. Non-indexed triangles and a double-sided material: winding
   is not worth getting right for something that is never seen. */
function roofSolid() {
  const a = [0, RY, -RD]; const b = [0, RY, RD];
  const e = [[-RW, BH, -RD], [RW, BH, -RD], [-RW, BH, RD], [RW, BH, RD]];
  const tri = (p, q, r) => [...p, ...q, ...r];
  const v = [                                        // two slopes, then the two gable ends
    ...tri(a, e[0], e[2]), ...tri(a, e[2], b), ...tri(a, e[1], e[3]), ...tri(a, e[3], b),
    ...tri(a, e[0], e[1]), ...tri(b, e[2], e[3]),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

/** A rectangle drawn flat on the front face: door and window frames. */
const rect = (x, y, w, h, c, o) => poly([
  V(x - w / 2, y - h / 2, FZ), V(x + w / 2, y - h / 2, FZ),
  V(x + w / 2, y + h / 2, FZ), V(x - w / 2, y + h / 2, FZ),
], c, o, true);

/* One front of moved air: an arc that leaves the louvre mouth and fans
   downward, the way a wall unit actually throws. It is built at one
   radius and scaled from the mouth, which is the kit's pulseRing idiom
   applied to an arc instead of a circle. */
function airFront(splay) {
  const pts = [];
  for (let i = 0; i <= 20; i += 1) {
    const th = ((-12 + (i / 20) * 96) * Math.PI) / 180;
    pts.push(V(Math.cos(th) * 0.16, -Math.sin(th) * 0.16, 0));
  }
  const line = poly(pts, C.beat, 0.6);
  const grp = new THREE.Group();
  // Splayed in plan as well as section, so the three fronts read as a
  // cone of air rather than one curve seen edge-on as the object turns.
  grp.position.set(UX, MY, 0); grp.rotation.y = splay; grp.add(line);
  return { grp, line };
}

export function build(opts = {}) {
  // Tilted down onto the roof so the pitch reads and the flank the unit
  // is on stays in view for most of the slow turn.
  const [group, sp] = mk(0, 0.3);
  // Drawn at house scale, then blown up to fill the radius the stage
  // normalises against. The ridge is the tallest thing, so the lot is
  // dropped by its own share of that same factor.
  const K = opts.scale ?? 1.32;
  const root = new THREE.Group();
  root.position.y = -0.62 * K;
  root.scale.setScalar(K);
  // Turned onto its corner so the gable and the unit's flank are both in
  // view: this is the pose the object rests at when a drag lets go.
  root.rotation.y = -1.05;
  sp.add(root);

  /* ---- the ground it sits on ---- */
  root.add(ring(1.12, C.rhodium, 0.2, 'y'));
  const tp = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    tp.push(V(Math.cos(a) * 1.12, 0, Math.sin(a) * 1.12), V(Math.cos(a) * 1.21, 0, Math.sin(a) * 1.21));
  }
  root.add(segs(tp, C.rhodium, 0.18));

  /* ---- the house, context only ---- */
  const bodySolid = occluder(new THREE.BoxGeometry(BW - 0.02, BH - 0.02, BD - 0.02));
  const shell = edges(new THREE.BoxGeometry(BW, BH, BD), C.rhodium, 0.42);
  bodySolid.position.y = BH / 2; shell.position.y = BH / 2;
  const rs = occluder(roofSolid());
  rs.material.side = THREE.DoubleSide;
  root.add(bodySolid); root.add(shell); root.add(rs);
  root.add(segs([
    V(0, RY, -RD), V(0, RY, RD),
    V(0, RY, -RD), V(-RW, BH, -RD), V(0, RY, -RD), V(RW, BH, -RD),
    V(0, RY, RD), V(-RW, BH, RD), V(0, RY, RD), V(RW, BH, RD),
    V(-RW, BH, -RD), V(-RW, BH, RD), V(RW, BH, -RD), V(RW, BH, RD),
  ], C.rhodium, 0.45));

  root.add(rect(-0.45, 0.24, 0.28, 0.48, C.rhodium, 0.45));
  const porch = node(0.022, C.brass, 0.12);          // the presence tell: a lamp by the door
  porch.position.set(-0.27, 0.34, FZ); root.add(porch);

  /* The lit window: the kit's additive annulus with almost no hole, so a
     round pool of light sits inside a square frame the way spill does.
     Small and dim on purpose — bloom makes brass carry, and the window
     is not the subject. */
  const glow = disc(0.001, 0.08, C.brass, 0.06);
  glow.position.set(0.06, 0.56, FZ - 0.004);         // behind the frame, in front of the occluder
  root.add(glow);
  root.add(rect(0.06, 0.56, 0.3, 0.26, C.rhodium, 0.45));
  root.add(rect(0.5, 0.56, 0.22, 0.26, C.rhodium, 0.35));
  root.add(segs([                                    // the two windows' glazing bars
    V(0.06, 0.43, FZ), V(0.06, 0.69, FZ), V(-0.09, 0.56, FZ), V(0.21, 0.56, FZ),
    V(0.5, 0.43, FZ), V(0.5, 0.69, FZ),
  ], C.rhodium, 0.28));

  /* ---- the unit: the subject ---- */
  const unitSolid = occluder(new THREE.BoxGeometry(UD * 0.94, UH * 0.88, UL * 0.96));
  const unit = edges(new THREE.BoxGeometry(UD, UH, UL), C.steel, 0.95);
  unitSolid.position.set(UX, UY, 0); unit.position.set(UX, UY, 0);
  root.add(unitSolid); root.add(unit);

  // Intake grille on the top face, four strokes: enough to say which
  // way the air goes in without becoming texture.
  const gp = [];
  for (let i = 0; i < 4; i += 1) {
    const z = -UL * 0.3 + i * (UL * 0.2);
    gp.push(V(UX - UD * 0.4, UY + UH / 2, z), V(UX + UD * 0.4, UY + UH / 2, z));
  }
  root.add(segs(gp, C.steel, 0.4));

  // Four louvre blades across the mouth. Each blade spans the unit's
  // length along Z and pivots about that same Z axis, which is the axis
  // a real louvre turns on, so tilting them opens the mouth.
  const blades = [];
  for (let i = 0; i < 4; i += 1) {
    const c = 0.032; const l = UL * 0.43;
    const b = poly([V(-c, 0, -l), V(c, 0, -l), V(c, 0, l), V(-c, 0, l)], C.steel, 0.8, true);
    const g = new THREE.Group();
    g.position.set(UX + (i - 1.5) * (UD * 0.24), MY, 0);
    g.add(b); root.add(g); blades.push(g);
  }

  const air = [airFront(-0.34), airFront(0), airFront(0.34)];
  air.forEach((a) => root.add(a.grp));

  /* The pad ring doubles as the thermometer scale: indoor sits on it in
     blued steel, the setpoint in brass, so the gap between them is the
     reading without a single glyph. */
  const tIn = node(0.03, C.blued, 0);
  const tSet = node(0.03, C.brass, 0);
  root.add(tIn); root.add(tSet);
  const place = (m, v) => {
    if (v === null) { m.material.opacity = 0; return; }
    const a = -Math.PI * 0.72 + ((clamp(v, 15, 33) - 15) / 18) * Math.PI * 1.44;
    m.position.set(Math.cos(a) * 1.165, 0, Math.sin(a) * 1.165);
    m.material.opacity = 0.9;
  };

  const parts = {
    unit, blades, air, glow, porch, tIn, tSet, bladeA: 0,
    st: { status: 'off', power: false, mode: null, indoor: null, target: null, home: false },
  };
  group.userData.parts = parts;
  group.userData.spin = [0, opts.spin ?? 0.1, 0];
  group.userData.hitR = 1.9;

  function setState(s) {
    const o = s || {};
    const st = {
      status: Object.prototype.hasOwnProperty.call(STATUS_HEX, o.status) ? o.status : 'off',
      power: !!o.power,
      mode: (o.mode === 'cool' || o.mode === 'heat' || o.mode === 'fan') ? o.mode : null,
      indoor: num(o.indoor),
      target: num(o.target),
      home: !!o.home,
    };
    parts.st = st;
    const hex = STATUS_HEX[st.status];
    unit.material.color.setHex(hex);
    unit.material.opacity = st.power ? 0.95 : 0.5;
    // Fan moves air it has not conditioned, so it gets neither cyan nor brass.
    const ac = st.mode === 'heat' ? C.brass : st.mode === 'cool' ? C.beat : C.steel;
    air.forEach((x) => x.line.material.color.setHex(ac));
    blades.forEach((b) => b.children[0].material.color.setHex(st.power ? hex : C.rhodium));
    glow.material.opacity = st.home ? 0.2 : 0.055;
    porch.material.opacity = st.home ? 0.9 : 0.12;
    place(tIn, st.indoor);
    place(tSet, st.target);
  }
  setState(null);

  group.userData.tick = (t, dt, p, env) => {
    const on = p.st.power;
    // The blades ease to their open or closed angle even under reduced
    // motion: that easing is the one slow state change a power toggle is
    // allowed to make. Only the swing on top of it is motion.
    const swing = on && !env.reduced ? Math.sin(t * 0.7) * 0.2 : 0;
    const want = (on ? -0.62 : 0) + swing;
    // Snapped once it is within a hair of the target, so under reduced
    // motion the blades genuinely stop instead of easing forever.
    const d = want - p.bladeA;
    p.bladeA = Math.abs(d) < 0.0015 ? want : p.bladeA + d * (1 - Math.exp(-dt * 3));
    // Each blade lags the one before it a little, the way a stack of them does.
    p.blades.forEach((b, i) => { b.rotation.z = p.bladeA * (1 - i * 0.06); });

    p.air.forEach((x, i) => {
      if (env.reduced) {
        x.grp.scale.setScalar(1 + i * 0.8);
        x.line.material.opacity = on ? 0.6 - i * 0.18 : 0;
        return;
      }
      const ph = (t * 0.5 + i / 3) % 1;
      x.grp.scale.setScalar(1 + ph * 2.4);
      // Fade in fast off the louvres, out slowly as the front spreads.
      x.line.material.opacity = on ? 0.85 * (1 - ph) * Math.min(1, ph * 5) : 0;
    });
  };

  return { group, setState };
}
