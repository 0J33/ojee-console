/* ============================================================
   movement/models/router — the thing with the antennas.

   A gaming router: a low angular chassis on a desk with six blade
   antennas splayed off its shoulders, a light bar across the nose, and
   signal washing out across the desk in rings.

   Everything the module reports is on the object. The bar across the
   nose carries the signal bars. Each aggregated carrier pushes its own
   train of rings out across the desk — cyan for NR, steel for LTE — so
   three carriers is visibly three. The antennas light from the outside
   in as the signal comes up, and the clients stand around the desk on a
   line each; the line only exists while there is something to carry it.

   Dropped, the rings stop where they are and everything but the chassis
   goes out. A router with no signal is a box with sticks on it.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, occluder, ring, mk,
} from '../kit.js';

const SX = 1.10;          // chassis scale — wider than it is deep, like the real ones
const SZ = 0.92;
const Y0 = -0.92;         // the desk
const DECK = 0.24;        // lower deck height
const RIDGE = 0.42;       // the raised spine on top of it
const BARS = 5;
const ANT = 6;            // antennas
const AL = 1.25;          // antenna length
const AW = 0.10;          // blade half-width
const MAX_CLIENTS = 6;
const MAX_CARRIERS = 3;
const RINGS = 3;          // rings in flight per carrier
const TINT = { '5G': C.beat, '4G': C.steel };
const SPEED = { '5G': 0.42, '4G': 0.28 };
const SPREAD = { '5G': 3.6, '4G': 2.7 };

/* The chassis outline, nose at +z. Angular on purpose: the whole point
   of one of these is that it does not look like a box. */
const PLAN = [
  [0.00, 1.12], [0.62, 0.66], [0.92, -0.10], [0.66, -0.92],
  [-0.66, -0.92], [-0.92, -0.10], [-0.62, 0.66],
];
/* Which outline corners carry an antenna, and how far each one leans out.
   The pair on the flanks lean least: they are the two that cost the most
   width on screen, and the object is wide enough already. */
const MOUNTS = [[1, 0.48], [2, 0.34], [3, 0.56], [4, 0.56], [5, 0.34], [6, 0.48]];

const keep = (o) => { o.userData.o0 = o.material.opacity; return o; };

const loop = (k, y) => PLAN.map(([x, z]) => V(x * SX * k, y, z * SZ * k));

/* A solid between two outlines — sides and both caps. The occluder wants
   faces, not a wireframe, or the antennas behind the chassis show through
   it and the object stops reading as one thing. */
