/* ============================================================
   The watch: a Seiko 5 SNXS79 on a 7S26.

   Not a diagram of one and not a dial: a whole wristwatch with an
   exhibition case. Turn it and you get the dial — hours, minutes, a running
   seconds hand, the day and the date at three; turn it further and you get
   the display back, with the movement under the crystal and the winding
   weight sweeping across it.

   It is drawn to a real watch's numbers rather than to a pleasing circle,
   because the proportions are the whole difference between "a watch" and
   THIS watch. 37 mm across, 43 mm lug to lug, 19 mm between the lugs,
   11.7 mm thick, crown at four. That lug-to-lug is the one that decides how
   it reads: 43 against 37 means the lugs clear the case by three
   millimetres and nothing more, so they are not horns bolted to a disc —
   the case flank simply keeps going and becomes the lug. Everything below
   is expressed in millimetres times `MM` so those numbers stay legible.

   It is built the way everything else in this console is built: solid
   bodies in the ground colour with their edges drawn in light. The solids
   are there to OCCLUDE — a wheel behind a bridge is hidden by it, the dial
   hides the movement behind it — and that hidden-line removal is what makes
   a wireframe read as a thing rather than as a diagram of a thing. Nothing
   is lit; the colour of a line says what a part is made of and what it does.

   Two things it does that a watch does not:

   * **The seconds hand jumps on the true second.** The hand is the
     console's clock, and it moves when `timesync.now()` crosses a beat —
     not when an animation frame happens to land. A clock that is a second
     out is a clock that is wrong.

   * **The barrel carries the alerts.** The mainspring is what everything
     downstream runs on, so when something needs attention the ratchet over
     the barrel takes the status colour and breathes. It is the one part of
     the movement allowed to mean something.

   No name is printed anywhere on it. The shape is the reference; the marks
   on a dial are somebody else's.
   ============================================================ */

import * as THREE from 'three';
import {
  C, mk, edges, poly, segs, ring, occluder, node, pulseRing, V,
} from './kit.js';
import { pref } from '/prefs.js';

/* ---- what the movement is made of ----------------------------------
   The case and the dial are steel and white: they are the outside of the
   object and they read as metal. Everything INSIDE the back is white and
   grey line art — the same material as the rest of the console's objects.

   No colour is spent on the parts. Colour arrives only with state: the
   barrel carries the alert, and that is the one place the object wears
   amber or red. */
const LUME = 0xffffff;

const INNER = {
  wheel: C.beat,        // the going train, the barrel, the balance
  frame: 0x5e5e5e,      // bridges and the plate under them: present, quiet
  fine: 0x9a9a9a,       // the escapement, where the detail is
  jewel: C.ruby,        // the bearings
};

/* ---- printed text ---------------------------------------------------
   A day and a date are PRINTED on a wheel, not drawn in wire, so they are
   set on a small canvas and hung on a plane. It is the one place in this
   object where a line is not the answer.

   The face is the page's plain `sans-serif`, not either of the mono faces
   the console is set in, and that is deliberate: a Seiko day-date disc is
   printed in a plain proportional grotesque — flat-topped five, flagged one
   with no foot, even stroke, letters spaced by their own widths. A
   monospace would lock "MON" and "27" to a grid the real wheel does not
   use, and the display face would be a costume.

   NOT condensed. It was set at a 0.9 x-scale on the theory that a date disc
   squeezes its figures to fit four millimetres — but a Seiko's day and date
   are printed at normal width in a fairly wide grotesque, and against the
   real thing the condensed version reads as a different typeface. */
/* The wheel faces.

   Three of them, because the wheel is three different things: a day in
   Latin, a day in Arabic, and a date in figures.

     day     Sweet Sans Pro Medium — drawn from engravers' lettering,
             which is where watch-dial capitals come from
     figures Engravers Gothic Bold — the same lineage, wider and lighter
     Arabic  Amiri, a revival of the Bulaq Press naskh, matched against a
             photograph of a bilingual 7S26 wheel

   The Latin pair are the user's call rather than mine. For the record,
   against the photographed wheel they run lighter and wider than what is
   printed there, which is a narrow even-stroke grotesque — the earlier
   Nimbus Sans Narrow is nearer that disc. They are a better match for the
   dial's own capitals than for the day-date disc, and this object has to
   look like one watch rather than like a parts photograph.

   The figures are the Bold. The Regular went in first because that was
   all the package had; the Bold's cap height is 530 against the
   Regular's 539, so the swap changed the weight and nothing else — the
   fitter targets ink height, not a point size.

   Each is subset to the glyphs its pane can contain — A-Z for the day,
   0-9 for the date — which is why they are kilobytes. */
const FACE_V = 4;
const WHEEL_DAY = "'Wheel Day', system-ui, sans-serif";
const WHEEL_NUM = "'Wheel Num', 'Wheel Day', system-ui, sans-serif";
const WHEEL_AR = "'Wheel Arabic', 'Wheel Day', system-ui, sans-serif";

