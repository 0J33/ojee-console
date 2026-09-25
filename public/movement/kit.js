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

/* ---- drawing ------------------------------------------------------ */

export const lineMat = (c = C.rhodium, o = 1) => new THREE.LineBasicMaterial({
  color: c, transparent: true, opacity: o,
});

const geoOf = (pts) => new THREE.BufferGeometry().setFromPoints(pts);

export const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** An open path, or a closed one with `loop`. */
export function poly(pts, c = C.rhodium, o = 0.9, loop = false) {
  const geo = geoOf(pts);
  return loop ? new THREE.LineLoop(geo, lineMat(c, o)) : new THREE.Line(geo, lineMat(c, o));
}

/** Disconnected segments from a flat list of pairs. */
export const segs = (pts, c = C.rhodium, o = 0.6) => new THREE.LineSegments(geoOf(pts), lineMat(c, o));

export const edges = (geo, c = C.rhodium, o = 0.8, thresh = 1) =>
  new THREE.LineSegments(new THREE.EdgesGeometry(geo, thresh), lineMat(c, o));

export const wire = (geo, c = C.rhodium, o = 0.6) =>
  new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMat(c, o));

export const dots = (pts, c = C.steel, size = 0.02, o = 0.8) => new THREE.Points(
  geoOf(pts), new THREE.PointsMaterial({ color: c, size, sizeAttenuation: true, transparent: true, opacity: o }),
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
  g.userData = { sp, tilt: t, spin: [0, 0.12, 0], rx: 0, ry: 0, av: { x: 0, y: 0 }, hitR: 1.8, parts: {} };
  return [g, sp];
}

/* ---- the mount ---------------------------------------------------- */

const RX_MAX = 1.35;
const clampRx = (v) => Math.max(-RX_MAX, Math.min(RX_MAX, v));

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
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloom ?? 0.9, 0.55, 0.12);
    composer.addPass(bloom);
  }

  const objects = [];
  let raf = 0; let visible = true; let running = true;
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
    if (ortho) {
      // The frustum IS the viewport, measured in world units, so a model at
      // world (x, y) lands on the pixel the layout put its dial at.
      camera.left = -w / (2 * ortho); camera.right = w / (2 * ortho);
      camera.top = h / (2 * ortho); camera.bottom = -h / (2 * ortho);
    } else {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
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
  const drag = { on: false, id: null, x: 0, y: 0, obj: null };
  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="tab"], [contenteditable]';
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
      if (g.userData.hitR === 0 || !g.visible) continue;
      const v = g.position.clone().project(camera);
      const sx = (v.x * 0.5 + 0.5) * r.width;
      const sy = (-v.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - px, sy - py);
      const radius = (g.userData.hitR * (g.scale.x || 1)) / perPixel();
      if (d < radius && d < bestD) { best = g; bestD = d; }
    }
    return best;
  };

  const down = (e) => {
    if (locked || !o.drag) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target?.closest?.(INTERACTIVE)) return;
    const target = pick(e);
    if (!target) return;
    drag.on = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.obj = target;
    host.classList.add('is-turning');
    document.body.classList.add('mv-turning');
  };
  const move = (e) => {
    if (!drag.on || e.pointerId !== drag.id) return;
    const k = perPixel() * 1.35;
    const u = drag.obj.userData;
    const dx = (e.clientX - drag.x) * k; const dy = (e.clientY - drag.y) * k;
    drag.x = e.clientX; drag.y = e.clientY;
    u.ry += dx;
    // Pitch is rubber-banded rather than clamped dead, so the object sits
    // on a weighted base instead of hitting a wall.
    const outward = (dy >= 0) === (u.rx >= 0);
    const damp = outward ? Math.max(0, 1 - (Math.abs(u.rx) / RX_MAX) ** 2) : 1;
    u.rx = clampRx(u.rx + dy * damp);
    u.av.x = dy; u.av.y = dx;
  };
  const up = (e) => {
    if (!drag.on || e.pointerId !== drag.id) return;
    drag.on = false; drag.obj = null;
    host.classList.remove('is-turning');
    document.body.classList.remove('mv-turning');
  };
  if (o.drag) {
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;
    if (!visible || !running) return;
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
      const held = locked && u.lockable;
      if (!held) {
        u.sp.rotation.x += u.spin[0] * dt;
        u.sp.rotation.y += u.spin[1] * dt;
        u.sp.rotation.z += u.spin[2] * dt;
      } else {
        u.rest?.();
      }
      if (!drag.on) {
        // Let the throw run out, then ease back to the pose the object
        // was drawn at, the short way round.
        const decay = Math.exp(-dt * 1.6);
        u.av.x *= decay; u.av.y *= decay;
        if (Math.abs(u.av.y) > 0.0015) u.ry += u.av.y;
        if (Math.abs(u.av.x) > 0.0015) u.rx = clampRx(u.rx + u.av.x);
        if (Math.hypot(u.av.x, u.av.y) < 0.0015) {
          u.ry = Math.atan2(Math.sin(u.ry), Math.cos(u.ry));
          const k = 1 - Math.exp(-dt * 2.6);
          u.ry += (0 - u.ry) * k * (locked ? 1 : 0.35);
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
      if (locked) {
        for (const g of objects) {
          g.userData.av.x = 0; g.userData.av.y = 0;
        }
      }
      host.classList.toggle('is-locked', locked);
      o.onLock?.(locked);
    },
    get locked() { return locked; },
    resize: size,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (o.drag) {
        window.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      }
      document.body.classList.remove('mv-turning');
      scene.traverse((n) => {
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose?.());
        else n.material?.dispose?.();
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
