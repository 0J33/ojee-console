/* ============================================================
   movement/models/router — the 5G CPE as a complication.

   The real unit is a Huawei H153-381: an upright slab about twice as
   tall as it is wide, on a small base, with the antennas inside. So
   the drawing gets no whip aerials and no wifi glyph. The body is the
   slab and the subject is what leaves the top of it: three sets of
   arcs, one per aggregated carrier, expanding and dying at their own
   cadence. A carrier you have is a carrier that is radiating.

   Two things here are less obvious than they look:

   * The arcs are drawn twice, in two planes crossed at ninety
     degrees. The object yaws slowly, and a flat annulus in a single
     plane goes edge-on and disappears once per revolution — which for
     the hero of the object is not a thing that can be allowed to
     happen. Crossed, the pair also reads as a lobe rather than a
     sticker.
   * The ladder's rungs are thin boxes, not lines, for the same
     reason. A vertical line survives a yaw because it lies along the
     spin axis; a horizontal one collapses to a point.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, mk, poly, segs, edges, node, disc, occluder, jewel, pulseRing,
} from '../kit.js';

const W = 0.62; const H = 1.30; const D = 0.30;  // slab: 2.1 times as tall as it is wide
const CY = -0.18;                                // slab centre, so its top lands at 0.47
const TOP = CY + H / 2;                          // where the radio starts
const SHELLS = 3;                                // arcs per plane, per carrier
const MAX_CLIENTS = 8;                           // beads at the foot; beyond that it is a number

/* A 5G carrier is wider and goes further. That difference is the whole
   reason to draw three groups instead of one. */
const SPAN = { '4G': 0.30, '5G': 0.52 };   // half-sweep, radians, centred on +y
const REACH = { '4G': 0.72, '5G': 1.18 };  // how far an arc travels before it is gone
const TINT = { '4G': C.brass, '5G': C.beat };

/** One carrier's radio: SHELLS arcs in each of two crossed planes. */
function makeCarrier(i) {
  const root = new THREE.Group();
  root.position.set(0, TOP, 0);
  const r0 = 0.15 + i * 0.045;   // a little nesting so two 4G carriers never sit on top of each other
  const rings = [];
  for (let plane = 0; plane < 2; plane += 1) {
    const holder = new THREE.Group();
    holder.rotation.y = (plane * Math.PI) / 2;
    root.add(holder);
    for (let s = 0; s < SHELLS; s += 1) {
      // pulseRing is built with a unit travel so at(k) maps k straight to
      // radius in world units; the reach and the fade are then this object's
      // own, because they change when the carrier's generation does.
      const p = pulseRing(r0, r0 + 1, C.brass, 0.035);
      p.mesh.geometry.dispose();
      p.mesh.geometry = new THREE.RingGeometry(r0, r0 + 0.035, 40, 1, Math.PI / 2 - 0.3, 0.6);
      holder.add(p.mesh);
      rings.push({ p, phase: s / SHELLS });
    }
  }
  return {
    root, rings, gen: '4G', span: SPAN['4G'], reach: REACH['4G'], period: 2.7 - i * 0.38,
  };
}

/** Rewrite an arc's sector in place. Cheaper than a group per generation
    and the only geometry in the object that is not fixed at build. */
function setSpan(car, span) {
  if (Math.abs(car.span - span) < 1e-6) return;
  car.span = span;
  for (const r of car.rings) {
    const g = r.p.mesh.geometry;
    const inner = g.parameters.innerRadius; const outer = g.parameters.outerRadius;
    g.dispose();
    r.p.mesh.geometry = new THREE.RingGeometry(inner, outer, 40, 1, Math.PI / 2 - span, span * 2);
  }
}