const DAYS = {
  en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  // As the bilingual wheel prints them — WITH the hamza. The plain forms
  // were a guess that the disc would drop it to save ink; the photograph
  // shows it on all three words that take one.
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

const fontWaiters = new Set();
let fontsReady = false;

/** Load the wheel faces once for the page, and tell every disc when they
    land — a texture drawn before the font arrived is drawn in the fallback
    and would otherwise stay that way until the date changed. */
(function loadWheelFaces() {
  if (typeof FontFace !== 'function' || typeof document === 'undefined' || !document.fonts) return;
  /* Versioned. Fonts are not in the shell's `no-store` set — that covers
     js, css and html — so a wheel face that is replaced keeps being served
     from the browser's cache, and the object goes on printing in the old
     one no matter what the file on disk says. Bump this when a face
     changes. */
  const at = (f) => `${new URL(`./fonts/${f}`, import.meta.url)}?v=${FACE_V}`;
  const faces = [
    new FontFace('Wheel Day', `url(${at('wheel-day.woff2')})`, { weight: '500' }),
    new FontFace('Wheel Num', `url(${at('wheel-num.woff2')})`, { weight: '700' }),
    new FontFace('Wheel Arabic', `url(${at('wheel-arabic.woff2')})`, { weight: '400' }),
  ];
  Promise.all(faces.map((f) => f.load().then((l) => document.fonts.add(l))))
    .then(() => {
      fontsReady = true;
      for (const fn of fontWaiters) { try { fn(); } catch { /* one disc is not the others' problem */ } }
      fontWaiters.clear();
    })
    .catch(() => { /* the fallback is a grotesque too; it is just not the right one */ });
}());

/* How big the printing sits in the window — measured off a macro
   photograph of a 7S26 aperture, not chosen.

   On the real watch the ink is MUCH bigger in the window than it was
   here. Measured against the aperture's inner height: the day's caps are
   about half of it and the date's figures nearly three fifths, so the
   date stands about a fifth taller than the day rather than matching it.
   This was drawing both at 0.44 and at the same size as each other, which
   is why the window read as a label with room around it instead of a
   wheel seen through a hole.

   These are fractions of the PLANE height, and the fitter below hits them
   by measuring the ink — so they hold whatever face the wheel is set in
   and whatever the glyphs happen to be. */
const INK = {
  day: 0.49 / 0.86,    // Latin caps, against the aperture; 0.86 is the plane in it
  num: 0.58 / 0.86,    // figures, a fifth taller than the day
  /* Naskh gets a bigger budget than Latin caps for the same apparent size.
     Its ink height is set by the alef and the lam, which tower over the
     letters that carry the word — so a naskh measured to the same number
     as a cap height prints a word that LOOKS half the size beside it. */
  ar: 0.62 / 0.86,
};
/* Every date is printed at one size, and so is every day. A wheel is
   struck once; "WED" is not smaller than "FRI" because it is wider, and
   "28" is not smaller than "1". So the fit is computed against the whole
   SET a pane can ever show — the gauge — and the chosen word is then
   drawn at that size, on the baseline the set shares. Fitting each word
   on its own is what makes a date window look like a text box. */
const DATES = Array.from({ length: 31 }, (_, i) => String(i + 1));
/* How far the printing may be squeezed before it is set down instead.
   Below about four fifths a grotesque stops looking condensed and starts
   looking broken. */
const XS_MIN = 0.74;

function printed(text, colour = '#e6e6e6', aspect = 2, face = 'day', gauge = null) {
  /* The canvas is cut to the ASPECT of the plane it will be mapped onto.
     A fixed 128x64 texture stretched over a narrower plane squeezes the
     glyphs by exactly the ratio between the two, and the date pane is a
     third of the aperture: 1.29 wide against the texture's 2.0, which
     printed "25" at 65% of its width. That is what still read as condensed
     after the type itself was set straight — not the typeface, the box.

     128 tall rather than 64: the Latin was fine either way, but a
     calligraphic naskh has detail in it — the tail of a seen, the join
     under a lam — and at 64 that landed between two pixels and smudged. */
  const h = 128;
  const w = Math.max(24, Math.round(h * aspect));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = colour;

  const ar = face === 'ar';
  const fam = ar ? WHEEL_AR : face === 'num' ? WHEEL_NUM : WHEEL_DAY;
  /* The figures are bold and the day is the medium it is cut at. Amiri
     stays on the fine weight, because its bold thickens the strokes until
     the contrast that makes it naskh is gone — and the 128-tall canvas is
     there so that survives. */
  const weight = ar ? 400 : face === 'num' ? 700 : 500;
  g.textAlign = 'center';
  g.direction = ar ? 'rtl' : 'ltr';
  g.textBaseline = 'alphabetic';

  const fill = INK[face] ?? INK.day;
  const set = (gauge && gauge.length) ? gauge : [text];
  const PROBE = 100;
  const metrics = (px, t) => {
    g.font = `${weight} ${px}px ${fam}`;
    const m = g.measureText(t);
    return {
      w: m.width,
      asc: m.actualBoundingBoxAscent || px * 0.72,
      desc: m.actualBoundingBoxDescent || 0,
    };
  };
  /* Set to the INK, not to a point size. A point size means one thing in
     a condensed grotesque and another in a naskh, and what has to be right
     is how much of the window the printing fills. */
  let ink = 0; let wide = 0;
  for (const t of set) {
    const m = metrics(PROBE, t);
    ink = Math.max(ink, m.asc + m.desc);
    wide = Math.max(wide, m.w);
  }
  /* Height first, and the width is made to fit by CONDENSING rather than
     by shrinking.

     The widest word in the set decides, and for the day that is WED, or
     الأربعاء. Sweet Sans is a wide face and Amiri a sprawling one, so at
     the height the aperture wants, the widest word does not fit across
     the pane — and scaling the whole set down to it printed every day a
     fifth shorter than the date beside it, which is backwards. On the
     real wheel the day and the date are near enough the same height and
     the DAY is the narrower drawing.

     So the set is squeezed horizontally instead, all of it by the same
     amount so the face still reads as one face, and only then set down if
     even a full squeeze will not do. That is what a wheel's type designer
     does; it is why a date wheel's figures are narrow in the first
     place. */
  const room = w * 0.96;
  let size = (PROBE * (h * fill)) / Math.max(1, ink);
  let xs = 1;
  const span = (wide * size) / PROBE;
  if (span > room) {
    xs = Math.max(XS_MIN, room / span);
    if (span * xs > room) size *= room / (span * xs);
  }
  if ((ink * size) / PROBE > h * 0.96) size = (h * 0.96 * PROBE) / ink;

  // The baseline the whole set shares, placed so the set's ink sits in the
  // middle of the window — not each word's own ink, which would bob the
  // Arabic up and down as the day changed.
  let gAsc = 0; let gDesc = 0;
  for (const t of set) {
    const m = metrics(size, t);
    gAsc = Math.max(gAsc, m.asc);
    gDesc = Math.max(gDesc, m.desc);
  }
  g.font = `${weight} ${size}px ${fam}`;
  g.save();
  g.translate(w / 2, 0);
  g.scale(xs, 1);
  g.fillText(text, 0, (h + gAsc - gDesc) / 2);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function printedPlane(w, h, text, colour, face = 'day', gauge = null) {
  const aspect = w / h;
  let cur = text;
  let curFace = face;
  let curGauge = gauge;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: printed(text, colour, aspect, face, gauge), transparent: true, depthWrite: false,
    }),
  );
  const draw = () => {
    m.material.map.dispose();
    m.material.map = printed(cur, colour, aspect, curFace, curGauge);
    m.material.needsUpdate = true;
  };
  m.userData.set = (next, nextFace = curFace, nextGauge = curGauge) => {
    if (next === cur && nextFace === curFace && nextGauge === curGauge) return;
    cur = next; curFace = nextFace; curGauge = nextGauge;
    draw();
  };
  // Redraw once the real face arrives, so the first paint is not the one
  // that sticks.
  if (!fontsReady) fontWaiters.add(draw);
  return m;
}

/* ---- the primitive this whole object is made of --------------------
   A part is a solid in the ground colour with its edges drawn over it. The
   solid writes depth and hides whatever is behind it; the edges are the
   only thing you actually see. */
function part(geo, colour = C.rhodium, opacity = 0.8, thresh = 1) {
  const g = new THREE.Group();
  g.add(occluder(geo));
  g.add(edges(geo, colour, opacity, thresh));
  return g;
}

/** A disc lying in the XY plane, solid, with its rim drawn. */
function plate(r, z, colour, opacity, seg = 72) {
  const g = part(new THREE.CircleGeometry(r, seg), colour, opacity);
  g.position.z = z;
  return g;
}

/** A closed rounded rectangle, as points — an aperture, a marker, a slot. */
function roundRect(w, h, r, z = 0, seg = 4) {
  const pts = [];
  const cx = w / 2 - r; const cy = h / 2 - r;
  const corners = [[cx, cy, 0], [-cx, cy, Math.PI / 2], [-cx, -cy, Math.PI], [cx, -cy, -Math.PI / 2]];
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i += 1) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(V(x + Math.cos(a) * r, y + Math.sin(a) * r, z));
    }
  }
  return pts;
}

/* ---- wheels ---------------------------------------------------------
   A watch wheel is a rim of teeth, a hub, and the crossings between them —
   the spokes, cut away so the wheel is light enough for a spring to move.
   The teeth are ogival: they rise, hold and fall, because a square tooth
   binds. */

function toothAt(p) {
  const ease = (x) => x * x * (3 - 2 * x);
  if (p < 0.09) return ease(p / 0.09);
  if (p < 0.33) return 1;
  if (p < 0.43) return 1 - ease((p - 0.33) / 0.1);
  return 0;
}

/** The outline of a toothed wheel, as points. */
function toothed(rTip, teeth) {
  const depth = rTip * (teeth > 26 ? 0.09 : 0.17);
  const rRoot = rTip - depth;
  const pts = [];
  const seg = Math.max(teeth * 8, 128);
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const p = ((a * teeth) / (Math.PI * 2)) % 1;
    const r = rRoot + depth * toothAt(p);
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/**
 * A wheel: the toothed rim drawn, a solid behind it so it occludes what is
 * underneath, and the crossings drawn across it.
 */
function wheelPart(rTip, teeth, colour = C.brass, arms = 4) {
  const g = new THREE.Group();
  const outline = toothed(rTip, teeth);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  const solid = occluder(new THREE.ShapeGeometry(shape, 2));
  solid.position.z = -0.004;
  g.add(solid);
  g.add(poly(outline, colour, 0.85, true));

  const rRim = rTip * 0.8;
  const rHub = rTip * 0.2;
  g.add(ring(rRim, colour, 0.5));
  g.add(ring(rHub, colour, 0.6));
  const spokes = [];
  for (let k = 0; k < arms; k += 1) {
    const a = (k / arms) * Math.PI * 2;
    const w = 0.035 * (rTip / 0.4);
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    for (const sgn of [1, -1]) {
      spokes.push(
        V(Math.cos(a) * rHub + nx * sgn, Math.sin(a) * rHub + ny * sgn, 0),
        V(Math.cos(a) * rRim + nx * sgn, Math.sin(a) * rRim + ny * sgn, 0),
      );
    }
  }
  if (arms > 0) g.add(segs(spokes, colour, 0.4));
  return g;
}

/** A flat spiral, drawn: the hairspring, and the mainspring in the barrel. */
function spiral(turns, r0, r1, colour, opacity, steps = 240) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return poly(pts, colour, opacity);
}

/** The outline of a bridge, drawn ALONG the pivots it spans rather than as
    a slab over them — which is why a real movement's wheels are visible. */
