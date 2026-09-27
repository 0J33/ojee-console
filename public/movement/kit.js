/* ============================================================
   movement/kit — the line-art engine every object in this console
   is drawn with.

   A watch movement rendered as shaded brass would be a skeuomorph
   and would fight the mono type it sits under. So nothing here is
   shaded: every part is an outline in one of six colours, and the
   only light in the scene is bloom picking up the bright ones. The
   grammar is ojee.net's — unlit LineBasicMaterial, additive glow
   shells, expanding rings for anything that pulses — and the
   lifecycle is the cockpit concept's, which is the half ojee.net
   never wrote: pause when off-screen, clamp the pixel ratio, mean
   it when the machine asks for reduced motion, and dispose on the
   way out.

   Three things this fixes that the site gets wrong:

   * **A dead WebGL context is not a dead page.** three.js arrives
     from a CDN; if it never lands, or the context is refused, the
     host gets `data-fallback` and the page keeps every word and
     number it had. Nothing here is load-bearing for meaning.
   * **Hidden means stopped.** An IntersectionObserver and the page
     visibility API both gate the loop, so a console left open on a
     second monitor costs nothing.
   * **Reduced motion reaches the parts.** Idle rotation stops and
     each object's own tick is told, rather than only slowing the
     outer group while the escapement keeps beating.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export { THREE };

/* The movement's colours. Each means one thing; nothing is coloured
   for decoration. Steel and rhodium are the structure, brass is the
   train that carries force, blued steel is a hand, ruby is a bearing,
   and cyan is reserved for what is alive right now. */
export const C = {
  plate: 0x0b0f12,      // the ground under everything — near the page's own black
  rhodium: 0x46565e,    // bridges, plate edges, perlage: present, never the subject
  steel: 0x7d8b93,      // secondary structure that should read
  brass: 0xffbf3f,      // the going train, anything transmitting force
  blued: 0x4a8fe0,      // hands and screws
  ruby: 0xff4a6e,       // jewels at the pivots
  beat: 0x00ffff,       // the live second, and only that
  hot: 0xdffcff,        // the one hot value in a frame
  ok: 0x5bffa5,
  warn: 0xffb000,
  bad: 0xff2d2d,
};

export const STATUS_HEX = { ok: C.ok, warn: C.warn, err: C.bad, off: C.rhodium };

export const REDUCED = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- drawing ------------------------------------------------------
   Every line in this world has WIDTH.

   A WebGL line is one pixel, always, on every driver — so a model drawn at
   120 pixels and the same model drawn at 300 are not the same picture at two
   sizes. They are the same lines at two DISTANCES APART. Packed close, each
   line's bloom overlaps its neighbours and sums into the glow this whole
   world is made of; spread out, every line glows alone and the object reads
   as a thin technical diagram of itself. That is why an object looked right
   on the plate and wrong the moment a page gave it room, and no amount of
   bloom or opacity could fix it: both make a sparse line brighter, neither
   makes it wider.

   So the lines are instanced quads rather than GL lines, and their width is
   set from how big the object is on the screen. One draw call each, same as
   before; the cost is a handful of vertices per segment. */

/** Every line material in the scene, so resolution and width can be set on
    all of them at once — a screen-space line shader needs to be told how big
    the screen is, and it needs telling again on every resize. */
const LINE_MATS = new Set();
/* The last known drawing-buffer size, kept HERE rather than only pushed out
   on resize. A line shader divides by its resolution, so a material that
   never gets told one divides by zero and draws a quad the size of the sky —
   and models are built long after the canvas is first measured, so pushing
   on resize alone reaches none of them. Every material is born knowing. */
const LINE_RES = new THREE.Vector2(1, 1);

export const lineMat = (c = C.rhodium, o = 1) => {
  const m = new LineMaterial({
    color: c, transparent: true, opacity: o, linewidth: 1, worldUnits: false,
  });
  m.resolution.copy(LINE_RES);
  LINE_MATS.add(m);
  return m;
};

/** Tell every line how big the drawing buffer is, now and in future. */
export function lineResolution(w, h) {
  LINE_RES.set(w, h);
  for (const m of LINE_MATS) m.resolution.copy(LINE_RES);
}

/** Forget a material that is going away, so the set does not grow forever. */
export function forgetLine(m) { LINE_MATS.delete(m); }

