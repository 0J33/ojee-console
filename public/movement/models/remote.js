/* ============================================================
   movement/models/remote — the screen you are looking through.

   The old object was a monitor and a laptop on a desk with a wire
   between them. Two boxes of roughly equal weight and neither of them
   the subject: at three-quarters the monitor went edge-on and became a
   sliver on a stick, and the laptop — the machine you are already
   sitting at, the least interesting thing in the story — was the
   biggest thing in the frame.

   So: one screen, facing you, with the remote desktop on it — a window
   open, scanlines rolling, somebody's pointer moving in short steps. Lit
   while a session is streaming; the bezel and the lamp on the back carry
   the module's status. (The machines you can reach used to hang over it
   on an arc with a line to the one you were in; the user asked for the
   screen alone.)

   A dark panel with no window on it is a session that is not running,
   and that has to be legible without reading a label.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, mk,
  poly, segs, edges, ring, node, occluder, jewel,
} from '../kit.js';

/* The screen alone fills the object now, so it is drawn larger than when it
   shared the frame with the machines over it. */
const MW = 2.3; const MH = 1.44; const MD = 0.09;     // the screen
const MY = 0.14;                                      // its centre
const SW = MW - 0.16; const SH = MH - 0.16;          // its panel
const Y0 = -1.0;                                      // the desk

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rect = (w, h, c, o) => poly(
  [V(-w / 2, -h / 2), V(w / 2, -h / 2), V(w / 2, h / 2), V(-w / 2, h / 2)], c, o, true,
);

/* A lit rectangle.

   This was a disc with a hair-thin hole, scaled on two axes — which is an
   OVAL. An oval of light behind a rectangular screen does not read as a
   panel that is on; it reads as a smudge on the lens, and the corners of
   every screen on the object stayed dark while the glow spilled out past
   the sides. A screen is a rectangle. Its spill is a rectangle with soft
   edges, which is one blurred rectangle in a texture, shared by all of
   them. */
