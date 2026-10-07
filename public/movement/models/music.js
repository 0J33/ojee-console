/* ============================================================
   movement/models/music — a pocket music player.

   After the small cassette-era players: a landscape slab, a raised glass
   window with the screen in it, a ledge under the window where a cassette
   door's hinge would be, and the keys along the top edge — power first,
   a long volume rocker, then play, menu and back. The jacks are on the
   right flank. No marks on it anywhere.

   Coloured as the user's own one, the BLACK Snowsky Echo Mini — real-object
   colour, which the console shows as it is (DESIGN.md): a satin black body
   a shade lighter than the deep-black surround of the screen, every key
   black except POWER, which is the high-contrast red one, and on the back
   the printed "battery cover" a cassette player would have had.

   On the plate its screen draws what the real ones draw: two tape reels,
   turning while something plays, and a line along the bottom that is how
   far through the track it is.

   Opened up (the console calls setFocus), the screen and the panel under
   the ledge are handed to the page: `layout` says exactly where they are,
   in model units, and the page lays the live player over them. The drawn
   screen steps aside so there is one screen, not two.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, occluder, ring, edges, REDUCED, mk,
} from '../kit.js';

/* The black Echo Mini's own colours. */
const BODY = 0x1f1f21;          // satin black PC/ABS with a metallic paint
const BEZEL = 0x060606;         // the deep-black surround the screen sits in
const BODY_LINE = 0x6a6a6e;     // its edges catching the light
const POWER = 0xd7262e;         // the red power key
const solid = (geo, c) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c }));

// 80 x 54.5 x 14.5 mm, at 3.4 units across.
const W = 3.4;
const H = W * (54.5 / 80);
const D = W * (14.5 / 80);
const R = 0.13;                 // corner radius, seen from the front
const ZF = D / 2;               // the front face

/* Where the page may draw, in model units about the body's centre. The
   console reads these to lay the player exactly over them. */
export const LAYOUT = {
  body: { w: W, h: H, r: R },
  window: { x: 0, y: 0.31, w: 2.98, h: 1.46 },
  screen: { x: 0, y: 0.31, w: 2.7, h: 1.2 },
  deck: { x: 0, y: -0.86, w: 2.9, h: 0.42 },
};

/** A rounded rectangle as a list of points, in the z = z plane. */
function rrect(cx, cy, w, h, r, z = 0, seg = 6) {
  const pts = [];
  const corners = [
    [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2],
    [cx - w / 2 + r, cy - h / 2 + r, Math.PI],
    [cx + w / 2 - r, cy - h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i += 1) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(V(x + Math.cos(a) * r, y + Math.sin(a) * r, z));
    }
  }
  return pts;
}

function rrShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** A tape reel: hub, rim, and the three spokes that show it turning. */
function reel(r) {
  const g = new THREE.Group();
  const rim = ring(r, C.steel, 0.75, 'z', 40);
  const hub = ring(r * 0.36, C.steel, 0.9, 'z', 24);
  const spokes = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2;
    spokes.push(V(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, 0), V(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0));
  }
  const sp = segs(spokes, C.steel, 0.7);
  g.add(rim, hub, sp);
  return { g, lines: [rim, hub, sp] };
}

