/* ============================================================
   cockpit concept — the own-ship.

   A wireframe airframe drawn in code, in the centre portal, whose
   four systems stand for the console's four modules. The mapping is
   what an aircraft actually has, not decoration:

     ECS   environmental control — the jet's air conditioning   → Home
     ENG   the engine and its nozzle, the power plant          → Fleet
     DLNK  datalink antennas on the spine and belly            → Remote
     MSN   mission computer and radar in the nose              → Agent

   Each system's lines take its module's status colour; callouts
   are HTML, pinned to projected 3D anchors with SVG leaders, so
   they stay crisp text and remain clickable. Drag to spin; a
   soft-key or callout turns the airframe to present that system.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (c, o) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o });
const segs = (pairs, c, o) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pairs), mat(c, o));
const loop = (pts, c, o) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat(c, o));
const line = (pts, c, o) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(c, o));

export const STATUS_HEX = { ok: 0x3dff7a, caution: 0xffb000, warning: 0xff2d2d, off: 0x3a4248 };
const HULL = 0x0e8f99;     // own-ship symbology, a dimmer cyan so the systems read over it

/* ── geometry ──────────────────────────────────────────────────────────
   Nose at +z. Stations are lofted as chined octagons, the way the real
   fuselage is flat-sided with hard chines rather than round. */
const STATIONS = [
  //  z      w     h     y (section centre)
  [2.25, 0.02, 0.02, 0.02],
  [1.90, 0.20, 0.16, 0.02],
  [1.55, 0.34, 0.26, 0.04],
  [1.15, 0.48, 0.36, 0.06],
  [0.75, 0.80, 0.42, 0.05],
  [0.30, 0.92, 0.46, 0.05],
  [-0.30, 0.94, 0.44, 0.04],
  [-0.90, 0.88, 0.40, 0.03],
  [-1.40, 0.70, 0.34, 0.02],
  [-1.72, 0.44, 0.30, 0.00],
];
function section(w, h, y, z) {
  return [
    V(0, y + h * 0.55, z), V(w * 0.30, y + h * 0.45, z), V(w * 0.5, y, z), V(w * 0.36, y - h * 0.40, z),
    V(0, y - h * 0.48, z), V(-w * 0.36, y - h * 0.40, z), V(-w * 0.5, y, z), V(-w * 0.30, y + h * 0.45, z),
  ];
}

