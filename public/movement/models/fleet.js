/* ============================================================
   movement/models/fleet — the machines themselves, as a complication.

   Fleet watches three hosts and the services on them, so the object is
   three rack towers on one plinth. The frames are only the carrier: what
   the module actually reports is a column of service beads down each
   front face and a load bar at its edge, so those are the bright things
   and everything structural sits back at body weight.

   The towers are divided on a real U pitch, the beads land on slot
   centres, and the cables leave the frames where a cable would.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, edges, node, occluder, mk, pulseRing,
} from '../kit.js';

const U = 12;                     // slots per tower
const H = 1.70;                   // tower height
const PITCH = H / U;              // one U: every rule and bead lands on it
const W = 0.46;                   // front face width
const D = 0.30;                   // depth
const Y0 = -0.95;                 // the floor all three stand on
const XS = [-0.72, 0, 0.72];
const BEAD_FROM = 2;              // bottom two U are power and patching, not services
const NBEADS = 8;                 // eight service bands per host, ~25 across the fleet
const DIM = 0.18;                 // a host that is down

const clamp01 = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);

/* Authored opacity is remembered on the object, so dimming a tower for a
   dead host and bringing it back later is not a lossy operation. */
const keep = (o) => { o.userData.o0 = o.material.opacity; return o; };

/** A cable run: quadratic curve sampled into a line, because a straight
    segment between two boxes reads as a strut and not as a cable. */
function cable(a, ctrl, b, c, o) {
  const pts = new THREE.QuadraticBezierCurve3(a, ctrl, b).getPoints(30);
  return keep(poly(pts, c, o));
}

function tower(x, idx) {
  const g = new THREE.Group();
  g.position.x = x;
  const cy = Y0 + H / 2;
  const zf = D / 2;
  const T = { root: g, frame: [], beads: [], live: false, phase: idx * 0.37 };

  // The far side of a wire box is noise, so a plate-coloured solid just
  // inside the frame eats it and the tower reads as a solid machine.
  const occ = occluder(new THREE.BoxGeometry(W - 0.012, H - 0.012, D - 0.012));
  occ.position.y = cy;
  g.add(occ);

  const box = keep(edges(new THREE.BoxGeometry(W, H, D), C.steel, 0.7));
  box.position.y = cy;
  T.frame.push(box);

  // U divisions across the front face, with the mounting-hole pair a rack
  // ear would need drawn as two short ticks either side of each rule.
  const rules = []; const ears = [];
  for (let i = 1; i < U; i += 1) {
    const y = Y0 + i * PITCH;
    rules.push(V(-W / 2, y, zf), V(W / 2, y, zf));
    for (const ex of [-W / 2 + 0.03, W / 2 - 0.03]) {
      ears.push(V(ex, y - PITCH * 0.3, zf), V(ex, y - PITCH * 0.16, zf));
    }
  }
  T.frame.push(keep(segs(rules, C.rhodium, 0.45)));
  T.frame.push(keep(segs(ears, C.rhodium, 0.28)));

  // Beads sit slightly proud of the front face, half sunk into it, so the
  // occluder clips their back half and they read as mounted, not floating.
  const bx = -W * 0.22;
  for (let i = 0; i < NBEADS; i += 1) {
    const b = node(0.027, C.steel, 0.3);
    b.position.set(bx, Y0 + (BEAD_FROM + i + 0.5) * PITCH, zf + 0.014);
    b.userData.st = 0;
    b.userData.ph = i * 1.31 + idx * 0.9;
    T.beads.push(b);
    g.add(b);
  }

  // The load bar runs the usable height of the frame at its right edge.
  const barX = W * 0.30; const hw = 0.028;
  T.y0 = Y0 + PITCH * 0.7;
  T.len = H - PITCH * 1.4;
  T.frame.push(keep(poly([
    V(barX - hw, T.y0, zf), V(barX + hw, T.y0, zf),
    V(barX + hw, T.y0 + T.len, zf), V(barX - hw, T.y0 + T.len, zf),
  ], C.rhodium, 0.35, true)));

  // Three verticals scaled in y: with bloom on them that reads as a filled
  // column, and one scale is cheaper than rebuilding geometry per frame.
  const fv = [];
  for (const fx of [-hw * 0.8, 0, hw * 0.8]) fv.push(V(fx, 0, 0), V(fx, T.len, 0));
  T.fill = segs(fv, C.brass, 0.9);
  T.fill.position.set(barX, T.y0, zf + 0.004);
  T.fill.scale.y = 0.0001;
  T.fill.visible = false;
  g.add(T.fill);

  T.mark = poly([V(-hw * 1.7, 0, 0), V(hw * 1.7, 0, 0)], C.hot, 1);
  T.mark.position.set(barX, T.y0, zf + 0.006);
  T.mark.visible = false;
  g.add(T.mark);

  // The travelling sweep is the one thing that says this host is being
  // polled right now, which is why reduced motion parks it.
  T.sweep = poly([V(-W / 2, 0, zf + 0.008), V(W / 2, 0, zf + 0.008)], C.beat, 0);
  g.add(T.sweep);

  for (const o of T.frame) g.add(o);
  return T;
}

