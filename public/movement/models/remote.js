/* ============================================================
   movement/models/remote — the Remote module as a complication.

   Remote is a screen you reach across the network, so the object is
   two screens and the distance between them: the monitor is the
   machine being reached, the laptop is what he is sitting at, and the
   curved path between them carries the H.264 stream, one bead per
   frame, fading as it lands. The chassis is body-weight steel and
   nothing more — the eye goes to the cyan. A dark monitor with no
   beads is a session that is not running, and that has to be legible
   without reading a label.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, mk,
  poly, segs, edges, ring, node, disc, occluder, jewel, pulseRing,
} from '../kit.js';

const BEADS = 3;
const MW = 1.34; const MH = 0.84; const MD = 0.08;
const LW = 0.92; const LD = 0.62;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rect = (w, h, c, o) => poly(
  [V(-w / 2, -h / 2), V(w / 2, -h / 2), V(w / 2, h / 2), V(-w / 2, h / 2)], c, o, true,
);

/* An additive plane is not in the kit, but a disc with a hair-thin hole
   scaled on two axes is the same thing and keeps the vocabulary intact. */
function glowPlane(w, h, o) {
  const d = disc(0.002, 0.5, C.beat, o);
  d.scale.set(w / 1.004, h / 1.004, 1);
  d.userData.target = o;
  return d;
}

