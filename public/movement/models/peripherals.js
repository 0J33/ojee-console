/* ============================================================
   movement/models/peripherals — the desk: the V5 and the R86 HE.

   A 75% board and the mouse beside it, seen from above the desk the way you
   see them sitting at it. What the module reports is on the objects:

     the mouse's DPI lamp is the colour of the stage it is actually on
     a ring round the mouse's foot is its battery, and it breathes while
       it charges; a cable runs off its nose while it is on the wire
     the board lights when it is plugged in, and its WASD keys go down and
       come up again — a magnetic board is the one that registers a key on
       the way down AND the way back up, and that is what they are doing

   A device the module cannot see is drawn and not lit. The board is on the
   desk before it has arrived.
   ============================================================ */

import {
  THREE, C, STATUS_HEX, V, poly, segs, node, occluder, ring, mk,
} from '../kit.js';

const Y0 = -0.16;               // the desk — centred once the tilt lays it back

/* ---- the board ------------------------------------------------------------
   Sixteen units a row, which is what makes it a 75%: F-row, number row, the
   four alpha rows with the arrow cluster tucked into the right of the last
   two. Widths are key units. */
const ROWS = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, 1],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75, 1, 1],
  [1.25, 1.25, 1.25, 6.25, 1, 1, 1, 1, 1, 1],
];
const KB_W = 2.28;              // across the case
const KB_D = 0.98;              // front to back
const KB_H = 0.1;               // case height
const KB_X = -0.62;             // where the board sits on the desk
const U = (KB_W - 0.14) / 16;   // one key unit
const CAP = U * 0.84;           // a cap is a little less than its unit
const CAP_H = 0.07;
// WASD: row, index-in-row — the four that move.
const WASD = [[2, 2], [3, 1], [3, 2], [3, 3]];

/* ---- the mouse ------------------------------------------------------------
   The V5: a small symmetrical shell. In plan a rounded superellipse, widest a
   little behind the middle and narrowing toward the buttons; in profile a hump
   behind centre falling to a low nose, over a short upright side wall. Built
   nose-first along +z and then turned round, so it points AWAY from you with
   the thumb buttons on its left — the way it sits on the desk. */
const M_X = 1.48;
const M = { L: 0.98, W: 0.56, H: 0.27, wall: 0.045, m: 2.6 };
const M_SEG_U = 30;             // nose to tail
const M_SEG_V = 18;             // across

function halfW(z) {
  const u = z / (M.L / 2);                              // -1 tail .. +1 nose
  return (M.W / 2) * (1 - 0.1 * (u + 0.25) ** 2 - (u > 0 ? 0.07 * u : 0));
}
function crown(z) {
  const u = z / (M.L / 2);
  return M.wall + (M.H - M.wall) * Math.max(0, 1 - 0.6 * (u + 0.24) ** 2);
}
/* A point on the shell from (u, v): u runs tail to nose, v across. The plan
   edge is a superellipse, so the ends round off instead of stopping flat —
   which is what made the last one look like a slipper. */
function shellPoint(u, v) {
  const z = u * (M.L / 2);
  const edge = (1 - Math.abs(u) ** M.m) ** (1 / M.m);   // how much width is left at this z
  const x = v * halfW(z) * edge;
  const s = (Math.abs(v) ** M.m * (1 - Math.abs(u) ** M.m) + Math.abs(u) ** M.m) ** (1 / M.m);
  const y = M.wall + (crown(z) - M.wall) * Math.sqrt(Math.max(0, 1 - s ** 2.4));
  return V(x, y, z);
}
const footPoint = (u, v, y = 0) => { const p = shellPoint(u, v); return V(p.x, y, p.z); };
/* Lines drawn exactly ON the solid lose the depth test to it about half the
   time and vanish — the split, the seam and the thumb buttons were all there
   and none of them showed. So every line rides a hair above the shell. */
const onShell = (u, v) => { const p = shellPoint(u, v); return V(p.x * 1.012, p.y + 0.007, p.z * 1.006); };

/** A solid box, as raw triangles, appended to `pos`. */
function box(pos, cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy, y1 = cy + h, z0 = cz - d / 2, z1 = cz + d / 2;
  const q = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
  q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]); // top
  q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // front
  q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // back
  q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // left
  q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // right
}