export function build(opts = {}) {
  // A hair of roll so it reads as a drawn object rather than an elevation,
  // and a little pitch down so the base sits on something.
  const [group, sp] = mk(opts.tiltZ ?? 0.05, opts.tiltX ?? -0.20);

  /* ---- the unit ---- */
  const slab = edges(new THREE.BoxGeometry(W, H, D), C.steel, 0.7);
  slab.position.y = CY;
  const slabFill = occluder(new THREE.BoxGeometry(W - 0.008, H - 0.008, D - 0.008));
  slabFill.position.y = CY;
  sp.add(slabFill, slab);

  // The front face is one moulded panel inset from the shell edge.
  const fx = W / 2 - 0.07; const fyT = TOP - 0.07; const fyB = CY - H / 2 + 0.07;
  sp.add(poly([V(-fx, fyB, 0), V(fx, fyB, 0), V(fx, fyT, 0), V(-fx, fyT, 0)], C.rhodium, 0.32, true)
    .translateZ(D / 2 + 0.002));

  const base = edges(new THREE.BoxGeometry(0.80, 0.09, 0.44), C.rhodium, 0.55);
  base.position.y = CY - H / 2 - 0.045;
  const baseFill = occluder(new THREE.BoxGeometry(0.79, 0.08, 0.43));
  baseFill.position.y = base.position.y;
  sp.add(baseFill, base);

  // Vent grille, high on the front where the real one exhausts.
  const vent = [];
  for (let i = 0; i < 6; i += 1) {
    const y = 0.10 + i * 0.045;
    vent.push(V(-0.19, y, 0), V(0.19, y, 0));
  }
  sp.add(segs(vent, C.rhodium, 0.3).translateZ(D / 2 + 0.003));

  // The antenna is inside the case, so the jewel marks where the radio
  // pivots rather than a part you could point at.
  const pivot = jewel(0.055);
  pivot.position.set(0, TOP, D / 2 + 0.004);
  sp.add(pivot);

  const led = node(0.028, C.rhodium, 0.9);
  led.position.set(0, -0.70, D / 2 + 0.012);
  const halo = disc(0.03, 0.05, C.rhodium, 0.25);
  halo.position.copy(led.position);
  sp.add(led, halo);

  /* ---- the radio ---- */
  const carriers = [makeCarrier(0), makeCarrier(1), makeCarrier(2)];
  for (const car of carriers) { car.root.visible = false; sp.add(car.root); }

  /* ---- signal ladder ---- */
  const rungs = [];
  for (let i = 0; i < 5; i += 1) {
    const w = 0.16 + i * 0.045;   // widening upward, so strength reads before the count does
    const bar = edges(new THREE.BoxGeometry(w, 0.05, 0.05), C.rhodium, 0.2);
    bar.position.set(0.78 + w / 2, -0.58 + i * 0.22, 0);
    rungs.push(bar); sp.add(bar);
  }
  sp.add(poly([V(0.74, -0.66, 0), V(0.74, 0.38, 0)], C.rhodium, 0.3));

  /* ---- clients, as beads at the foot ---- */
  const beads = [];
  for (let i = 0; i < MAX_CLIENTS; i += 1) {
    const b = node(0.022, C.steel, 0.85);
    b.position.set(-0.315 + i * 0.09, CY - H / 2 - 0.175, 0.04);
    b.visible = false;
    beads.push(b); sp.add(b);
  }

  const state = { status: 'off', bars: 0, connected: false, clients: 0 };

  function setState(s) {
    const o = (s && typeof s === 'object') ? s : {};
    state.status = STATUS_HEX[o.status] ? o.status : 'off';
    state.bars = Math.max(0, Math.min(5, Math.round(Number(o.bars) || 0)));
    state.connected = !!o.connected;
    state.clients = Math.max(0, Math.min(MAX_CLIENTS, Math.round(Number(o.clients) || 0)));

    const list = Array.isArray(o.carriers)
      ? o.carriers.filter((c) => c && typeof c === 'object').slice(0, 3) : [];
    carriers.forEach((car, i) => {
      const c = list[i];
      car.root.visible = !!c;
      if (!c) return;
      // The band name is the fallback: an NR band is written N41, an LTE one B3.
      const gen = (String(c.generation || '').toUpperCase() === '5G'
        || (!c.generation && /^n/i.test(String(c.band || '')))) ? '5G' : '4G';
      car.gen = gen;
      car.reach = REACH[gen];
      setSpan(car, SPAN[gen]);
      for (const r of car.rings) r.p.mesh.material.color.setHex(TINT[gen]);
    });

    const hex = STATUS_HEX[state.status];
    rungs.forEach((bar, i) => {
      const on = i < state.bars;
      bar.material.color.setHex(on ? hex : C.rhodium);
      bar.material.opacity = on ? 0.95 : 0.18;
    });
    led.material.color.setHex(hex);
    halo.material.color.setHex(hex);
    beads.forEach((b, i) => { b.visible = i < state.clients; });
  }
  setState(opts.state);

  group.userData.spin = [0, 0.10, 0];
  group.userData.hitR = 1.7;
  group.userData.parts = { state, carriers, rungs, led, halo, beads };

  group.userData.tick = (t, dt, parts, env) => {
    const live = parts.state.connected;
    for (const car of parts.carriers) {
      if (!car.root.visible) continue;
      car.rings.forEach((r, j) => {
        let k;
        if (env.reduced) k = 0.30 + (j % SHELLS) * 0.22;   // held as a static nested fan
        else k = ((t / car.period) + r.phase) % 1;
        // Disconnected, the radio never leaves the case: the arcs sit on the
        // antenna at their smallest and stay dim.
        const travel = live ? k : 0.04;
        r.p.at(travel * car.reach);
        r.p.mesh.material.opacity = live ? 0.5 * (1 - k) : 0.1;
      });
    }
    // The bead breathes only while the link is up; off, it is just a dot.
    const b = live && !env.reduced ? 0.7 + 0.3 * Math.sin(t * 2.4) : 0.85;
    parts.led.material.opacity = parts.state.status === 'off' ? 0.35 : b;
    parts.halo.material.opacity = parts.state.status === 'off' ? 0.06 : 0.22 * b;
  };

  return { group, setState };
}
