/* ============================================================
   movement/models/agent — the board that thinks.

   The Agent module is background workflows, an assistant and a
   service stack: work arrives, waits, runs, and finishes. The watch
   analogue for that is not a wheel — a wheel turns at a fixed rate
   and says nothing about load. It is a printed-circuit board, seen
   at the raking angle you hold one at to read its routing.

   What carries the meaning:

   * **The traces are the subject.** They are routed the way copper
     actually is — horizontal leg, via, vertical leg, never a
     diagonal — because a diagonal turns a board into a texture. They
     sit dim until a bead is on them, so the eye follows work, not
     wiring.
   * **A bead is a job.** It enters from the board edge, runs the
     trace, and when it reaches the package the die flashes and
     fades. Traffic is the running count; beads queued outside the
     board edge are the backlog waiting for a trace.
   * **Failure is on the copper, not on a badge.** A failed job dyes
     one trace and its vias red while the package outline carries the
     module's status colour.
   ============================================================ */

import {
  C, THREE, STATUS_HEX, V, poly, segs, edges, dots, node, disc, occluder, ring, mk, pulseRing,
} from '../kit.js';

const W = 2.9;           // board width
const H = 2.05;          // board height
const CW = 0.8;          // package body
const CH = 0.74;
const CT = 0.17;         // package height off the board
const PITCH = 0.09;      // lead pitch, and therefore the grid traces land on
const ZT = 0.012;        // copper sits just above the substrate

/* Each trace is a list of waypoints where every leg is either
   horizontal or vertical. The interior waypoints are the corners, and
   a corner is where a real board changes layer, so those are the vias.
   The last point of each is a lead tip at x = ±0.5, and every terminal
   y is a multiple of the lead pitch so the copper meets the lead. */
const TRACES = [
  [[-1.38, 0.63], [-0.68, 0.63], [-0.68, 0.27], [-0.50, 0.27]],
  [[-1.38, 0.40], [-0.86, 0.40], [-0.86, 0.18], [-0.50, 0.18]],
  [[-1.38, -0.58], [-0.68, -0.58], [-0.68, -0.18], [-0.50, -0.18]],
  [[-1.38, -0.92], [0.96, -0.92], [0.96, -0.09], [0.50, -0.09]],
];
const FAIL_TRACE = 2;    // the one that goes red — always the same one, so a
                         // failure reads as a place on the board, not a shuffle

const rect = (w, h, x = 0, y = 0, z = 0) => [
  V(x - w / 2, y - h / 2, z), V(x + w / 2, y - h / 2, z),
  V(x + w / 2, y + h / 2, z), V(x - w / 2, y + h / 2, z),
];

/** A two-pad component: body outline and the pads it is soldered by. */
function component(x, y, w, h) {
  const g = new THREE.Group();
  g.add(poly(rect(w, h, x, y, ZT + 0.004), C.steel, 0.65, true));
  for (const s of [-1, 1]) {
    g.add(poly(rect(0.07, h * 0.78, x + s * (w / 2 + 0.035), y, ZT + 0.002), C.steel, 0.45, true));
  }
  return g;
}