function bridgeShape(path, halfWidth) {
  const P = path.map(([x, y]) => new THREE.Vector2(x, y));
  const normals = P.map((_, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    const d = new THREE.Vector2().subVectors(b, a).normalize();
    return new THREE.Vector2(-d.y, d.x);
  });
  const w = (i) => (typeof halfWidth === 'function' ? halfWidth(i / (P.length - 1)) : halfWidth);
  const cap = (centre, n, sign, width) => {
    const out = [];
    const a0 = Math.atan2(n.y * sign, n.x * sign);
    for (let k = 1; k < 9; k += 1) {
      const a = a0 - Math.PI * (k / 9) * sign;
      out.push(new THREE.Vector2(centre.x + Math.cos(a) * width, centre.y + Math.sin(a) * width));
    }
    return out;
  };
  const pts = [];
  P.forEach((pt, i) => pts.push(new THREE.Vector2(pt.x + normals[i].x * w(i), pt.y + normals[i].y * w(i))));
  pts.push(...cap(P[P.length - 1], normals[P.length - 1], 1, w(P.length - 1)));
  for (let i = P.length - 1; i >= 0; i -= 1) {
    pts.push(new THREE.Vector2(P[i].x - normals[i].x * w(i), P[i].y - normals[i].y * w(i)));
  }
  pts.push(...cap(P[0], normals[0], -1, w(0)));
  return pts;
}

function bridge(path, halfWidth, z, colour = C.steel) {
  const pts = bridgeShape(path, halfWidth);
  const g = new THREE.Group();
  g.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(pts), 1)));
  g.add(poly(pts.map((p) => V(p.x, p.y, 0)), colour, 0.85, true));
  g.position.z = z;
  return g;
}

/** A screw: a disc with its slot. */
function screw(r, colour = INNER.fine) {
  const g = part(new THREE.CircleGeometry(r, 14), colour, 0.85);
  g.add(segs([V(-r * 0.78, 0, 0.002), V(r * 0.78, 0, 0.002)], colour, 0.95));
  return g;
}

/** A jewel: the ruby, and the rim of the chaton around it. */
function stone(r) {
  const g = new THREE.Group();
  g.add(occluder(new THREE.CircleGeometry(r * 1.5, 12)));
  g.add(ring(r * 1.5, INNER.fine, 0.6));
  g.add(node(r, C.ruby, 0.95));
  return g;
}

/** Diashock: Seiko's shock setting, and the one part of a 7S26 you can
    name from across the room. The balance jewel floats in a cone and is
    held there by a three-armed spring — a clover, not a ring — so a knock
    pushes the jewel aside instead of snapping the pivot. It is the brightest
    small thing on the back, so it is drawn at full strength. */
function diashock(r) {
  const g = new THREE.Group();
  g.add(occluder(new THREE.CircleGeometry(r * 2.1, 16)));
  g.add(ring(r * 2.1, INNER.fine, 0.45));
  const arms = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    let prev = null;
    for (let i = 0; i <= 8; i += 1) {
      const b = a - 0.62 + (1.24 * i) / 8;
      const p = V(Math.cos(b) * r * 1.65, Math.sin(b) * r * 1.65, 0.002);
      if (prev) arms.push(prev, p);
      prev = p;
    }
    arms.push(
      V(Math.cos(a) * r * 1.65, Math.sin(a) * r * 1.65, 0.002),
      V(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0.002),
    );
  }
  g.add(segs(arms, INNER.fine, 0.8));
  g.add(node(r * 0.55, C.ruby, 0.95));
  return g;
}

/* ================= the numbers =================
   One millimetre, in world units. Everything the case and the dial are made
   of is written in millimetres so the measurements stay readable, and the
   whole object lands inside the radius of 2.0 the stage scales against. The
   case radius is what sets that: at 1.49 the outer corner of a lug tip —
   the furthest point on the object, further than the tip's centre because
   it is off to one side — comes to 1.989, and nothing else gets near it. */
const CASE_R = 1.49;              // 37.0 mm across, crown excluded
const MM = CASE_R / 18.5;
const CASE_H = 4.1 * MM;          // half the mid-case; the crystal and the
                                  // display back carry it out to 11.7 mm
const DIAL_R = 14.7 * MM;         // the bezel's aperture — a 4 mm bezel
const TRACK = DIAL_R * 0.91;      // the minute track's outer end
const MOV_R = 13.7 * MM;          // the 7S26 is 27.4 mm across
const WIN_R = 13.5 * MM;          // the window in the back is 27 mm, so the
                                  // movement's own rim runs under the ring

/* The lugs, which are the measurement this watch lives or dies by.

     lug to lug          43 mm   ->  tips at y = +-1.732
     between the lugs    19 mm   ->  inner faces at x = +-0.765
     across the horns    25.4 mm ->  outer faces at x = +-1.023

   Three millimetres of lug past an 18.5 mm case radius is nothing, and that
   is the point: the flank leaves the case circle low down — twenty-two
   degrees above the waist — with the circle's own tangent, and runs almost
   straight from there to the tip. There is no shoulder, no notch and no
   root, because on the watch there is no join: the side of the case and the
   side of the lug are one surface that happens to stop being round. Drawn
   as four separate horns clipped against a circle it reads as tabs bolted
   on, which is exactly what it looked like before. */
const LUG_TIP = 21.5 * MM;
const LUG_IN = 9.5 * MM;
const LUG_OUT = 12.7 * MM;
const LUG_DEP = 22 * (Math.PI / 180);   // where the flank leaves the circle

/** One quarter of the case's plan outline, from the waist at 3 o'clock up
    to 12, as [x, y]. The other three are mirrors of it. */
function caseQuarter() {
  const q = [];
  const push = (x, y) => q.push([x, y]);

  // the waist: plain case circle, up to where the lug takes over
  for (let i = 0; i <= 8; i += 1) push(
    Math.cos((LUG_DEP * i) / 8) * CASE_R,
    Math.sin((LUG_DEP * i) / 8) * CASE_R,
  );

  /* The flank. A cubic that leaves the circle along the circle's own
     tangent and arrives at the tip very nearly vertical — which, because the
     tangent at twenty-two degrees is already leaning inward by about the
     same amount the lug tapers, is almost a straight line. That near
     coincidence is why the real case can get away with looking like one
     unbroken sweep. */
  const r = 0.06;                                   // the tip's corner radius
  const p0 = [Math.cos(LUG_DEP) * CASE_R, Math.sin(LUG_DEP) * CASE_R];
  const p3 = [LUG_OUT, LUG_TIP - r];
  const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const p1 = [p0[0] - Math.sin(LUG_DEP) * 0.35 * len, p0[1] + Math.cos(LUG_DEP) * 0.35 * len];
  const p2 = [p3[0] + 0.1203 * 0.35 * len, p3[1] - 0.9927 * 0.35 * len];
  for (let i = 1; i <= 14; i += 1) {
    const t = i / 14; const u = 1 - t;
    push(
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    );
  }

  // the tip: chamfered outside, flat across, chamfered inside
  for (let i = 1; i <= 4; i += 1) {
    const a = (i / 4) * (Math.PI / 2);
    push(LUG_OUT - r + Math.cos(a) * r, LUG_TIP - r + Math.sin(a) * r);
  }
  for (let i = 1; i <= 4; i += 1) {
    const a = Math.PI / 2 + (i / 4) * (Math.PI / 2);
    push(LUG_IN + r + Math.cos(a) * r, LUG_TIP - r + Math.sin(a) * r);
  }

  /* The inner face, and the fillet where it runs back into the case. The
     floor of the strap gap is the case's own wall — the lugs stand on it
     rather than being cut out of it — so this curve ends ON the circle and
     the arc across the top of the watch is the case, unmodified. */
  const yIn = Math.sqrt(Math.max(0, CASE_R * CASE_R - LUG_IN * LUG_IN));
  push(LUG_IN, yIn + 0.08);
  const aFil = Math.acos(Math.min(1, (LUG_IN + 0.055) / CASE_R));
  for (let i = 1; i <= 4; i += 1) {
    const t = i / 4; const u = 1 - t;
    const e = [Math.cos(aFil) * CASE_R, Math.sin(aFil) * CASE_R];
    push(
      u * u * LUG_IN + 2 * u * t * LUG_IN + t * t * e[0],
      u * u * (yIn + 0.08) + 2 * u * t * (yIn - 0.02) + t * t * e[1],
    );
  }
  for (let i = 1; i <= 12; i += 1) {
    const a = aFil + ((Math.PI / 2 - aFil) * i) / 12;
    push(Math.cos(a) * CASE_R, Math.sin(a) * CASE_R);
  }
  return q;
}