function buildAirframe() {
  const root = new THREE.Group();
  const zones = { msn: new THREE.Group(), ecs: new THREE.Group(), dlnk: new THREE.Group(), eng: new THREE.Group() };
  const hull = new THREE.Group();
  root.add(hull, ...Object.values(zones));

  const rings = STATIONS.map(([z, w, h, y]) => section(w, h, y, z));
  // The nose stations belong to the mission system; the aft ones to the engine.
  rings.forEach((r, i) => {
    const z = STATIONS[i][0];
    const g = z >= 1.5 ? zones.msn : z <= -0.9 ? zones.eng : hull;
    g.add(loop(r, HULL, 0.5));
  });
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < rings.length - 1; i++) {
      const z = STATIONS[i][0];
      const g = z >= 1.5 ? zones.msn : STATIONS[i + 1][0] <= -0.9 ? zones.eng : hull;
      g.add(line([rings[i][k], rings[i + 1][k]], HULL, 0.5));
    }
  }

  // canopy: a bubble over the forward fuselage
  const can = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, z = 1.45 - t * 0.95;
    can.push(V(0, 0.2 + Math.sin(t * Math.PI) * 0.2, z));
  }
  hull.add(line(can, HULL, 0.8));
  for (const s of [-1, 1]) {
    const side = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, z = 1.45 - t * 0.95;
      side.push(V(s * (0.10 + Math.sin(t * Math.PI) * 0.08), 0.2 + Math.sin(t * Math.PI) * 0.1, z));
    }
    hull.add(line(side, HULL, 0.55));
  }

  // wings: a clipped delta, with a spar line
  for (const s of [-1, 1]) {
    const w = [V(s * 0.46, 0, 0.55), V(s * 1.95, 0, -0.72), V(s * 1.95, 0, -1.02), V(s * 0.46, 0, -1.25)];
    hull.add(loop(w, HULL, 0.65));
    hull.add(line([V(s * 0.46, 0, -0.35), V(s * 1.95, 0, -0.86)], HULL, 0.25));
    // stabilators
    const st = [V(s * 0.34, 0.02, -1.30), V(s * 1.18, 0.02, -1.70), V(s * 1.18, 0.02, -1.92), V(s * 0.34, 0.02, -1.98)];
    zones.eng.add(loop(st, HULL, 0.5));
    // canted twin tails
    const lean = 0.42;
    const tl = [V(s * 0.30, 0.2, -0.86), V(s * (0.30 + lean * 0.7), 0.95, -1.36), V(s * (0.30 + lean * 0.7), 0.95, -1.60), V(s * 0.30, 0.2, -1.62)];
    hull.add(loop(tl, HULL, 0.6));
  }

  // ECS: the intakes either side, and the ducts running aft from them
  for (const s of [-1, 1]) {
    const x0 = s * 0.47, x1 = s * 0.60;
    const lip = [V(x0, 0.24, 0.92), V(x1, 0.18, 0.86), V(x1, -0.04, 0.80), V(x0, -0.06, 0.86)];
    zones.ecs.add(loop(lip, HULL, 1));
    zones.ecs.add(segs([V(x0, 0.24, 0.92), V(s * 0.46, 0.22, 0.20), V(x0, -0.06, 0.86), V(s * 0.46, -0.08, 0.20),
                        V(x1, 0.18, 0.86), V(s * 0.46, 0.2, 0.3)], HULL, 1));
    // the heat exchanger vents on the spine
    zones.ecs.add(segs([V(s * 0.12, 0.26, 0.05), V(s * 0.22, 0.25, -0.25), V(s * 0.22, 0.25, -0.25), V(s * 0.12, 0.26, -0.28)], HULL, 1));
  }

  // DLNK: blade antennas top and bottom, and the link they carry
  const blade = (z, up) => {
    const y0 = up ? 0.28 : -0.22, y1 = up ? 0.46 : -0.38;
    return [V(0, y0, z), V(0, y1, z - 0.08), V(0, y1, z - 0.08), V(0, y1, z - 0.18), V(0, y1, z - 0.18), V(0, y0, z - 0.22)];
  };
  zones.dlnk.add(segs([...blade(0.20, true), ...blade(-0.55, true), ...blade(-0.10, false)], HULL, 1));
  const arcs = [];
  for (let k = 0; k < 3; k++) {
    const r = 0.14 + k * 0.1, pts = [];
    for (let i = 0; i <= 18; i++) { const a = -0.9 + (i / 18) * 1.8; pts.push(V(Math.sin(a) * r, 0.52 + Math.cos(a) * r * 0.6, 0.12)); }
    const l = line(pts, HULL, 1); zones.dlnk.add(l); arcs.push(l);
  }

  // MSN: the radar face inside the radome
  const radar = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; radar.push(V(Math.cos(a) * 0.1, 0.03 + Math.sin(a) * 0.08, 1.72)); }
  zones.msn.add(loop(radar, HULL, 1));
  zones.msn.add(segs([V(-0.1, 0.03, 1.72), V(0.1, 0.03, 1.72), V(0, -0.05, 1.72), V(0, 0.11, 1.72)], HULL, 1));

  // ENG: the nozzle, and its petals
  const nozzle = [];
  for (const [z, r] of [[-1.72, 0.19], [-1.92, 0.17], [-2.08, 0.15]]) {
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push(V(Math.cos(a) * r, Math.sin(a) * r, z)); }
    zones.eng.add(loop(pts, HULL, 1)); nozzle.push(pts);
  }
  const petals = [];
  for (let i = 0; i < 28; i += 2) petals.push(nozzle[0][i], nozzle[2][i]);
  zones.eng.add(segs(petals, HULL, 1));

  // A plume that pulses with the fleet's state, behind the nozzle
  const plume = [];
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push(V(Math.cos(a) * (0.13 - k * 0.025), Math.sin(a) * (0.13 - k * 0.025), -2.2 - k * 0.14)); }
    const l = loop(pts, HULL, 0); zones.eng.add(l); plume.push(l);
  }

  root.userData = { zones, hull, arcs, plume };
  return root;
}

/* Where each callout's leader lands, in airframe space. */
const ANCHORS = {
  msn: V(0, 0.05, 1.95),
  ecs: V(0.6, 0.1, 0.84),
  dlnk: V(0, 0.46, 0.12),
  eng: V(0, 0.0, -2.06),
};

/* How the airframe turns to present each system: [yaw, pitch]. */
const PRESENT = {
  sys: null,
  msn: [-0.55, 0.22],
  ecs: [-1.25, 0.12],
  dlnk: [-0.35, 0.95],
  eng: [2.55, 0.22],
};

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} host      the portal body; canvas + overlay go inside
 * @param {object}      opts
 *   systems   [{ id, zone, code, name }]
 *   onSelect  (zone|null) => void
 *   detailEl  the readout box; while a system is selected it becomes that
 *             system's callout, and the corner tags stand down
 */
