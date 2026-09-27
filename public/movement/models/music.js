/* ============================================================
   movement/models/music — a pocket music player.

   After the small cassette-era players: a landscape slab, a raised glass
   window with the screen in it, a ledge under the window where a cassette
   door's hinge would be, and the keys along the top edge — power in red,
   a long volume rocker, then play, menu and back. The jacks are on the
   right flank. No marks on it anywhere.

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
  const P = group.userData.parts;

  /* ---- the body ---- */
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(W, H, R), { depth: D, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.translate(0, 0, -D / 2);
  sp.add(occluder(bodyGeo));
  const outline = edges(bodyGeo.clone(), C.steel, 0.85, 25);
  sp.add(outline);

  /* ---- the window and its glass ---- */
  const Wn = LAYOUT.window;
  const winZ = ZF + 0.035;
  const winGeo = new THREE.ExtrudeGeometry(rrShape(Wn.w, Wn.h, 0.07), { depth: 0.035, bevelEnabled: false, curveSegments: 4 });
  winGeo.translate(Wn.x, Wn.y, ZF);
  sp.add(occluder(winGeo));
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

  // What the screen draws on the plate. Stepped aside when opened up.
  const art = new THREE.Group();
  art.position.set(S.x, S.y, sZ + 0.002);
  sp.add(art);
  const reelR = 0.3;
  const L = reel(reelR); L.g.position.set(-0.72, 0.1, 0);
  const Rr = reel(reelR); Rr.g.position.set(0.72, 0.1, 0);
  art.add(L.g, Rr.g);
  // The tape between them, and the cassette's own outline.
  const tape = segs([
    V(-0.72, 0.1 - reelR, 0), V(0.72, 0.1 - reelR, 0),
    V(-0.36, 0.3, 0), V(0.36, 0.3, 0), V(0.36, 0.3, 0), V(0.36, -0.1, 0),
    V(0.36, -0.1, 0), V(-0.36, -0.1, 0), V(-0.36, -0.1, 0), V(-0.36, 0.3, 0),
  ], C.rhodium, 0.6);
  const cassette = poly(rrect(0, 0.08, 2.1, 0.86, 0.06, 0, 3), C.rhodium, 0.45, true);
  art.add(tape, cassette);
  // Progress: a track and the part of it already played.
  const barY = -S.h / 2 + 0.16;
  const barX0 = -S.w / 2 + 0.2;
  const barW = S.w - 0.4;
  art.add(segs([V(barX0, barY, 0), V(barX0 + barW, barY, 0)], C.rhodium, 0.5));
  const played = poly([V(barX0, barY, 0.001), V(barX0 + barW, barY, 0.001)], C.beat, 0.95);
  played.scale.x = 0.0001; played.position.x = barX0 - barX0 * 0.0001; // grown from the left, below
  art.add(played);
  const head = node(0.03, C.hot, 1);
  head.position.set(barX0, barY, 0.002);
  art.add(head);

  /* ---- the ledge under the window ---- */
  const ledgeY = Wn.y - Wn.h / 2 - 0.07;
  const ledge = segs([
    V(-W / 2 + 0.04, ledgeY, ZF + 0.002), V(W / 2 - 0.04, ledgeY, ZF + 0.002),
    V(-W / 2 + 0.04, ledgeY - 0.06, ZF + 0.002), V(W / 2 - 0.04, ledgeY - 0.06, ZF + 0.002),
  ], C.rhodium, 0.7);
  sp.add(ledge);

  /* ---- the panel below: blank, and where the page puts the keys ---- */
  const Dk = LAYOUT.deck;
  const deckLine = poly(rrect(Dk.x, Dk.y, Dk.w, Dk.h, 0.05, ZF + 0.002, 3), C.rhodium, 0.28, true);
  sp.add(deckLine);

  /* ---- the keys along the top ----
     Left to right as on the real one: power (red), volume (long), play,
     menu, back. Play lights while something is playing. */
  const KEYS = [[-1.39, -1.16, 'power'], [-0.93, -0.19, 'volume'], [0.0, 0.35, 'play'], [0.5, 0.85, 'menu'], [1.0, 1.35, 'back']];
  const keyH = 0.07; const keyD = D * 0.56;
  const keyMats = {};
  for (const [x0, x1, name] of KEYS) {
    const kg = new THREE.BoxGeometry(x1 - x0, keyH, keyD);
    kg.translate((x0 + x1) / 2, H / 2 + keyH / 2, 0);
    sp.add(occluder(kg));
    const e = edges(kg.clone(), name === 'power' ? C.bad : C.steel, name === 'power' ? 0.9 : 0.7, 25);
    keyMats[name] = e;
    sp.add(e);
  }
  P.play = keyMats.play;

  /* ---- the flanks: jacks on the right, USB-C and card slot on the left ---- */
  const jack = (z, r) => { const c = ring(r, C.steel, 0.8, 'x', 28); c.position.set(W / 2 + 0.002, -0.3, z); return c; };
  sp.add(jack(-0.1, 0.075), jack(0.15, 0.1));
  const usb = poly(rrect(0, 0, 0.1, 0.3, 0.045, 0, 3).map((p) => V(-W / 2 - 0.002, -0.2 + p.x, p.y)), C.steel, 0.7, true);
  const card = segs([V(-W / 2 - 0.002, 0.3, -0.14), V(-W / 2 - 0.002, 0.3, 0.14)], C.rhodium, 0.7);
  sp.add(usb, card);

  /* ---- the back: four screws ---- */
  for (const [x, y] of [[-1.5, 0.95], [1.5, 0.95], [-1.5, -0.95], [1.5, -0.95]]) {
    const s = ring(0.06, C.rhodium, 0.6, 'z', 16);
    s.position.set(x, y, -ZF - 0.002);
    sp.add(s);
  }

  /* ---- state ---- */
  let playing = false;
  let progress = 0;             // 0..1 at `progressAt`
  let duration = 0;
  let progressAt = 0;
  let status = 'off';
  let reelA = 0;

  const paintProgress = (f) => {
    const x = Math.max(0.0001, Math.min(1, f));
    // A Line2 has no geometry to stretch cheaply, so the played length is a
    // scale about the bar's left end.
    played.scale.x = x;
    played.position.x = barX0 * (1 - x);
    head.position.x = barX0 + barW * x;
  };

  group.userData.tick = (t, dt, _p, env) => {
    if (playing && !REDUCED) {
      reelA -= dt * 2.2;
      // The take-up reel turns slower as it fills — a cassette detail, and
      // it is what makes two turning circles read as tape rather than gears.
      L.g.rotation.z = reelA * (1.15 - 0.3 * progress);
      Rr.g.rotation.z = reelA * (0.85 + 0.3 * progress);
    }
    let f = progress;
    if (playing && duration) f = progress + (performance.now() - progressAt) / duration;
    paintProgress(f);
  };

  function setState(s = {}) {
    status = s.status || 'ok';
    const live = s.connected !== false && status !== 'err';
    playing = !!s.playing && live;
    duration = Number(s.durationMs) || 0;
    progress = Math.max(0, Math.min(1, Number(s.progress) || 0));
    progressAt = performance.now();
    const hex = STATUS_HEX[status] ?? C.steel;
    outline.material.color.setHex(status === 'ok' ? C.steel : hex);
    outline.material.opacity = live ? 0.85 : 0.45;
    keyMats.play.material.color.setHex(playing ? C.beat : C.steel);
    keyMats.play.material.opacity = playing ? 1 : 0.7;
    for (const l of [...L.lines, ...Rr.lines]) {
      l.material.color.setHex(playing ? C.beat : C.steel);
      l.material.opacity = live ? (playing ? 0.9 : 0.6) : 0.3;
    }
    played.visible = live && progress > 0;
    head.visible = live;
  }

  /** Opened up: the page draws the screen, so the drawing steps aside. */
  function setFocus(on) {
    art.visible = !on;
    glint.visible = !on;
  }

  setState(opts.state || { status: 'off', connected: false });
  return { group, setState, setFocus, layout: LAYOUT };
}
