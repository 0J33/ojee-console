/* ============================================================
   movement/models/home — the room being conditioned.

   The first version of this was a house with an air conditioner stuck on
   the outside wall, which is two mistakes in one object: nobody's AC hangs
   off the front of their house, and a house says "property" when the module
   says "the bedroom is 25.5 and cooling to 26".

   So the object is the thing the module actually drives: a wall-mounted
   split unit, in the corner of a room, moving air. Everything it reports is
   something you can see happening — the louvre sits at the angle the swing
   is set to, the air leaves it at the speed the fan is running and in the
   colour of the mode, and the two marks on the wall scale are where the
   room IS and where it has been told to get to. Switched off, the louvre
   closes and the air stops; there is nothing else to say.

   The room is drawn at the weight of a pencil line. It is context, not
   subject: enough corner to know the unit is indoors and high on a wall,
   and not one line more.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, edges, node, occluder, ring, mk,
} from '../kit.js';

/* The unit, in the room's units. A split indoor unit is about a metre wide
   and a third of that tall, mounted near the ceiling. */
const W = 1.78;          // the unit's width
const UH = 0.46;         // its height
const UD = 0.34;         // its depth
const UY = 0.40;         // how high on the wall it hangs
const FLOOR = -0.86;
const STREAMS = 3;       // chevrons of air leaving the louvre
const SCALE_X = 1.16;    // the wall scale, off to one side
const SCALE_TOP = 0.44;
const SCALE_BOT = -0.52;
const T_MIN = 16;        // what the scale spans, in degrees
const T_MAX = 32;

const num = (v) => (Number.isFinite(+v) ? +v : null);
const keep = (o) => { o.userData.o0 = o.material.opacity; return o; };

/** Where a temperature sits on the wall scale. */
const atTemp = (t) => {
  const k = Math.max(0, Math.min(1, (t - T_MIN) / (T_MAX - T_MIN)));
  return SCALE_BOT + (SCALE_TOP - SCALE_BOT) * k;
};

