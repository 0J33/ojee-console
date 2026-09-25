/* ============================================================
   movement/calibre — the clock, drawn as the movement that keeps it.

   This is the object the whole console is named after. A watch seen
   through its display back shows the balance and the escapement, the
   barrel that drives them, and the bridges holding it all down — so
   that is what this draws, in line art, on the true second.

   What makes it honest rather than decorative:

   * **The seconds marker jumps on the real second**, read from the
     NTP-referenced clock the console already keeps, not from a local
     Date. If the page is 40 ms behind the true second, the marker is
     40 ms behind, and the rate readout says so.
   * **The escape wheel steps, the balance swings, and they agree.**
     One tooth per beat, two beats per second, the way a 4 Hz movement
     would be drawn if you slowed it enough to see.
   * **The barrel carries the alerts.** Mainspring torque is the one
     thing in a watch that everything else depends on, so an alert
     rides it: the spring turns amber, then red, and the barrel's ring
     pulses at a rate the severity sets.
   ============================================================ */

import {
  C, THREE, V, poly, segs, ring, disc, node, jewel, cotes, perlage, mk, pulseRing,
} from './kit.js';

const TAU = Math.PI * 2;

/** The hairspring: a flat Archimedean spiral, which is what a real one
    is. Drawn with enough samples that the coils stay smooth at the size
    the balance is seen. */
function hairspring(r0, r1, turns, c = C.steel, o = 0.55) {
  const pts = [];
  const n = Math.round(turns * 72);
  for (let i = 0; i <= n; i += 1) {
    const k = i / n;
    const a = k * turns * TAU;
    const r = r0 + (r1 - r0) * k;
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return poly(pts, c, o);
}

/** An escape wheel with club teeth. The teeth are the reason this reads
    as an escapement and not as a gear: each one is an asymmetric hook
    with a locking face and an impulse face. */
function escapeWheel(r, teeth, c = C.brass, o = 0.8) {
  const g = new THREE.Group();
  g.add(ring(r * 0.22, c, o));
  const pts = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * TAU;
    const b = ((i + 1) / teeth) * TAU;
    const m = a + (b - a) * 0.62;
    const root = V(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 0);
    const tip = V(Math.cos(m) * r, Math.sin(m) * r, 0);
    const heel = V(Math.cos(b) * r * 0.78, Math.sin(b) * r * 0.78, 0);
    pts.push(root, tip, tip, heel);
    // A spoke every third tooth: enough to read as a wheel, not a disc.
    if (i % 3 === 0) pts.push(V(0, 0, 0), root);
  }
  g.add(segs(pts, c, o));
  return g;
}

/** The balance: rim, crossing, timing screws, and the roller that the
    fork talks to. */
function balanceWheel(r) {
  const g = new THREE.Group();
  g.add(ring(r, C.steel, 0.9));
  g.add(ring(r * 0.88, C.steel, 0.45));
  // Two arms, not four: a modern balance is a two-armed crossing, and
  // four reads as a wagon wheel.
  g.add(segs([V(-r, 0, 0), V(r, 0, 0), V(0, -r, 0), V(0, r, 0)], C.steel, 0.5));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + TAU / 16;
    const s = node(r * 0.07, C.brass, 0.85);
    s.position.set(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94, 0);
    g.add(s);
  }
  const roller = ring(r * 0.2, C.steel, 0.7);
  g.add(roller);
  const impulse = node(r * 0.05, C.ruby, 1);
  impulse.position.set(r * 0.2, 0, 0.01);
  g.add(impulse);
  return g;
}

/** The pallet fork: two pallet stones on a lever that rocks between the
    escape wheel and the balance. */
function palletFork(len) {
  const g = new THREE.Group();
  g.add(poly([V(-len * 0.52, 0, 0), V(len * 0.5, 0, 0)], C.steel, 0.8));
  g.add(poly([V(len * 0.5, 0, 0), V(len * 0.62, len * 0.12, 0)], C.steel, 0.8));
  g.add(poly([V(len * 0.5, 0, 0), V(len * 0.62, -len * 0.12, 0)], C.steel, 0.8));
  const a = node(len * 0.06, C.ruby, 0.95); a.position.set(-len * 0.44, len * 0.16, 0);
  const b = node(len * 0.06, C.ruby, 0.95); b.position.set(-len * 0.44, -len * 0.16, 0);
  g.add(a, b);
  g.add(poly([V(-len * 0.44, len * 0.16, 0), V(-len * 0.2, 0, 0), V(-len * 0.44, -len * 0.16, 0)], C.steel, 0.6));
  return g;
}