const rectPts = (cx, y, cz, w, d) => {
  const a = V(cx - w / 2, y, cz - d / 2), b = V(cx + w / 2, y, cz - d / 2);
  const c = V(cx + w / 2, y, cz + d / 2), e = V(cx - w / 2, y, cz + d / 2);
  return [a, b, b, c, c, e, e, a];
};

export function build(opts = {}) {
  /* Tilted TOWARD the viewer, the opposite way to the others. They are
     upright things seen from a little above; this is a desk, and a flat
     thing tilted the other way shows you its underside. */
  const [group, sp] = mk(0, 0.62);
  group.userData.sway = [0.05, 0.3, 0.02];
  group.userData.swayPeriod = 11;
  group.userData.swayPhase = 2.4;
  group.userData.hitR = 2.0;
  const P = group.userData.parts;

  /* ---- the desk ---- */
  const mat = poly([V(-1.95, Y0, -0.72), V(2.15, Y0, -0.72), V(2.15, Y0, 0.82), V(-1.95, Y0, 0.82)], C.rhodium, 0.16, true);
  sp.add(mat);

  /* ---- the board ---- */
  const kb = new THREE.Group();
  kb.position.set(KB_X, Y0, 0);
  sp.add(kb);

  const casePos = [];
  box(casePos, 0, 0, 0, KB_W, KB_H, KB_D);
  const caseGeo = new THREE.BufferGeometry();
  caseGeo.setAttribute('position', new THREE.Float32BufferAttribute(casePos, 3));
  kb.add(occluder(caseGeo));
  const caseTop = poly(rectPts(0, KB_H, 0, KB_W, KB_D).filter((_, i) => i % 2 === 0), C.steel, 0.8, true);
  const caseBase = poly(rectPts(0, 0.001, 0, KB_W, KB_D).filter((_, i) => i % 2 === 0), C.steel, 0.4, true);
  kb.add(caseTop, caseBase);

  /* Every cap that does not move is ONE solid and ONE set of lines — eighty
     keys drawn separately would be a hundred and sixty draw calls for the
     most static thing on the screen. Only WASD is its own object. */
  const capPos = [];
  const capLines = [];
  const moving = [];
  const pitch = (KB_D - 0.14) / ROWS.length;
  ROWS.forEach((row, r) => {
    let u = 0;
    const z = -KB_D / 2 + 0.07 + pitch * (r + 0.5);
    row.forEach((wu, i) => {
      const cx = -KB_W / 2 + 0.07 + U * (u + wu / 2);
      const w = U * wu - (U - CAP);
      u += wu;
      if (WASD.some(([rr, ii]) => rr === r && ii === i)) {
        moving.push({ cx, z, w });
        return;
      }
      box(capPos, cx, KB_H, z, w, CAP_H, CAP);
      capLines.push(...rectPts(cx, KB_H + CAP_H + 0.001, z, w, CAP));
    });
  });
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  kb.add(occluder(capGeo));
  const caps = segs(capLines, C.steel, 0.5);
  kb.add(caps);

  const wasd = moving.map((m, k) => {
    const g = new THREE.Group();
    g.position.set(m.cx, KB_H, m.z);
    const pos = [];
    box(pos, 0, 0, 0, m.w, CAP_H, CAP);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.add(occluder(geo));
    const top = segs(rectPts(0, CAP_H + 0.001, 0, m.w, CAP), C.beat, 0.35);
    g.add(top);
    // The magnet under the switch: a ring on the plate that brightens as the key goes down.
    const field = ring(CAP * 0.36, C.beat, 0, 'y', 32);
    field.position.y = 0.004;
    g.add(field);
    kb.add(g);
    return { g, top, field, phase: [0, 0.18, 0.36, 0.54][k] };
  });

  /* ---- the mouse ---- */
  const mouse = new THREE.Group();
  mouse.position.set(M_X, Y0, 0.12);
  /* Nose away from you — but not straight away. Seen square from behind, the
     hump hides the split, the wheel and the thumb buttons, and a mouse from
     behind is an egg. Turned a quarter of the way round, it shows its left
     flank and the front of its back, the way you glance at it on a desk. */
  // Away and to the LEFT: that is the turn that brings the left flank, and the
  // thumb buttons on it, round toward you. Away-right hides them.
  mouse.rotation.y = Math.PI + 0.55;
  sp.add(mouse);

  const shellPos = [];
  const quad = (a, b, c, d) => shellPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  for (let i = 0; i < M_SEG_U; i += 1) {
    const u0 = -1 + (2 * i) / M_SEG_U, u1 = -1 + (2 * (i + 1)) / M_SEG_U;
    for (let j = 0; j < M_SEG_V; j += 1) {
      const v0 = -1 + (2 * j) / M_SEG_V, v1 = -1 + (2 * (j + 1)) / M_SEG_V;
      quad(shellPoint(u0, v0), shellPoint(u1, v0), shellPoint(u1, v1), shellPoint(u0, v1));
    }
    // the upright side wall, both sides
    for (const v of [-1, 1]) quad(footPoint(u0, v), footPoint(u1, v), shellPoint(u1, v), shellPoint(u0, v));
  }
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPos, 3));
  const shellSolid = occluder(shellGeo);
  shellSolid.material.side = THREE.DoubleSide;
  mouse.add(shellSolid);

  const loopAt = (fn) => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) pts.push(fn(-1 + (2 * i) / 48, 1));
    for (let i = 48; i >= 0; i -= 1) pts.push(fn(-1 + (2 * i) / 48, -1));
    return pts;
  };
  const foot = poly(loopAt((u, v) => footPoint(u, v)), C.steel, 0.75, true);
  mouse.add(foot);
  const rim = poly(loopAt((u, v) => onShell(u, v)), C.steel, 0.5, true);
  mouse.add(rim);

  const lines = [];
  const across = (u) => { for (let j = 0; j < 24; j += 1) lines.push(onShell(u, -1 + j / 12), onShell(u, -1 + (j + 1) / 12)); };
  across(0.14);                             // where the buttons end and the palm begins
  across(-0.5);                             // the fall of the tail
  for (let i = 0; i < 14; i += 1) {         // the split between the buttons
    const a = 0.14 + (i / 14) * 0.86, b = 0.14 + ((i + 1) / 14) * 0.86;
    lines.push(onShell(a, 0), onShell(b, 0));
  }
  // Thumb buttons on the left flank: +v here, which the turn puts on your left.
  for (const [ua, ub] of [[0.0, 0.2], [0.24, 0.44]]) {
    const va = 0.84, vb = 0.97;
    const edge = (u0, v0, u1, v1) => { for (let k = 0; k < 6; k += 1) lines.push(onShell(u0 + (u1 - u0) * k / 6, v0 + (v1 - v0) * k / 6), onShell(u0 + (u1 - u0) * (k + 1) / 6, v0 + (v1 - v0) * (k + 1) / 6)); };
    edge(ua, va, ub, va); edge(ub, va, ub, vb); edge(ub, vb, ua, vb); edge(ua, vb, ua, va);
  }
  const shellLines = segs(lines, C.steel, 0.7);
  mouse.add(shellLines);

  // The wheel, standing up in the split.
  const wheelAt = shellPoint(0.46, 0);
  const wheel = ring(0.046, C.steel, 0.85, 'x', 28);
  wheel.position.set(wheelAt.x, wheelAt.y + 0.012, wheelAt.z);
  mouse.add(wheel);
  // The slot the wheel sits in.
  const slot = poly([V(-0.028, 0, -0.07), V(0.028, 0, -0.07), V(0.028, 0, 0.07), V(-0.028, 0, 0.07)], C.steel, 0.4, true);
  slot.position.set(wheelAt.x, wheelAt.y + 0.008, wheelAt.z);
  mouse.add(slot);

  // The DPI lamp, behind the wheel: the colour of the stage the mouse is on.
  const lampAt = shellPoint(0.25, 0);
  const lamp = node(0.022, C.beat, 0.9);
  lamp.position.set(lampAt.x, lampAt.y + 0.012, lampAt.z);
  mouse.add(lamp);

  // Battery: a ring on the desk round the mouse's foot, drawn as far as the charge.
  // An oval that follows the mouse's own outline — long nose to tail (z),
  // narrow across (x) — with the same margin all round. It was drawn the other
  // way about, wide across and short along, so it cut under the middle of the
  // mouse instead of circling its foot.
  const BAT_RX = M.W / 2 + 0.14;
  const BAT_RZ = M.L / 2 + 0.14;
  const BAT_SEG = 64;
  const batPts = [];
  for (let i = 0; i <= BAT_SEG; i += 1) {
    // From the tail, round past the left flank: the part of the ring nearest
    // the viewer fills first.
    const a = -Math.PI / 2 + (i / BAT_SEG) * Math.PI * 2;
    batPts.push(V(Math.cos(a) * BAT_RX, 0.003, Math.sin(a) * BAT_RZ));
  }
  const batTrack = poly(batPts, C.rhodium, 0.25);
  const batFill = poly(batPts, C.ok, 0.85);
  mouse.add(batTrack, batFill);

  // The cable, off the nose, while it is on the wire.
  // Off the nose and away across the desk, toward whatever it is plugged into.
  const nose = footPoint(1, 0, 0.03);
  const cablePts = [nose, V(0.0, 0.02, 0.66), V(0.14, 0.006, 0.9), V(0.4, 0.004, 1.02)];
  const cableCurve = new THREE.CatmullRomCurve3(cablePts);
  const cable = poly(cableCurve.getPoints(30), C.rhodium, 0.6);
  mouse.add(cable);
  const spark = node(0.018, C.warn, 0.9);
  mouse.add(spark);

  Object.assign(P, {
    kbGroup: kb, caseTop, caseBase, caps, wasd,
    foot, shellLines, wheel, lamp, batFill, batPts, cable, cableCurve, spark,
    kbOnline: false, mouseOnline: false, charging: false, wired: false, battery: null,
  });

  group.userData.tick = (t, dt, p, env) => {
    const slow = env && env.reduced ? 0 : 1;
    // WASD: down and back up, each a beat after the last.
    for (const k of p.wasd) {
      if (!p.kbOnline) { k.g.position.y = KB_H; k.field.material.opacity = 0; continue; }
      const s = (Math.sin((t * 1.6 + k.phase * 6) * slow) + 1) / 2;
      const press = Math.max(0, s - 0.35) / 0.65;          // rests up most of the time
      k.g.position.y = KB_H - press * CAP_H * 0.55;
      k.field.material.opacity = 0.15 + press * 0.7;
      k.top.material.opacity = 0.35 + press * 0.5;
    }
    // The charge ring breathes while it charges.
    if (p.battery != null) {
      p.batFill.material.opacity = p.charging ? 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4)) : 0.85;
    }
    // Current down the cable while it is on the wire.
    p.spark.visible = p.mouseOnline && p.wired;
    if (p.spark.visible) p.cableCurve.getPointAt(1 - ((t * 0.35) % 1), p.spark.position);
  };

  function setState(state) {
    const s = state || {};
    const devs = Array.isArray(s.devices) ? s.devices : [];
    const m = devs.find((d) => d.kind === 'mouse') || {};
    const k = devs.find((d) => d.kind === 'keyboard') || {};
    const status = STATUS_HEX[s.status] ? s.status : 'ok';

    P.kbOnline = !!k.online;
    const kbHex = P.kbOnline ? STATUS_HEX[status] : C.rhodium;
    P.caseTop.material.color.setHex(kbHex);
    P.caseTop.material.opacity = P.kbOnline ? 0.85 : 0.35;
    P.caps.material.opacity = P.kbOnline ? 0.55 : 0.22;

    P.mouseOnline = !!m.online;
    P.wired = m.link === 'wired';
    P.charging = !!m.charging;
    P.foot.material.color.setHex(P.mouseOnline ? STATUS_HEX[status] : C.rhodium);
    P.foot.material.opacity = P.mouseOnline ? 0.85 : 0.4;
    P.shellLines.material.opacity = P.mouseOnline ? 0.55 : 0.25;
    P.lamp.visible = P.mouseOnline;
    if (m.dpiColor && /^#[0-9a-f]{6}$/i.test(m.dpiColor)) P.lamp.material.color.set(m.dpiColor);
    P.cable.material.opacity = P.mouseOnline && P.wired ? 0.6 : 0;

    P.battery = typeof m.battery === 'number' ? Math.max(0, Math.min(100, m.battery)) : null;
    if (P.battery == null) {
      P.batFill.visible = false;
    } else {
      P.batFill.visible = true;
      const n = Math.max(2, Math.round((P.battery / 100) * (P.batPts.length - 1)) + 1);
      P.batFill.geometry.setPositions(P.batPts.slice(0, n).flatMap((v) => [v.x, v.y, v.z]));
      P.batFill.computeLineDistances?.();
      P.batFill.material.color.setHex(P.battery <= 15 && !P.charging ? C.warn : C.ok);
    }
  }

  setState(opts.state || {
    status: 'ok',
    devices: [{ kind: 'mouse', online: true, battery: 80, charging: false, link: 'dongle', dpiColor: '#ffffff' }],
  });
  return { group, setState };
}