const flat = (pts) => {
  const out = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i += 1) {
    out[i * 3] = pts[i].x; out[i * 3 + 1] = pts[i].y; out[i * 3 + 2] = pts[i].z || 0;
  }
  return out;
};

export const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** An open path, or a closed one with `loop`. */
export function poly(pts, c = C.rhodium, o = 0.9, loop = false) {
  const list = loop && pts.length ? [...pts, pts[0]] : pts;
  const geo = new LineGeometry();
  geo.setPositions(flat(list));
  const l = new Line2(geo, lineMat(c, o));
  l.computeLineDistances();
  return l;
}

/** Disconnected segments from a flat list of pairs. */
export function segs(pts, c = C.rhodium, o = 0.6) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(flat(pts));
  return new LineSegments2(geo, lineMat(c, o));
}

/** The same, from an existing geometry's position buffer. */
function fromGeometry(geo, c, o) {
  const pos = geo.attributes.position.array;
  const g = new LineSegmentsGeometry();
  g.setPositions(pos instanceof Float32Array ? pos : Float32Array.from(pos));
  geo.dispose();
  return new LineSegments2(g, lineMat(c, o));
}

export const edges = (geo, c = C.rhodium, o = 0.8, thresh = 1) =>
  fromGeometry(new THREE.EdgesGeometry(geo, thresh), c, o);

export const wire = (geo, c = C.rhodium, o = 0.6) =>
  fromGeometry(new THREE.WireframeGeometry(geo), c, o);

export const dots = (pts, c = C.steel, size = 0.02, o = 0.8) => new THREE.Points(
  new THREE.BufferGeometry().setFromPoints(pts),
  new THREE.PointsMaterial({ color: c, size, sizeAttenuation: true, transparent: true, opacity: o }),
);

/** A bead. Small enough that a sphere reads as a point of light. */
export const node = (r = 0.03, c = C.hot, o = 1) => new THREE.Mesh(
  new THREE.SphereGeometry(r, 10, 10),
  new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o }),
);

/** A circle in any plane, tessellated by hand so it stays a line. */
export function ring(r, c = C.rhodium, o = 0.6, axis = 'z', seg = 72) {
  const pts = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * r; const y = Math.sin(a) * r;
    pts.push(axis === 'z' ? V(x, y, 0) : axis === 'y' ? V(x, 0, y) : V(0, x, y));
  }
  return poly(pts, c, o);
}

/** A filled annulus, for a glow that has to read as light rather than wire. */
export const disc = (r, w, c = C.beat, o = 0.3) => new THREE.Mesh(
  new THREE.RingGeometry(r, r + w, 84),
  new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);

/** An invisible solid in the ground colour, so the far side of a wire
    object does not show through the near side. Opaque, unlit, and the
    same value as the page: it reads as absence, not as a surface. */
export const occluder = (geo) => new THREE.Mesh(
  geo, new THREE.MeshBasicMaterial({ color: C.plate }),
);

/** Three nested groups per object: the viewer's drag, the artistic
    tilt it is seen at, and its own idle rotation. Keeping them apart is
    what lets a drag survive a tilt and an idle spin survive both. */
export function mk(tiltZ = 0, tiltX = 0) {
  const g = new THREE.Group(); const t = new THREE.Group(); const sp = new THREE.Group();
  t.rotation.z = tiltZ; t.rotation.x = tiltX;
  t.add(sp); g.add(t);
  g.rotation.order = 'YXZ';
  /* `spin` turns the object all the way round for ever. `sway`, if an
     object sets it, replaces that with a lean back and forth about the
     pose it was drawn at — three amplitudes in radians and a period in
     seconds. Only the watch turns the whole way now: for everything else
     the interesting face is the front, and a full revolution spends half
     its time showing you the back of something and the other half
     edge-on. */
  g.userData = {
    sp, tilt: t, spin: [0, 0.12, 0], sway: null, swayPeriod: 9, swayPhase: 0,
    rx: 0, ry: 0, av: { x: 0, y: 0 }, hitR: 1.8, parts: {},
    // `fixed`: held facing the viewer, square on, with no tilt and no sway —
    // an object opened up to be USED rather than looked at. Eased in and out
    // through `pose` (1 = drawn pose, 0 = square on) so neither way snaps.
    tiltRest: [tiltX, tiltZ], fixed: false, pose: 1,
    // `free`: let go by its own page (an opened object's Unlock), which the
    // crown does not override. `sg`: how much of its sway it is showing —
    // eased to nothing while the crown holds it, so it settles, not stops.
    free: false, sg: 1,
  };
  return [g, sp];
}