export function mountAirframe(host, { systems, onSelect, detailEl }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'af-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('af-leaders');
  svg.setAttribute('aria-hidden', 'true');
  const labels = document.createElement('div');
  labels.className = 'af-labels';
  host.append(canvas, svg, labels);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 0.6, 7.0);
  camera.lookAt(0, 0, 0);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 0.12);
  composer.addPass(bloom);

  const frame = new THREE.Group();       // drag + presentation rotation
  const body = buildAirframe();
  frame.add(body);
  scene.add(frame);
  const { zones, arcs, plume } = body.userData;

  // A ground reference: the attitude reference line under the aircraft.
  const horizon = segs([V(-3.2, -0.62, 0), V(3.2, -0.62, 0)], 0x1d3a40, 0.9);
  const ticks = [];
  for (let i = -6; i <= 6; i++) ticks.push(V(i * 0.5, -0.62, 0), V(i * 0.5, i % 2 ? -0.66 : -0.7, 0));
  scene.add(horizon, segs(ticks, 0x1d3a40, 0.9));

  /* callouts */
  const byZone = new Map(systems.map((s) => [s.zone, s]));
  const els = {};
  for (const s of systems) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'af-tag';
    b.dataset.zone = s.zone;
    b.innerHTML = `<i class="lamp"></i><b>${s.code}</b><span class="af-tag-h"></span>`;
    b.setAttribute('aria-label', `${s.code} · ${s.name}`);
    b.addEventListener('click', () => onSelect?.(sel === s.zone ? null : s.zone));
    labels.append(b);
    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    dot.setAttribute('width', 5); dot.setAttribute('height', 5);
    // A fault is marked where it is on the airframe, not only by colour:
    // a small system like the datalink antennas would otherwise carry a
    // warning in a handful of pixels.
    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.setAttribute('r', 14);
    svg.append(pl, halo, dot);
    els[s.zone] = { b, pl, dot, halo };
  }

  /* state */
  let W = 1, H = 1, sel = null;
  let yaw = -0.6, pitch = 0.28, vYaw = 0, vPitch = 0;
  let targetYaw = null, targetPitch = null;
  let dragging = false, lastX = 0, lastY = 0, lastT = 0;
  const status = {};

  const resize = () => {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    // Fit the airframe: narrow portals pull the camera back.
    // Side-on, nose to nozzle plume is ~5.2 units: keep ±2.9 of it inside the
    // frame horizontally with margin, and ±1.7 vertically.
    const t = Math.tan((camera.fov / 2) * Math.PI / 180), asp = W / H;
    // Narrow portals (phones) trade a little side-on margin for a bigger
    // airframe: the callouts already claim its corners.
    const half = W < 520 ? 2.45 : 2.9;
    camera.position.z = Math.min(16, Math.max(7.0, half / (t * asp), 1.7 / t));
    camera.updateProjectionMatrix();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  /* drag to spin */
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    vYaw = vPitch = 0; targetYaw = targetPitch = null;
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('is-grab');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), dt = Math.max(0.008, (now - lastT) / 1000);
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    const k = 3.2 / Math.max(260, Math.min(W, H));
    yaw += dx * k; pitch = Math.max(-1.1, Math.min(1.25, pitch + dy * k));
    vYaw = (dx * k) / dt; vPitch = (dy * k) / dt;
  });
  const up = () => { dragging = false; host.classList.remove('is-grab'); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  /* per frame */
  const p = new THREE.Vector3();
  const project = (v) => {
    p.copy(v).applyMatrix4(body.matrixWorld).project(camera);
    return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H, p.z];
  };

  // Labels sit in four fixed slots at the portal's edges; each system takes
  // the slot on its own side, top or bottom by where its anchor projects.
  function placeLabels() {
    const pts = systems.map((s) => ({ s, xy: project(ANCHORS[s.zone]) }));
    const left = pts.filter((q) => q.xy[0] < W / 2).sort((a, b) => a.xy[1] - b.xy[1]);
    const right = pts.filter((q) => q.xy[0] >= W / 2).sort((a, b) => a.xy[1] - b.xy[1]);
    // Keep at most two a side: overflow moves across.
    while (left.length > 2) right.unshift(left.pop());
    while (right.length > 2) left.push(right.shift());
    left.sort((a, b) => a.xy[1] - b.xy[1]); right.sort((a, b) => a.xy[1] - b.xy[1]);
    const pad = 12;
    const slot = (arr, side) => arr.forEach((q, i) => {
      const e = els[q.s.zone];
      const bw = e.b.offsetWidth, bh = e.b.offsetHeight;
      const y = arr.length === 1 ? (q.xy[1] < H / 2 ? pad + 36 : H - bh - pad) : i === 0 ? pad + 36 : H - bh - pad;
      const x = side === 'l' ? pad : W - bw - pad;
      e.b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const ex = side === 'l' ? x + bw : x, ey = y + bh / 2;
      const [ax, ay] = q.xy;
      const elbow = side === 'l' ? Math.min(ax - 14, ex + 26) : Math.max(ax + 14, ex - 26);
      e.pl.setAttribute('points', `${ex},${ey} ${elbow},${ey} ${ax},${ay}`);
      e.dot.setAttribute('x', ax - 2.5); e.dot.setAttribute('y', ay - 2.5);
      e.halo.setAttribute('cx', ax); e.halo.setAttribute('cy', ay);
    });
    slot(left, 'l'); slot(right, 'r');

    // Selected: one leader, from the readout box to the system it describes.
    if (sel && detailEl && !detailEl.hidden) {
      const hr = host.getBoundingClientRect(), dr = detailEl.getBoundingClientRect();
      const [ax, ay] = project(ANCHORS[sel]);
      const ex = dr.right - hr.left, ey = dr.top - hr.top + 16;
      const e = els[sel];
      e.pl.setAttribute('points', `${ex},${ey} ${Math.max(ex + 18, Math.min(ax - 14, ex + 60))},${ey} ${ax},${ay}`);
    }
  }

  let t = 0, last = performance.now(), raf = 0, visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
  io.observe(host);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;

    if (!dragging) {
      if (targetYaw != null) {
        // turn the short way round to the presented attitude
        let d = targetYaw - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = REDUCED ? 1 : 1 - Math.exp(-dt * 3.2);
        yaw += d * k; pitch += (targetPitch - pitch) * k;
      } else {
        const damp = Math.exp(-dt * 1.6);
        vYaw *= damp; vPitch *= damp;
        yaw += vYaw * dt; pitch = Math.max(-1.1, Math.min(1.25, pitch + vPitch * dt));
        if (Math.abs(vYaw) < 0.25 && !REDUCED) yaw += dt * 0.16;        // idle turn
        if (Math.abs(vPitch) < 0.25) pitch += (0.28 - pitch) * (1 - Math.exp(-dt * 0.6));
      }
    }
    frame.rotation.set(pitch, yaw, 0, 'XYZ');

    // system colours, and the selected one breathes
    for (const [zone, g] of Object.entries(zones)) {
      const st = status[zone] || 'off';
      const c = STATUS_HEX[st];
      const on = sel === zone, dimmed = sel && !on;
      const base = st === 'warning' ? 0.65 + 0.35 * Math.sin(t * 7) : st === 'caution' ? 0.75 + 0.2 * Math.sin(t * 3) : 0.85;
      g.traverse((o) => {
        if (!o.material || plume.includes(o)) return;
        o.material.color.setHex(c);
        o.material.opacity = dimmed ? 0.18 : on ? Math.min(1, base + 0.15) : base;
      });
    }
    body.userData.hull.traverse((o) => { if (o.material) o.material.opacity = sel ? 0.22 : 0.5; });
    arcs.forEach((a, i) => { a.material.opacity = (sel && sel !== 'dlnk' ? 0.1 : 0.9) * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.9)); });
    plume.forEach((l, i) => {
      const k = ((t * 1.3 + i * 0.25) % 1);
      l.material.color.setHex(STATUS_HEX[status.eng || 'off']);
      l.material.opacity = (sel && sel !== 'eng' ? 0.06 : 0.5) * (1 - k);
      l.scale.setScalar(1 + k * 0.4);
    });

    composer.render();
    frame.updateMatrixWorld();
    placeLabels();
    for (const [zone, e] of Object.entries(els)) {
      const st = status[zone] || 'off';
      const gone = sel && sel !== zone && detailEl && !detailEl.hidden;
      e.pl.setAttribute('class', `st-${st}${sel === zone ? ' is-sel' : ''}${sel && sel !== zone ? ' is-dim' : ''}${gone ? ' is-gone' : ''}`);
      e.dot.setAttribute('class', `st-${st}`);
      e.halo.setAttribute('class', `halo st-${st}${sel && sel !== zone ? ' is-dim' : ''}`);
    }
  };
  tick();

  return {
    setStatus(zone, st, headline) {
      status[zone] = st;
      const e = els[zone]; if (!e) return;
      e.b.dataset.st = st;
      e.b.querySelector('.af-tag-h').textContent = headline || '';
    },
    select(zone) {
      sel = zone;
      const pr = zone && PRESENT[zone];
      if (pr) { targetYaw = pr[0]; targetPitch = pr[1]; vYaw = vPitch = 0; } else { targetYaw = targetPitch = null; }
      for (const [z, e] of Object.entries(els)) {
        e.b.classList.toggle('is-sel', z === zone);
        e.b.classList.toggle('is-dim', !!zone && z !== zone);
        e.b.setAttribute('aria-pressed', String(z === zone));
      }
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); },
  };
}