export function build(opts = {}) {
  const [group, sp] = mk(0.02, -0.26);
  // The scene's mass sits high and forward of the wall it hangs on, so the
  // whole of it is shifted back onto the origin the stage scales about.
  sp.position.set(0, 0.06, -0.20);
  /* A lean, not a revolution: the front of this is the side worth
     looking at, and turning it all the way round spent half the time
     showing its back. */
  group.userData.sway = [0.055, 0.30, 0.022];
  group.userData.swayPeriod = 10.5;
  group.userData.swayPhase = 0.0;
  group.userData.hitR = 2.1;
  const parts = group.userData.parts;

  /* ---- what it is mounted on ----
     Not a room. A room drawn in full is graph paper, and a flat wall is a
     sliver the moment the object turns side on — which it does, all day.
     What is needed is only enough wall to say "indoors, mounted high", so
     it is a panel a little wider than the unit, and a floor ellipse under
     it of the kind everything else in this console stands on. */
  const wallZ = -UD / 2 - 0.02;
  const wallW = W * 0.34;
  sp.add(keep(segs([
    // the rail it hooks over, and the two arms down to the wall
    V(-wallW, UY + UH * 0.44, wallZ), V(wallW, UY + UH * 0.44, wallZ),
    V(-wallW, UY + UH * 0.44, wallZ), V(-wallW, UY - UH * 0.42, wallZ),
    V(wallW, UY + UH * 0.44, wallZ), V(wallW, UY - UH * 0.42, wallZ),
    V(-wallW, UY - UH * 0.42, wallZ), V(wallW, UY - UH * 0.42, wallZ),
  ], C.rhodium, 0.3)));

  // The floor the air arrives at.
  const plinth = ring(0.86, C.rhodium, 0.26, 'y');
  plinth.position.set(0, FLOOR, UD / 2 + 0.34);
  sp.add(keep(plinth));
  const plinth2 = ring(0.58, C.rhodium, 0.12, 'y');
  plinth2.position.copy(plinth.position);
  sp.add(keep(plinth2));

  /* ---- the unit ---- */
  const unitG = new THREE.Group();
  unitG.position.set(0, UY, 0);
  sp.add(unitG);

  const body = new THREE.BoxGeometry(W, UH, UD);
  unitG.add(occluder(body));
  const shell = edges(body, C.steel, 0.9);
  unitG.add(shell);

  // The intake grille across the top face, and the maker's small display.
  const grille = [];
  for (let i = 1; i < 9; i += 1) {
    const x = -W / 2 + (i / 9) * W;
    grille.push(V(x, UH / 2 + 0.001, -UD / 2 + 0.03), V(x, UH / 2 + 0.001, UD / 2 - 0.03));
  }
  unitG.add(keep(segs(grille, C.rhodium, 0.4)));

  const face = new THREE.Group();
  face.position.z = UD / 2 + 0.002;
  unitG.add(face);
  face.add(keep(poly([
    V(-W / 2 + 0.06, -UH / 2 + 0.05), V(W / 2 - 0.06, -UH / 2 + 0.05),
    V(W / 2 - 0.06, UH / 2 - 0.05), V(-W / 2 + 0.06, UH / 2 - 0.05),
  ], C.rhodium, 0.28, true)));

  /* The readout on the unit's own face: the setpoint, the way these things
     show it. Two marks either side stand in for the digits at this size. */
  const readout = new THREE.Group();
  readout.position.set(W / 2 - 0.30, 0, 0.003);
  face.add(readout);
  readout.add(keep(poly([
    V(-0.13, -0.06), V(0.13, -0.06), V(0.13, 0.06), V(-0.13, 0.06),
  ], C.steel, 0.5, true)));
  const digits = keep(segs([
    V(-0.07, -0.03, 0.001), V(-0.07, 0.03, 0.001),
    V(-0.02, -0.03, 0.001), V(-0.02, 0.03, 0.001),
    V(0.04, -0.03, 0.001), V(0.04, 0.03, 0.001),
    V(0.09, -0.03, 0.001), V(0.09, 0.03, 0.001),
  ], C.hot, 0.85));
  readout.add(digits);

  /* ---- the louvre ----
     Hinged along the unit's bottom front edge, so it swings the way one
     does: shut flat against the body, or dropped to throw the air down. */
  const louvre = new THREE.Group();
  louvre.position.set(0, -UH / 2, UD / 2 - 0.01);
  unitG.add(louvre);
  const blade = new THREE.BoxGeometry(W - 0.10, 0.035, 0.20);
  const bladeMesh = occluder(blade);
  bladeMesh.position.z = 0.10;
  louvre.add(bladeMesh);
  const bladeEdge = edges(blade, C.steel, 0.75);
  bladeEdge.position.z = 0.10;
  louvre.add(bladeEdge);
  // The vane slats inside the mouth, which is what you actually see of it.
  const slats = [];
  for (let i = 1; i < 6; i += 1) {
    const x = -W / 2 + 0.05 + (i / 6) * (W - 0.10);
    slats.push(V(x, 0.02, 0.02), V(x, 0.02, 0.19));
  }
  louvre.add(keep(segs(slats, C.rhodium, 0.35)));

  /* ---- the air ----
     Chevrons, not streams. Four curves running from the mouth to the floor
     read as a waterfall, because that is what four long falling curves are
     — and an air conditioner does not pour. What air looks like when it is
     drawn is a stack of shallow arcs leaving a mouth and opening as they
     go, and what it looks like when it is MOVING is that stack drifting
     outward and fading. Three of them, over half a unit, and no further:
     the news is that it is blowing, not where the air ends up. */
  const MOUTH = V(0, UY - UH / 2 - 0.02, UD / 2 + 0.06);
  const air = [];
  for (let i = 0; i < STREAMS; i += 1) {
    const arc = [];
    const span = 0.30;
    for (let k = 0; k <= 12; k += 1) {
      const u = (k / 12) * 2 - 1;                 // -1 .. 1 across the mouth
      arc.push(V(u * span, -Math.abs(u) * 0.055, 0));
    }
    const line = keep(poly(arc, C.beat, 0));
    sp.add(line);
    air.push({ line, phase: i / STREAMS });
  }

  /* ---- the wall scale ----
     Where the room is, and where it has been told to be. Two marks on one
     scale say the whole of it: far apart is working, together is arrived. */
  const scaleG = new THREE.Group();
  scaleG.position.set(SCALE_X, 0, wallZ + 0.01);
  sp.add(scaleG);
  scaleG.add(keep(poly([V(0, SCALE_BOT), V(0, SCALE_TOP)], C.rhodium, 0.3)));
  const ticks = [];
  for (let d = T_MIN; d <= T_MAX; d += 2) {
    const y = atTemp(d);
    const long = d % 8 === 0;
    ticks.push(V(0, y), V(long ? -0.10 : -0.05, y));
  }
  scaleG.add(keep(segs(ticks, C.rhodium, 0.28)));

  /** A mark on the scale: an arrow pointing at its own temperature. */
  const mark = (colour, size, o) => {
    const g = new THREE.Group();
    g.add(keep(poly([V(0.02, 0), V(0.02 + size, size * 0.62),
      V(0.02 + size, -size * 0.62)], colour, o, true)));
    scaleG.add(g);
    return g;
  };
  const inMark = mark(C.hot, 0.11, 0.9);       // the room
  const setMark = mark(C.beat, 0.09, 0.9);     // the setpoint
  // The span between them, drawn as a bar: the work left to do.
  const span = keep(poly([V(-0.02, 0), V(-0.02, 0)], C.beat, 0.5));
  scaleG.add(span);

  /* ---- occupancy ----
     One ring on the floor under the unit. Somebody is home, or nobody is. */
  const here = ring(0.34, C.ok, 0.0, 'y');
  here.position.set(0, FLOOR + 0.006, UD / 2 + 0.34);
  sp.add(here);

  parts.unit = shell;
  parts.louvre = louvre;
  parts.air = air;
  parts.here = here;

  /* ---- state ---- */
  const st = {
    status: 'off', power: false, mode: null, indoor: null, target: null, home: false,
  };

  function setState(s) {
    const o = s || {};
    st.status = Object.prototype.hasOwnProperty.call(STATUS_HEX, o.status) ? o.status : 'off';
    st.power = !!o.power;
    st.mode = (o.mode === 'cool' || o.mode === 'heat' || o.mode === 'fan') ? o.mode : null;
    st.indoor = num(o.indoor);
    st.target = num(o.target);
    st.home = !!o.home;

    const hex = STATUS_HEX[st.status];
    shell.material.color.setHex(hex);
    shell.material.opacity = st.power ? 0.95 : 0.45;
    digits.material.opacity = st.power ? 0.85 : 0.12;

    /* Cool is the beat's cyan, heat is brass, and a fan that conditions
       nothing gets steel — moving air is not the same as cooling it. */
    const airC = st.mode === 'heat' ? C.brass : st.mode === 'cool' ? C.beat : C.steel;
    for (const a of air) a.line.material.color.setHex(airC);
    setMark.children[0].material.color.setHex(airC);
    span.material.color.setHex(airC);

    if (st.indoor != null) {
      inMark.position.y = atTemp(st.indoor);
      inMark.visible = true;
    } else inMark.visible = false;
    if (st.target != null) {
      setMark.position.y = atTemp(st.target);
      setMark.visible = true;
    } else setMark.visible = false;

    if (st.indoor != null && st.target != null) {
      const a = atTemp(st.indoor); const b = atTemp(st.target);
      span.geometry.setPositions(new Float32Array([-0.02, a, 0, -0.02, b, 0]));
      span.material.opacity = Math.abs(a - b) > 0.01 ? 0.55 : 0;
    } else span.material.opacity = 0;

    here.material.opacity = st.home ? 0.5 : 0.08;
  }

  /* ---- motion ---- */
  let t0 = 0;
  group.userData.tick = (t, dt, p, env) => {
    const slow = env && env.reduced ? 0.3 : 1;
    // The louvre sits where the swing put it, and eases rather than snaps.
    const openTo = st.power ? -0.62 : 0.02;
    louvre.rotation.x += (openTo - louvre.rotation.x) * Math.min(1, dt * 3);

    const running = st.power && !(env && env.locked);
    t0 += dt * slow * (running ? 1 : 0);
    /* The chevrons travel the way the louvre is pointing: straight out of
       the mouth when it is shut, downward as it opens. One direction for
       all of them, so they read as one body of air. */
    const a = louvre.rotation.x;
    const dir = V(0, Math.sin(a) * 0.9, Math.cos(a)).normalize();
    for (let i = 0; i < p.air.length; i += 1) {
      const c = p.air[i];
      if (!running) {
        c.line.material.opacity += (0 - c.line.material.opacity) * Math.min(1, dt * 5);
        continue;
      }
      const f = (t0 * 0.55 + c.phase) % 1;        // 0 at the mouth, 1 away
      const reach = 0.62;
      c.line.position.set(
        MOUTH.x + dir.x * f * reach,
        MOUTH.y + dir.y * f * reach,
        MOUTH.z + dir.z * f * reach,
      );
      // Opening out as it goes, and gone before it reaches anything.
      c.line.scale.set(1 + f * 0.9, 1 + f * 0.9, 1);
      c.line.material.opacity = 0.75 * Math.sin(Math.PI * Math.min(1, f * 1.1)) ** 1.2;
    }
    if (p.here.material.opacity > 0.2) {
      p.here.scale.setScalar(1 + Math.sin(t * 0.8) * 0.03);
    }
  };

  setState(opts.state ?? null);
  return { group, setState };
}
