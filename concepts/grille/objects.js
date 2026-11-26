/* The Grille's objects: cream industrial products on a black shelf, softly lit.
   Each module is a thing you could put on a sideboard: a radio for the network, a hi-fi
   stack for the machines, a calculator for the agent, a turntable for music, a wall
   thermostat for home, an alarm clock for time. Their state is real: the clock keeps the
   console's time, the thermostat turns to the setpoint, the record spins while music
   plays, and a machine's lamp takes its state colour.
   One WebGL canvas covers the window; each [data-obj] slot is scissored into its own
   rectangle and clipped to the layer on top, so there is one GL context in total.
   The page never depends on it: every fact is also in words. */
(function () {
  const T = window.THREE;
  const off = () => { document.documentElement.classList.add('obj-fallback'); window.Stage = { scan() {} }; };
  if (!T) return off();
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const M = {
    cream: new T.MeshStandardMaterial({ color: '#E8E2D4', roughness: 0.62, metalness: 0 }),
    cream2: new T.MeshStandardMaterial({ color: '#D3CCBC', roughness: 0.7, metalness: 0 }),
    alu: new T.MeshStandardMaterial({ color: '#B7B6B2', roughness: 0.38, metalness: 0.35 }),
    graphite: new T.MeshStandardMaterial({ color: '#2E2D2C', roughness: 0.55, metalness: 0.05 }),
    black: new T.MeshStandardMaterial({ color: '#0B0B0C', roughness: 0.35, metalness: 0.1 }),
    vinyl: new T.MeshStandardMaterial({ color: '#111112', roughness: 0.28, metalness: 0.2 }),
    hole: new T.MeshBasicMaterial({ color: '#1A1917' }),
    yellow: new T.MeshStandardMaterial({ color: '#F2C230', roughness: 0.45 }),
    run: new T.MeshBasicMaterial({ color: '#63C26F' }),
    hold: new T.MeshBasicMaterial({ color: '#F2C230' }),
    stop: new T.MeshBasicMaterial({ color: '#F0592E' }),
    lit: new T.MeshBasicMaterial({ color: '#ECE6D8' }),
    screenGlow: new T.MeshBasicMaterial({ color: '#2A2A2C' }),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); return m; };

  function rrect(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  function rbox(w, h, d, r = 0.12, b = 0.035) {
    b = Math.min(b, d * 0.3);
    const g = new T.ExtrudeGeometry(rrect(w - 2 * b, h - 2 * b, Math.max(0.01, r - b)), { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 10 });
    g.center(); return g;
  }
  const cylZ = (r, d, seg = 48) => { const g = new T.CylinderGeometry(r, r, d, seg); g.rotateX(Math.PI / 2); return g; };
  const cylY = (r, h, seg = 48, rb) => new T.CylinderGeometry(r, rb ?? r, h, seg);

  // a perforated grille: holes in a rect or circle, facing +z, at depth z
  function holes({ w, h, pitch = 0.09, r = 0.026, circle = 0, x = 0, y = 0, z = 0 }) {
    const pts = [];
    for (let yy = -h / 2 + pitch / 2; yy <= h / 2; yy += pitch) for (let xx = -w / 2 + pitch / 2; xx <= w / 2; xx += pitch) {
      if (circle && Math.hypot(xx, yy) > circle) continue; pts.push([xx, yy]);
    }
    const geo = new T.CircleGeometry(r, 10), im = new T.InstancedMesh(geo, M.hole, pts.length), o = new T.Object3D();
    pts.forEach(([a, b], i) => { o.position.set(x + a, y + b, z + 0.001); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    return im;
  }
  const lamp = (state = 'run', r = 0.045) => new T.Mesh(new T.SphereGeometry(r, 16, 12), M[state] || M.run);

  /* ---------------------------------------------------------------- builders */
  const B = {
    clock() {
      const g = new T.Group();
      g.add(mesh(rbox(1.7, 1.7, 0.42, 0.26), M.cream));
      g.add(mesh(cylZ(0.72, 0.06, 64), M.black, 0, 0, 0.2));
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
        const m = mesh(new T.BoxGeometry(big ? 0.035 : 0.014, big ? 0.13 : 0.05, 0.01), M.lit, Math.sin(a) * (big ? 0.58 : 0.62), Math.cos(a) * (big ? 0.58 : 0.62), 0.235);
        m.rotation.z = -a; g.add(m);
      }
      const hand = (len, w, mat, z, tail = 0.08) => { const p = new T.Group(); p.position.z = z; p.add(mesh(new T.BoxGeometry(w, len + tail, 0.012), mat, 0, (len - tail) / 2, 0)); g.add(p); return p; };
      const hh = hand(0.38, 0.06, M.lit, 0.245), mh = hand(0.56, 0.045, M.lit, 0.255), sh = hand(0.6, 0.016, M.hold, 0.265, 0.16);
      g.add(mesh(cylZ(0.045, 0.03, 20), M.hold, 0, 0, 0.275));
      g.add(mesh(cylZ(0.06, 0.08, 20), M.yellow, 0.55, 0.92, -0.05)); // the alarm key on top
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;
      const tick = () => {
        const d = new Date(Date.now() + (window.CLOCK_OFFSET || 0));
        const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
        const sStep = REDUCED ? Math.floor(s) : Math.floor(s) + Math.min(1, (s % 1) * 6); // quartz tick with a short travel
        sh.rotation.z = -(sStep / 60) * Math.PI * 2; mh.rotation.z = -(m / 60) * Math.PI * 2; hh.rotation.z = -(h / 12) * Math.PI * 2;
      };
      return { g, scale: 1, tick, base: 0.28, sway: 0.16, tiltX: 0.05 };
    },
    radio() {
      const g = new T.Group();
      g.add(mesh(rbox(1.25, 1.75, 0.55, 0.16), M.cream));
      g.add(holes({ w: 0.95, h: 0.95, pitch: 0.085, circle: 0.44, y: 0.32, z: 0.275 }));
      const wheel = mesh(cylZ(0.24, 0.06, 48), M.alu, 0, -0.5, 0.29); g.add(wheel);
      g.add(mesh(new T.BoxGeometry(0.02, 0.16, 0.02), M.black, 0, -0.4, 0.33));
      const ant = mesh(cylY(0.018, 1.3, 10), M.alu, 0.42, 1.4, -0.1); ant.rotation.z = -0.32; g.add(ant);
      { const l = lamp('run'); l.position.set(0.42, -0.72, 0.28); g.add(l); }
      return { g, scale: 0.92, base: -0.42, sway: 0.28 };
    },
    stack(led = 'run') {
      const g = new T.Group();
      [[-0.55, M.cream, led === 'stop' ? 'stop' : 'run'], [-0.05, M.alu, 'run'], [0.45, M.cream, 'run']].forEach(([y, mat, st], i) => {
        g.add(mesh(rbox(1.95, 0.44, 1.05, 0.06, 0.02), mat, 0, y, 0));
        g.add(mesh(new T.BoxGeometry(0.9, 0.035, 0.01), M.black, -0.32, y + 0.05, 0.53));
        g.add(holes({ w: 0.42, h: 0.22, pitch: 0.07, r: 0.02, x: 0.58, y, z: 0.525 }));
        const l = lamp(st, 0.04); l.position.set(-0.84, y - 0.08, 0.53); g.add(l);
        g.add(mesh(cylZ(0.06, 0.05, 24), M.graphite, 0.12, y - 0.08, 0.54));
      });
      return { g, scale: 0.88, base: -0.5, sway: 0.24, tiltX: 0.22 };
    },
    tv() {
      const g = new T.Group();
      g.add(mesh(rbox(1.95, 1.3, 0.32, 0.12), M.cream, 0, 0.25, 0));
      g.add(mesh(rbox(1.62, 1.0, 0.04, 0.08, 0.01), M.black, -0.06, 0.25, 0.16));
      g.add(mesh(new T.PlaneGeometry(0.62, 0.38), M.screenGlow, -0.36, 0.38, 0.185));
      g.add(mesh(new T.PlaneGeometry(0.54, 0.3), M.screenGlow, 0.3, 0.12, 0.185));
      g.add(holes({ w: 0.12, h: 0.8, pitch: 0.06, r: 0.016, x: 0.86, y: 0.25, z: 0.16 }));
      g.add(mesh(cylY(0.03, 0.62, 12), M.alu, 0, -0.7, -0.05));
      g.add(mesh(cylY(0.42, 0.05, 48), M.alu, 0, -1.02, -0.05));
      return { g, scale: 0.9, base: -0.4, sway: 0.26 };
    },
    calc() {
      const g = new T.Group(), c = new T.Group();
      c.add(mesh(rbox(1.15, 1.8, 0.16, 0.1), M.graphite));
      c.add(mesh(rbox(0.95, 0.3, 0.03, 0.04, 0.01), M.black, 0, 0.62, 0.08));
      for (let i = 0; i < 5; i++) c.add(mesh(new T.BoxGeometry(0.06, 0.11, 0.005), M.run, 0.32 - i * 0.12, 0.62, 0.1));
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
        const yellow = r === 4 && k === 3, key = mesh(cylZ(0.085, 0.06, 28), yellow ? M.yellow : (k === 3 ? M.alu : M.cream), -0.39 + k * 0.26, 0.24 - r * 0.24, 0.1);
        c.add(key);
      }
      c.rotation.x = -0.75; g.add(c);
      return { g, scale: 0.95, base: -0.35, sway: 0.28, tiltX: 0.1 };
    },
    turntable() {
      const g = new T.Group();
      g.add(mesh(rbox(2.1, 0.32, 1.45, 0.08, 0.03), M.cream, 0, -0.2, 0));
      const plat = new T.Group(); plat.position.set(-0.3, -0.02, 0);
      plat.add(mesh(cylY(0.62, 0.05, 64), M.alu));
      plat.add(mesh(cylY(0.58, 0.02, 64), M.vinyl, 0, 0.035, 0));
      plat.add(mesh(cylY(0.18, 0.025, 32), M.yellow, 0, 0.045, 0));
      plat.add(mesh(new T.BoxGeometry(0.08, 0.026, 0.02), M.black, 0.08, 0.06, 0));
      g.add(plat);
      const arm = new T.Group(); arm.position.set(0.72, 0.02, -0.42);
      arm.add(mesh(cylY(0.06, 0.08, 20), M.alu));
      const rod = mesh(new T.BoxGeometry(0.03, 0.03, 0.95), M.alu, -0.12, 0.08, 0.4); rod.rotation.y = 0.4; arm.add(rod);
      arm.add(mesh(new T.BoxGeometry(0.08, 0.04, 0.12), M.black, -0.32, 0.07, 0.83));
      g.add(arm);
      g.add(mesh(cylY(0.05, 0.04, 16), M.graphite, 0.75, -0.02, 0.5)); g.add(mesh(cylY(0.05, 0.04, 16), M.graphite, 0.9, -0.02, 0.5));
      return { g, scale: 0.9, base: -0.3, sway: 0.25, tiltX: 0.42, spin: plat };
    },
    dial() {
      const g = new T.Group();
      g.add(mesh(rbox(1.75, 1.75, 0.14, 0.2), M.cream));
      for (let t = 16; t <= 30; t++) {
        const a = (t - 23) / 7 * (Math.PI * 0.75), big = t % 2 === 0;
        const m = mesh(new T.BoxGeometry(big ? 0.022 : 0.012, big ? 0.1 : 0.06, 0.01), M.graphite, Math.sin(a) * 0.78, Math.cos(a) * 0.78, 0.075);
        m.rotation.z = -a; g.add(m);
      }
      const knob = new T.Group(); knob.position.z = 0.07;
      knob.add(mesh(cylZ(0.6, 0.34, 64), M.alu, 0, 0, 0.17));
      knob.add(mesh(cylZ(0.5, 0.02, 64), M.cream2, 0, 0, 0.345));
      knob.add(mesh(new T.BoxGeometry(0.05, 0.3, 0.02), M.yellow, 0, 0.3, 0.36));
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r = mesh(new T.BoxGeometry(0.03, 0.02, 0.3), M.cream2, Math.sin(a) * 0.6, Math.cos(a) * 0.6, 0.17); r.rotation.z = -a; knob.add(r); }
      g.add(knob);
      let cur = null;
      const tick = (el) => {
        const v = +(el.dataset.value || 24), target = -(v - 23) / 7 * (Math.PI * 0.75);
        cur = cur == null || REDUCED ? target : cur + (target - cur) * 0.25;
        knob.rotation.z = cur;
      };
      return { g, scale: 0.98, tick, base: -0.22, sway: 0.16, tiltX: 0.06 };
    },
    desk() {
      const g = new T.Group(), k = new T.Group();
      k.add(mesh(rbox(1.95, 0.68, 0.12, 0.06, 0.02), M.cream));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
        if (r === 3 && c > 2 && c < 9) continue;
        k.add(mesh(rbox(0.125, 0.125, 0.06, 0.025, 0.01), r === 0 && c === 0 ? M.yellow : (c > 9 ? M.alu : M.graphite), -0.8 + c * 0.145, 0.22 - r * 0.145, 0.08));
      }
      k.add(mesh(rbox(0.85, 0.125, 0.06, 0.025, 0.01), M.graphite, 0.07, 0.22 - 3 * 0.145, 0.08));
      k.rotation.x = -1.25; k.position.set(-0.25, -0.15, 0); g.add(k);
      const m = mesh(new T.SphereGeometry(0.3, 32, 20), M.cream, 1.05, -0.2, 0.12); m.scale.set(0.72, 0.38, 1.12); g.add(m);
      g.add(mesh(new T.BoxGeometry(0.012, 0.012, 0.16), M.graphite, 1.05, -0.1, -0.06));
      return { g, scale: 1.08, base: -0.3, sway: 0.24, tiltX: 0.2 };
    },
    laptop(led = 'run') {
      const g = new T.Group();
      g.add(mesh(rbox(1.8, 0.08, 1.2, 0.06, 0.02), M.alu, 0, -0.42, 0));
      g.add(mesh(new T.BoxGeometry(1.5, 0.012, 0.55), M.graphite, 0, -0.375, -0.14));
      g.add(mesh(new T.BoxGeometry(0.55, 0.012, 0.3), M.cream2, 0, -0.375, 0.34));
      const lid = new T.Group(); lid.position.set(0, -0.38, -0.58); lid.rotation.x = -0.24;
      lid.add(mesh(rbox(1.8, 1.12, 0.05, 0.06, 0.015), M.alu, 0, 0.56, 0));
      lid.add(mesh(new T.PlaneGeometry(1.62, 0.96), M.black, 0, 0.57, 0.03));
      const l = lamp(led, 0.03); l.position.set(0.8, 0.04, 0.04); lid.add(l);
      g.add(lid);
      return { g, scale: 0.9, base: -0.45, sway: 0.24, tiltX: 0.22 };
    },
    tower(led = 'run') {
      const g = new T.Group();
      g.add(mesh(rbox(0.7, 1.7, 1.25, 0.08, 0.025), M.cream));
      g.add(holes({ w: 0.5, h: 0.9, pitch: 0.075, r: 0.022, y: 0.25, z: 0.625 }));
      const l = lamp(led, 0.045); l.position.set(0, -0.55, 0.63); g.add(l);
      g.add(mesh(cylZ(0.07, 0.04, 24), M.alu, 0, -0.7, 0.63));
      return { g, scale: 0.9, base: -0.55, sway: 0.24, tiltX: 0.15 };
    },
    rack(led = 'run') {
      const g = new T.Group();
      g.add(mesh(rbox(1.3, 1.6, 1.05, 0.08, 0.025), M.graphite));
      for (let i = 0; i < 4; i++) {
        const y = 0.54 - i * 0.36;
        g.add(mesh(rbox(1.14, 0.28, 0.06, 0.04, 0.01), M.cream, 0, y, 0.53));
        g.add(holes({ w: 0.5, h: 0.16, pitch: 0.06, r: 0.017, x: -0.22, y, z: 0.565 }));
        const l = lamp(i === 1 ? led : 'run', 0.035); l.position.set(0.45, y, 0.57); g.add(l);
      }
      return { g, scale: 0.9, base: -0.5, sway: 0.24, tiltX: 0.15 };
    },
  };

  /* ---------------------------------------------------------------- stage */
  const canvas = document.getElementById('stage');
  let R;
  try { R = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return off(); }
  R.setClearColor(0x000000, 0); R.autoClear = false;
  const slots = new WeakMap();
  let phase = 0;

  function build(el) {
    const f = B[el.dataset.obj]; if (!f) return null;
    const o = f(el.dataset.led || 'run'), scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xfff8ec, 0x1a1816, 1.9));
    const key = new T.DirectionalLight(0xfff4e2, 2.6); key.position.set(-3, 5, 4); scene.add(key);
    const rim = new T.DirectionalLight(0xdfe6ff, 1.1); rim.position.set(3, 2, -4); scene.add(rim);
    const pivot = new T.Group(); pivot.add(o.g); pivot.scale.setScalar(o.scale || 1); pivot.rotation.x = o.tiltX ?? 0.16; scene.add(pivot);
    const cam = new T.PerspectiveCamera(22, 1, 0.1, 50); cam.position.set(0, 0.5, 7.4); cam.lookAt(0, 0, 0);
    return { scene, cam, pivot, tick: o.tick, spin: o.spin, base: o.base ?? -0.45, sway: o.sway ?? 0.28, ph: (phase += 1.9) };
  }

  function layer() {
    const idle = document.getElementById('idle'); if (!idle.hidden) return { root: idle, clip: null };
    const pal = document.getElementById('palette'); if (!pal.hidden) return { root: pal, clip: null };
    const sh = document.getElementById('sheet'); if (!sh.hidden) return { root: sh, clip: document.getElementById('sheetbody').getBoundingClientRect() };
    const dock = document.getElementById('dock');
    const dockTop = dock && getComputedStyle(dock).display !== 'none' ? dock.querySelector('.miniplayer').getBoundingClientRect().top : innerHeight;
    return { root: document.getElementById('main'), clip: { top: 0, left: 0, right: innerWidth, bottom: dockTop } };
  }

  let W = 0, H = 0, spinA = 0, lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const w = innerWidth, h = innerHeight;
    if (w !== W || h !== H) { W = w; H = h; R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.setSize(w, h, false); }
    R.setScissorTest(false); R.clear(); R.setScissorTest(true);
    const { root, clip } = layer(), t = now / 1000, dt = Math.min(0.1, t - lastT); lastT = t;
    if (window.MUSIC_PLAYING && !REDUCED) spinA += dt * (33.3 / 60) * Math.PI * 2;
    root.querySelectorAll('[data-obj]').forEach(el => {
      let s = slots.get(el);
      if (s === undefined) { s = build(el); slots.set(el, s); }
      if (!s) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) return;
      const c = clip || { top: 0, left: 0, right: w, bottom: h };
      const L2 = Math.max(r.left, c.left), T2 = Math.max(r.top, c.top), R2 = Math.min(r.right, c.right), B2 = Math.min(r.bottom, c.bottom);
      if (R2 <= L2 || B2 <= T2) return;
      s.pivot.rotation.y = REDUCED ? s.base : s.base + Math.sin(t * 0.32 + s.ph) * s.sway;
      if (s.tick) s.tick(el);
      if (s.spin) s.spin.rotation.y = -spinA;
      s.cam.aspect = r.width / r.height;
      s.cam.zoom = s.cam.aspect < 1 ? s.cam.aspect : 1; // fit narrow slots by width
      s.cam.updateProjectionMatrix();
      R.setViewport(r.left, h - r.bottom, r.width, r.height);
      R.setScissor(L2, h - B2, R2 - L2, B2 - T2);
      R.render(s.scene, s.cam);
    });
  }
  requestAnimationFrame(frame);
  window.Stage = { scan() {} };
})();
