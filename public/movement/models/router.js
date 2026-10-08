/* ============================================================
   movement/models/router — the Huawei 5G CPE 5s (H153-381).

   The router on the desk is not a gaming router with antennas: it is a
   white square-section tower, 90 x 90 x 183 mm, rounded on its four
   vertical edges, flat on top, standing on a vented base. Its antennas are
   inside it. What it says about itself it says with three lamps in a
   column on its front face, low down, labelled 5G, 4G and STATUS.

   It speaks the console's language, not Huawei's (2026-10-08: the real
   LEDs' blue/yellow/red made it the one object in a different palette).
   The body is see-through line art over an occluder, like every other
   object; its outline and its foot carry the module's overall status, as
   the agent's board, the remote's bezel and fleet's plinth do; and each lamp is a bead with a ring of light round it in
   the status colours — ok, warn, bad — dark when it says nothing. A lamp
   in trouble blinks and a healthy one breathes, as fleet's beads do. No
   marks on it.

   Preferred: the module's `lights` (summary.model.lights) — three
   self-describing lamps, top to bottom, each {id, label, state, detail}
   with state ok|warn|err|off. The owner repurposed them: Internet, Signal
   (the radio carrying traffic), Data (this month against the plan).

   Fallback, for a module that predates `lights`, from `summary.model`:
   `bars` (0..5, the lead radio), `connected`, and `carriers` with their
   generation. The module reports one signal strength, not one per radio,
   so both signal lamps read the same bars; a lamp is lit only when a
   carrier of its generation is aggregated.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, ring, edges, occluder, mk,
} from '../kit.js';

const W = 1.5;                  // 90 mm across, both ways
const H = W * (183 / 90);       // 183 mm tall
const R = 0.2;                  // the vertical edges' radius
const Y0 = -H / 2;              // its foot
const ZF = W / 2;               // the front face

const BODY_LINE = C.steel;      // its edges, as on every other object

function rrShape(w, d, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  return s;
}

/** The plan outline at height y, as points (the same rounded square). */
function plan(y, inset = 0) {
  const pts = rrShape(W - inset * 2, W - inset * 2, Math.max(0.02, R - inset)).getPoints(6);
  return pts.map((p) => V(p.x, y, -p.y));
}