/** An angle brought back into (-PI, PI] — the short way to it. */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ---- the mount ---------------------------------------------------- */

/* Nothing is clamped. An object you cannot turn past eighty degrees is an
   object with a lid on it, and every time you reach that lid you are told the
   thing is a picture rather than a thing. Tumble it end over end if you like;
   it will still be there when you let go. */

/**
 * Put a scene in a host element.
 *
 * @param {HTMLElement} host
 * @param {object} o
 * @param {number} [o.fov]        34 reads as an instrument, 58 as a room.
 * @param {number} [o.distance]   camera z.
 * @param {number} [o.ortho]      px per world unit; switches to an
 *                                orthographic camera so a world position maps
 *                                exactly onto a DOM box. A movement is an
 *                                assembly drawing, and an assembly drawing has
 *                                no vanishing point.
 * @param {number} [o.bloom]      strength; 0 disables the pass entirely.
 * @param {boolean} [o.drag]      let the pointer turn the scene.
 * @param {boolean} [o.locked]    start with rotation frozen (the crown).
 * @param {Function} [o.onLock]   told when the lock changes from inside.
 */
export function mount(host, o = {}) {
  const fov = o.fov ?? 38;
  const dist = o.distance ?? 7;
  const canvas = document.createElement('canvas');
  canvas.className = 'mv-canvas';
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    // No context: the host says so and the page carries on with its words.
    host.dataset.fallback = 'true';
    canvas.remove();
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  // Parts can ask to be cut off at a boundary — a movement seen through the
  // round window of a case back, for one. The planes themselves live on the
  // materials that want them.
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const ortho = o.ortho || 0;
  const camera = ortho
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100)
    : new THREE.PerspectiveCamera(fov, 1, 0.1, 80);
  camera.position.set(0, 0, dist);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if ((o.bloom ?? 0.9) > 0) {
    /* The threshold is in LINEAR light, and the numbers you read off a
       stylesheet are not. A line at #7d8b93 half-opaque is 0.245 in sRGB and
       about 0.048 linear — under a 0.12 threshold it contributes nothing at
       all, and the only reason anything glowed was that densely packed
       objects stack several transparent lines on the same pixels until the
       sum clears the bar. Which is why the same object glowed at 130px and
       went flat and crisp at 330: not a different setting, the same one
       meeting lines that no longer overlap.

       At 0.03 a single line carries its own light. */
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloom ?? 0.9, 0.5, 0.10);
    composer.addPass(bloom);
  }

  const objects = [];
  let raf = 0; let visible = true; let running = true;
  /* Frames are not free, and this scene was drawing one on every refresh
     of the display — 144 a second on a gaming panel — for hours at a time
     on the idle screen, with a full-screen bloom on each. Nothing in it
     needs that. The sway has a ten-second period, the watch turns a tenth
     of a radian a second, the seconds hand steps six times a second. So it
     is held to IDLE_FPS, and only goes to the display's full rate while a
     hand is actually on it: a drag, the coast after a throw, the crown
     bringing the watch home. That is where a dropped frame would be felt,
     and it lasts seconds. */
  const IDLE_FPS = o.idleFps ?? 30;
  let boostUntil = 0;
  let lastDraw = 0;
  const boost = (s) => { boostUntil = Math.max(boostUntil, performance.now() / 1000 + s); };
  let locked = !!o.locked || REDUCED;
  let last = performance.now() / 1000;
  const clock = { t: 0 };

  const size = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, w < 720 ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    /* The bloom at HALF resolution. A glow is a blur by definition, so it
       loses nothing a person could see, and its passes are most of what
       the GPU does per frame: a bright-pass and five mip levels of two-way
       blur, each a full-screen draw. Half the width and half the height is
       a quarter of the pixels, in every one of them. The lines themselves
       are drawn at full resolution as before — this does not touch how
       crisp anything is. Must come after composer.setSize, which resizes
       every pass back to full. */
    bloom?.setSize(Math.max(1, Math.round((w * dpr) / 2)), Math.max(1, Math.round((h * dpr) / 2)));
    if (ortho) {
      // The frustum IS the viewport, measured in world units, so a model at
      // world (x, y) lands on the pixel the layout put its dial at.
      camera.left = -w / (2 * ortho); camera.right = w / (2 * ortho);
      camera.top = h / (2 * ortho); camera.bottom = -h / (2 * ortho);
    } else {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    // A screen-space line shader has to be told how big the screen is, in the
    // pixels it will actually be rasterised into.
    lineResolution(w * dpr, h * dpr);
    if (o.fit) o.fit({ camera, w, h });
  };
  size();

  const ro = new ResizeObserver(size);
  ro.observe(host);

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 });
  io.observe(host);

  const onVis = () => { running = !document.hidden; };
  document.addEventListener('visibilitychange', onVis);

  /* ---- drag ----
     The canvas paints OVER the page and takes no pointer events, so the
     objects sit in their dials rather than behind the plates they are
     drawn on. That means the listeners live on the window, and the first
     thing they do is get out of the way of anything the page owns: a drag
     that starts on a link, a button or a field belongs to that control. */
  const drag = {
    on: false, id: null, x: 0, y: 0, obj: null,
    pending: false, x0: 0, y0: 0, touch: false, moved: 0, link: null,
  };
  /* A drag that starts on a CONTROL belongs to that control — but a link is
     not quite a control here. On the plate every module's object sits inside
     one: the whole register is a link to that module, so refusing to start a
     drag on a link meant five of the six objects on the front page could not
     be turned at all, which is the exact thing people try first.
     So a link may be dragged over, and the click it would have produced is
     swallowed if the pointer actually travelled. */
  const INTERACTIVE = 'button, input, select, textarea, label, [role="tab"], [contenteditable]';
  /* Every object can be taken hold of, anywhere on it. Picking is by
     proximity in screen space — the pointer is already where the eye is, and
     a raycast against line art hits almost nothing.

     A finger is the other case, because a finger is the page's scrolling
     gesture before it is anything else. Rather than fence touches into boxes
     that opt in — which costs the ability to turn most of the objects on a
     phone at all — a touch declares its INTENT: move across an object and it
     turns, move down the page and the page scrolls. The thresholds are
     lopsided on purpose, because a scroll that becomes a drag is far worse
     than a drag that becomes a scroll. */
  const TURN_PX = 7;
  const SCROLL_PX = 10;
  const perPixel = () => (ortho
    ? 1 / ortho
    : (2 * Math.tan((fov * Math.PI) / 360) * dist) / Math.max(1, host.clientHeight));

  const pick = (e) => {
    // Nearest object to the pointer in screen space. A raycast against line
    // art hits almost nothing; distance to the projected origin is what the
    // eye is doing anyway.
    const r = host.getBoundingClientRect();
    const px = e.clientX - r.left; const py = e.clientY - r.top;
    let best = null; let bestD = Infinity;
    for (const g of objects) {
      if (g.userData.hitR === 0 || g.userData.fixed || !g.visible) continue;
      const v = g.position.clone().project(camera);
      const sx = (v.x * 0.5 + 0.5) * r.width;
      const sy = (-v.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - px, sy - py);
      const radius = (g.userData.hitR * (g.scale.x || 1)) / perPixel();
      if (d < radius && d < bestD) { best = g; bestD = d; }
    }
    return best;
  };

  const begin = () => {
    drag.on = true;
    drag.pending = false;
    host.classList.add('is-turning');
    document.body.classList.add('mv-turning');
  };

  const down = (e) => {
    if (!o.drag) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target?.closest?.(INTERACTIVE)) return;
    const target = pick(e);
    if (!target) return;
    /* The crown holds the WATCH still. It used to be a single `if (locked)`
       at the top of this function, which held the whole SCENE still: ask the
       watch to stop so you can read it and every other object on the page
       stopped answering the pointer too — and the lock is remembered between
       visits, so it stayed that way until you found the crown again. */
    if (locked && target.userData.lockable && !target.userData.free) return;
    boost(2.5);
    drag.id = e.pointerId; drag.obj = target;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.x0 = e.clientX; drag.y0 = e.clientY;
    drag.touch = e.pointerType === 'touch';
    drag.moved = 0;
    drag.link = e.target?.closest?.('a') || null;
    // A cursor has said what it means by arriving; a finger has not yet.
    if (drag.touch) drag.pending = true;
    else begin();
  };
  const move = (e) => {
    if (e.pointerId !== drag.id) return;
    if (drag.pending) {
      const ax = Math.abs(e.clientX - drag.x0);
      const ay = Math.abs(e.clientY - drag.y0);
      if (ay > SCROLL_PX && ay > ax) { drag.pending = false; drag.obj = null; return; }
      if (ax > TURN_PX && ax > ay) { drag.x = e.clientX; drag.y = e.clientY; begin(); } else return;
    }
    if (!drag.on) return;
    /* A drag that is never told it ended is a page that never scrolls again.
       A module can capture the pointer and stop its events propagating — the
       remote session does exactly that over its own screen — and then no
       pointerup ever reaches us, `drag.on` stays true, and every touchmove
       after it is cancelled by the line below. On a phone that reads as
       scrolling breaking the moment you leave the session.

       So the end of a drag is inferred as well as listened for: no buttons
       held means no drag, whatever we were told. */
    if (e.buttons === 0) { up(e); return; }
    // Once it IS a turn, the page may not also scroll underneath it.
    if (drag.touch && e.cancelable) e.preventDefault();
    const k = perPixel() * 1.35;
    const u = drag.obj.userData;
    const dx = (e.clientX - drag.x) * k; const dy = (e.clientY - drag.y) * k;
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    u.ry += dx;
    u.rx += dy;
    u.av.x = dy; u.av.y = dx;
    // Through the coast after the throw, which runs a couple of seconds.
    boost(2.5);
  };
  const up = (e) => {
    // Not gated on `drag.on`: a touch that was still making up its mind has
    // to be cleared too, or the next pointer down inherits its candidate.
    if (e.pointerId !== drag.id) return;
    // A turn is not a click. If the pointer travelled while it was down, the
    // link under it does not get to navigate.
    if (drag.link && drag.moved > 6) {
      const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      drag.link.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => drag.link?.removeEventListener('click', swallow, { capture: true }), 350);
    }
    drag.on = false; drag.pending = false; drag.obj = null; drag.id = null; drag.link = null;
    host.classList.remove('is-turning');
    document.body.classList.remove('mv-turning');
  };
  if (o.drag) {
    /* Capture phase, all of them: these listeners sit on the window and a
       module's own handler must not be able to strand them by stopping
       propagation on the way up. */
    window.addEventListener('pointerdown', down, { capture: true });
    // Not passive: once a touch has declared itself a turn, the move has to
    // be able to stop the page scrolling under it.
    window.addEventListener('pointermove', move, { passive: false, capture: true });
    window.addEventListener('pointerup', up, { capture: true });
    window.addEventListener('pointercancel', up, { capture: true });
  }

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now() / 1000;
    if (!visible || !running) { last = now; return; }
    if (!drag.on && now > boostUntil && now - lastDraw < 1 / IDLE_FPS - 0.004) return;
    // dt is the time since the last frame DRAWN, not the last refresh, so a
    // capped scene moves at the same speed as an uncapped one.
    const dt = Math.min(0.1, now - last);
    last = now; lastDraw = now;
    clock.t += dt;
    // Whoever owns the layout gets a chance to re-measure before the frame is
    // drawn. A scene bound to DOM boxes is only ever as right as its last
    // measurement, and pages reflow for reasons no resize event reports.
    o.onFrame?.(clock.t, dt);

    for (const g of objects) {
      const u = g.userData;
      // The crown holds the MOVEMENT still — it was never a switch for the
      // whole scene. An object that does not answer to it keeps turning,
      // and the one that does eases back to facing you rather than freezing
      // at whatever angle it happened to be at.
      const held = locked && u.lockable && !u.free;
      // Square-on and back again. The pose scales the tilt and the sway
      // rather than replacing them, so the way back is the same curve.
      const kp = 1 - Math.exp(-dt * 7);
      const poseTo = u.fixed ? 0 : 1;
      if (u.pose !== poseTo) {
        u.pose += (poseTo - u.pose) * kp;
        if (Math.abs(u.pose - poseTo) < 0.002) u.pose = poseTo;
        u.tilt.rotation.x = u.tiltRest[0] * u.pose;
        u.tilt.rotation.z = u.tiltRest[1] * u.pose;
        boost(0.3);
      }
      if (u.fixed) {
        u.av.x = 0; u.av.y = 0;
        u.ry -= wrap(u.ry) * kp;
        u.rx -= u.rx * kp;
        if (!u.sway) {
          u.sp.rotation.y = wrap(u.sp.rotation.y);
          u.sp.rotation.x -= u.sp.rotation.x * kp;
          u.sp.rotation.y -= u.sp.rotation.y * kp;
          u.sp.rotation.z -= u.sp.rotation.z * kp;
        }
      }
      if ((u.sway || !held) && !(u.fixed && !u.sway)) {
        if (u.sway) {
          // Held by the crown, a swaying object eases to its drawn pose.
          const sgTo = held ? 0 : 1;
          if (u.sg !== sgTo) {
            u.sg += (sgTo - u.sg) * kp;
            if (Math.abs(u.sg - sgTo) < 0.002) u.sg = sgTo;
          }
          const amp = u.pose * u.sg;
          /* Three sines on periods that do not divide into each other, so
             the lean never repeats exactly and never reads as a mechanism
             counting. Set, not integrated: a sway has a pose to be at at
             any moment, and integrating it would drift. */
          const w = (Math.PI * 2) / (u.swayPeriod || 9);
          u.sp.rotation.x = amp * u.sway[0] * Math.sin(clock.t * w * 0.73 + u.swayPhase + 1.1);
          u.sp.rotation.y = amp * u.sway[1] * Math.sin(clock.t * w + u.swayPhase);
          u.sp.rotation.z = amp * u.sway[2] * Math.sin(clock.t * w * 0.41 + u.swayPhase + 2.3);
        } else {
          u.sp.rotation.x += u.spin[0] * dt;
          u.sp.rotation.y += u.spin[1] * dt;
          u.sp.rotation.z += u.spin[2] * dt;
        }
      }
      if (!drag.on && !u.fixed) {
        // A throw runs out and the object STAYS where it was left. Easing
        // every object back to the pose it was drawn at meant you could look
        // at the back of something for about a second and a half, and it
        // undid the one gesture the page offers. Only the watch comes home,
        // and only because the crown asked it to.
        const decay = Math.exp(-dt * 1.6);
        u.av.x *= decay; u.av.y *= decay;
        if (Math.abs(u.av.y) > 0.0015) u.ry += u.av.y;
        if (Math.abs(u.av.x) > 0.0015) u.rx += u.av.x;
        // Kept inside one turn. The value is modular so this shows nothing,
        // but it stops the drag angle growing without bound over an
        // afternoon and it is what makes the homing below honest.
        u.ry = wrap(u.ry);
        if (held && Math.hypot(u.av.x, u.av.y) < 0.0015) {
          /* ONE homing, along the short way round.

             What you see is the drag angle PLUS the idle spin, and those
             used to come home separately — the drag eased to zero while
             the object's own rotation eased to its nearest whole turn.
             Two independent journeys of up to half a turn each, at once,
             which after a good spin was most of a revolution in about a
             third of a second: the watch whipped round before it settled.

             So the sum is what comes home, by the shorter way.

             But the sum being zero is not the watch being straight. The
             drag turns OUTSIDE the tilt and the idle spin turns INSIDE it,
             so drag = −spin faces you with the tilt swung round to whatever
             axis the spin left it on: the watch settled leaning sideways.
             Both have to reach zero. The sum sets the journey you see;
             the drag is drained into the spin along the way, which only
             swings the small tilt back to where it was drawn. */
          const k = 1 - Math.exp(-dt * 3);
          u.sp.rotation.y = wrap(u.sp.rotation.y);   // whole turns: invisible
          const ds = -wrap(u.ry + u.sp.rotation.y) * k;
          const dr = -u.ry * k;
          u.ry += dr;
          u.sp.rotation.y += ds - dr;
          u.rx += (0 - u.rx) * k;
        }
      }
      g.rotation.y = u.ry;
      g.rotation.x = u.rx;
      u.tick?.(clock.t, dt, u.parts, { locked: locked && u.lockable, reduced: REDUCED });
    }

    composer.render();
  };
  raf = requestAnimationFrame(tick);

  return {
    scene,
    camera,
    clock,
    add(obj) { objects.push(obj); scene.add(obj); return obj; },
    /** Take an object out of the scene and dispose what it was made of. */
    remove(obj) {
      const i = objects.indexOf(obj);
      if (i >= 0) objects.splice(i, 1);
      scene.remove(obj);
      obj.traverse?.((n) => {
        n.geometry?.dispose?.();
        for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
          if (!m) continue;
          forgetLine(m);
          m.dispose?.();
        }
      });
    },
    /**
     * Where an object is on the page, in pixels relative to the host — its
     * world position run through the camera. The movement turns, so a callout
     * that names a part has to ask every frame where that part has got to.
     */
    projectObject(obj) {
      if (!obj) return null;
      const r = host.getBoundingClientRect();
      const v = new THREE.Vector3();
      obj.getWorldPosition(v);
      const depth = v.z;
      // Which way the part is FACING: the z of its own +Z axis in the world.
      // Positive means it is turned toward the camera. A caller pointing at
      // something on the back of an object needs this — the part's depth
      // alone says nothing, because a part off the centre of a turning object
      // can be nearer than the camera-facing side it belongs to.
      const facing = new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld, 2).normalize().z;
      v.project(camera);
      // `depth` is the part's distance toward the camera in world units. A
      // caller pointing at something can use it to tell whether the object
      // has turned that part away — a leader to a part behind the dial is a
      // leader to nothing.
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, depth, facing };
    },
    /** The crown: freeze every rotation so the thing can be read. */
    setLocked(v) {
      locked = !!v;
      // The homing takes under three seconds; draw it at full rate.
      boost(3.2);
      if (locked) {
        for (const g of objects) {
          g.userData.av.x = 0; g.userData.av.y = 0;
        }
      }
      host.classList.toggle('is-locked', locked);
      o.onLock?.(locked);
    },
    get locked() { return locked; },
    /** Draw at full rate for a while: something is about to move. */
    boost,
    resize: size,
    /* A scene now outlives the screen that asked for it, and different
       screens want different amounts of light. */
    setBloom(v) { if (bloom) bloom.strength = v; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (o.drag) {
        window.removeEventListener('pointerdown', down, { capture: true });
        window.removeEventListener('pointermove', move, { capture: true });
        window.removeEventListener('pointerup', up, { capture: true });
        window.removeEventListener('pointercancel', up, { capture: true });
      }
      document.body.classList.remove('mv-turning');
      scene.traverse((n) => {
        n.geometry?.dispose?.();
        for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
          if (!m) continue;
          forgetLine(m);
          m.dispose?.();
        }
      });
      composer.dispose?.();
      renderer.dispose();
      canvas.remove();
    },
  };
}