/** The whole plan outline, counter-clockwise, as one closed loop. */
function caseOutline() {
  const q = caseQuarter();
  const pts = q.slice();
  for (let i = q.length - 2; i >= 0; i -= 1) pts.push([-q[i][0], q[i][1]]);
  for (let i = 1; i < q.length; i += 1) pts.push([-q[i][0], -q[i][1]]);
  for (let i = q.length - 2; i >= 1; i -= 1) pts.push([q[i][0], -q[i][1]]);
  return pts;
}

/* The case as ONE body.

   Not a cylinder with things attached: a single shell lofted along the plan
   outline, where every point on that outline carries its own height. On the
   case circle it is the full mid-case; out at the lug tip it has shrunk to
   three millimetres and dropped, because a lug is the bottom edge of the
   case carrying on outward while the top of the case slopes away to meet
   it. That is why the bezel is a clean circle even though the plan is not —
   the lugs live below it.

   Three rings: the back, the waist, and the front. The waist is full width
   and the two faces are pulled in a little, which is the chamfer a polished
   case is finished with and the only reason the sides read as metal rather
   than as a wall. */
function caseShell() {
  const outline = caseOutline();
  const n = outline.length;
  const P = outline.map(([x, y]) => new THREE.Vector2(x, y));
  const N = P.map((_, i) => {
    const a = P[(i - 1 + n) % n]; const b = P[(i + 1) % n];
    const d = new THREE.Vector2().subVectors(b, a).normalize();
    return new THREE.Vector2(d.y, -d.x);        // counter-clockwise: outward
  });
  const rMax = Math.max(...P.map((p) => p.length()));
  // How far out past the case circle a point is, and what that does to the
  // section there: shorter, and dropped, so the lug ends up as the case's
  // bottom edge carrying on rather than as a slab at bezel height.
  const drop = (p) => {
    const t = Math.min(1, Math.max(0, (p.length() - CASE_R) / (rMax - CASE_R)));
    return { h: CASE_H * (1 - 0.62 * t), c: -CASE_H * 0.30 * t };
  };
  const prof = [[-1, 0.085], [0, 0], [1, 0.065]];
  const rings = prof.map(([u, inset]) => P.map((p, i) => {
    const { h, c } = drop(p);
    const k = inset * (h / CASE_H);
    return V(p.x - N[i].x * k, p.y - N[i].y * k, c + u * h);
  }));

  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  for (let j = 0; j + 1 < rings.length; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const i2 = (i + 1) % n;
      quad(rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]);
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

  /* The two faces, each the plan outline with the hole it frames punched
     out of it — the bezel's aperture at the front, the window at the back.
     Triangulated flat and then pushed into the third dimension afterwards,
     because the outline doubles back on itself where the lug meets the case
     and anything that assumes one radius per angle tears a hole there. */
  const capGeo = (rHole, sign) => {
    const shape = new THREE.Shape(P);
    const hole = new THREE.Path();
    for (let i = 0; i <= 72; i += 1) {
      const a = -(i / 72) * Math.PI * 2;
      hole.lineTo(Math.cos(a) * rHole, Math.sin(a) * rHole);
    }
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 1);
    const at = g.attributes.position;
    const v = new THREE.Vector2();
    for (let i = 0; i < at.count; i += 1) {
      const { h, c } = drop(v.set(at.getX(i), at.getY(i)));
      at.setZ(i, sign > 0 ? c + h : c - h);
    }
    if (sign < 0) g.setIndex(Array.from(g.getIndex().array).reverse());
    return g;
  };

  return {
    wall, caps: [capGeo(DIAL_R, 1), capGeo(WIN_R, -1)], rings, outline,
  };
}

/* ================= the movement's layout =================
   The 7S26 is authored the way Seiko draws it — looking at the train side,
   which is what the display back shows you, with the stem out at three
   o'clock. Everything is a fraction of the movement's radius, so the table
   reads as a movement rather than as a list of world coordinates.

   Two positions here are measured off Seiko's own drawing rather than
   guessed: the balance sits at 0.50 of the radius directly opposite the
   stem with a wheel a quarter of the radius across, and its cock runs down
   to it almost vertically with the screw at 0.52 above. The rest of the
   train is reconstructed from the tooth counts and the centre distances
   they force — a wheel drives the NEXT wheel's pinion, never its wheel,
   which is why the pinions are so small and why a train can cross a
   movement in four steps.

   The stem is the reason the movement is turned in the case at all. It
   leaves the 7S26 at three o'clock and the crown on this watch is at four,
   so the whole movement sits thirty degrees round from upright. */
const L = {
  barrel: { x: 0.50, y: 0.26, r: 0.34, teeth: 72 },
  centre: { x: 0.30, y: -0.22, r: 0.21, teeth: 54 },
  third: { x: 0.10, y: 0.10, r: 0.17, teeth: 45 },
  fourth: { x: 0.00, y: 0.00, r: 0.19, teeth: 50 },   // sweep seconds, at the centre
  escape: { x: -0.16, y: -0.20, r: 0.115, teeth: 15 },
  pallet: { x: -0.37, y: -0.10 },
  balance: { x: -0.52, y: 0.04, r: 0.25 },
  redA: { x: 0.05, y: 0.30, r: 0.13, teeth: 30 },     // driven off the rotor
  redB: { x: 0.30, y: 0.54, r: 0.15, teeth: 34 },     // and the pawl lever's wheel
};

