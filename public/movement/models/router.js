/* ============================================================
   movement/models/router — the Huawei 5G CPE 5s (H153-381).

   The router on the desk is not a gaming router with antennas: it is a
   white square-section tower, 90 x 90 x 183 mm, rounded on its four
   vertical edges, flat on top, standing on a vented base. Its antennas are
   inside it. What it says about itself it says with three lamps in a
   column on its front face, low down, labelled 5G, 4G and STATUS — and
   that is exactly what this object says too, in the lamps' own colours
   (Huawei quick start guide):

     5G       steady blue strong · yellow moderate · red weak signal
     4G       the same, for the LTE side
     STATUS   steady blue connected · red not connected

   A lamp whose radio carries nothing (no NR carrier aggregated, say) is
   dark, as on the real one. The body is white because the real one is:
   real-object colour, shown as it is (DESIGN.md). No marks on it.

   Mapped from what the router module reports in `summary.model`:
   `bars` (0..5, the lead radio), `connected`, and `carriers` with their
   generation. The module reports one signal strength, not one per radio,
   so both signal lamps read the same bars; a lamp is lit only when a
   carrier of its generation is aggregated.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, ring, edges, mk,
} from '../kit.js';

const W = 1.5;                  // 90 mm across, both ways
const H = W * (183 / 90);       // 183 mm tall
const R = 0.2;                  // the vertical edges' radius
const Y0 = -H / 2;              // its foot
const ZF = W / 2;               // the front face

const BODY = 0xdedcd6;          // white plastic, a shade under paper-white on black
const BODY_LINE = 0x8c8c88;     // its edges
const LED = { blue: 0x1e7bff, yellow: 0xffc21a, red: 0xff2a2a };

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
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: BODY }));
  sp.add(body);
  const outline = edges(geo.clone(), BODY_LINE, 0.9, 25);
  sp.add(outline);

  /* A soft vertical shade on each face, so the white reads as a solid with
     sides and not as a flat sticker: two faint lines down each flat face,
     where the curve of the corner begins. */
  const shade = [];
  for (const [x, z] of [[W / 2 - R, ZF], [-W / 2 + R, ZF], [W / 2, ZF - R], [W / 2, -ZF + R], [-W / 2, ZF - R], [-W / 2, -ZF + R]]) {
    shade.push(V(x, Y0 + 0.12, z), V(x, Y0 + 0.12 + bodyH, z));
  }
  sp.add(segs(shade, 0xb4b2ac, 0.5));

  /* ---- the base: a dark band, perforated ---- */
  const baseGeo = new THREE.ExtrudeGeometry(rrShape(W - 0.06, W - 0.06, R - 0.03), { depth: 0.12, bevelEnabled: false, curveSegments: 6 });
  baseGeo.rotateX(-Math.PI / 2);
  baseGeo.translate(0, Y0, 0);
  sp.add(new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({ color: 0x2a2a2a })));
  sp.add(edges(baseGeo.clone(), C.steel, 0.6, 25));
  const holes = [];
  for (let i = 0; i < 14; i += 1) {
    const x = -W / 2 + 0.2 + i * ((W - 0.4) / 13);
    holes.push(V(x - 0.012, Y0 + 0.06, ZF - 0.025), V(x + 0.012, Y0 + 0.06, ZF - 0.025));
  }
  sp.add(segs(holes, C.steel, 0.7));

  /* ---- the top: flat, with a faint seam round it ---- */
  sp.add(poly(plan(Y0 + H + 0.001, 0.08), 0xa8a6a0, 0.6, true));

  /* ---- the back: the recessed port panel, low down ---- */
  const bz = -ZF - 0.003;
  const panel = poly([
    V(-0.42, Y0 + 0.24, bz), V(0.42, Y0 + 0.24, bz), V(0.42, Y0 + 0.62, bz), V(-0.42, Y0 + 0.62, bz),
  ], 0x6e6e6a, 0.8, true);
  const portPts = [];
  const port = (x, w, h) => {
    const y = Y0 + 0.43;
    portPts.push(V(x - w / 2, y - h / 2, bz), V(x + w / 2, y - h / 2, bz), V(x + w / 2, y - h / 2, bz), V(x + w / 2, y + h / 2, bz),
      V(x + w / 2, y + h / 2, bz), V(x - w / 2, y + h / 2, bz), V(x - w / 2, y + h / 2, bz), V(x - w / 2, y - h / 2, bz));
  };
  port(-0.2, 0.2, 0.16);         // RJ45
  port(0.12, 0.08, 0.08);        // WPS
  const dc = ring(0.05, 0x6e6e6a, 0.8, 'z', 20);
  dc.position.set(0.3, Y0 + 0.43, bz);
  sp.add(panel, segs(portPts, 0x6e6e6a, 0.8), dc);

  /* ---- the three lamps, in a column on the front, low down ---- */
  const lampY = [0.35, 0.28, 0.21].map((f) => Y0 + H * f);   // 5G, 4G, STATUS, top to bottom
  const lamps = lampY.map((y) => {
    const g = new THREE.Group();
    g.position.set(0, y, ZF + 0.004);
    const bead = node(0.058, LED.blue, 1);
    bead.scale.z = 0.4;
    // The light it throws on the white round it.
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 24),
      new THREE.MeshBasicMaterial({ color: LED.blue, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    halo.position.z = -0.002;
    const rim = ring(0.075, 0x9a9a96, 0.7, 'z', 20);
    g.add(halo, rim, bead);
    sp.add(g);
    return { g, bead, halo };
  });
  // The printed legend beside each lamp, as a short rule — the words are not
  // drawn (no marks on the object), but the column is still a legend.
  const legend = lampY.flatMap((y) => [V(0.12, y, ZF + 0.003), V(0.3, y, ZF + 0.003)]);
  sp.add(segs(legend, 0xa0a09a, 0.7));

  parts.lamps = lamps;
  parts.outline = outline;

  /* ---- state ---- */
  const st = { status: 'off', connected: false, bars: 0, nr: false, lte: false, blink: null };

  function setLamp(l, hex) {
    const on = hex != null;
    l.bead.material.color.setHex(on ? hex : 0x3a3a3a);
    l.bead.material.opacity = on ? 1 : 0.7;
    l.halo.material.color.setHex(on ? hex : 0x000000);
    l.halo.material.opacity = on ? 0.28 : 0;
    l.on = on;
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
    // body's edge carries the status.
    const reachable = st.status !== 'off' && o.connected !== undefined;
    outline.material.color.setHex(st.status === 'ok' || st.status === 'off' ? BODY_LINE : STATUS_HEX[st.status]);

    const strength = st.bars >= 4 ? LED.blue : st.bars === 3 ? LED.yellow : LED.red;
    setLamp(lamps[0], reachable && st.connected && st.nr ? strength : null);
    setLamp(lamps[1], reachable && st.connected && st.lte ? strength : null);
    setLamp(lamps[2], reachable ? (st.connected ? LED.blue : LED.red) : null);
    body.material.color.setHex(reachable ? BODY : 0xb8b6b0);
  }

  group.userData.tick = (t, dt, p, env) => {
    // A lamp is steady, as the real ones are; only its light on the body
    // breathes a little, so a living router is never a still picture.
    const k = env && env.reduced ? 0 : 1;
    for (const l of p.lamps) {
      if (l.on) l.halo.material.opacity = 0.22 + 0.08 * k * (0.5 + 0.5 * Math.sin(t * 1.4));
    }
  };

  setState(opts.state ?? null);
  return { group, setState };
}
