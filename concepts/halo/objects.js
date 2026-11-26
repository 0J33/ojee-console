/* Halo objects: the Wireframe builders, drawn two ways. In "wire" every part is a
   depth-only occluder plus its edges in light; in "chrome" the same parts are liquid metal
   that reflects a studio with the tile's own hue in it, so the object picks up its halo.
   The concept switch sets window.OBJ_MODE and calls Stage.rebuild().

   Wireframe objects. Every part is two things: an invisible occluder that only writes
   depth, and its edges drawn in light. The occluders give hidden-line removal, which is
   what makes line art read as an object instead of a tangle. Colour is spent only on
   what is really coloured (the SNXS79's lume and its day-date wheel, a lit lamp, a lit
   key) and on state.
   One WebGL canvas covers the window; each [data-obj] slot is scissored into its own
   rectangle and clipped to the layer on top, so there is one GL context in total. */
(function () {
  const T = window.THREE;
  const off = () => { document.documentElement.classList.add('obj-fallback'); window.Stage = { scan() {} }; };
  if (!T) return off();
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COL = { line: 0xE9EEF3, mid: 0xA9B2BC, dim: 0x5A646E, accent: 0x5FE6EC, ok: 0x3DDC97, warn: 0xF5B841, err: 0xFF5A5F, lume: 0x5FE6EC, key: 0x00FFFF };
  const lineMats = new Map();
  const LINE = (c = COL.line, o = 0.85) => { const k = c + ':' + o; if (!lineMats.has(k)) lineMats.set(k, new T.LineBasicMaterial({ color: c, transparent: true, opacity: o })); return lineMats.get(k); };
  const OCC = new T.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 1.5 });
  const V = (x, y, z = 0) => new T.Vector3(x, y, z);

  /* chrome: an equirect studio (soft boxes, a horizon line, and a band of the tile's hue),
     prefiltered once per hue */
  let CH = false, HUE = '255,255,255';
  const envs = new Map(), chromes = new Map();
  function envFor(hue) {
    if (envs.has(hue)) return envs.get(hue);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#3a3c42'); g.addColorStop(0.42, '#0d0e11'); g.addColorStop(0.5, '#050506'); g.addColorStop(1, '#020203'); x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    const box = (bx, by, bw, bh, a, col = '255,255,255') => { const r = x.createRadialGradient(bx + bw / 2, by + bh / 2, 0, bx + bw / 2, by + bh / 2, Math.max(bw, bh) / 1.4); r.addColorStop(0, `rgba(${col},${a})`); r.addColorStop(0.6, `rgba(${col},${a * 0.85})`); r.addColorStop(1, `rgba(${col},0)`); x.fillStyle = r; x.fillRect(bx - bw * 0.3, by - bh * 0.3, bw * 1.6, bh * 1.6); };
    box(180, 40, 260, 90, 1); box(640, 70, 200, 60, 0.85); box(860, 150, 120, 120, 0.5);
    x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(0, 248, 1024, 5);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 236, 1024, 2);
    const hb = x.createLinearGradient(0, 300, 0, 420); hb.addColorStop(0, `rgba(${hue},0)`); hb.addColorStop(0.5, `rgba(${hue},.9)`); hb.addColorStop(1, `rgba(${hue},0)`); x.fillStyle = hb; x.fillRect(0, 300, 1024, 120);
    box(420, 330, 260, 60, 0.6, hue);
    const tex = new T.CanvasTexture(c); tex.mapping = T.EquirectangularReflectionMapping; tex.colorSpace = T.SRGBColorSpace;
    const pm = new T.PMREMGenerator(R); const rt = pm.fromEquirectangular(tex); pm.dispose(); tex.dispose();
    envs.set(hue, rt.texture); return rt.texture;
  }
  function chromeMat(rough = 0.16, col = 0xffffff) {
    const k = HUE + ':' + rough + ':' + col;
    if (!chromes.has(k)) chromes.set(k, new T.MeshStandardMaterial({ color: col, metalness: 1, roughness: rough, envMap: envFor(HUE), envMapIntensity: 1.15 }));
    return chromes.get(k);
  }
  const BODY = () => CH ? chromeMat() : OCC;

  function part(geo, c = COL.line, o = 0.85, thresh = 28) {
    thresh = Math.min(thresh, 14);
    const g = new T.Group();
    if (CH) { geo.computeVertexNormals(); g.add(new T.Mesh(geo, chromeMat())); return g; }
    g.add(new T.Mesh(geo, OCC));
    g.add(new T.LineSegments(new T.EdgesGeometry(geo, thresh), LINE(c, o)));
    return g;
  }
  const at = (obj, x = 0, y = 0, z = 0) => { obj.position.set(x, y, z); return obj; };
  const fill = (geo, c, o = 1) => new T.Mesh(geo, new T.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o }));
  const poly = (pts, c = COL.line, o = 0.85, loop = false) => { const g = new T.BufferGeometry().setFromPoints(pts); return loop ? new T.LineLoop(g, LINE(c, o)) : new T.Line(g, LINE(c, o)); };
  const segs = (pts, c = COL.line, o = 0.6) => new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), LINE(c, o));
  const ring = (r, c = COL.line, o = 0.6, z = 0, seg = 96) => { const p = []; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; p.push(V(Math.cos(a) * r, Math.sin(a) * r, z)); } return poly(p, c, o, true); };
  const disc = (r, c, o, z = 0, seg = 32) => at(fill(new T.CircleGeometry(r, seg), c, o), 0, 0, z);

  function rrect(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  const rrectPts = (w, h, r, z = 0, seg = 6) => rrect(w, h, r).getPoints(seg).map(p => V(p.x, p.y, z));
  function rbox(w, h, d, r = 0.1) {
    const g = new T.ExtrudeGeometry(rrect(w, h, r), { depth: d, bevelEnabled: false, curveSegments: CH ? 10 : 3 }); g.center(); return g;
  }
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cylZ = (r, d, seg = 48) => { const g = new T.CylinderGeometry(r, r, d, seg); g.rotateX(Math.PI / 2); return g; };

  /* ================================================================ the watch
     Seiko 5 SNXS79 on a 7S26, from the measurements in public/movement/calibre.js:
     37 mm case, 43 mm lug to lug, 19 mm between the lugs, crown at four, a dark
     sunburst dial, applied batons with a double baton at twelve and none at three,
     baton hands with lume down the middle, and a white day-date wheel at three
     printed black with SAT in blue and SUN in red, in English or Arabic.
     No name is printed on it: the shape is the reference. */
  const MM = 1.49 / 18.5;
  const CASE_R = 1.49, DIAL_R = 14.7 * MM, TRACK = DIAL_R * 0.91;
  const DAYS = { en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] };
  const DAY_INK = ['#D0202A', '#141414', '#141414', '#141414', '#141414', '#141414', '#1F4FA8'];

  function watch() {
    const g = new T.Group();
    // case and bezel: a lathe profile from the caseback round to the bezel's aperture
    const prof = [[0, -0.46], [1.12, -0.46], [1.32, -0.4], [1.47, -0.24], [CASE_R, -0.08], [CASE_R, 0.1], [1.43, 0.22], [1.31, 0.31], [DIAL_R + 0.02, 0.33], [DIAL_R, 0.29]]
      .map(([r, z]) => new T.Vector2(r, z));
    const lathe = new T.LatheGeometry(prof, 120); lathe.rotateX(Math.PI / 2);
    g.add(part(lathe, COL.line, 0.75, 12));
    // lugs: the case flank keeps going, 43 mm tip to tip
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const lug = part(rbox(0.25, 0.74, 0.36, 0.06), COL.line, 0.7, 28);
      lug.position.set(sx * 0.89, sy * 1.38, -0.06); lug.rotation.x = sy * 0.12; g.add(lug);
    }
    // the bracelet: end link, then three-piece links fading away
    for (const sy of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = sy * (1.86 + i * 0.33), o = 0.62 - i * 0.14;
      g.add(at(part(rbox(1.5, 0.28, 0.22, 0.05), COL.mid, o, 28), 0, y, -0.12 - i * 0.03));
      g.add(segs([V(-0.27, y - 0.14, -0.005 - i * 0.03), V(-0.27, y + 0.14, -0.005 - i * 0.03), V(0.27, y - 0.14, -0.005 - i * 0.03), V(0.27, y + 0.14, -0.005 - i * 0.03)], COL.mid, o * 0.7));
    }
    // crown at four
    const ca = -Math.PI / 6, crown = part(rbox(0.3, 0.24, 0.3, 0.05), COL.line, 0.8, 30);
    { const kn = []; for (let i = 0; i < 6; i++) { const x = -0.1 + i * 0.04; kn.push(V(x, -0.12, 0.151), V(x, 0.12, 0.151)); } crown.add(segs(kn, COL.line, 0.35)); }
    crown.position.set(Math.cos(ca) * 1.6, Math.sin(ca) * 1.6, -0.04); crown.rotation.z = ca; g.add(crown);

    const face = new T.Group(); face.position.z = 0.2; g.add(face);
    face.add(new T.Mesh(new T.CircleGeometry(DIAL_R, 96), CH ? chromeMat(0.42, 0x1b2230) : OCC));
    // sunburst: faint rays, a finish rather than content
    const rays = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; rays.push(V(Math.cos(a) * DIAL_R * 0.22, Math.sin(a) * DIAL_R * 0.22, 0.001), V(Math.cos(a) * DIAL_R * 0.95, Math.sin(a) * DIAL_R * 0.95, 0.001)); }
    face.add(segs(rays, COL.line, 0.06));
    face.add(ring(DIAL_R * 0.985, COL.line, 0.35, 0.002));
    face.add(ring(TRACK * 1.03, COL.line, 0.18, 0.002));
    // minute track
    const ticks = []; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, len = TRACK * (i % 5 === 0 ? 0.073 : 0.039); ticks.push(V(Math.cos(a) * TRACK, Math.sin(a) * TRACK, 0.003), V(Math.cos(a) * (TRACK - len), Math.sin(a) * (TRACK - len), 0.003)); }
    face.add(segs(ticks, COL.line, 0.6));
    // applied batons with lume
    const IN = TRACK * 0.685, OUT = TRACK * 0.955, BAR = TRACK * 0.125, len = OUT - IN, mid = (OUT + IN) / 2;
    const baton = (a, w, offs) => {
      const b = new T.Group(); b.rotation.z = a;
      b.add(at(poly(rrectPts(len, w, w * 0.18, 0, 2), COL.line, 0.9, true), mid, offs, 0.006));
      b.add(at(fill(new T.PlaneGeometry(len * 0.74, w * 0.46), COL.lume, 0.7), mid, offs, 0.007));
      face.add(b);
    };
    for (let i = 0; i < 12; i++) {
      if (i === 3) continue; // the day-date sits at three
      const a = Math.PI / 2 - i / 12 * Math.PI * 2;
      if (i === 0) { baton(a, TRACK * 0.084, TRACK * 0.058); baton(a, TRACK * 0.084, -TRACK * 0.058); } else baton(a, BAR, 0);
    }
    // the day-date window, 2.73 : 1, day on 56 %
    const winW = TRACK * 0.74, winH = winW / 2.73, DAY_PANE = 0.56;
    const cv = document.createElement('canvas'); cv.width = 1092; cv.height = 400;
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const win = new T.Group(); win.position.set(TRACK * 0.66, 0, 0.004); face.add(win);
    win.add(new T.Mesh(new T.PlaneGeometry(winW, winH), new T.MeshBasicMaterial({ map: tex })));
    win.add(poly(rrectPts(winW + 0.02, winH + 0.02, winH * 0.22, 0.002), COL.line, 0.95, true));
    win.add(poly(rrectPts(winW + 0.07, winH + 0.07, winH * 0.3, 0.001), COL.line, 0.4, true));
    let printedKey = '';
    const fit = (ctx, text, font, maxW, maxH, rtl) => {
      let size = maxH; ctx.font = `${size}px ${font}`;
      const m = ctx.measureText(text); const w = m.width; if (w > maxW) size *= maxW / w;
      ctx.font = `${size}px ${font}`; ctx.direction = rtl ? 'rtl' : 'ltr'; return size;
    };
    const print = (lang, day, date) => {
      const k = lang + day + date + (document.fonts ? document.fonts.status : ''); if (k === printedKey) return; printedKey = k;
      const c = cv.getContext('2d'), W = cv.width, H = cv.height, split = W * DAY_PANE;
      c.fillStyle = '#F2F1EC'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#9a9a96'; c.fillRect(split - 3, 0, 6, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = DAY_INK[day];
      if (lang === 'ar') { fit(c, DAYS.ar[day], "'Wheel Arabic', serif", split * 0.84, H * 0.62, true); c.fillText(DAYS.ar[day], split / 2, H * 0.52); }
      else { fit(c, DAYS.en[day], "'Wheel Day', sans-serif", split * 0.84, H * 0.58); c.fillText(DAYS.en[day], split / 2, H * 0.54); }
      c.direction = 'ltr'; c.fillStyle = '#141414';
      fit(c, String(date), "'Wheel Num', 'Wheel Day', sans-serif", (W - split) * 0.78, H * 0.58); c.fillText(String(date), split + (W - split) / 2, H * 0.54);
      tex.needsUpdate = true;
    };
    if (document.fonts) document.fonts.load("40px 'Wheel Day'").then(() => document.fonts.load("40px 'Wheel Num'")).then(() => document.fonts.load("40px 'Wheel Arabic'", 'الأحد')).then(() => { printedKey = ''; }).catch(() => {});

    // hands: batons with a body that hides what they cross, lume down the middle
    const hand = (L, w, z) => {
      const tail = L * 0.09, pts = [V(-tail, -w * 0.4), V(L * 0.12, -w), V(L * 0.86, -w * 0.86), V(L, -w * 0.16), V(L, w * 0.16), V(L * 0.86, w * 0.86), V(L * 0.12, w), V(-tail, w * 0.4)];
      const h = new T.Group(); h.position.z = z;
      h.add(new T.Mesh(new T.ShapeGeometry(new T.Shape(pts.map(p => new T.Vector2(p.x, p.y)))), BODY()));
      h.add(poly(pts.map(p => V(p.x, p.y, 0.001)), COL.line, 0.95, true));
      h.add(at(fill(new T.PlaneGeometry(L * 0.56, w * 0.9), COL.lume, 0.75), L * 0.51, 0, 0.002));
      face.add(h); return h;
    };
    const hh = hand(TRACK * 0.65, TRACK * 0.058, 0.02), mh = hand(TRACK * 0.94, TRACK * 0.048, 0.03);
    const sec = new T.Group(); sec.position.z = 0.04; const sl = TRACK * 0.97;
    sec.add(poly([V(-sl * 0.16, 0), V(sl, 0)], COL.line, 1));
    sec.add(poly([V(-sl * 0.16, 0), V(-sl * 0.13, -0.03), V(-sl * 0.045, -0.02), V(-sl * 0.045, 0.02), V(-sl * 0.13, 0.03)], COL.line, 0.9, true));
    face.add(sec);
    face.add(at(fill(new T.CircleGeometry(0.045, 20), COL.line, 1), 0, 0, 0.05));

    const tick = () => {
      const d = new Date(Date.now() + (window.CLOCK_OFFSET || 0));
      // 21,600 beats an hour: the seconds hand steps six times a second
      const s = d.getSeconds() + d.getMilliseconds() / 1000, s6 = REDUCED ? Math.floor(s) : Math.floor(s * 6) / 6;
      const m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      sec.rotation.z = Math.PI / 2 - s6 / 60 * Math.PI * 2; mh.rotation.z = Math.PI / 2 - m / 60 * Math.PI * 2; hh.rotation.z = Math.PI / 2 - h / 12 * Math.PI * 2;
      print(window.DAY_LANG === 'ar' ? 'ar' : 'en', d.getDay(), d.getDate());
    };
    return { g, tick, fit: 2.0, base: 0, sway: 0.22, tiltX: 0.06 };
  }

  /* ================================================================ the others */
  const B = {
    watch,
    ac(el) { // the wall split unit; its flap opens when the AC is on, and air runs
      const g = new T.Group();
      g.add(part(rbox(2.4, 0.74, 0.62, 0.16), COL.line, 0.8, 30));
      const vents = []; for (let i = 0; i < 18; i++) { const x = -1.0 + i * 0.118; vents.push(V(x, 0.37, -0.2), V(x, 0.37, 0.2)); } g.add(segs(vents, COL.mid, 0.35));
      g.add(at(poly(rrectPts(0.36, 0.13, 0.03), COL.accent, 0.9, true), 0.78, 0.12, 0.312));
      for (let i = 0; i < 3; i++) g.add(at(fill(new T.PlaneGeometry(0.06, 0.06), COL.accent, 0.85), 0.68 + i * 0.1, 0.12, 0.313));
      const flap = new T.Group(); flap.position.set(0, -0.3, 0.3); g.add(flap);
      flap.add(at(part(box(2.1, 0.05, 0.22), COL.line, 0.8, 30), 0, 0, -0.11));
      const air = []; for (let i = 0; i < 5; i++) {
        const x = -0.8 + i * 0.4, pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(V(x + Math.sin(t * 3 + i) * 0.06, -0.42 - t * 0.9, 0.42 + t * 0.55)); }
        const geo = new T.BufferGeometry().setFromPoints(pts); const ln = new T.Line(geo, new T.LineDashedMaterial({ color: COL.accent, dashSize: 0.08, gapSize: 0.08, transparent: true, opacity: 0.6 })); ln.computeLineDistances(); air.push(ln); g.add(ln);
      }
      let cur = 0;
      const tick = (el2, t) => {
        const on = (el2.dataset.on || 'true') === 'true';
        cur += ((on ? 1 : 0) - cur) * 0.08;
        flap.rotation.x = cur * 0.7;
        air.forEach((a, i) => { a.visible = cur > 0.2; a.material.opacity = 0.6 * cur; a.material.dashOffset = REDUCED ? 0 : -t * 0.35 - i * 0.05; });
      };
      return { g, tick, fit: 1.35, base: -0.35, sway: 0.2, tiltX: 0.18 };
    },
    dial(el) { // a rotary encoder: the setpoint as an angle, its arc lit
      const g = new T.Group();
      g.add(part(cylZ(1.25, 0.12, 96), COL.dim, 0.6, 12));
      const tk = []; for (let t = 16; t <= 30; t++) { const a = Math.PI / 2 + (23 - t) / 7 * Math.PI * 0.75, big = t % 2 === 0, r1 = 1.12, r2 = big ? 0.98 : 1.04; tk.push(V(Math.cos(a) * r1, Math.sin(a) * r1, 0.07), V(Math.cos(a) * r2, Math.sin(a) * r2, 0.07)); }
      g.add(segs(tk, COL.line, 0.7));
      const knob = new T.Group(); g.add(knob);
      knob.add(part(cylZ(0.78, 0.36, 72), COL.line, 0.85, 12).translateZ(0.2));
      const kn = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; kn.push(V(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.04), V(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.36)); } knob.add(segs(kn, COL.line, 0.18));
      knob.add(ring(0.62, COL.line, 0.3, 0.385));
      knob.add(at(fill(new T.PlaneGeometry(0.05, 0.36), COL.accent, 1), 0, 0.5, 0.39));
      let arc = null, cur = null;
      const tick = (el2) => {
        const v = +(el2.dataset.value || 24), target = (23 - v) / 7 * Math.PI * 0.75;
        cur = cur == null || REDUCED ? target : cur + (target - cur) * 0.25; knob.rotation.z = cur;
        if (arc) g.remove(arc);
        const a0 = Math.PI / 2 + Math.PI * 0.75, a1 = Math.PI / 2 + cur, pts = []; const n = 48;
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(V(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0.075)); }
        arc = poly(pts, COL.accent, 0.95); g.add(arc);
      };
      return { g, tick, fit: 1.35, base: -0.2, sway: 0.14, tiltX: 0.08 };
    },
    router() { // the white Huawei 5G CPE: a tall rounded column, three lamps
      const g = new T.Group();
      g.add(part(rbox(0.95, 2.0, 0.95, 0.22), COL.line, 0.8, 30));
      g.add(at(part(rbox(0.98, 0.08, 0.98, 0.24), COL.mid, 0.5, 30), 0, 1.02, 0));
      const sl = []; for (let i = 0; i < 9; i++) { const y = 0.75 - i * 0.05; sl.push(V(-0.3, y, 0.476), V(0.3, y, 0.476)); } g.add(segs(sl, COL.mid, 0.3));
      [COL.accent, COL.warn, COL.dim].forEach((c, i) => g.add(at(fill(new T.CircleGeometry(0.035, 16), c, c === COL.dim ? 0.5 : 1), 0, -0.35 - i * 0.14, 0.477)));
      g.add(ring(0.62, COL.dim, 0.5, 0).rotateX(Math.PI / 2).translateZ(1.0));
      return { g, fit: 1.25, base: -0.5, sway: 0.25, tiltX: 0.18 };
    },
    fleet(el) {
      const g = new T.Group(), led = el.dataset.led || 'run';
      [-0.68, 0, 0.68].forEach((x, i) => {
        const h = i === 1 ? 1.6 : 1.4, y = (h - 1.6) / 2;
        g.add(at(part(rbox(0.56, h, 1.0, 0.06), COL.line, 0.8, 30), x, y, 0));
        const s = []; for (let k = 0; k < 4; k++) { const yy = y + h / 2 - 0.25 - k * 0.12; s.push(V(x - 0.18, yy, 0.502), V(x + 0.18, yy, 0.502)); } g.add(segs(s, COL.mid, 0.4));
        const c = i === 2 ? (led === 'stop' ? COL.err : COL.ok) : COL.ok;
        g.add(at(fill(new T.CircleGeometry(0.04, 14), c, 1), x + 0.16, y - h / 2 + 0.16, 0.503));
      });
      return { g, fit: 1.3, base: -0.5, sway: 0.22, tiltX: 0.2 };
    },
    monitor() {
      const g = new T.Group();
      g.add(at(part(rbox(2.2, 1.35, 0.1, 0.06), COL.line, 0.85, 30), 0, 0.3, 0));
      g.add(at(poly(rrectPts(2.04, 1.19, 0.03, 0.051), COL.mid, 0.4, true), 0, 0.3, 0));
      g.add(at(poly(rrectPts(0.9, 0.55, 0.03, 0.052), COL.accent, 0.7, true), -0.45, 0.42, 0));
      g.add(at(poly(rrectPts(0.7, 0.42, 0.03, 0.052), COL.line, 0.45, true), 0.45, 0.12, 0));
      g.add(at(part(box(0.12, 0.6, 0.1), COL.mid, 0.6), 0, -0.6, -0.1));
      g.add(at(part(rbox(0.9, 0.06, 0.5, 0.12), COL.mid, 0.6, 30), 0, -0.92, -0.1));
      return { g, fit: 1.3, base: -0.4, sway: 0.24, tiltX: 0.12 };
    },
    chip() {
      const g = new T.Group(), c = new T.Group(); c.rotation.x = -0.9; g.add(c);
      c.add(part(rbox(1.5, 1.5, 0.14, 0.08), COL.line, 0.8, 30));
      c.add(at(part(rbox(0.74, 0.74, 0.08, 0.04), COL.line, 0.9, 30), 0, 0, 0.1));
      c.add(at(poly(rrectPts(0.42, 0.42, 0.02, 0.141), COL.accent, 0.9, true), 0, 0, 0));
      const grid = []; for (let i = 1; i < 4; i++) { const p = -0.21 + i * 0.105; grid.push(V(p, -0.21, 0.142), V(p, 0.21, 0.142), V(-0.21, p, 0.142), V(0.21, p, 0.142)); } c.add(segs(grid, COL.accent, 0.35));
      const pins = []; for (let i = 0; i < 9; i++) { const p = -0.6 + i * 0.15; for (const [a, b] of [[p, 0.75], [p, -0.75], [0.75, p], [-0.75, p]]) { const ax = Math.abs(a) === 0.75; pins.push(V(a, b, 0), V(ax ? a + Math.sign(a) * 0.18 : a, ax ? b : b + Math.sign(b) * 0.18, 0)); } } c.add(segs(pins, COL.line, 0.6));
      const tr = [V(0.37, 0.15, 0.072), V(0.55, 0.15, 0.072), V(0.62, 0.3, 0.072), V(0.75, 0.3, 0.072)]; c.add(poly(tr, COL.accent, 0.6)); c.add(poly(tr.map(p => V(-p.x, -p.y, p.z)), COL.accent, 0.6));
      return { g, fit: 1.25, base: -0.35, sway: 0.28, tiltX: 0.1 };
    },
    player() { // the Snowsky Echo Mini: black body, cassette window, red power key
      const g = new T.Group();
      g.add(part(rbox(1.25, 1.9, 0.32, 0.12), COL.line, 0.85, 30));
      g.add(at(poly(rrectPts(1.0, 0.72, 0.06, 0.161), COL.line, 0.55, true), 0, 0.45, 0));
      const reels = [];
      [-0.24, 0.24].forEach(x => { const r = new T.Group(); r.position.set(x, 0.45, 0.162); r.add(ring(0.16, COL.accent, 0.85)); const sp = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; sp.push(V(Math.cos(a) * 0.05, Math.sin(a) * 0.05), V(Math.cos(a) * 0.13, Math.sin(a) * 0.13)); } r.add(segs(sp, COL.accent, 0.6)); g.add(r); reels.push(r); });
      g.add(at(poly(rrectPts(0.6, 0.06, 0.02, 0.162), COL.mid, 0.5, true), 0, 0.2, 0));
      for (let i = 0; i < 5; i++) g.add(at(poly(rrectPts(0.16, 0.12, 0.03, 0.162), i === 2 ? COL.line : COL.mid, i === 2 ? 0.9 : 0.5, true), -0.4 + i * 0.2, -0.35, 0));
      g.add(at(part(rbox(0.06, 0.2, 0.08, 0.02), COL.err, 1, 30), 0.65, 0.6, 0));
      g.add(at(fill(new T.PlaneGeometry(0.03, 0.16), COL.err, 1), 0.661, 0.6, 0).rotateY(Math.PI / 2));
      const tick = (el, t) => { if (window.MUSIC_PLAYING && !REDUCED) reels.forEach(r => { r.rotation.z = -t * 2.4; }); };
      return { g, tick, fit: 1.25, base: -0.35, sway: 0.25, tiltX: 0.12 };
    },
    desk() { // the R86 HE lit #00ffff on every key, and the V5
      const g = new T.Group(), k = new T.Group(); k.rotation.x = -1.15; k.position.set(-0.3, -0.05, 0); g.add(k);
      k.add(part(rbox(2.1, 0.78, 0.12, 0.06), COL.line, 0.8, 30));
      const keys = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) { if (r === 4 && c > 3 && c < 10) continue; keys.push(...rrectPts(0.11, 0.11, 0.02, 0.07, 1).map((p, i, a) => [p, a[(i + 1) % a.length]]).flat().map(p => V(p.x - 0.92 + c * 0.142, p.y + 0.29 - r * 0.142, p.z))); }
      keys.push(...rrectPts(0.83, 0.11, 0.02, 0.07, 1).map((p, i, a) => [p, a[(i + 1) % a.length]]).flat().map(p => V(p.x - 0.92 + 6.5 * 0.142, p.y + 0.29 - 4 * 0.142, p.z)));
      k.add(segs(keys, COL.key, 0.55));
      const m = part(new T.SphereGeometry(0.32, 12, 8), COL.line, 0.55, 1); m.scale.set(0.7, 0.36, 1.1); m.position.set(1.15, -0.25, 0.1); g.add(m);
      return { g, fit: 1.2, base: -0.3, sway: 0.24, tiltX: 0.18 };
    },
    laptop(el) {
      const g = new T.Group(), led = el.dataset.led || 'run';
      g.add(at(part(rbox(1.9, 0.07, 1.25, 0.06), COL.line, 0.8, 30), 0, -0.45, 0));
      const kb = []; for (let r = 0; r < 4; r++) kb.push(V(-0.7, -0.41, -0.35 + r * 0.1), V(0.7, -0.41, -0.35 + r * 0.1)); g.add(segs(kb, COL.mid, 0.3));
      g.add(at(poly(rrectPts(0.55, 0.3, 0.03), COL.mid, 0.4, true), 0, -0.41, 0.33).rotateX(-Math.PI / 2));
      const lid = new T.Group(); lid.position.set(0, -0.41, -0.6); lid.rotation.x = -0.25; g.add(lid);
      lid.add(at(part(rbox(1.9, 1.18, 0.05, 0.06), COL.line, 0.85, 30), 0, 0.59, 0));
      lid.add(at(poly(rrectPts(1.72, 1.0, 0.02, 0.026), COL.mid, 0.4, true), 0, 0.6, 0));
      lid.add(at(fill(new T.CircleGeometry(0.03, 12), led === 'stop' ? COL.err : COL.ok, 1), 0.8, 0.08, 0.027));
      return { g, fit: 1.2, base: -0.45, sway: 0.24, tiltX: 0.22 };
    },
    tower(el) {
      const g = new T.Group(), led = el.dataset.led || 'run';
      g.add(part(rbox(0.75, 1.75, 1.3, 0.06), COL.line, 0.85, 30));
      const s = []; for (let i = 0; i < 10; i++) { const y = 0.7 - i * 0.07; s.push(V(-0.22, y, 0.651), V(0.22, y, 0.651)); } g.add(segs(s, COL.mid, 0.35));
      g.add(at(fill(new T.CircleGeometry(0.045, 14), led === 'stop' ? COL.err : COL.ok, 1), 0, -0.6, 0.652));
      return { g, fit: 1.2, base: -0.55, sway: 0.24, tiltX: 0.15 };
    },
    rack(el) {
      const g = new T.Group(), led = el.dataset.led || 'run';
      g.add(part(rbox(1.35, 1.7, 1.1, 0.06), COL.line, 0.8, 30));
      for (let i = 0; i < 4; i++) {
        const y = 0.57 - i * 0.38;
        g.add(at(poly(rrectPts(1.18, 0.3, 0.03, 0.551), COL.mid, 0.55, true), 0, y, 0));
        const v = []; for (let k = 0; k < 6; k++) v.push(V(-0.45 + k * 0.08, y - 0.08, 0.552), V(-0.45 + k * 0.08, y + 0.08, 0.552)); g.add(segs(v, COL.mid, 0.3));
        g.add(at(fill(new T.CircleGeometry(0.035, 12), i === 1 && led === 'stop' ? COL.err : COL.ok, 1), 0.45, y, 0.553));
      }
      return { g, fit: 1.2, base: -0.5, sway: 0.24, tiltX: 0.15 };
    },
  };

  /* ================================================================ stage */
  const canvas = document.getElementById('stage');
  let R;
  try { R = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return off(); }
  R.setClearColor(0x000000, 0); R.autoClear = false;
  let slots = new WeakMap();
  let phase = 0;

  function build(el) {
    const f = B[el.dataset.obj]; if (!f) return null;
    CH = window.OBJ_MODE === 'chrome';
    const tile = el.closest('.tile, .idle, .sheet-hero') || el;
    HUE = (getComputedStyle(tile).getPropertyValue('--h') || '').trim() || '255, 255, 255';
    if (el.dataset.obj === 'watch') HUE = '95, 230, 236';
    const o = f(el), scene = new T.Scene();
    CH = false;
    const pivot = new T.Group(); pivot.add(o.g); pivot.rotation.x = o.tiltX ?? 0.15; scene.add(pivot);
    const cam = new T.PerspectiveCamera(24, 1, 0.1, 80);
    return { scene, cam, pivot, tick: o.tick, fit: o.fit || 1.3, base: o.base ?? -0.4, sway: o.sway ?? 0.25, ph: (phase += 1.9) };
  }
  function layer() {
    const idle = document.getElementById('idle'); if (!idle.hidden) return { root: idle, clip: null };
    const pal = document.getElementById('palette'); if (!pal.hidden) return { root: pal, clip: null };
    const sh = document.getElementById('sheet'); if (!sh.hidden) return { root: sh, clip: document.getElementById('sheetbody').getBoundingClientRect() };
    const dock = document.getElementById('dock');
    const dockTop = dock && getComputedStyle(dock).display !== 'none' ? dock.querySelector('.miniplayer').getBoundingClientRect().top : innerHeight;
    return { root: document.getElementById('main'), clip: { top: 0, left: 0, right: innerWidth, bottom: dockTop } };
  }
  const TAN = Math.tan((24 / 2) * Math.PI / 180);
  let W = 0, H = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const w = innerWidth, h = innerHeight;
    if (w !== W || h !== H) { W = w; H = h; R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.setSize(w, h, false); }
    R.setScissorTest(false); R.clear(); R.setScissorTest(true);
    const { root, clip } = layer(), t = now / 1000;
    root.querySelectorAll('[data-obj]').forEach(el => {
      let s = slots.get(el);
      if (s === undefined) { s = build(el); slots.set(el, s); }
      if (!s) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) return;
      const c = clip || { top: 0, left: 0, right: w, bottom: h };
      const L2 = Math.max(r.left, c.left), T2 = Math.max(r.top, c.top), R2 = Math.min(r.right, c.right), B2 = Math.min(r.bottom, c.bottom);
      if (R2 <= L2 || B2 <= T2) return;
      s.pivot.rotation.y = REDUCED ? s.base : s.base + Math.sin(t * 0.3 + s.ph) * s.sway;
      if (s.tick) s.tick(el, t);
      const asp = r.width / r.height, need = asp < 1 ? s.fit / asp : s.fit;
      s.cam.aspect = asp; s.cam.position.set(0, s.fit * 0.1, need / TAN); s.cam.lookAt(0, 0, 0); s.cam.updateProjectionMatrix();
      R.setViewport(r.left, h - r.bottom, r.width, r.height);
      R.setScissor(L2, h - B2, R2 - L2, B2 - T2);
      R.render(s.scene, s.cam);
    });
  }
  requestAnimationFrame(frame);
  window.Stage = { scan() {}, rebuild() { slots = new WeakMap(); } };
})();