export function build(opts = {}) {
  // Tipped a little toward you, so the keys on the top edge read.
  const [group, sp] = mk(0, 0.2);
  group.userData.sway = [0.04, 0.34, 0.02];
  group.userData.swayPeriod = 10;
  group.userData.swayPhase = 0.9;
  group.userData.hitR = 2.0;
  // The crown holds it with the watch: the two sit together on the plate.
  group.userData.lockable = true;
  const P = group.userData.parts;

  /* ---- the body ---- */
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(W, H, R), { depth: D, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.translate(0, 0, -D / 2);
  sp.add(solid(bodyGeo, BODY));
  const outline = edges(bodyGeo.clone(), BODY_LINE, 0.85, 25);
  sp.add(outline);

  /* ---- the window and its glass ---- */
  const Wn = LAYOUT.window;
  const winZ = ZF + 0.035;
  const winGeo = new THREE.ExtrudeGeometry(rrShape(Wn.w, Wn.h, 0.07), { depth: 0.035, bevelEnabled: false, curveSegments: 4 });
  winGeo.translate(Wn.x, Wn.y, ZF);
  sp.add(solid(winGeo, BEZEL));
  const winLine = poly(rrect(Wn.x, Wn.y, Wn.w, Wn.h, 0.07, winZ + 0.002, 4), C.rhodium, 0.9, true);
  sp.add(winLine);
  // A glint across the glass: the one thing that says "window" in wire.
  const glint = segs([
    V(-Wn.w / 2 + 0.18, Wn.y + Wn.h / 2 - 0.08, winZ + 0.003), V(-Wn.w / 2 + 0.52, Wn.y + Wn.h / 2 - 0.08 - 0.34, winZ + 0.003),
    V(-Wn.w / 2 + 0.3, Wn.y + Wn.h / 2 - 0.08, winZ + 0.003), V(-Wn.w / 2 + 0.5, Wn.y + Wn.h / 2 - 0.08 - 0.2, winZ + 0.003),
  ], C.hot, 0.22);
  sp.add(glint);

  /* ---- the screen ---- */
  const S = LAYOUT.screen;
  const sZ = winZ + 0.004;
  const screenEdge = poly(rrect(S.x, S.y, S.w, S.h, 0.04, sZ, 3), C.steel, 0.55, true);
  sp.add(screenEdge);

  /* What the screen shows when the page is not drawing it: the same cassette
     the opened player shows — the cover as the label, title and artist under
     it, the real position along the bottom — painted into a texture, with
     the two reels drawn as lines over it so they glow and turn like the rest
     of the object. Laid out in fractions of the screen, the same fractions
     the page uses, so opening it up changes nothing but who draws it. */
  const art = new THREE.Group();
  art.position.set(S.x, S.y, sZ + 0.002);
  sp.add(art);
  const scr = paintSurface(1024, Math.round(1024 * S.h / S.w));
  const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), scr.material);
  art.add(scrMesh);
  const RR = 0.21 * S.h;                                   // reel radius
  const RY = S.h / 2 - 0.35 * S.h;                         // reels' hubs level with the label's middle
  const RX = Math.max(0.25 * S.h + RR + 0.05 * S.w, 0.26 * S.w);
  const L = reel(RR); L.g.position.set(-RX, RY, 0.004);
  const Rr = reel(RR); Rr.g.position.set(RX, RY, 0.004);
  // The tape wound on each reel: the left empties as the right fills.
  const woundL = ring(RR, C.rhodium, 0.5, 'z', 40); woundL.position.copy(L.g.position);
  const woundR = ring(RR, C.rhodium, 0.5, 'z', 40); woundR.position.copy(Rr.g.position);
  art.add(L.g, Rr.g, woundL, woundR);

  /* ---- the ledge under the window ---- */
  const ledgeY = Wn.y - Wn.h / 2 - 0.07;
  const ledge = segs([
    V(-W / 2 + 0.04, ledgeY, ZF + 0.002), V(W / 2 - 0.04, ledgeY, ZF + 0.002),
    V(-W / 2 + 0.04, ledgeY - 0.06, ZF + 0.002), V(W / 2 - 0.04, ledgeY - 0.06, ZF + 0.002),
  ], C.rhodium, 0.7);
  sp.add(ledge);

  /* ---- the panel below: the five keys, drawn. They are a picture — a
     click anywhere on the object opens it, and the opened one's keys are
     the real ones, laid exactly over these. ---- */
  const Dk = LAYOUT.deck;
  const deckLine = poly(rrect(Dk.x, Dk.y, Dk.w, Dk.h, 0.05, ZF + 0.002, 3), C.rhodium, 0.28, true);
  sp.add(deckLine);
  const dk = paintSurface(1024, Math.round(1024 * Dk.h / Dk.w));
  const deckMesh = new THREE.Mesh(new THREE.PlaneGeometry(Dk.w, Dk.h), dk.material);
  deckMesh.position.set(Dk.x, Dk.y, ZF + 0.003);
  sp.add(deckMesh);

  /* ---- the keys along the top ----
     Left to right as on the real one: power, volume (long), play,
     menu, back. Play lights while something is playing. */
  const KEYS = [[-1.39, -1.16, 'power'], [-0.93, -0.19, 'volume'], [0.0, 0.35, 'play'], [0.5, 0.85, 'menu'], [1.0, 1.35, 'back']];
  const keyH = 0.07; const keyD = D * 0.56;
  const keyMats = {};
  for (const [x0, x1, name] of KEYS) {
    const kg = new THREE.BoxGeometry(x1 - x0, keyH, keyD);
    kg.translate((x0 + x1) / 2, H / 2 + keyH / 2, 0);
    const red = name === 'power';
    sp.add(solid(kg, red ? 0x8a1218 : BODY));
    const e = edges(kg.clone(), red ? POWER : C.steel, red ? 1 : 0.7, 25);
    keyMats[name] = e;
    sp.add(e);
  }
  P.play = keyMats.play;

  /* ---- the flanks: jacks on the right, USB-C and card slot on the left ---- */
  const jack = (z, r) => { const c = ring(r, C.steel, 0.8, 'x', 28); c.position.set(W / 2 + 0.002, -0.3, z); return c; };
  sp.add(jack(-0.1, 0.075), jack(0.15, 0.1));
  const usb = poly(rrect(0, 0, 0.1, 0.3, 0.045, 0, 3).map((p) => V(-W / 2 - 0.002, -0.2 + p.x, p.y)), C.steel, 0.7, true);
  const card = segs([V(-W / 2 - 0.002, 0.3, -0.14), V(-W / 2 - 0.002, 0.3, 0.14)], C.rhodium, 0.7);
  // The lanyard hole, in the bottom corner of the same flank.
  const lanyard = ring(0.035, C.rhodium, 0.7, 'x', 16);
  lanyard.position.set(-W / 2 - 0.002, -H / 2 + 0.16, -0.12);
  sp.add(usb, card, lanyard);

  /* ---- the back: the printed battery cover, with its grip lines ---- */
  const bz = -ZF - 0.002;
  const cover0 = poly(rrect(0, -0.25, 2.3, 1.0, 0.08, bz, 4), C.rhodium, 0.55, true);
  const grip = [];
  for (let i = 0; i < 5; i += 1) {
    const x = 0.75 + i * 0.07;
    grip.push(V(x, -0.55, bz), V(x, 0.05, bz));
  }
  sp.add(cover0, segs(grip, C.rhodium, 0.45));

  /* ---- the back: four screws ---- */
  for (const [x, y] of [[-1.5, 0.95], [1.5, 0.95], [-1.5, -0.95], [1.5, -0.95]]) {
    const s = ring(0.06, C.rhodium, 0.6, 'z', 16);
    s.position.set(x, y, -ZF - 0.002);
    sp.add(s);
  }

  /* ---- state ---- */
  let st = { playing: false, progress: 0, durationMs: 0 };
  let progressAt = 0;
  let live = false;
  let reelL = 0;
  let reelR = 0;
  const REEL_K = 80;            // rad/s × wound radius (same units as the rings)
  let lastSecond = -1;
  let cover = null;             // { url, img, ready }

  const posMs = () => {
    const d = Number(st.durationMs) || 0;
    const base = (Number(st.progress) || 0) * d;
    return Math.min(d, base + (st.playing ? performance.now() - progressAt : 0));
  };

  function drawScreen() {
    const { ctx: c, w, h } = scr;
    const d = Number(st.durationMs) || 0;
    const p = posMs();
    const f = d ? p / d : 0;
    const F = fonts();
    c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
    // The shell.
    c.strokeStyle = 'rgba(154,154,154,0.32)'; c.lineWidth = 2;
    roundRect(c, 0.06 * w, 0.07 * h, 0.88 * w, 0.555 * h, 0.022 * h); c.stroke();
    if (!live) {
      c.fillStyle = 'rgba(179,179,179,0.8)'; c.font = `500 ${0.09 * h}px ${F.sans}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(st.connected === false ? 'Not connected' : 'Nothing playing', w / 2, 0.8 * h);
    }
    // The label: the cover.
    const cs = 0.5 * h; const cx = w / 2 - cs / 2; const cy = 0.1 * h;
    c.fillStyle = '#0a0a0a'; c.fillRect(cx - 6, cy - 6, cs + 12, cs + 12);
    if (cover?.ready) c.drawImage(cover.img, cx, cy, cs, cs);
    else {
      c.strokeStyle = 'rgba(154,154,154,0.5)'; c.lineWidth = 2;
      c.beginPath(); c.arc(w / 2, cy + cs / 2, cs * 0.26, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(w / 2, cy + cs / 2, cs * 0.09, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = 'rgba(154,154,154,0.45)'; c.lineWidth = 2; c.strokeRect(cx, cy, cs, cs);
    if (!live || !st.title) { scr.texture.needsUpdate = true; return; }
    // Device, top left.
    c.textBaseline = 'top'; c.textAlign = 'left';
    c.fillStyle = 'rgba(179,179,179,0.85)'; c.font = `${0.036 * h}px ${F.hud}`;
    spaced(c, `ON ${String(st.device || (st.last ? 'last played' : '')).toUpperCase()}`, 0.09 * w, 0.014 * h, 0.16);
    // Title, then artist · album.
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff'; c.font = `500 ${0.086 * h}px ${F.sans}`;
    c.fillText(fit(c, st.title, 0.84 * w), w / 2, 0.73 * h);
    c.font = `${0.056 * h}px ${F.sans}`;
    const artist = st.artist || '';
    const album = st.album ? ` · ${st.album}` : '';
    const line = fit(c, artist + album, 0.84 * w);
    const aw = c.measureText(line).width;
    c.textAlign = 'left';
    const x0 = w / 2 - aw / 2;
    const cut = Math.min(line.length, artist.length);
    c.fillStyle = '#ffffff'; c.fillText(line.slice(0, cut), x0, 0.83 * h);
    c.fillStyle = '#8a8a8a'; c.fillText(line.slice(cut), x0 + c.measureText(line.slice(0, cut)).width, 0.83 * h);
    // The bar: where it really is.
    const by = 0.93 * h; const bx0 = 0.14 * w; const bx1 = 0.86 * w;
    c.font = `${0.044 * h}px ${F.mono}`; c.fillStyle = 'rgba(179,179,179,0.9)';
    c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillText(mmss(p), bx0 - 14, by);
    c.textAlign = 'left'; c.fillText(mmss(d), bx1 + 14, by);
    c.fillStyle = 'rgba(154,154,154,0.35)'; c.fillRect(bx0, by - 2, bx1 - bx0, 4);
    c.fillStyle = st.playing ? '#ffffff' : '#b3b3b3'; c.fillRect(bx0, by - 2, (bx1 - bx0) * f, 4);
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(bx0 + (bx1 - bx0) * f, by, 7, 0, Math.PI * 2); c.fill();
    scr.texture.needsUpdate = true;
  }

  function drawDeck() {
    const { ctx: c, w, h } = dk;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h);
    const keys = [
      ['shuffle', 0.11, st.shuffle], ['prev', 0.15, false], [st.playing ? 'pause' : 'play', 0.22, 'main'],
      ['next', 0.15, false], ['repeat', 0.11, st.repeat && st.repeat !== 'off'],
    ];
    const gap = 0.028 * w;
    const total = keys.reduce((a, k) => a + k[1] * w, 0) + gap * 4;
    let x = w / 2 - total / 2;
    const kh = 0.62 * h; const ky = (h - kh) / 2;
    for (const [name, frac, on] of keys) {
      const kw = frac * w;
      const lit = on === 'main' || on === true;
      c.fillStyle = lit ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.6)';
      roundRect(c, x, ky, kw, kh, 5); c.fill();
      c.strokeStyle = lit ? '#ffffff' : 'rgba(154,154,154,0.6)'; c.lineWidth = 2; c.stroke();
      glyph(c, name, x + kw / 2, ky + kh / 2, kh * 0.46, lit ? '#ffffff' : '#b3b3b3');
      if (name === 'repeat' && st.repeat === 'track') {
        c.fillStyle = '#ffffff'; c.font = `${kh * 0.26}px ${fonts().mono}`; c.textAlign = 'center';
        c.fillText('1', x + kw * 0.82, ky + kh * 0.3);
      }
      x += kw + gap;
    }
    dk.texture.needsUpdate = true;
  }

  function loadCover(url) {
    if (!url) { cover = null; return; }
    if (cover?.url === url) return;
    const img = new Image();
    cover = { url, img, ready: false };
    img.decoding = 'async';
    img.onload = () => { if (cover?.img === img) { cover.ready = true; drawScreen(); } };
    img.src = url;
  }

  // The painted text uses the page's faces; draw again once they have loaded.
  document.fonts?.ready.then(() => { drawScreen(); drawDeck(); });

  group.userData.tick = (t, dt) => {
    if (st.playing && !REDUCED) {
      /* Counter-clockwise, both, as a playing cassette's are: the tape runs
         left to right along the bottom. And at a steady tape speed a reel
         turns faster the less tape it holds — the full left reel starts
         slow, the empty right one fast, and they trade as the track plays.
         The opened player turns its reels by the same rule. */
      const d = Number(st.durationMs) || 0;
      const f = d ? Math.min(1, posMs() / d) : 0;
      reelL += dt * REEL_K / (18 + 26 * (1 - f));
      reelR += dt * REEL_K / (18 + 26 * f);
      L.g.rotation.z = reelL;
      Rr.g.rotation.z = reelR;
    }
    // The picture moves once a second: the time and the bar.
    if (st.playing && art.visible) {
      const sec = Math.floor(posMs() / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        drawScreen();
        const d = Number(st.durationMs) || 0;
        const f = d ? posMs() / d : 0;
        woundL.scale.setScalar((18 + 26 * (1 - f)) / 47);
        woundR.scale.setScalar((18 + 26 * f) / 47);
      }
    }
  };

  function setState(s = {}) {
    const status = s.status || 'ok';
    live = s.connected !== false && status !== 'err' && !!s.title;
    st = { ...s, playing: !!s.playing && live };
    progressAt = performance.now();
    lastSecond = -1;
    loadCover(s.cover && s.base ? `${s.base}${s.cover}` : null);
    const hex = STATUS_HEX[status] ?? C.steel;
    outline.material.color.setHex(status === 'ok' ? BODY_LINE : hex);
    outline.material.opacity = s.connected !== false ? 0.85 : 0.45;
    keyMats.play.material.color.setHex(st.playing ? C.beat : C.steel);
    keyMats.play.material.opacity = st.playing ? 1 : 0.7;
    for (const l of [...L.lines, ...Rr.lines]) {
      l.material.color.setHex(st.playing ? C.beat : C.steel);
      l.material.opacity = live ? (st.playing ? 0.9 : 0.6) : 0.3;
    }
    const d = Number(st.durationMs) || 0;
    const f = d ? posMs() / d : 0;
    woundL.scale.setScalar((18 + 26 * (1 - f)) / 47);
    woundR.scale.setScalar((18 + 26 * f) / 47);
    woundL.visible = woundR.visible = live;
    drawScreen();
    drawDeck();
  }

  /** Opened up: the page draws the screen and the keys, so these step aside. */
  function setFocus(on) {
    art.visible = !on;
    glint.visible = !on;
    deckMesh.visible = !on;
    if (!on) { lastSecond = -1; drawScreen(); }
  }

  setState(opts.state || { status: 'off', connected: false });
  return { group, setState, setFocus, layout: LAYOUT };
}

/* ── painting ─────────────────────────────────────────────────────────── */

/** A canvas and the texture and material that show it. */
function paintSurface(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // A touch under white: the page is dark and bloomed, and a bright cover at
  // full value would flare rather than read.
  const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xd6d6d6, toneMapped: false });
  return { canvas, ctx, texture, material, w, h };
}

let FONTS = null;
function fonts() {
  if (FONTS) return FONTS;
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
  FONTS = {
    sans: getComputedStyle(document.body).fontFamily || 'sans-serif',
    mono: v('--mono', 'ui-monospace, monospace'),
    hud: v('--hud', 'ui-monospace, monospace'),
  };
  return FONTS;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Letter-spaced text, the way the page sets its small capitals. */
function spaced(c, text, x, y, em) {
  const size = parseFloat(c.font.match(/([\d.]+)px/)?.[1] || 12);
  let cx = x;
  for (const ch of text) { c.fillText(ch, cx, y); cx += c.measureText(ch).width + size * em; }
}

function fit(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && c.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* The keys' glyphs: the same drawings the opened player uses. */
const GLYPHS = {
  play: ['fill', 'M8 5.5v13l10.5-6.5z'],
  pause: ['fill', 'M7 5h3.6v14H7zM13.4 5H17v14h-3.6z'],
  prev: ['fill', 'M6 5h2.4v14H6zM9.6 12 19 5.5v13z'],
  next: ['fill', 'M15.6 5H18v14h-2.4zM5 5.5 14.4 12 5 18.5z'],
  shuffle: ['stroke', 'M4 7h3.5c4.5 0 5.5 10 10 10H20M4 17h3.5c1.6 0 2.7-1.2 3.6-2.8M13 9.8C13.9 8.2 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5'],
  repeat: ['stroke', 'M5 11V9a2 2 0 0 1 2-2h11.5M16 4.5 18.5 7 16 9.5M19 13v2a2 2 0 0 1-2 2H5.5M8 19.5 5.5 17 8 14.5'],
};
function glyph(c, name, x, y, size, color) {
  const [mode, d] = GLYPHS[name];
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 24, size / 24);
  const path = new Path2D(d);
  if (mode === 'fill') { c.fillStyle = color; c.fill(path); }
  else { c.strokeStyle = color; c.lineWidth = 1.8; c.lineCap = 'square'; c.stroke(path); }
  c.restore();
}