export function build(o = {}) {
  const now = o.now || (() => Date.now());
  const [group, sp] = mk(0, -0.12);
  // Only the watch answers the crown. The module objects keep turning — the
  // crown holds the MOVEMENT still, which is what it says it does.
  group.userData.lockable = true;
  // It turns, the way every other object in this console turns. The crown is
  // what brings it back to facing you, and nothing else does.
  group.userData.spin = [0, 0.17, 0];
  group.userData.hitR = 2.1;
  const parts = group.userData.parts;

  /* ================= the case ================= */
  const shell = caseShell();
  sp.add(occluder(shell.wall));
  for (const c of shell.caps) sp.add(occluder(c));
  // The three outlines the shell is lofted through, and nothing else. A
  // case has no edges to find: it is polished, and what you see of it is
  // where it turns away from you.
  sp.add(poly(shell.rings[2], C.steel, 0.6, true));
  sp.add(poly(shell.rings[1], C.steel, 0.28, true));
  sp.add(poly(shell.rings[0], C.steel, 0.45, true));

  // The bezel's aperture and the window in the back.
  const bez = ring(DIAL_R, C.steel, 0.7); bez.position.z = CASE_H; sp.add(bez);
  const win = ring(WIN_R, C.steel, 0.6); win.position.z = -CASE_H; sp.add(win);
  const winIn = ring(WIN_R * 0.94, C.steel, 0.3); winIn.position.z = -CASE_H - 0.004; sp.add(winIn);

  /* Six notches round the back, not six screws: this case back screws in,
     and what it gives a case wrench to bite on is a set of slots cut in its
     rim. Screws would be a different watch entirely. */
  const notch = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    for (const d of [-0.055, 0.055]) {
      const b = a + d;
      notch.push(
        V(Math.cos(b) * (CASE_R - 0.16), Math.sin(b) * (CASE_R - 0.16), -CASE_H - 0.004),
        V(Math.cos(b) * (CASE_R - 0.04), Math.sin(b) * (CASE_R - 0.04), -CASE_H - 0.004),
      );
    }
  }
  sp.add(segs(notch, C.steel, 0.5));

  /* The crown, at FOUR o'clock. It is small — small enough that reviews of
     this watch complain about pulling it out — and it is set against the
     flank rather than standing off it, which is why the case looks
     uninterrupted from the front and why the crown never digs into a wrist.
     It sits wherever the outline happens to be at minus thirty degrees,
     which on this case is already out on the lower lug's flank. */
  const crownAngle = -Math.PI / 6;
  let crownR = CASE_R;
  let near = Infinity;
  for (const [x, y] of shell.outline) {
    const d = Math.abs(Math.atan2(y, x) - crownAngle);
    if (d < near) { near = d; crownR = Math.hypot(x, y); }
  }
  const crown = new THREE.Group();
  const crownBody = new THREE.CylinderGeometry(2.1 * MM, 2.1 * MM, 2.6 * MM, 20, 1, true);
  crownBody.rotateZ(Math.PI / 2);
  crown.add(part(crownBody, C.steel, 0.7, 30));
  const knurl = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    knurl.push(
      V(-1.3 * MM, Math.cos(a) * 2.12 * MM, Math.sin(a) * 2.12 * MM),
      V(1.3 * MM, Math.cos(a) * 2.12 * MM, Math.sin(a) * 2.12 * MM),
    );
  }
  crown.add(segs(knurl, C.steel, 0.3));
  crown.position.set(
    Math.cos(crownAngle) * (crownR + 1.0 * MM),
    Math.sin(crownAngle) * (crownR + 1.0 * MM),
    -CASE_H * 0.12,
  );
  crown.rotation.z = crownAngle;
  sp.add(crown);
  parts.crown = crown;

  // The spring bar across each pair of lugs, which is what actually holds a
  // strap, sitting a millimetre and a half in from the tips.
  for (const sy of [1, -1]) {
    const bar = new THREE.CylinderGeometry(0.4 * MM, 0.4 * MM, LUG_IN * 2 + 0.10, 10);
    bar.rotateZ(Math.PI / 2);
    // Forty-five degrees, not thirty: a ten-sided tube's facets are
    // thirty-six apart, and a threshold under that draws every one of them —
    // a spring bar that reads as a length of hatching.
    const b = part(bar, C.steel, 0.45, 45);
    b.position.set(0, sy * (LUG_TIP - 2.6 * MM), -CASE_H * 0.32);
    sp.add(b);
  }

  /* ================= the dial, at the front ================= */
  const face = new THREE.Group();
  face.position.z = 0.25;
  face.add(plate(DIAL_R, 0, C.steel, 0.65, 96));
  /* Sunburst, not guilloche. This dial is brushed in rays from the centre,
     which is the whole reason it reads black at one angle and grey at
     another and why people call the same reference black and blue in the
     same breath. Drawn as thirty faint rays: enough for the eye to catch
     the direction, few enough that it stays a finish rather than becoming
     content. */
  const rays = [];
  for (let i = 0; i < 30; i += 1) {
    const a = (i / 30) * Math.PI * 2;
    rays.push(
      V(Math.cos(a) * DIAL_R * 0.24, Math.sin(a) * DIAL_R * 0.24, 0.001),
      V(Math.cos(a) * DIAL_R * 0.95, Math.sin(a) * DIAL_R * 0.95, 0.001),
    );
  }
  face.add(segs(rays, C.rhodium, 0.10));
  // The flange between the minute track and the bezel, which on this dial
  // is a wide sloping ring and is most of why the face looks small.
  face.add(ring(DIAL_R * 0.985, C.rhodium, 0.3));

  /* The minute track. Sixty dashes hung off the outer edge, the ones on the
     hours twice as long as the rest — printed, not applied, and the only
     printing left on this dial. */
  const ticks = [];
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const len = TRACK * (i % 5 === 0 ? 0.073 : 0.039);
    ticks.push(
      V(Math.cos(a) * TRACK, Math.sin(a) * TRACK, 0.002),
      V(Math.cos(a) * (TRACK - len), Math.sin(a) * (TRACK - len), 0.002),
    );
  }
  face.add(segs(ticks, C.steel, 0.65));

  /* The indices: applied polished batons, long and slim, running from
     seven tenths of the track out to within a hair of it. Each is a steel
     frame with lume set into the whole of it, which is why the markers glow
     as bars and not as pips.

     Twelve o'clock is a DOUBLE baton — one wider plate carrying two lume
     bars side by side — and it is how you find the top of this dial without
     reading anything. There is no lume pip above it; the double marker IS
     the pip. Three o'clock has no index at all, because the day and date
     are cut through the dial there. */
  const IN = TRACK * 0.685;
  const OUT = TRACK * 0.955;
  const BAR_W = TRACK * 0.125;
  const marker = (a, w, off) => {
    const len = OUT - IN;
    const mid = (OUT + IN) / 2;
    const g = part(new THREE.PlaneGeometry(len, w), C.hot, 0.8);
    const nx = -Math.sin(a) * off; const ny = Math.cos(a) * off;
    g.position.set(Math.cos(a) * mid + nx, Math.sin(a) * mid + ny, 0.004);
    g.rotation.z = a;
    face.add(g);
    const lume = new THREE.Mesh(
      new THREE.PlaneGeometry(len * 0.74, w * 0.50),
      new THREE.MeshBasicMaterial({ color: LUME, transparent: true, opacity: 0.62 }),
    );
    lume.position.set(Math.cos(a) * mid + nx, Math.sin(a) * mid + ny, 0.006);
    lume.rotation.z = a;
    face.add(lume);
  };
  for (let i = 0; i < 12; i += 1) {
    if (i === 3) continue;
    const a = Math.PI / 2 - (i / 12) * Math.PI * 2;
    if (i === 0) {
      const w = TRACK * 0.084;
      marker(a, w, TRACK * 0.058);
      marker(a, w, -TRACK * 0.058);
    } else {
      marker(a, BAR_W, 0);
    }
  }

  /* The day-date at three. It is the one feature you would name this watch
     by from across a room: a single aperture with a polished surround, a
     divider down it, the day on the left in two thirds of the width and the
     date on the right in the rest. The wheels behind it are black with
     white figures, because this dial is dark — a white wheel in a dark dial
     is a different reference. */
  const winG = new THREE.Group();
  winG.position.set(TRACK * 0.66, 0, 0.004);
  const winW = TRACK * 0.74;
  /* The aperture is 2.7 wide to 1 tall, measured on the photograph. It was
     3.7 here — a letterbox — and no amount of setting the type right fixes
     a window of the wrong shape: the figures had to stay small to sit in
     it, so the whole thing read as a label printed on the dial rather than
     a wheel seen through a hole. */
  const winH = winW / 2.73;
  winG.add(poly(roundRect(winW, winH, winH * 0.24, 0.002), C.hot, 0.75, true));
  winG.add(poly(roundRect(winW + 0.04, winH + 0.04, winH * 0.3, 0.001), C.steel, 0.5, true));
  /* Where the wheels meet. Measured on the photograph the day takes 54%
     of the aperture and the date 46% — near enough halves. This had the
     day on 63%, which left the date pane too narrow for two figures at
     the size they are actually printed and was half of why "25" kept
     reading as condensed. */
  /* 56%, a shade over the 54% the photograph gives. The measured watch
     prints its day in a NARROW face; this one is set in a wide one, and
     at 54% the widest day had to be squeezed past the point where it
     still looks like the same typeface. Two points of pane buys that
     back. */
  const DAY_PANE = 0.56;
  const divide = -winW / 2 + winW * DAY_PANE;
  winG.add(segs([V(divide, -winH / 2, 0.002), V(divide, winH / 2, 0.002)], C.hot, 0.45));
  /* The day pane is cut for the longer of the two languages, not for
     "FRI": the glyphs are drawn at a fixed height either way, so a wider
     pane costs an English day nothing but margin, while a narrower one
     would shrink "الثلاثاء" until it was a smudge. */
  const lang0 = pref('dayLang');
  const dayText = printedPlane(winW * DAY_PANE * 0.94, winH * 0.86,
    DAYS[lang0][new Date(now()).getDay()], '#e6e6e6',
    lang0 === 'ar' ? 'ar' : 'day', DAYS[lang0]);
  dayText.position.set((-winW / 2 + divide) / 2, 0, 0.006);
  winG.add(dayText);
  const dateText = printedPlane(winW * (1 - DAY_PANE) * 0.94, winH * 0.86,
    '25', '#e6e6e6', 'num', DATES);
  dateText.position.set((divide + winW / 2) / 2, 0, 0.006);
  winG.add(dateText);
  face.add(winG);
  parts.dayText = dayText;
  parts.dateText = dateText;

  /* The hands. A watch hand is a body with an outline — the solid is what
     lets it pass over a marker and hide it. These are batons: a narrow neck
     at the pinion, full width by a tenth of the way out, then a long shallow
     taper to a blunt chisel tip, with lume down the middle stopping short
     of the point. The minute hand reaches into the track; the hour hand
     stops where the indices begin. */
  const hand = (len, w, colour) => {
    const tail = len * 0.09;
    const outline = [
      V(-tail, -w * 0.40, 0.001), V(len * 0.12, -w, 0.001),
      V(len * 0.86, -w * 0.86, 0.001), V(len, -w * 0.16, 0.001),
      V(len, w * 0.16, 0.001), V(len * 0.86, w * 0.86, 0.001),
      V(len * 0.12, w, 0.001), V(-tail, w * 0.40, 0.001),
    ];
    const s = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.Group();
    g.add(occluder(new THREE.ShapeGeometry(s, 1)));
    g.add(poly(outline, colour, 0.95, true));
    const lume = new THREE.Mesh(
      new THREE.PlaneGeometry(len * 0.56, w * 1.00),
      new THREE.MeshBasicMaterial({ color: LUME, transparent: true, opacity: 0.7 }),
    );
    lume.position.set(len * 0.51, 0, 0.003);
    g.add(lume);
    return g;
  };
  const hourHand = hand(TRACK * 0.65, TRACK * 0.058, C.hot);
  hourHand.position.z = 0.008;
  const minHand = hand(TRACK * 0.94, TRACK * 0.048, C.hot);
  minHand.position.z = 0.012;
  face.add(hourHand, minHand);

  /* Centre seconds, in the colour reserved for the live second — a plain
     needle with the short tapered counterweight every seconds hand carries
     to balance it about the pivot. It JUMPS: this is the console's clock. */
  const secLen = TRACK * 0.97;
  const secHand = new THREE.Group();
  secHand.add(poly([V(-secLen * 0.16, 0, 0.018), V(secLen, 0, 0.018)], C.beat, 1));
  const tailPts = [
    V(-secLen * 0.16, 0, 0.018), V(-secLen * 0.13, -0.032, 0.018),
    V(-secLen * 0.045, -0.022, 0.018), V(-secLen * 0.045, 0.022, 0.018),
    V(-secLen * 0.13, 0.032, 0.018),
  ];
  secHand.add(poly(tailPts, C.beat, 0.85, true));
  face.add(secHand);

  /* The stopwatch's hand: a fine needle in the train's grey (C.brass is
     a role name now, not a hue) — over the seconds hand, with a
     round counterweight so it cannot be mistaken for it. Only there while
     the stopwatch has time on it, and it SWEEPS, as a chronograph does. */
  const chronoHand = new THREE.Group();
  chronoHand.add(poly([V(-secLen * 0.2, 0, 0.02), V(secLen * 0.99, 0, 0.02)], C.brass, 1));
  const cw = ring(0.035, C.brass, 0.9, 'z', 20);
  cw.position.set(-secLen * 0.16, 0, 0.02);
  chronoHand.add(cw);
  chronoHand.visible = false;
  face.add(chronoHand);
  const cap = node(0.038, C.blued, 0.9);
  cap.position.z = 0.022;
  face.add(cap);
  parts.hourHand = hourHand;
  parts.minHand = minHand;
  parts.secHand = secHand;
  parts.chronoHand = chronoHand;
  sp.add(face);

  /* ================= the movement, at the back =================
     `back` turns the movement to face the other way so it can be authored
     looking AT it; `mov` scales the layout table out of movement radii into
     world units and turns the whole thing thirty degrees, which is what puts
     the stem under the crown at four o'clock. */
  const back = new THREE.Group();
  back.rotation.y = Math.PI;
  back.position.z = -0.10;
  sp.add(back);

  const mov = new THREE.Group();
  mov.scale.setScalar(MOV_R);
  mov.rotation.z = -Math.PI * 5 / 6;
  back.add(mov);

  mov.add(plate(1.0, -0.09, INNER.frame, 0.6, 96));

  /* ---- the barrel: the mainspring, and where alerts live ---- */
  const B = L.barrel;
  const barrel = new THREE.Group();
  barrel.position.set(B.x, B.y, -0.03);
  barrel.add(wheelPart(B.r, B.teeth, INNER.wheel, 0));
  barrel.add(spiral(3.6, B.r * 0.2, B.r * 0.82, INNER.wheel, 0.45));
  const ratchet = wheelPart(B.r * 0.56, 22, INNER.fine, 0);
  ratchet.position.z = 0.05;
  barrel.add(ratchet);
  const ratchetPulse = pulseRing(B.r * 0.58, B.r * 0.98, C.warn, 0.02);
  ratchetPulse.mesh.position.z = 0.055;
  barrel.add(ratchetPulse.mesh);
  const arbor = screw(0.045);
  arbor.position.z = 0.065;
  barrel.add(arbor);
  mov.add(barrel);
  parts.barrel = barrel;
  parts.ratchet = ratchet;
  parts.ratchetPulse = ratchetPulse;

  /* ---- the going train ----
     Barrel to centre to third to fourth to escape. The fourth is at the
     movement's own centre because this is a sweep-seconds calibre: the hand
     is on that arbor, and the rotor's ball bearing sits directly over it. */
  const train = [];
  for (const key of ['centre', 'third', 'fourth']) {
    const w = L[key];
    const g = wheelPart(w.r, w.teeth, INNER.wheel);
    g.position.set(w.x, w.y, -0.05);
    mov.add(g);
    train.push(g);
    const pin = wheelPart(w.r * 0.24, 8, INNER.fine, 0);
    pin.position.set(w.x, w.y, -0.075);
    mov.add(pin);
  }

  const E = L.escape;
  const escape = wheelPart(E.r, E.teeth, INNER.fine, 3);
  escape.position.set(E.x, E.y, -0.045);
  mov.add(escape);
  parts.escape = escape;

  /* ---- the escapement ---- */
  const F = L.pallet;
  const fork = new THREE.Group();
  for (const path of [[[0.30, -0.02], [0.02, 0.0], [-0.14, 0.20]], [[0.04, -0.01], [0.24, -0.20]]]) {
    const pts = bridgeShape(path, 0.038);
    fork.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(pts), 1)));
    fork.add(poly(pts.map((p) => V(p.x, p.y, 0)), INNER.fine, 0.85, true));
  }
  for (const [px, py] of [[0.30, -0.02], [0.24, -0.20]]) {
    const pallet = node(0.03, C.ruby, 0.95);
    pallet.position.set(px, py, 0.004);
    fork.add(pallet);
  }
  fork.position.set(F.x, F.y, -0.005);
  mov.add(fork);
  parts.fork = fork;

  /* ---- the balance: the part that decides what a second is ----
     A quarter of the movement's radius across and half a radius out from
     the centre, dead opposite the stem — which is Seiko's own drawing, not
     a composition. Two arms and a plain rim: a 7S26 balance carries no
     timing screws at all, because it is regulated at the hairspring and
     nowhere else. */
  const G = L.balance;
  const balance = new THREE.Group();
  balance.position.set(G.x, G.y, 0.035);
  balance.add(ring(G.r, INNER.wheel, 0.9));
  balance.add(ring(G.r * 0.88, INNER.wheel, 0.4));
  const arms = [];
  for (let i = 0; i < 2; i += 1) {
    const a = (i * Math.PI) / 2 + 0.4;
    const w = 0.03;
    const nx = -Math.sin(a) * w; const ny = Math.cos(a) * w;
    for (const sgn of [1, -1]) {
      arms.push(
        V(Math.cos(a) * G.r + nx * sgn, Math.sin(a) * G.r + ny * sgn, 0),
        V(-Math.cos(a) * G.r + nx * sgn, -Math.sin(a) * G.r + ny * sgn, 0),
      );
    }
  }
  balance.add(segs(arms, INNER.wheel, 0.6));
  const roller = node(0.026, C.ruby, 0.95);
  roller.position.set(G.r * 0.3, -0.04, -0.02);
  balance.add(roller);
  mov.add(balance);
  parts.balance = balance;

  const hair = spiral(4.8, 0.045, G.r * 0.66, INNER.fine, 0.6);
  hair.position.set(G.x, G.y, 0.055);
  mov.add(hair);
  parts.hair = hair;

  /* ---- the bridges ----
     One big barrel and train wheel bridge over the barrel, the third and
     the fourth, running out to the rim on the far side; a small centre
     wheel bridge along the bottom carrying the centre and the escape; the
     balance cock dropping almost straight down onto the balance with its
     screw half a radius above it; and the pallet cock beside it. */
  const trainPath = [[0.90, 0.50], [B.x, B.y], [0.16, 0.10], [-0.10, -0.46], [-0.46, -0.80]];
  const trainW = (t) => 0.34 - t * 0.16;
  mov.add(bridge(trainPath, trainW, 0.045, INNER.frame));
  /* The chamfer round the bridge's edge. Every bridge in every movement has
     one and it is the only finishing worth drawing at this size: a second
     line just inside the first, which is what a bevelled edge looks like
     from straight on. Striping was the other candidate and it was wrong —
     parallel lines across a solid read as a section cut, not as brushing. */
  const chamfer = poly(
    bridgeShape(trainPath, (t) => trainW(t) - 0.035).map((p) => V(p.x, p.y, 0)),
    INNER.frame, 0.35, true,
  );
  chamfer.position.z = 0.047;
  mov.add(chamfer);

  mov.add(bridge([[0.40, -0.30], [0.06, -0.34], [E.x - 0.04, E.y - 0.02]], 0.15, 0.04, INNER.frame));

  /* Narrow where it lands on the balance, wide at its foot. A cock drawn
     as broad as the wheel it carries hides the wheel completely, which is
     the one thing on this side of the movement worth seeing. */
  const cock = bridge([[-0.47, 0.62], [-0.50, 0.32], [G.x, G.y]], (t) => 0.16 - t * 0.05, 0.085, INNER.frame);
  mov.add(cock);
  mov.add(bridge([[-0.62, -0.30], [F.x - 0.02, F.y - 0.02]], 0.10, 0.07, INNER.frame));

  /* The regulator, on the cock just above the balance: an index arm between
     a plus and a minus, and the stud the hairspring's outer end is pinned
     to. It is the only adjustment this movement has. */
  const idx = poly([V(-0.50, 0.30, 0.092), V(-0.36, 0.22, 0.092)], INNER.fine, 0.8);
  mov.add(idx);
  const reg = [];
  for (const [x, y, plus] of [[-0.585, 0.30, true], [-0.415, 0.30, false]]) {
    reg.push(V(x - 0.022, y, 0.092), V(x + 0.022, y, 0.092));
    if (plus) reg.push(V(x, y - 0.022, 0.092), V(x, y + 0.022, 0.092));
  }
  mov.add(segs(reg, INNER.fine, 0.65));

  /* ---- the winding, on top of the bridge ----
     Seiko's Magic Lever: the rotor's pinion turns the first reduction wheel,
     an eccentric on it rocks a long two-clawed pawl lever, and the claws
     push the ratchet wheel round — one pulling, one pushing, so the weight
     winds whichever way it happens to be going. It is the reason a 7S26 has
     no reversing wheels and the reason the whole assembly is a lever rather
     than a gear. */
  const A = L.redA; const D = L.redB;
  const redA = wheelPart(A.r, A.teeth, INNER.fine, 3);
  redA.position.set(A.x, A.y, 0.095);
  mov.add(redA);
  const redB = wheelPart(D.r, D.teeth, INNER.fine, 3);
  redB.position.set(D.x, D.y, 0.105);
  mov.add(redB);
  const pawl = new THREE.Group();
  for (const path of [[[0, 0], [0.12, -0.20], [0.24, -0.29]], [[0.12, -0.20], [0.26, -0.20]]]) {
    const pts = bridgeShape(path, 0.028);
    pawl.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(pts), 1)));
    pawl.add(poly(pts.map((p) => V(p.x, p.y, 0)), INNER.fine, 0.8, true));
  }
  pawl.position.set(D.x, D.y, 0.12);
  mov.add(pawl);
  parts.pawl = pawl;

  // The click, holding the ratchet against the mainspring's pull.
  const clickPts = bridgeShape([[0.86, 0.02], [0.78, 0.18], [0.70, 0.28]], 0.026);
  const click = new THREE.Group();
  click.add(occluder(new THREE.ShapeGeometry(new THREE.Shape(clickPts), 1)));
  click.add(poly(clickPts.map((p) => V(p.x, p.y, 0)), INNER.fine, 0.75, true));
  click.position.z = 0.056;
  mov.add(click);

  /* The stem, coming in at three o'clock, which is the whole reason the
     movement sits turned in the case. It stops at the clutch. */
  mov.add(segs([V(0.99, 0, 0.0), V(0.66, 0, 0.0)], INNER.fine, 0.7));
  const clutch = wheelPart(0.08, 10, INNER.fine, 0);
  clutch.position.set(0.70, 0, 0.0);
  mov.add(clutch);

  /* ---- jewels ----
     Twenty-one of them, of which these are the ones a display back shows:
     the balance under its Diashock, the pallet staff, the escape and third
     wheels under their cap jewels, and the rest of the train. */
  const shock = diashock(0.032);
  shock.position.set(G.x, G.y, 0.10);
  mov.add(shock);

  for (const [x, y, z, r] of [
    [F.x, F.y, 0.08, 0.026],
    [E.x, E.y, 0.05, 0.026],
    [L.third.x, L.third.y, 0.05, 0.028],
    [L.centre.x, L.centre.y, 0.05, 0.03],
    [A.x, A.y, 0.108, 0.024],
    [D.x, D.y, 0.135, 0.024],
  ]) {
    const j = stone(r);
    j.position.set(x, y, z);
    mov.add(j);
  }
  for (const [x, y, z] of [
    [0.90, 0.50, 0.052], [-0.46, -0.80, 0.052], [-0.10, -0.46, 0.052],
    [-0.47, 0.54, 0.092], [-0.62, -0.30, 0.077], [0.40, -0.30, 0.047],
  ]) {
    const s = screw(0.04);
    s.position.set(x, y, z);
    mov.add(s);
  }

  /* ---- the weight ----
     The 7S26's oscillating weight: a little over a half-disc of heavy metal
     on a ball bearing at the movement's own centre, free to turn all the way
     round in either direction. It is the first thing you see through a
     display back and the last thing anybody expects to be doing anything.

     Its shape is the calibre's, not a generic fan. The mass is a stepped rim
     out at the edge; the body is pierced by two kidney slots and one small
     round hole — the hole you line up with the one in the balance cock when
     you put the weight back on; and the straight side is scalloped away on
     one flank so the winding train underneath can be reached without taking
     the weight off. */
  const rotor = new THREE.Group();
  rotor.position.z = 0.165;
  const rOut = 0.93;
  const flatY = -0.155;
  const rBoss = 0.30;
  const xOut = Math.sqrt(rOut * rOut - flatY * flatY);
  const xBoss = Math.sqrt(rBoss * rBoss - flatY * flatY);
  const aOut = Math.atan2(flatY, xOut);
  const segPts = [];
  for (let i = 0; i <= 96; i += 1) {
    const t = aOut + (i / 96) * (Math.PI - 2 * aOut);
    segPts.push(V(Math.cos(t) * rOut, Math.sin(t) * rOut, 0));
  }
  // the scalloped flank, cut up into the body on the left of the hub
  for (let i = 0; i <= 18; i += 1) {
    const x = -xOut + ((-0.30 + xOut) * i) / 18;
    const k = (x + 0.80) / 0.50;
    const bump = k > 0 && k < 1 ? 0.24 * Math.sin(Math.PI * k) ** 2 : 0;
    segPts.push(V(x, flatY + bump, 0));
  }
  for (let i = 0; i <= 14; i += 1) {
    const t = Math.PI + Math.atan2(-flatY, xBoss) + (i / 14)
      * (Math.PI - 2 * Math.atan2(-flatY, xBoss));
    segPts.push(V(Math.cos(t) * rBoss, Math.sin(t) * rBoss, 0));
  }
  for (let i = 0; i <= 6; i += 1) segPts.push(V(xBoss + ((xOut - xBoss) * i) / 6, flatY, 0));
  const shape = new THREE.Shape(segPts.map((p) => new THREE.Vector2(p.x, p.y)));
  rotor.add(occluder(new THREE.ShapeGeometry(shape, 12)));
  rotor.add(poly(segPts, INNER.wheel, 0.9, true));
  // The heavy rim: an arc, not a ring, because the mass stops where the
  // half-disc does.
  const step = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = aOut + (i / 64) * (Math.PI - 2 * aOut);
    step.push(V(Math.cos(t) * rOut * 0.84, Math.sin(t) * rOut * 0.84, 0.002));
  }
  rotor.add(poly(step, INNER.frame, 0.4));
  // The two kidney slots and the index hole.
  for (const [ang, rr] of [[0.92, 0.46], [Math.PI - 0.92, 0.46]]) {
    const slot = poly(roundRect(0.075, 0.23, 0.037, 0.002), INNER.frame, 0.55, true);
    slot.position.set(Math.cos(ang) * rr, Math.sin(ang) * rr, 0);
    slot.rotation.z = ang;
    rotor.add(slot);
  }
  const hole = ring(0.042, INNER.frame, 0.5);
  hole.position.set(0, 0.62, 0.002);
  rotor.add(hole);
  // The ball bearing and its inside screw.
  rotor.add(ring(0.24, INNER.fine, 0.5));
  rotor.add(ring(0.16, INNER.fine, 0.6));
  rotor.add(segs([V(-0.10, 0, 0.004), V(0.10, 0, 0.004)], INNER.fine, 0.8));
  rotor.add(node(0.04, C.ruby, 0.9));
  mov.add(rotor);
  parts.rotor = rotor;

  /* The case back's window.

     A movement is a size. It is not shrunk to suit a case — it is CUT OFF by
     one, which is what looking through a display back actually shows you:
     the 7S26 is 27.4 mm across and the window in front of it is smaller, so
     the bridges and the weight run out of sight under the ring rather than
     stopping politely short of it.

     Sixteen planes stand in for the circle. They are written in the
     movement's own frame and pushed into world space every frame, because
     world space is the only space three.js clips in and this object turns. */
  const CLIP_N = 16;
  const clipLocal = [];
  const clipWorld = [];
  for (let i = 0; i < CLIP_N; i += 1) {
    const a = (i / CLIP_N) * Math.PI * 2;
    clipLocal.push(new THREE.Plane(new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0), WIN_R));
    clipWorld.push(new THREE.Plane());
  }
  back.traverse((n) => {
    if (!n.material) return;
    for (const m of (Array.isArray(n.material) ? n.material : [n.material])) m.clippingPlanes = clipWorld;
  });
  const clipToCase = () => {
    back.updateWorldMatrix(true, false);
    for (let i = 0; i < CLIP_N; i += 1) clipWorld[i].copy(clipLocal[i]).applyMatrix4(back.matrixWorld);
  };
  clipToCase();

  /* ---- motion ---------------------------------------------------------
     The hands come from the clock, the train turns at the ratios its tooth
     counts give it, and the balance beats three times a second — 21,600
     vibrations an hour, which is the 7S26's own rate and the rate the
     seconds hand steps in time with. */
  let beat = 0;
  let lastSecond = -1;
  let lastDay = -1;
  let lastLang = pref('dayLang');
  /* The weight is a pendulum, and the only honest way to move it is to let
     gravity do it.

     `spin` is the rotor's OWN angle, in the movement's frame, and it is what
     gets integrated. Gravity pulls on it toward whatever counts as down
     inside the plane it turns in; turning the watch moves that direction and
     the weight has to catch up. Measuring the angle relative to down instead
     — which the first cut did — makes the weight track the case exactly, with
     no lag and no overshoot: a rotor with no mass at all. */
  let spin = 0.3;
  let spinV = 0;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const EX = new THREE.Vector3();
  const EY = new THREE.Vector3();
  const MAT = new THREE.Matrix4();

  group.userData.tick = (t, dt, p, env) => {
    const slow = env && env.reduced ? 0.3 : 1;
    const d = new Date(now());
    clipToCase();

    /* The seconds hand SWEEPS, because this is a mechanical watch and a
       mechanical seconds hand does not tick once a second — it steps once a
       beat. Six a second, which is the 21,600 vibrations an hour this
       movement runs at, and which the balance below beats in time with. It
       is still the true second: the step is quantised off `now()`, not off
       an animation frame, so the hand is never between two seconds by more
       than a sixth of one. */
    const beatsPerSec = 6;
    const ticks = Math.floor((d.getTime() / 1000) * beatsPerSec) % (60 * beatsPerSec);
    if (ticks !== lastSecond) {
      lastSecond = ticks;
      p.secHand.rotation.z = Math.PI / 2 - (ticks / (60 * beatsPerSec)) * Math.PI * 2;
    }
    const day = d.getDate();
    const lang = pref('dayLang');
    if (day !== lastDay || lang !== lastLang) {
      lastDay = day; lastLang = lang;
      p.dateText.userData.set(String(day));
      p.dayText.userData.set(DAYS[lang][d.getDay()], lang === 'ar' ? 'ar' : 'day', DAYS[lang]);
    }
    const chrono = o.chrono?.();
    p.chronoHand.visible = chrono != null;
    if (chrono != null) p.chronoHand.rotation.z = Math.PI / 2 - ((chrono % 60_000) / 60_000) * Math.PI * 2;
    const mins = d.getMinutes() + d.getSeconds() / 60;
    const hours = (d.getHours() % 12) + mins / 60;
    p.minHand.rotation.z = Math.PI / 2 - (mins / 60) * Math.PI * 2;
    p.hourHand.rotation.z = Math.PI / 2 - (hours / 12) * Math.PI * 2;

    if (!(env && env.locked)) {
      const dd = dt * slow;
      barrel.rotation.z += dd * 0.06;
      train.forEach((w, i) => { w.rotation.z += (i % 2 ? -1 : 1) * dd * (0.5 + i * 0.9); });
      escape.rotation.z -= dd * 3.2;

      beat += dd * Math.PI * 2 * (env && env.reduced ? 0.6 : 3);
      p.fork.rotation.z = Math.sin(beat) * 0.16;
      p.balance.rotation.z = Math.sin(beat) * 2.3;
      const breathe = 1 + Math.cos(beat) * 0.04;
      p.hair.scale.set(breathe, breathe, 1);
      p.hair.rotation.z = Math.sin(beat) * 0.55;

      /* The weight. Its plane's own axes in the world tell us which way is
         down INSIDE that plane, and how much of gravity is in it at all: face
         on, all of it; edge on, none, and the weight simply coasts. */
      // The rotor's PARENT, not the rotor. Reading the axes off the rotor
      // itself folds its own angle into the measurement, and the equation
      // then solves for an angle relative to itself — which is a rotor that
      // sits still, or spins, depending on the sign of the error.
      // The world matrix is also a frame stale at this point in the loop,
      // so it is brought up to date first.
      const frame = p.rotor.parent;
      frame.updateWorldMatrix(true, false);
      MAT.copy(frame.matrixWorld);
      EX.setFromMatrixColumn(MAT, 0).normalize();
      EY.setFromMatrixColumn(MAT, 1).normalize();
      const gx = DOWN.dot(EX);
      const gy = DOWN.dot(EY);
      const pull = Math.hypot(gx, gy);
      const down = Math.atan2(gy, gx);
      /* A damped pendulum, integrated on the rotor's own angle. The mass
         sits at the middle of the segment, a quarter turn from the angle the
         group is drawn at, so that is what gravity acts on.

         The two constants are the whole character of the thing. The first is
         how hard gravity has hold of it — and a HEAVY weight falls hard, so
         this is high: it drops to the bottom in about half a second rather
         than drifting there. (Slowing it down reads as light and lazy, not as
         heavy, which is the wrong way round and was the first guess.) The
         second is damping, kept low against it so the weight carries well
         past the bottom and swings back several times before it settles —
         momentum is the other half of looking massive. */
      const mass = spin + Math.PI / 2;
      spinV += (-27 * pull * Math.sin(mass - down) - 1.05 * spinV) * dd;
      spin += spinV * dd;
      p.rotor.rotation.z = spin;
      // The Magic Lever is driven by the weight and by nothing else, so the
      // reduction wheels turn with it and the pawl rocks as it goes. A rotor
      // that swings over a winding train standing still is a rotor that is
      // not connected to anything.
      redA.rotation.z = -spin * 5;
      redB.rotation.z = spin * 3.4;
      p.pawl.rotation.z = Math.sin(spin * 5) * 0.07;
    }

    if (p.alertLevel) p.ratchetPulse.at((t * 0.55) % 1);
    else p.ratchetPulse.mesh.material.opacity = 0;
  };

  /* ---- what needs attention, on the mainspring ---- */
  parts.alertLevel = null;
  const ALERT = { warn: C.warn, err: C.bad };
  function setAlert(level) {
    parts.alertLevel = ALERT[level] ? level : null;
    const colour = parts.alertLevel ? ALERT[level] : INNER.fine;
    parts.ratchet.traverse((n) => {
      // Any material with a colour: the lines are LineMaterial now, not
      // LineBasicMaterial, and a check for the old class silently stopped
      // finding them.
      if (n.material && n.material.color) n.material.color.setHex(colour);
    });
    parts.ratchetPulse.mesh.material.color.setHex(colour);
    if (!parts.alertLevel) parts.ratchetPulse.mesh.material.opacity = 0;
  }
  setAlert(o.alert);

  /* The crown, held: the watch comes back to face you. A locked movement
     stopped wherever it happened to be would be locked at an angle, which is
     not what "hold it still so I can read it" means. */
  return { group, setAlert };
}