export function build(opts = {}) {
  // Seen a little from above, a little from its left: front face and one
  // flank, the way it stands on a shelf.
  const [group, sp] = mk(0, 0.16);
  group.userData.sway = [0.05, 0.42, 0.02];
  group.userData.swayPeriod = 10;
  group.userData.swayPhase = 1.7;
  group.userData.hitR = 2.0;
  const parts = group.userData.parts;

  /* ---- the desk ---- */
  const desk = ring(1.25, C.rhodium, 0.18, 'y');
  desk.position.y = Y0 - 0.06;
  sp.add(desk);

  /* ---- the body: a rounded square extruded up ---- */
  const bodyH = H - 0.12;                       // the base below is darker
  const geo = new THREE.ExtrudeGeometry(rrShape(W, W, R), { depth: bodyH, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);                    // extrude along +y
  geo.translate(0, Y0 + 0.12, 0);
  // An occluder, not a white solid: the back edges hide behind it, and the
  // object reads as line art like the rest of the console's objects.
  sp.add(occluder(geo));
  const outline = edges(geo.clone(), BODY_LINE, 0.9, 25);
  sp.add(outline);

  /* Two faint lines down each flat face, where the curve of the corner
     begins, so the rounded square reads as a solid with sides. */
  const shade = [];
  for (const [x, z] of [[W / 2 - R, ZF], [-W / 2 + R, ZF], [W / 2, ZF - R], [W / 2, -ZF + R], [-W / 2, ZF - R], [-W / 2, -ZF + R]]) {
    shade.push(V(x, Y0 + 0.12, z), V(x, Y0 + 0.12 + bodyH, z));
  }
  sp.add(segs(shade, C.rhodium, 0.5));

  /* ---- the base: a dark band, perforated ---- */
  const baseGeo = new THREE.ExtrudeGeometry(rrShape(W - 0.06, W - 0.06, R - 0.03), { depth: 0.12, bevelEnabled: false, curveSegments: 6 });
  baseGeo.rotateX(-Math.PI / 2);
  baseGeo.translate(0, Y0, 0);
  sp.add(occluder(baseGeo));
  // The foot carries the module's status, as every object's foot does.
  const foot = edges(baseGeo.clone(), STATUS_HEX.off, 0.85, 25);
  sp.add(foot);
  const holes = [];
  for (let i = 0; i < 14; i += 1) {
    const x = -W / 2 + 0.2 + i * ((W - 0.4) / 13);
    holes.push(V(x - 0.012, Y0 + 0.06, ZF - 0.025), V(x + 0.012, Y0 + 0.06, ZF - 0.025));
  }
  sp.add(segs(holes, C.rhodium, 0.7));

  /* ---- the top: flat, with a faint seam round it ---- */
  sp.add(poly(plan(Y0 + H + 0.001, 0.08), C.rhodium, 0.6, true));

  /* ---- the back: the recessed port panel, low down ---- */
  const bz = -ZF - 0.003;
  const panel = poly([
    V(-0.42, Y0 + 0.24, bz), V(0.42, Y0 + 0.24, bz), V(0.42, Y0 + 0.62, bz), V(-0.42, Y0 + 0.62, bz),
  ], C.rhodium, 0.8, true);
  const portPts = [];
  const port = (x, w, h) => {
    const y = Y0 + 0.43;
    portPts.push(V(x - w / 2, y - h / 2, bz), V(x + w / 2, y - h / 2, bz), V(x + w / 2, y - h / 2, bz), V(x + w / 2, y + h / 2, bz),
      V(x + w / 2, y + h / 2, bz), V(x - w / 2, y + h / 2, bz), V(x - w / 2, y + h / 2, bz), V(x - w / 2, y - h / 2, bz));
  };
  port(-0.2, 0.2, 0.16);         // RJ45
  port(0.12, 0.08, 0.08);        // WPS
  const dc = ring(0.05, C.rhodium, 0.8, 'z', 20);
  dc.position.set(0.3, Y0 + 0.43, bz);
  sp.add(panel, segs(portPts, C.rhodium, 0.8), dc);

  /* ---- the three lamps, in a column on the front, low down ---- */
  const lampY = [0.35, 0.28, 0.21].map((f) => Y0 + H * f);   // 5G, 4G, STATUS, top to bottom
  const lamps = lampY.map((y) => {
    const g = new THREE.Group();
    g.position.set(0, y, ZF + 0.004);
    const bead = node(0.05, C.ok, 0.95);
    bead.scale.z = 0.4;
    // Its light, drawn as a ring like the mouse's lamp — a line, not a fill.
    const halo = ring(0.095, C.ok, 0.6, 'z', 28);
    const rim = ring(0.07, C.rhodium, 0.7, 'z', 20);
    g.add(halo, rim, bead);
    sp.add(g);
    return { g, bead, halo, state: 'off', ph: lampY.indexOf(y) * 1.31 };
  });
  // The printed legend beside each lamp, as a short rule — the words are not
  // drawn (no marks on the object), but the column is still a legend.
  const legend = lampY.flatMap((y) => [V(0.12, y, ZF + 0.003), V(0.3, y, ZF + 0.003)]);
  sp.add(segs(legend, C.rhodium, 0.7));

  parts.lamps = lamps;
  parts.outline = outline;
  parts.foot = foot;

  /* ---- state ---- */
  const st = { status: 'off', connected: false, bars: 0, nr: false, lte: false, blink: null };

  function setLamp(l, state) {
    const on = state === 'ok' || state === 'warn' || state === 'err';
    const hex = on ? STATUS_HEX[state] : C.rhodium;
    l.state = on ? state : 'off';
    l.bead.material.color.setHex(hex);
    l.bead.material.opacity = on ? 0.95 : 0.35;
    l.halo.material.color.setHex(hex);
    l.halo.material.opacity = on ? 0.6 : 0;
  }

  function setState(s) {
    const o = (s && typeof s === 'object') ? s : {};
    st.status = STATUS_HEX[o.status] ? o.status : 'off';
    st.connected = !!o.connected;
    st.bars = Math.max(0, Math.min(5, Math.round(Number(o.bars) || 0)));
    const list = Array.isArray(o.carriers) ? o.carriers.filter((c) => c && typeof c === 'object') : [];
    const gen = (c) => ((String(c.generation || '').toUpperCase() === '5G'
      || (!c.generation && /^n/i.test(String(c.band || '')))) ? '5G' : '4G');
    st.nr = list.some((c) => gen(c) === '5G');
    st.lte = list.some((c) => gen(c) === '4G');
    // No carrier list at all but a signal: the lead radio is lit as 4G.
    if (!list.length && st.connected && st.bars) st.lte = true;

    // The module itself down (not the router's link): every lamp dark, the
    // body dimmed, the foot in the status colour.
    const reachable = st.status !== 'off' && o.connected !== undefined;
    for (const l of [outline, foot]) {
      l.material.color.setHex(STATUS_HEX[st.status]);
      l.material.opacity = st.status !== 'off' ? 0.9 : 0.4;
    }

    const lights = Array.isArray(o.lights) ? o.lights.slice(0, 3) : null;
    if (lights && lights.length === 3) {
      lights.forEach((l, i) => setLamp(lamps[i], reachable ? l && l.state : 'off'));
      return;
    }
    const strength = st.bars >= 4 ? 'ok' : st.bars === 3 ? 'warn' : 'err';
    setLamp(lamps[0], reachable && st.connected && st.nr ? strength : 'off');
    setLamp(lamps[1], reachable && st.connected && st.lte ? strength : 'off');
    setLamp(lamps[2], reachable ? (st.connected ? 'ok' : 'err') : 'off');
  }

  group.userData.tick = (t, dt, p, env) => {
    // A lamp in trouble blinks; a healthy one breathes — fleet's beads say
    // it the same way, and both read at a glance.
    const reduced = !!(env && env.reduced);
    for (const l of p.lamps) {
      if (l.state === 'off') continue;
      if (reduced) { l.bead.material.opacity = 0.95; l.halo.material.opacity = 0.6; continue; }
      const w = Math.sin(t * (l.state === 'err' ? 7.4 : 2.1) + l.ph);
      const k = l.state === 'err' ? (w > 0 ? 1 : 0.28) : 0.72 + 0.28 * (0.5 + 0.5 * w);
      l.bead.material.opacity = 0.95 * k;
      l.halo.material.opacity = 0.6 * k;
    }
  };

  setState(opts.state ?? null);
  return { group, setState };
}