function loft(a, b) {
  const pos = [];
  const tri = (p, q, r) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  for (let i = 0; i < a.length; i += 1) {
    const j = (i + 1) % a.length;
    tri(a[i], a[j], b[j]); tri(a[i], b[j], b[i]);
  }
  for (let i = 1; i < a.length - 1; i += 1) {
    tri(b[0], b[i], b[i + 1]); tri(a[0], a[i + 1], a[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function build(opts = {}) {
  const [group, sp] = mk(0, -0.22);
  /* A lean, not a revolution: the front of this is the side worth
     looking at, and turning it all the way round spent half the time
     showing its back. */
  group.userData.sway = [0.055, 0.34, 0.022];
  group.userData.swayPeriod = 9.5;
  group.userData.swayPhase = 1.7;
  group.userData.hitR = 2.0;
  const parts = group.userData.parts;

  const yDeck = Y0 + DECK;
  const yTop = yDeck + RIDGE;

  /* ---- the desk it stands on ---- */
  const desk = keep(ring(1.78, C.rhodium, 0.22, 'y'));
  desk.position.y = Y0;
  sp.add(desk);
  const desk2 = keep(ring(1.3, C.rhodium, 0.1, 'y'));
  desk2.position.y = Y0;
  sp.add(desk2);

  /* ---- the chassis ----
     Two tiers: a wide deck the antennas bolt to, and a narrower spine on
     top of it with the vents in it. */
  const base = loop(1.0, Y0);
  const mid = loop(0.98, yDeck);
  const crown = loop(0.5, yTop);

  const shell = new THREE.Group();
  shell.add(occluder(loft(base, mid)));
  shell.add(occluder(loft(mid, crown)));
  sp.add(shell);

  const shellLines = new THREE.Group();
  const l1 = poly(base, C.steel, 0.85, true);
  const l2 = poly(mid, C.steel, 0.85, true);
  const l3 = poly(crown, C.steel, 0.9, true);
  shellLines.add(l1, l2, l3);
  const ribs = [];
  for (let i = 0; i < PLAN.length; i += 1) {
    ribs.push(base[i], mid[i], mid[i], crown[i]);
  }
  const l4 = segs(ribs, C.steel, 0.7);
  shellLines.add(l4);
  sp.add(shellLines);
  const shellMats = [l1, l2, l3, l4].map((o) => o.material);

  // The vents down the spine — chevrons, pointing the way the chassis does.
  const vent = [];
  for (let i = 0; i < 4; i += 1) {
    const z = 0.30 - i * 0.19;
    vent.push(V(-0.22, yTop + 0.001, z - 0.09), V(0, yTop + 0.001, z),
      V(0, yTop + 0.001, z), V(0.22, yTop + 0.001, z - 0.09));
  }
  sp.add(keep(segs(vent, C.rhodium, 0.3)));

  /* ---- the light bar ----
     Across the nose, on the deck in front of the spine. This is the
     signal, and it is the one part of the chassis allowed to be bright
     when the rest of it is not. */
  const strip = [];
  for (let i = 0; i < BARS; i += 1) {
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.155, 0.085),
      new THREE.MeshBasicMaterial({ color: C.steel, transparent: true, opacity: 0.12 }),
    );
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(-0.34 + i * 0.17, yDeck + 0.003, 0.81);
    sp.add(bar);
    strip.push(bar);
  }
  sp.add(keep(poly([
    V(-0.44, yDeck + 0.002, 0.72), V(0.44, yDeck + 0.002, 0.72),
    V(0.36, yDeck + 0.002, 0.9), V(-0.36, yDeck + 0.002, 0.9),
  ], C.rhodium, 0.28, true)));

  // The underglow. Every one of these has one and it is never subtle.
  const glow = keep(ring(1.26, C.beat, 0, 'y'));
  glow.position.y = Y0 + 0.012;
  sp.add(glow);

  /* ---- the antennas ----
     Flat blades, not rods: hinged at the shoulder, leaning further out
     the further back they sit. */
  const blade = new THREE.Shape();
  blade.moveTo(-AW, 0);
  blade.lineTo(AW, 0);
  blade.lineTo(AW, AL - 0.09);
  blade.lineTo(AW * 0.42, AL);
  blade.lineTo(-AW * 0.42, AL);
  blade.lineTo(-AW, AL - 0.09);
  blade.closePath();
  const bladePts = [
    V(-AW, 0), V(AW, 0), V(AW, AL - 0.09),
    V(AW * 0.42, AL), V(-AW * 0.42, AL), V(-AW, AL - 0.09),
  ];
  const bladeGeo = new THREE.ShapeGeometry(blade);

  const ants = [];
  for (let i = 0; i < ANT; i += 1) {
    const [vi, tilt] = MOUNTS[i];
    const [px, pz] = PLAN[vi];
    const at = V(px * SX, yDeck - 0.01, pz * SZ);
    const g = new THREE.Group();
    g.position.copy(at);
    /* Built as a basis rather than as Euler angles. Euler order is easy to
       get backwards, and backwards here means six antennas that lean IN,
       which looks like a crown of skewers instead of a router. The blade
       stands along `up`, leaning out along the radial, and its width runs
       tangentially so the flat of it faces out. */
    const az = Math.atan2(at.x, at.z);
    const rad = V(Math.sin(az), 0, Math.cos(az));
    const up = V(rad.x * Math.sin(tilt), Math.cos(tilt), rad.z * Math.sin(tilt)).normalize();
    const side = V(Math.cos(az), 0, -Math.sin(az));
    const face = new THREE.Vector3().crossVectors(side, up).normalize();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, face));
    sp.add(g);

    // The knuckle it pivots on.
    const knuckle = keep(ring(0.052, C.rhodium, 0.5, 'z'));
    g.add(knuckle);

    const arm = new THREE.Group();
    arm.position.y = 0.06;
    g.add(arm);
    arm.add(occluder(bladeGeo));
    const outline = poly(bladePts, C.rhodium, 0.55, true);
    arm.add(outline);
    // The live part: the top of the blade, and the tip.
    // The ribs across it, so a blade reads as a blade and not a plank.
    const ribPts = [];
    for (let k = 1; k <= 4; k += 1) {
      const ry = (k / 5) * (AL - 0.09);
      ribPts.push(V(-AW * 0.7, ry), V(AW * 0.7, ry));
    }
    arm.add(keep(segs(ribPts, C.rhodium, 0.26)));
    const lit = poly([V(0, AL - 0.30), V(0, AL - 0.02)], C.beat, 0);
    arm.add(lit);
    const tip = node(0.03, C.beat, 0);
    tip.position.y = AL;
    arm.add(tip);

    ants.push({ outline, lit, tip, phase: i / ANT });
  }

  /* ---- the signal ----
     One train of rings per aggregated carrier, washing out across the
     desk. Out, not up: a wavefront that climbs turns the object into a
     flagpole and says nothing extra. */
  const carriers = [];
  for (let i = 0; i < MAX_CARRIERS; i += 1) {
    const root = new THREE.Group();
    root.position.y = Y0 + 0.02 + i * 0.012;
    sp.add(root);
    const rings = [];
    for (let k = 0; k < RINGS; k += 1) {
      const r = ring(0.48, C.beat, 0, 'y', 64);
      root.add(r);
      rings.push(r);
    }
    carriers.push({ root, rings, gen: '4G', phase: i / MAX_CARRIERS });
    root.visible = false;
  }

  /* ---- the clients ----
     Round the desk, each on its own line. The line is the association:
     no line, no client. */
  const clients = [];
  for (let i = 0; i < MAX_CLIENTS; i += 1) {
    const a = (i / MAX_CLIENTS) * Math.PI * 2 + 0.52;
    const at = V(Math.cos(a) * 1.9, Y0 + 0.02, Math.sin(a) * 1.9);
    const mark = node(0.042, C.ok, 0);
    mark.position.copy(at);
    sp.add(mark);
    const link = keep(poly([V(0, Y0 + 0.06, 0), at], C.ok, 0));
    sp.add(link);
    clients.push({ mark, link });
  }

  parts.ants = ants;
  parts.carriers = carriers;
  parts.clients = clients;
  parts.glow = glow;

  /* ---- state ---- */
  const st = {
    status: 'off', bars: 0, connected: false, clients: 0, live: 0,
  };

  function setState(s) {
    const o = (s && typeof s === 'object') ? s : {};
    st.status = STATUS_HEX[o.status] ? o.status : 'off';
    st.bars = Math.max(0, Math.min(BARS, Math.round(Number(o.bars) || 0)));
    st.connected = !!o.connected;
    st.clients = Math.max(0, Math.min(MAX_CLIENTS, Math.round(Number(o.clients) || 0)));

    const hex = STATUS_HEX[st.status];
    for (const m of shellMats) {
      m.color.setHex(hex);
      m.opacity = st.connected ? 0.85 : 0.45;
    }

    /* The bar reads like a signal meter anywhere else: the bars you have
       are lit, the ones you do not are still there and dark. A weak
       signal is amber even when nothing is wrong — two bars IS the news. */
    const barC = !st.connected ? C.rhodium
      : st.bars <= 2 ? C.warn : st.bars >= 4 ? C.ok : C.steel;
    strip.forEach((b, i) => {
      const on = st.connected && i < st.bars;
      b.material.color.setHex(on ? barC : C.steel);
      b.material.opacity = on ? 0.95 : 0.1;
    });
    glow.material.color.setHex(st.connected ? barC : C.rhodium);
    glow.material.opacity = st.connected ? 0.3 : 0.08;

    // The antennas come up with the signal, outside in.
    st.live = st.connected ? Math.max(1, Math.round((st.bars / BARS) * ANT)) : 0;
    ants.forEach((a, i) => {
      const on = i < st.live;
      a.outline.material.color.setHex(on ? C.steel : C.rhodium);
      a.outline.material.opacity = st.connected ? 0.6 : 0.3;
      if (!on) {
        a.lit.material.opacity = 0;
        a.tip.material.opacity = 0.05;
      }
    });

    const list = Array.isArray(o.carriers)
      ? o.carriers.filter((c) => c && typeof c === 'object').slice(0, MAX_CARRIERS) : [];
    carriers.forEach((car, i) => {
      const c = list[i];
      car.root.visible = !!c && st.connected;
      if (!c) return;
      // An NR band is written N41, an LTE one B3 — the letter is the
      // fallback when the module does not say which generation it is.
      const gen = (String(c.generation || '').toUpperCase() === '5G'
        || (!c.generation && /^n/i.test(String(c.band || '')))) ? '5G' : '4G';
      car.gen = gen;
      for (const r of car.rings) r.material.color.setHex(TINT[gen]);
    });

    clients.forEach((cl, i) => {
      const on = st.connected && i < st.clients;
      cl.mark.material.opacity = on ? 0.9 : 0.06;
      cl.link.material.opacity = on ? 0.32 : 0;
    });
  }

  /* ---- motion ---- */
  let t0 = 0;
  group.userData.tick = (t, dt, p, env) => {
    const slow = env && env.reduced ? 0.25 : 1;
    if (!(env && env.locked)) t0 += dt * slow;

    for (const car of p.carriers) {
      if (!car.root.visible) continue;
      car.rings.forEach((r, k) => {
        // Each ring is the same journey at a different offset: out from
        // under the chassis, growing, fading as it goes.
        const f = ((t0 * SPEED[car.gen]) + car.phase + k / RINGS) % 1;
        r.scale.setScalar(0.5 + f * SPREAD[car.gen]);
        r.material.opacity = 0.4 * (1 - f) ** 1.5;
      });
    }

    // The antennas fire in sequence, so a working router is never still.
    for (let i = 0; i < p.ants.length; i += 1) {
      const a = p.ants[i];
      if (a.lit.material.opacity <= 0 && a.tip.material.opacity <= 0.06) continue;
      const w = 0.5 + 0.5 * Math.sin(t * 2.2 - a.phase * Math.PI * 2);
      a.lit.material.opacity = 0.2 + 0.6 * w;
      a.tip.material.opacity = 0.35 + 0.6 * w;
    }

    // A client's line breathes, so an idle network still has a pulse.
    for (let i = 0; i < p.clients.length; i += 1) {
      const cl = p.clients[i];
      if (cl.link.material.opacity <= 0.01) continue;
      cl.link.material.opacity = 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.4 + i));
    }

    if (p.glow.material.opacity > 0.01) {
      p.glow.material.opacity = 0.22 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.1));
    }
  };

  setState(opts.state ?? null);
  return { group, setState };
}