export function build(opts = {}) {
  const [group, sp] = mk(0.16, -0.98);   // rolled a little, then raked hard over
  group.userData.spin = [0, 0.10, 0];
  group.userData.hitR = 1.75;
  const parts = group.userData.parts;

  /* ---- the substrate ---- */
  sp.add(poly(rect(W, H), C.steel, 0.7, true));
  sp.add(poly(rect(W - 0.13, H - 0.13, 0, 0, 0.001), C.rhodium, 0.22, true));
  // The board is opaque: without this the copper on the far face shows
  // through as the object turns and the routing stops being readable.
  const sub = occluder(new THREE.PlaneGeometry(W, H));
  sub.position.z = -0.004;
  sp.add(sub);

  for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const p = [sx * (W / 2 - 0.15), sy * (H / 2 - 0.15), 0.002];
    const pad = ring(0.082, C.rhodium, 0.45); pad.position.set(...p);
    const hole = ring(0.036, C.steel, 0.55); hole.position.set(...p);
    sp.add(pad, hole);
  }

  /* ---- context copper: stubs on the unused half, so the two hero
     traces read as part of a routed board rather than as the only
     two wires on it ---- */
  sp.add(segs([
    V(0.5, 0.27, ZT), V(1.16, 0.27, ZT), V(1.16, 0.27, ZT), V(1.16, 0.74, ZT),
    V(0.5, 0.09, ZT), V(0.88, 0.09, ZT), V(0.88, 0.09, ZT), V(0.88, 0.66, ZT),
    V(0.5, -0.27, ZT), V(1.3, -0.27, ZT), V(1.3, -0.27, ZT), V(1.3, -0.7, ZT),
  ], C.brass, 0.18));

  /* ---- the package ---- */
  const box = new THREE.BoxGeometry(CW, CH, CT);
  const shell = occluder(box);
  shell.position.z = CT / 2 + 0.006;
  const outline = edges(box, C.rhodium, 0.7);
  outline.position.copy(shell.position);
  sp.add(shell, outline);

  const leads = [];
  for (let i = -3; i <= 3; i += 1) {
    const y = i * PITCH;
    leads.push(V(-CW / 2, y, ZT), V(-CW / 2 - 0.1, y, ZT), V(CW / 2, y, ZT), V(CW / 2 + 0.1, y, ZT));
  }
  sp.add(segs(leads, C.steel, 0.6));

  const die = poly(rect(0.34, 0.3, 0, 0, 0), C.beat, 0.28, true);
  die.position.z = CT + 0.01;
  const glow = disc(0.02, 0.17, C.beat, 0);
  glow.position.z = die.position.z;
  const pulse = pulseRing(0.52, 1.25, C.beat, 0.022);
  pulse.mesh.position.z = die.position.z;
  sp.add(die, glow, pulse.mesh);

  sp.add(component(-1.02, 0.63, 0.34, 0.17));
  sp.add(component(-1.02, -0.58, 0.3, 0.22));

  /* ---- the traces ---- */
  const traces = TRACES.map((wp) => {
    const pts = wp.map(([x, y]) => V(x, y, ZT));
    const line = poly(pts, C.brass, 0.35);
    const via = dots(pts.slice(1, -1).map((p) => V(p.x, p.y, ZT + 0.002)), C.brass, 0.055, 0.75);
    sp.add(line, via);
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const d = pts[i].distanceTo(pts[i - 1]);
      seg.push(d); total += d;
    }
    return { line, via, pts, seg, total, hot: 0, fail: false };
  });

  /** A point at a distance along a trace, so a bead is placed by how far
      it has travelled rather than by which leg it happens to be on. */
  const at = (tr, d) => {
    let r = Math.max(0, Math.min(tr.total, d));
    for (let i = 0; i < tr.seg.length; i += 1) {
      if (r <= tr.seg[i] || i === tr.seg.length - 1) {
        return tr.pts[i].clone().lerp(tr.pts[i + 1], tr.seg[i] ? r / tr.seg[i] : 1);
      }
      r -= tr.seg[i];
    }
    return tr.pts[0].clone();
  };

  const beads = [];
  for (let i = 0; i < 9; i += 1) {
    const m = node(0.036, C.hot, 1);
    m.visible = false;
    sp.add(m);
    beads.push({ m, t: -1, d: 0 });
  }

  // The backlog waits outside the board, in the lane of the trace it is
  // destined for: a queue that is visibly *for* something.
  const queue = [];
  for (let i = 0; i < 12; i += 1) {
    const lane = TRACES[i % TRACES.length][0];
    const m = node(0.03, C.brass, 0.55);
    m.position.set(lane[0] - 0.11 - Math.floor(i / TRACES.length) * 0.1, lane[1], ZT);
    m.visible = false;
    sp.add(m);
    queue.push(m);
  }

  parts.traces = traces; parts.beads = beads; parts.queue = queue;
  parts.die = die; parts.glow = glow; parts.pulse = pulse; parts.chip = outline;

  /* ---- state ---- */
  const st = { status: 'off', running: 0, queued: 0, failed: 0, idle: true };
  parts.state = st;
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

  function setState(s) {
    const o = s || {};
    st.status = STATUS_HEX[o.status] ? o.status : 'off';
    st.running = num(o.running);
    st.queued = Math.round(num(o.queued));
    st.failed = num(o.failed);
    st.idle = o.idle == null ? st.running === 0 : !!o.idle;

    outline.material.color.setHex(STATUS_HEX[st.status]);
    outline.material.opacity = st.status === 'off' ? 0.5 : 0.75;
    traces.forEach((tr, i) => {
      tr.fail = st.failed > 0 && i === FAIL_TRACE;
      const c = tr.fail ? C.bad : C.brass;
      tr.line.material.color.setHex(c);
      tr.via.material.color.setHex(c);
    });
    for (let i = 0; i < queue.length; i += 1) queue[i].visible = i < st.queued;
  }
  setState(null);

  /* ---- motion ---- */
  let spawn = 0; let flash = 0; let pulseT = 2;
  group.userData.tick = (t, dt, p, env) => {
    if (env && env.reduced) {
      // Reduced motion gets no traffic and no flashing die. One trace held
      // lit says the same thing without anything moving.
      for (const b of p.beads) { b.t = -1; b.m.visible = false; }
      p.traces.forEach((tr, i) => { tr.line.material.opacity = i === 0 ? 0.85 : 0.35; });
      p.die.material.opacity = 0.6;
      p.glow.material.opacity = 0.1;
      p.pulse.at(1);
      return;
    }

    // Traffic follows the running count and stops dead when idle: an idle
    // module must look idle, not slow.
    const rate = st.idle ? 0 : Math.min(3.4, 0.3 + st.running * 0.55);
    spawn += dt * rate;
    while (spawn >= 1) {
      spawn -= 1;
      const free = p.beads.find((b) => b.t < 0);
      if (free) { free.t = Math.floor(Math.random() * p.traces.length); free.d = 0; free.m.visible = true; }
    }

    for (const tr of p.traces) tr.hot = Math.max(0, tr.hot - dt * 2.4);
    for (const b of p.beads) {
      if (b.t < 0) continue;
      const tr = p.traces[b.t];
      b.d += dt * 1.15;
      tr.hot = 1;
      if (b.d >= tr.total) {
        b.t = -1; b.m.visible = false;
        flash = tr.fail ? Math.max(flash, 0.4) : 1;   // the job lands and the die fires
        if (!tr.fail) pulseT = 0;
      } else {
        b.m.position.copy(at(tr, b.d));
        b.m.material.color.setHex(tr.fail ? C.bad : C.hot);
      }
    }
    for (const tr of p.traces) tr.line.material.opacity = 0.35 + 0.5 * tr.hot;

    flash = Math.max(0, flash - dt * 1.9);
    p.die.material.color.setHex(flash > 0.03 ? C.hot : C.beat);
    p.die.material.opacity = 0.28 + 0.7 * flash;
    p.glow.material.opacity = 0.45 * flash;
    if (pulseT < 1) { pulseT = Math.min(1, pulseT + dt * 1.7); p.pulse.at(pulseT); } else p.pulse.at(1);
  };

  if (opts.state) setState(opts.state);
  return { group, setState };
}