let softTex = null;
function soft() {
  if (softTex) return softTex;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  /* Blurred just enough to have an edge that falls off, not so much that
     the corners round away and it is an oval again. */
  g.filter = 'blur(7px)';
  g.fillStyle = '#fff';
  g.fillRect(n * 0.13, n * 0.13, n * 0.74, n * 0.74);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

function glowRect(w, h, o, feather = false) {
  const mat = new THREE.MeshBasicMaterial({
    color: C.beat, transparent: true, opacity: o, depthWrite: false,
  });
  if (feather) mat.map = soft();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.target = o;
  return m;
}

export function build(opts = {}) {
  const [group, sp] = mk(0, -0.14);
  /* A lean, not a revolution: the front of this is the side worth
     looking at, and turning it all the way round spent half the time
     showing its back. */
  group.userData.sway = [0.055, 0.30, 0.022];
  group.userData.swayPeriod = 11.0;
  group.userData.swayPhase = 4.4;
  group.userData.hitR = 2.0;
  const P = group.userData.parts;

  /* The desk, as context only. */
  const plate = ring(1.34, C.rhodium, 0.16, 'y');
  plate.position.y = Y0;
  sp.add(plate);

  /* ---- the screen ----
     Yawed a little, not a lot. Enough that it is an object in a space and
     not a poster; not so much that the thing it is showing is lost. */
  const mon = new THREE.Group();
  mon.position.set(0, MY, 0);
  mon.rotation.y = 0.2;
  sp.add(mon);
  mon.add(edges(new THREE.BoxGeometry(MW, MH, MD), C.steel, 0.7));
  mon.add(occluder(new THREE.BoxGeometry(MW * 0.99, MH * 0.99, MD * 0.9)));

  const bezel = rect(MW - 0.05, MH - 0.05, STATUS_HEX.ok, 0.9);
  bezel.position.z = MD / 2 + 0.001;
  mon.add(bezel);

  /* Everything on the panel lives in one group a clear step in front of
     both the bezel line and the occluder's front face, so no two of them
     are ever coplanar and the panel never flickers as the object turns. */
  const scr = new THREE.Group();
  scr.position.z = MD / 2 + 0.010;
  mon.add(scr);
  /* The glow is set for the AREA it has to fill. The same opacity that lit
     a small panel reads as a grey rectangle once the panel is half the
     object — a lit screen is the whole point of this thing. */
  const halo = glowRect(SW * 1.22, SH * 1.34, 0.14, true); halo.position.z = -0.004;
  /* A lit screen, not a lamp. Past about a fifth the cyan swamps the
     window drawn on top of it and the panel goes to a solid block — which
     is the one thing the window is there to stop it being. */
  const panel = glowRect(SW, SH, 0.2); panel.position.z = -0.002;
  const screen = rect(SW, SH, C.beat, 0.9);
  scr.add(halo, panel, screen);

  /* Scanlines: the one cue that says video rather than a lit rectangle.
     Six lines at one spacing, drifting by exactly one spacing, so the
     roll is periodic and never leaves the panel. */
  const step = SH / 6;
  const scanPts = [];
  for (let i = 0; i < 6; i += 1) scanPts.push(V(-SW / 2, -SH / 2 + i * step, 0), V(SW / 2, -SH / 2 + i * step, 0));
  const scan = segs(scanPts, C.beat, 0.3);
  scan.position.z = 0.002;
  scr.add(scan);

  /* What is actually on it: somebody else's desktop, with a window open on
     it. A lit rectangle is a lit rectangle; a window with a title bar and
     three buttons in the corner is a machine you are driving. */
  const win = new THREE.Group();
  win.position.set(-0.04, -0.02, 0.003);
  scr.add(win);
  const ww = SW * 0.74; const wh = SH * 0.64;
  win.add(rect(ww, wh, C.hot, 0.8));
  win.add(segs([V(-ww / 2, wh / 2 - 0.07), V(ww / 2, wh / 2 - 0.07)], C.hot, 0.6));
  for (let i = 0; i < 3; i += 1) {
    const b = node(0.014, C.hot, 0.8);
    b.position.set(ww / 2 - 0.05 - i * 0.045, wh / 2 - 0.035, 0.001);
    win.add(b);
  }
  // A couple of lines of something. Not text — the suggestion of it.
  const body = [];
  for (let i = 0; i < 4; i += 1) {
    const y = wh / 2 - 0.16 - i * 0.075;
    body.push(V(-ww / 2 + 0.06, y), V(-ww / 2 + 0.06 + ww * (0.7 - i * 0.13), y));
  }
  win.add(segs(body, C.beat, 0.4));

  /* ---- the back of it ----
     This object turns all the way round, so for half of every revolution
     the screen is facing away and what you get is the back of a monitor.
     Left plain that is a dark slab with a glow leaking round it, which is
     the emptiest the whole console ever looks. So the back is a back: a
     vent grille, a mount plate with its four screws, the ports along the
     bottom, and the status lamp — the same lamp as the bezel, because the
     one thing you still need to know from behind is whether it is up. */
  const bz = -MD / 2 - 0.003;
  const vent = [];
  for (let i = 0; i < 7; i += 1) {
    const y = 0.1 + i * 0.05;
    vent.push(V(-MW * 0.34, y, bz), V(MW * 0.34, y, bz));
  }
  mon.add(segs(vent, C.rhodium, 0.3));
  const mount = rect(0.36, 0.36, C.steel, 0.4);
  mount.position.set(0, -0.04, bz);
  mon.add(mount);
  const screws = [];
  for (const sx of [-0.13, 0.13]) for (const sy of [-0.17, 0.09]) screws.push(V(sx, sy, bz));
  mon.add(segs(screws.flatMap((v) => [v, v.clone().add(V(0.02, 0, 0))]), C.rhodium, 0.5));
  const ports = [];
  for (let i = 0; i < 5; i += 1) {
    const x = -0.34 + i * 0.17;
    ports.push(
      V(x, -MH / 2 + 0.1, bz), V(x + 0.1, -MH / 2 + 0.1, bz),
      V(x, -MH / 2 + 0.15, bz), V(x + 0.1, -MH / 2 + 0.15, bz),
      V(x, -MH / 2 + 0.1, bz), V(x, -MH / 2 + 0.15, bz),
      V(x + 0.1, -MH / 2 + 0.1, bz), V(x + 0.1, -MH / 2 + 0.15, bz),
    );
  }
  mon.add(segs(ports, C.rhodium, 0.35));
  const lamp = node(0.032, STATUS_HEX.ok, 0.9);
  lamp.position.set(MW / 2 - 0.14, -MH / 2 + 0.12, bz);
  mon.add(lamp);

  /* Somebody's pointer, because what is being remoted is a desktop. */
  const pointer = poly([
    V(0, 0), V(0, -0.115), V(0.030, -0.078), V(0.053, -0.118),
    V(0.072, -0.107), V(0.050, -0.068), V(0.086, -0.058),
  ], C.hot, 0.95, true);
  pointer.position.set(-0.1, 0.12, 0.006);
  scr.add(pointer);

  /* The stand. A screen this size does not float. */
  const foot = ring(0.5, C.steel, 0.55, 'y');
  foot.position.y = Y0 + 0.02;
  sp.add(foot);
  const foot2 = ring(0.28, C.rhodium, 0.3, 'y');
  foot2.position.y = Y0 + 0.02;
  sp.add(foot2);
  const neckTop = MY - MH / 2;
  sp.add(segs([
    V(-0.08, neckTop, 0), V(-0.08, Y0 + 0.03, 0),
    V(0.08, neckTop, 0), V(0.08, Y0 + 0.03, 0),
    V(-0.08, Y0 + 0.03, 0), V(0.08, Y0 + 0.03, 0),
  ], C.steel, 0.55));
  // Every complication has a bearing, and this is where the panel turns.
  const pivot = jewel(0.05);
  pivot.position.set(0, neckTop + 0.02, 0.02);
  sp.add(pivot);

  Object.assign(P, {
    bezel, lamp, screen, panel, halo, scan, pointer, win, glows: [halo, panel],
    streaming: false, step,
    ptr: { from: pointer.position.clone(), to: pointer.position.clone(), t0: 0, next: 0 },
  });

  group.userData.tick = (t, dt, p, env) => {
    /* Glow eases to its target: a session opening or dropping should read
       as a screen waking or going dark, not as a cut. */
    const k = Math.min(1, dt * 4);
    for (const g of p.glows) g.material.opacity += (g.userData.target - g.material.opacity) * k;

    if (!env.reduced) p.scan.position.y = (t * 0.09) % p.step;

    if (p.streaming && !env.reduced && t > p.ptr.next) {
      p.ptr.from.copy(p.ptr.to);
      p.ptr.to.set(
        clamp(p.ptr.to.x + (Math.random() - 0.5) * 0.52, -SW / 2 + 0.04, SW / 2 - 0.12),
        clamp(p.ptr.to.y + (Math.random() - 0.5) * 0.4, -SH / 2 + 0.14, SH / 2 - 0.04),
        0.006,
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
    P.lamp.material.color.setHex(STATUS_HEX[status]);
    P.lamp.material.opacity = live ? 0.9 : 0.3;

    P.screen.material.opacity = streaming ? 0.92 : 0.2;
    P.panel.userData.target = streaming ? 0.2 : 0.015;
    P.halo.userData.target = streaming ? 0.14 : 0;
    P.scan.visible = streaming;
    P.pointer.visible = streaming;
    P.win.visible = streaming;
  }

  setState(opts.state || { status: 'ok', streaming: true });
  return { group, setState };
}
