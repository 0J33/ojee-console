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
   A small symmetrical shell: widest just behind the middle, a hump a third of
   the way up from the back, the two buttons split down the front half. */
const M_X = 1.5;
const M_L = 0.98;               // length
const M_H = 0.3;                // hump height
const M_SEG_U = 22;             // along
const M_SEG_V = 14;             // across

const width = (t) => 0.5 * (0.84 + 0.1 * Math.sin(Math.PI * (1 - t)) - 0.12 * t * t) * 0.62;   // t 0 back → 1 front
const height = (t) => M_H * (0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.05)) ** 0.8) * (1 - 0.55 * t * t);

function shellPoint(t, v) {
  // v -1..1 across; a dome whose shoulders round over rather than a box's
  const w = width(t);
  const x = v * w;
  const y = height(t) * Math.sqrt(Math.max(0, 1 - v * v)) ** 0.9;
  const z = (t - 0.5) * M_L;
  return V(x, y, z);
}

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
  mouse.position.set(M_X, Y0, 0.08);
  mouse.rotation.y = -0.12;
  sp.add(mouse);

  const shellPos = [];
  for (let i = 0; i < M_SEG_U; i += 1) {
    for (let j = 0; j < M_SEG_V; j += 1) {
      const t0 = i / M_SEG_U, t1 = (i + 1) / M_SEG_U;
      const v0 = -1 + (2 * j) / M_SEG_V, v1 = -1 + (2 * (j + 1)) / M_SEG_V;
      const a = shellPoint(t0, v0), b = shellPoint(t1, v0), c = shellPoint(t1, v1), d = shellPoint(t0, v1);
      shellPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPos, 3));
  mouse.add(occluder(shellGeo));

  const outline = [];
  for (let i = 0; i <= 40; i += 1) outline.push(shellPoint(i / 40, 1));
  for (let i = 40; i >= 0; i -= 1) outline.push(shellPoint(i / 40, -1));
  const foot = poly(outline, C.steel, 0.75, true);
  mouse.add(foot);

  const lines = [];
  // Cross-sections: where the palm meets the buttons, and one through the hump.
  for (const t of [0.3, 0.58]) {
    for (let j = 0; j < 20; j += 1) lines.push(shellPoint(t, -1 + j / 10), shellPoint(t, -1 + (j + 1) / 10));
  }
  // The button split, down the front from the wheel.
  for (let i = 0; i < 10; i += 1) {
    const t0 = 0.58 + (i / 10) * 0.42, t1 = 0.58 + ((i + 1) / 10) * 0.42;
    lines.push(shellPoint(t0, 0), shellPoint(t1, 0));
  }
  // Side buttons on the left flank.
  for (const [ta, tb] of [[0.5, 0.62], [0.64, 0.76]]) {
    const v = -0.9;
    lines.push(shellPoint(ta, v), shellPoint(tb, v), shellPoint(ta, v + 0.14), shellPoint(tb, v + 0.14),
      shellPoint(ta, v), shellPoint(ta, v + 0.14), shellPoint(tb, v), shellPoint(tb, v + 0.14));
  }
  const shellLines = segs(lines, C.steel, 0.55);
  mouse.add(shellLines);

  // The wheel, standing up in the split.
  const wheelAt = shellPoint(0.7, 0);
  const wheel = ring(0.05, C.steel, 0.8, 'x', 28);
  wheel.position.set(wheelAt.x, wheelAt.y + 0.005, wheelAt.z);
  mouse.add(wheel);

  // The DPI lamp, behind the wheel: the colour of the stage the mouse is on.
  const lampAt = shellPoint(0.56, 0);
  const lamp = node(0.022, C.beat, 0.9);
  lamp.position.set(lampAt.x, lampAt.y + 0.012, lampAt.z);
  mouse.add(lamp);

  // Battery: a ring on the desk round the mouse's foot, drawn as far as the charge.
  const BAT_R = 0.62;
  const BAT_SEG = 64;
  const batPts = [];
  for (let i = 0; i <= BAT_SEG; i += 1) {
    const a = -Math.PI / 2 + (i / BAT_SEG) * Math.PI * 2;
    batPts.push(V(Math.cos(a) * BAT_R, 0.003, Math.sin(a) * BAT_R * 0.72));
  }
  const batTrack = poly(batPts, C.rhodium, 0.25);
  const batFill = poly(batPts, C.ok, 0.85);
  mouse.add(batTrack, batFill);

  // The cable, off the nose, while it is on the wire.
  const nose = shellPoint(1, 0);
  const cablePts = [nose.clone().add(V(0, -0.02, 0)), V(0.02, 0.02, 0.62), V(-0.1, 0.004, 0.86), V(-0.35, 0.004, 0.95)];
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
    devices: [{ kind: 'mouse', online: true, battery: 80, charging: false, link: 'dongle', dpiColor: '#00ffff' }],
  });
  return { group, setState };
}