export function build(opts = {}) {
  const [group, sp] = mk(0, -0.16);
  group.userData.spin = [0, 0.10, 0];
  group.userData.hitR = 1.9;
  const P = group.userData.parts;

  /* The desk the pair sits on, as context only. */
  const plate = ring(1.66, C.rhodium, 0.18, 'y');
  plate.scale.z = 0.4; plate.position.y = -0.92;
  sp.add(plate);

  /* ---- the monitor: the machine being reached ---- */
  const mon = new THREE.Group();
  mon.position.set(-0.60, 0.10, -0.24);
  mon.rotation.y = 0.40; // yawed toward the laptop, which is what makes it read three-quarter
  sp.add(mon);
  mon.add(edges(new THREE.BoxGeometry(MW, MH, MD), C.steel, 0.7));
  mon.add(occluder(new THREE.BoxGeometry(MW * 0.985, MH * 0.985, MD * 0.86)));

  const bezel = rect(MW - 0.05, MH - 0.05, STATUS_HEX.ok, 0.9);
  bezel.position.z = MD / 2 + 0.001;
  mon.add(bezel);

  /* Everything on the panel lives in one group a clear step in front of
     both the bezel line and the occluder's front face, so no two of them
     are ever coplanar and the panel never flickers as the object turns. */
  const SW = MW - 0.15; const SH = MH - 0.15;
  const scr = new THREE.Group();
  scr.position.z = MD / 2 + 0.010;
  mon.add(scr);
  const halo = glowPlane(SW * 1.35, SH * 1.45, 0.11); halo.position.z = -0.004;
  const panel = glowPlane(SW, SH, 0.30); panel.position.z = -0.002;
  const screen = rect(SW, SH, C.beat, 0.9);
  scr.add(halo, panel, screen);

  /* Scanlines: the one cue that says video rather than a lit rectangle.
     Six lines at one spacing, drifting by exactly one spacing, so the
     roll is periodic and never leaves the panel. */
  const step = SH / 6;
  const scanPts = [];
  for (let i = 0; i < 6; i += 1) scanPts.push(V(-SW / 2, -SH / 2 + i * step, 0), V(SW / 2, -SH / 2 + i * step, 0));
  const scan = segs(scanPts, C.beat, 0.22);
  scan.position.z = 0.002;
  scr.add(scan);

  /* Somebody's pointer, because what is being remoted is a desktop. */
  const pointer = poly([
    V(0, 0), V(0, -0.115), V(0.030, -0.078), V(0.053, -0.118),
    V(0.072, -0.107), V(0.050, -0.068), V(0.086, -0.058),
  ], C.hot, 0.95, true);
  pointer.position.set(-0.1, 0.12, 0.004);
  scr.add(pointer);

  const foot = ring(0.30, C.steel, 0.6, 'y');
  foot.scale.z = 0.4; foot.position.y = -MH / 2 - 0.31;
  const pivot = jewel(0.05); // every complication has a bearing, and this is where the panel turns
  pivot.position.y = -MH / 2 - 0.30;
  mon.add(segs([
    V(-0.09, -MH / 2, 0), V(-0.09, -MH / 2 - 0.30, 0),
    V(0.09, -MH / 2, 0), V(0.09, -MH / 2 - 0.30, 0),
  ], C.steel, 0.6), foot, pivot);

  /* ---- the laptop: what he is sitting at, nearer the viewer ---- */
  const lap = new THREE.Group();
  lap.position.set(0.80, -0.56, 0.44);
  lap.rotation.y = -0.44;
  sp.add(lap);
  lap.add(edges(new THREE.BoxGeometry(LW, 0.05, LD), C.steel, 0.7));
  lap.add(occluder(new THREE.BoxGeometry(LW * 0.99, 0.048, LD * 0.99)));

  const keys = [];
  for (let r = 0; r < 4; r += 1) keys.push(V(-0.33, 0.026, -0.20 + r * 0.085), V(0.33, 0.026, -0.20 + r * 0.085));
  lap.add(segs(keys, C.rhodium, 0.35));
  lap.add(poly([
    V(-0.12, 0.026, 0.14), V(0.12, 0.026, 0.14), V(0.12, 0.026, 0.25), V(-0.12, 0.026, 0.25),
  ], C.rhodium, 0.35, true));

  /* One hinge group holds the lid, so base and screen are a single
     hinged object rather than two slabs that happen to touch. */
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.025, -LD / 2);
  hinge.rotation.x = -0.30;
  lap.add(hinge);
  const lid = edges(new THREE.BoxGeometry(LW, 0.58, 0.025), C.steel, 0.7);
  lid.position.y = 0.29;
  const lidBack = occluder(new THREE.BoxGeometry(LW * 0.98, 0.575, 0.02));
  lidBack.position.y = 0.29;
  hinge.add(lid, lidBack);
  const lidScr = new THREE.Group();
  lidScr.position.set(0, 0.29, 0.016);
  hinge.add(lidScr);
  const lidGlow = glowPlane(LW - 0.12, 0.46, 0.22); lidGlow.position.z = -0.002;
  const lidScreen = rect(LW - 0.12, 0.46, C.beat, 0.75);
  lidScr.add(lidGlow, lidScreen);

  /* ---- the link: the stream itself ---- */
  sp.updateMatrixWorld(true);
  const inSp = (obj, v) => sp.worldToLocal(obj.localToWorld(v.clone()));
  const a = inSp(mon, V(MW * 0.46, -0.10, MD / 2));
  const b = inSp(lidScr, V(-LW * 0.34, 0.12, 0.02));
  /* The control point is lifted and pulled toward the camera so the path
     bows through the space in front of both screens; a straight line
     between two boxes reads as a cable, not as a route over a network. */
  const ctrl = a.clone().add(b).multiplyScalar(0.5).add(V(0, 0.46, 0.52));
  const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
  const path = poly(curve.getPoints(56), C.beat, 0.34);
  sp.add(path);

  const beads = [];
  for (let i = 0; i < BEADS; i += 1) { const bd = node(0.036, C.hot, 1); beads.push(bd); sp.add(bd); }
  /* A frame landing is a beat, so it gets the kit's beat idiom. */
  const pulse = pulseRing(0.05, 0.30, C.beat, 0.02);
  pulse.mesh.position.copy(b);
  sp.add(pulse.mesh);

  /* The fleet, one mark per machine, lit when it is reachable. */
  const marks = [];
  for (let i = 0; i < 6; i += 1) {
    const m = node(0.026, C.rhodium, 0.35);
    m.position.set(-0.40 + i * 0.16, -1.00, 0.30);
    m.visible = false; marks.push(m); sp.add(m);
  }

  Object.assign(P, {
    bezel, screen, panel, halo, scan, pointer, path, beads, pulse, curve,
    lidScreen, lidGlow, marks, glows: [halo, panel, lidGlow],
    streaming: false, speed: 0, u: 0, step,
    ptr: { from: pointer.position.clone(), to: pointer.position.clone(), t0: 0, next: 0 },
  });

  group.userData.tick = (t, dt, p, env) => {
    /* Glow eases to its target: a session opening or dropping should read
       as a screen waking or going dark, not as a cut. */
    const k = Math.min(1, dt * 4);
    for (const g of p.glows) g.material.opacity += (g.userData.target - g.material.opacity) * k;

    if (!env.reduced) {
      p.u = (p.u + dt * p.speed) % 1;
      p.scan.position.y = (t * 0.09) % p.step;
    }
    for (let i = 0; i < p.beads.length; i += 1) {
      const bd = p.beads[i];
      const u = (p.u + i / BEADS) % 1;
      p.curve.getPointAt(u, bd.position);
      // In and out: a frame brightens off the wire and dies as it arrives.
      bd.material.opacity = Math.min(1, u / 0.10) * (1 - clamp((u - 0.70) / 0.30, 0, 1));
      bd.visible = p.streaming;
    }
    p.pulse.at(p.streaming ? (p.u * BEADS) % 1 : 1);

    if (p.streaming && !env.reduced && t > p.ptr.next) {
      p.ptr.from.copy(p.ptr.to);
      p.ptr.to.set(
        clamp(p.ptr.to.x + (Math.random() - 0.5) * 0.52, -SW / 2 + 0.04, SW / 2 - 0.12),
        clamp(p.ptr.to.y + (Math.random() - 0.5) * 0.40, -SH / 2 + 0.14, SH / 2 - 0.04),
        0.004,
      );
      p.ptr.t0 = t;
      p.ptr.next = t + 0.5 + Math.random() * 0.9;
    }
    // A cursor does not glide: it goes in short quick steps and then waits.
    const s = Math.min(1, (t - p.ptr.t0) / 0.16);
    p.pointer.position.lerpVectors(p.ptr.from, p.ptr.to, s * s * (3 - 2 * s));
  };

  function setState(st) {
    const s = st || {};
    const status = STATUS_HEX[s.status] ? s.status : 'off';
    const live = status !== 'off';
    const streaming = !!s.streaming && live;
    P.streaming = streaming;

    P.bezel.material.color.setHex(STATUS_HEX[status]);
    P.bezel.material.opacity = live ? 0.9 : 0.45;

    /* Latency divides rather than subtracts, so 20ms looks instant and
       300ms visibly crawls without ever reversing or stopping dead. */
    const raw = s.latencyMs;
    const lat = (raw == null || !Number.isFinite(Number(raw))) ? 60 : Math.max(0, Number(raw));
    P.speed = streaming ? 0.55 / (1 + lat / 90) : 0;

    P.screen.material.opacity = streaming ? 0.92 : 0.20;
    P.panel.userData.target = streaming ? 0.30 : 0.015;
    P.halo.userData.target = streaming ? 0.11 : 0;
    P.lidScreen.material.opacity = streaming ? 0.75 : 0.22;
    P.lidGlow.userData.target = streaming ? 0.22 : 0.015;
    P.scan.visible = streaming;
    P.pointer.visible = streaming;
    P.path.material.opacity = streaming ? 0.34 : 0.12;

    const devs = clamp(Math.round(Number(s.devices) || 0), 0, P.marks.length);
    const up = clamp(Math.round(Number(s.online) || 0), 0, devs);
    P.marks.forEach((m, i) => {
      m.visible = i < devs;
      m.material.color.setHex(i < up ? C.ok : C.rhodium);
      m.material.opacity = i < up ? 0.95 : 0.3; // a machine that is off is present but not lit
    });
  }

  setState(opts.state || { status: 'ok', streaming: true, devices: 3, online: 2, latencyMs: 40 });
  return { group, setState };
}