/**
 * The whole calibre.
 *
 * @param {object} o
 * @param {Function} o.now   epoch ms from the console's own NTP-referenced
 *                           clock; the marker jumps on what this returns.
 */
export function build(o = {}) {
  const now = o.now || (() => Date.now());
  const [group, sp] = mk(0, -0.22);
  group.userData.spin = [0, 0.045, 0];   // a slow turn, so it reads as an object
  group.userData.hitR = 2.4;

  const parts = group.userData.parts;
  const R = 1.72;                         // the plate's outer radius

  /* ---- the plate ---- */
  const plate = new THREE.Group();
  plate.add(ring(R, C.rhodium, 0.5));
  plate.add(ring(R * 0.985, C.rhodium, 0.22));
  const texture = perlage(R * 1.5, R * 1.5, 0.3, C.rhodium, 0.07);
  texture.position.z = -0.06;
  plate.add(texture);
  // Case screws at the four quarters, which is where a movement is held.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + TAU / 8;
    const s = ring(0.055, C.steel, 0.5);
    s.position.set(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, 0);
    const slot = poly([V(-0.04, 0, 0), V(0.04, 0, 0)], C.steel, 0.5);
    slot.rotation.z = a * 1.7;
    slot.position.copy(s.position);
    plate.add(s, slot);
  }
  sp.add(plate);

  /* ---- the seconds track ---- */
  // A minute ring with a marker that jumps: the one thing on the page
  // that must be exactly right, so it is drawn as a scale and not a sweep.
  const track = new THREE.Group();
  const tickPts = [];
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * TAU;
    const long = i % 5 === 0;
    const r0 = R * (long ? 0.80 : 0.845);
    const r1 = R * 0.88;
    tickPts.push(V(Math.cos(a) * r0, Math.sin(a) * r0, 0), V(Math.cos(a) * r1, Math.sin(a) * r1, 0));
  }
  track.add(segs(tickPts, C.rhodium, 0.4));
  track.add(ring(R * 0.88, C.rhodium, 0.3));
  const marker = node(0.055, C.beat, 1);
  const markerGlow = disc(0.05, 0.09, C.beat, 0.35);
  track.add(marker, markerGlow);
  parts.marker = marker; parts.markerGlow = markerGlow; parts.trackR = R * 0.845;
  sp.add(track);

  /* ---- the barrel, which carries the alerts ---- */
  const barrel = new THREE.Group();
  barrel.position.set(-R * 0.46, R * 0.34, 0.02);
  const barrelR = 0.46;
  barrel.add(ring(barrelR, C.brass, 0.7));
  barrel.add(ring(barrelR * 0.93, C.brass, 0.3));
  const spring = hairspring(barrelR * 0.2, barrelR * 0.86, 3.2, C.brass, 0.45);
  barrel.add(spring);
  barrel.add(jewel(0.05));
  const barrelPulse = pulseRing(barrelR, barrelR * 1.5, C.warn, 0.02);
  barrel.add(barrelPulse.mesh);
  // Teeth around the barrel: it drives the train, and a toothless ring
  // would read as a dial.
  const bt = [];
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * TAU;
    bt.push(V(Math.cos(a) * barrelR, Math.sin(a) * barrelR, 0),
      V(Math.cos(a) * barrelR * 1.06, Math.sin(a) * barrelR * 1.06, 0));
  }
  barrel.add(segs(bt, C.brass, 0.5));
  parts.barrel = barrel; parts.spring = spring; parts.barrelPulse = barrelPulse;
  sp.add(barrel);

  /* ---- the going train ---- */
  const train = new THREE.Group();
  [[0.5, -0.18, 0.3], [0.05, -0.62, 0.24]].forEach(([x, y, r]) => {
    const w = new THREE.Group();
    w.position.set(x, y, 0.01);
    w.add(ring(r, C.brass, 0.5));
    w.add(ring(r * 0.2, C.brass, 0.4));
    const spokes = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      spokes.push(V(0, 0, 0), V(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, 0));
    }
    w.add(segs(spokes, C.brass, 0.3));
    w.add(jewel(0.042));
    train.add(w);
  });
  sp.add(train);

  /* ---- escapement and balance ---- */
  const esc = escapeWheel(0.34, 15);
  esc.position.set(0.62, 0.42, 0.03);
  esc.add(jewel(0.04));
  parts.esc = esc;
  sp.add(esc);

  const fork = palletFork(0.62);
  fork.position.set(0.28, 0.18, 0.04);
  fork.rotation.z = 0.5;
  parts.fork = fork;
  sp.add(fork);

  const bal = new THREE.Group();
  bal.position.set(-0.24, -0.3, 0.06);
  const wheel = balanceWheel(0.62);
  bal.add(wheel);
  const hs = hairspring(0.08, 0.34, 3.6, C.steel, 0.4);
  hs.position.z = 0.03;
  bal.add(hs);
  bal.add(jewel(0.05));
  parts.balance = wheel; parts.hair = hs;
  sp.add(bal);

  /* ---- the balance bridge, over everything ---- */
  // Drawn last and lit brightest along its edge: a bridge is the one part
  // of a movement you see first, and it is what makes the rest read as
  // being underneath something.
  const bridge = new THREE.Group();
  const shape = [
    V(-0.92, -0.05, 0), V(-0.62, 0.3, 0), V(-0.1, 0.42, 0), V(0.34, 0.26, 0),
    V(0.5, -0.12, 0), V(0.2, -0.5, 0), V(-0.36, -0.62, 0), V(-0.82, -0.44, 0),
  ];
  bridge.add(poly(shape, C.steel, 0.75, true));
  const inner = shape.map((p) => p.clone().multiplyScalar(0.9));
  bridge.add(poly(inner, C.steel, 0.25, true));
  const stripe = cotes(1.5, 0.9, 0.11, C.steel, 0.12);
  bridge.add(stripe);
  bridge.position.set(-0.24, -0.3, 0.12);
  bridge.add(jewel(0.06));
  sp.add(bridge);

  /* ---- motion ---- */
  let lastSecond = -1;
  let jump = 0;
  group.userData.tick = (t, dt, p, env) => {
    const ms = now();
    const sec = Math.floor(ms / 1000) % 60;
    const frac = (ms % 1000) / 1000;

    // The marker sits on the second it is, and is given a short overshoot
    // when it arrives — a jumping seconds marker that slides looks broken.
    if (sec !== lastSecond) { lastSecond = sec; jump = 1; }
    jump = Math.max(0, jump - dt * 6);
    const a = TAU * 0.25 - (sec / 60) * TAU - (env.reduced ? 0 : jump * 0.012);
    const r = p.trackR;
    p.marker.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.02);
    p.markerGlow.position.copy(p.marker.position);
    p.markerGlow.material.opacity = 0.18 + (env.reduced ? 0.1 : jump * 0.5);

    if (env.reduced) return;

    // Two beats a second, and the escape wheel steps one tooth per beat.
    const beat = frac * 2 % 1;
    const swing = Math.sin(frac * TAU * 2) * 1.15;
    p.balance.rotation.z = swing;
    p.hair.rotation.z = swing * 0.9;
    p.hair.scale.setScalar(1 + Math.cos(frac * TAU * 2) * 0.03);
    p.fork.rotation.z = 0.5 + Math.sign(Math.cos(frac * TAU * 2)) * 0.16;
    const step = Math.floor(frac * 2) / 2;
    const ease = Math.min(1, beat * 3);
    p.esc.rotation.z = -(step + ease * 0.5) * (TAU / 15);

    // The mainspring unwinds a little each minute and is wound back at the
    // top of it, which is the only slow thing on the page.
    p.spring.rotation.z = (ms / 60000) % 1 * -0.6;
    p.barrel.rotation.z = (ms / 60000) % 1 * -0.4;

    if (p.alert) {
      const rate = p.alert === 'err' ? 1.1 : 2.2;
      p.barrelPulse.at((t % rate) / rate);
    } else {
      p.barrelPulse.at(1);
    }
  };

  return {
    group,
    /** The alert level riding the barrel: null, 'warn' or 'err'. */
    setAlert(level) {
      parts.alert = level || null;
      const c = level === 'err' ? C.bad : level === 'warn' ? C.warn : C.brass;
      parts.spring.material.color.setHex(c);
      parts.spring.material.opacity = level ? 0.8 : 0.45;
      parts.barrelPulse.mesh.material.color.setHex(c);
    },
  };
}