export function build(opts = {}) {
  const [group, sp] = mk(0, 0.2);   // upright towers, seen slightly from above
  const parts = { towers: [], plinth: [] };

  parts.towers = XS.map((x, i) => {
    const T = tower(x, i);
    sp.add(T.root);
    return T;
  });

  // Base: the floor the towers stand on, the plinth line under it that
  // carries the overall status, and a foot at each corner tying them.
  const bw = 1.12; const bd = 0.27;
  const rect = (y) => [V(-bw, y, -bd), V(bw, y, -bd), V(bw, y, bd), V(-bw, y, bd)];
  sp.add(keep(poly(rect(Y0 - 0.006), C.rhodium, 0.22, true)));
  const plinth = keep(poly(rect(Y0 - 0.058), STATUS_HEX.off, 0.85, true));
  parts.plinth.push(plinth);
  sp.add(plinth);
  const feet = [];
  for (const p of rect(Y0 - 0.006)) feet.push(p.clone(), V(p.x, Y0 - 0.058, p.z));
  sp.add(keep(segs(feet, C.rhodium, 0.3)));

  // Cable runs: two data links leaving the backs of adjacent towers high
  // up, and one power run along the front of the plinth that sags.
  for (let i = 0; i < 2; i += 1) {
    const y = Y0 + H * 0.74;
    const a = V(XS[i] + W * 0.3, y, -D / 2);
    const b = V(XS[i + 1] - W * 0.3, y, -D / 2);
    sp.add(cable(a, V((a.x + b.x) / 2, y - 0.2, -D / 2 - 0.3), b, C.rhodium, 0.35));
  }
  const py = Y0 + PITCH * 0.4;
  sp.add(cable(V(XS[0], py, D / 2), V(0, Y0 - 0.16, D / 2 + 0.5), V(XS[2], py, D / 2), C.brass, 0.32));

  // One expanding ring lying flat on the plinth: the fleet's own heartbeat,
  // in whatever colour the overall status is.
  parts.pulse = pulseRing(0.95, 1.45, STATUS_HEX.off, 0.02);
  parts.pulse.mesh.rotation.x = -Math.PI / 2;
  parts.pulse.mesh.position.y = Y0 - 0.052;
  sp.add(parts.pulse.mesh);

  group.userData.parts = parts;
  group.userData.spin = [0, 0.10, 0];
  group.userData.hitR = 2.0;

  group.userData.tick = (t, dt, p, env) => {
    const reduced = !!env?.reduced;
    for (const T of p.towers) {
      for (const b of T.beads) {
        const st = b.userData.st;
        if (!st) continue;
        if (reduced) { b.material.opacity = st === 2 ? 1 : 0.9; continue; }
        const w = Math.sin(t * (st === 2 ? 7.4 : 2.1) + b.userData.ph);
        // A failing service blinks; a healthy one breathes. Same signal,
        // different urgency, and both read at a glance.
        b.material.opacity = st === 2 ? (w > 0 ? 1 : 0.28) : 0.72 + 0.28 * (0.5 + 0.5 * w);
      }
      const show = !reduced && T.live;
      T.sweep.visible = show;
      if (show) {
        const k = (t * 0.33 + T.phase) % 1;
        T.sweep.position.y = Y0 + k * H;
        T.sweep.material.opacity = 0.34 * Math.sin(Math.PI * k);
      }
    }
    p.pulse.at(reduced ? 0.3 : (t * 0.55) % 1);
  };

  function setState(s) {
    const st = (s && STATUS_HEX[s.status] !== undefined) ? s.status : 'off';
    const hex = STATUS_HEX[st];
    for (const o of parts.plinth) o.material.color.setHex(hex);
    parts.pulse.mesh.material.color.setHex(hex);

    const hosts = Array.isArray(s?.hosts) ? s.hosts : [];
    parts.towers.forEach((T, i) => {
      const h = (hosts[i] && typeof hosts[i] === 'object') ? hosts[i] : null;
      // No entry for a host is not the same as a host reported down: an
      // unknown slot keeps its frame and simply has nothing lit on it.
      const down = !!h && h.up === false;
      T.live = !!h && !down;
      for (const o of T.frame) o.material.opacity = down ? Math.min(o.userData.o0, DIM) : o.userData.o0;

      const fail = T.live ? Math.max(0, Math.min(NBEADS, Math.round(Number(h.failing) || 0))) : 0;
      T.beads.forEach((b, j) => {
        // Failures stack from the bottom so they grow the same way the load
        // bar beside them does.
        const bad = j < fail;
        b.userData.st = T.live ? (bad ? 2 : 1) : 0;
        b.material.color.setHex(T.live ? (bad ? C.bad : C.beat) : (down ? C.rhodium : C.steel));
        b.material.opacity = T.live ? 0.9 : (down ? DIM : 0.3);
      });

      const load = T.live ? clamp01(h.load) : 0;
      T.fill.visible = load > 0.004;
      T.fill.scale.y = Math.max(0.0001, load);
      T.fill.material.color.setHex(load > 0.85 ? C.hot : C.brass);
      T.mark.visible = T.fill.visible;
      T.mark.position.y = T.y0 + load * T.len;
    });
  }

  setState(opts.state ?? null);
  return { group, setState };
}