/* ---- shared parts ------------------------------------------------- */

/** A jewel in its setting: the ruby, the gold chaton around it, and the
    pivot's shine. Every complication has bearings, so they live here. */
export function jewel(r = 0.05) {
  const g = new THREE.Group();
  g.add(disc(r * 0.45, r * 0.55, C.ruby, 0.5));
  g.add(ring(r, C.brass, 0.75));
  g.add(node(r * 0.28, C.ruby, 0.95));
  return g;
}

/** Perlage: the overlapping circular graining a plate is finished with.
    Drawn sparse and dim — it is texture, and texture that reads as content
    is a mistake. */
export function perlage(w, h, step = 0.26, c = C.rhodium, o = 0.12) {
  const g = new THREE.Group();
  for (let y = -h / 2; y <= h / 2; y += step) {
    for (let x = -w / 2; x <= w / 2; x += step) {
      const r = ring(step * 0.62, c, o, 'z', 20);
      r.position.set(x + (Math.round(y / step) % 2 ? step / 2 : 0), y, 0);
      g.add(r);
    }
  }
  return g;
}

/** Côtes de Genève: the striping on a bridge. Parallel lines with a
    slight sweep, which is the whole difference from a hatch pattern. */
export function cotes(w, h, gap = 0.1, c = C.rhodium, o = 0.16) {
  const pts = [];
  for (let x = -w / 2; x <= w / 2; x += gap) {
    pts.push(V(x, -h / 2, 0), V(x + h * 0.12, h / 2, 0));
  }
  return segs(pts, c, o);
}

/** The idiom every pulse on ojee.net is built from: a ring that expands
    and fades once per beat. Returns a tick you drive with a 0..1 phase. */
export function pulseRing(r0, r1, c = C.beat, w = 0.02) {
  const m = disc(r0, w, c, 0);
  return {
    mesh: m,
    at(k) {
      const r = r0 + (r1 - r0) * k;
      m.scale.setScalar(r / r0);
      m.material.opacity = Math.max(0, 0.55 * (1 - k));
    },
  };
}
