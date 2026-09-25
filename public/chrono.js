/* ============================================================
   ojee-console — the chronometer.

   A reference clock for setting a mechanical watch: pull the crown
   to stop the seconds hand, set the hands a minute ahead, and push
   the crown in on the minute. So the things that matter are, in
   order: the seconds, read exactly; the approach to :00, readable
   without counting; and a reason to believe the time is right.

     readout   HH:MM:SS, tabular, seconds in the accent
     dial      an instrument face with a sweeping seconds hand —
               the thing you actually compare a watch against
     rail      the minute as sixty marks, the last five set apart
               as the approach to :00
     facts     date, zone, and where the time comes from, with a
               measured ± rather than a claim

   Every clock reads timesync.now(), never new Date().
   ============================================================ */

import {
  now, info, start as startSync, onChange, parts, longDate, shortDate, utcOffset, zoneAbbr,
  isoWeek, dayOfYear, zoneCity,
} from '/timesync.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

/* ── the dial face ─────────────────────────────────────────────────────
   Static SVG, drawn once. The hands are HTML over it and move by CSS
   transform alone, so a clock left running all day costs the compositor
   and not a repaint of the face sixty times a second. */
function face() {
  const tick = (i, r0, r1, cls) => {
    const a = (i / 60) * Math.PI * 2;
    const [s, c] = [Math.sin(a), -Math.cos(a)];
    return `<line class="${cls}" x1="${(s * r0).toFixed(2)}" y1="${(c * r0).toFixed(2)}" x2="${(s * r1).toFixed(2)}" y2="${(c * r1).toFixed(2)}"/>`;
  };
  let marks = '';
  for (let i = 0; i < 60; i++) {
    marks += i % 5 === 0 ? tick(i, 86, 74, 'ch-t5') : tick(i, 86, 81, 'ch-t1');
  }
  const nums = [[12, 0], [3, 90], [6, 180], [9, 270]].map(([n, deg]) => {
    const a = (deg / 180) * Math.PI;
    return `<text x="${(Math.sin(a) * 63).toFixed(2)}" y="${(-Math.cos(a) * 63).toFixed(2)}">${n}</text>`;
  }).join('');

  return `
    <svg class="ch-face" viewBox="-92 -92 184 184" aria-hidden="true">
      <circle class="ch-rim" r="86"/>
      ${marks}
      <g class="ch-num">${nums}</g>
    </svg>`;
}

/* A 12-hour face and nothing else. A 24-hour ring was tried and taken off:
   its 06 sat where the 3 is and its 12 at the bottom, so the hour hand could
   be read against the wrong scale — and the readout beside it is 24-hour
   already. */
function dialHTML() {
  return `
    <div class="ch-dial" aria-hidden="true">
      ${face()}
      <div class="ch-hands">
        <div class="ch-trail"></div>
        <div class="ch-hand ch-hand--h"></div>
        <div class="ch-hand ch-hand--m"></div>
        <div class="ch-hand ch-hand--s"></div>
        <div class="ch-hub"></div>
      </div>
      <div class="ch-pulse"></div>
    </div>`;
}

function railHTML() {
  let s = '';
  for (let i = 0; i < 60; i++) s += `<i${i >= 55 ? ' class="ch-app"' : ''}></i>`;
  return `<div class="ch-rail" aria-hidden="true">${s}</div>`;
}

/* ── facts about the time ──────────────────────────────────────────── */

function sourceLine(inf) {
  if (!inf.synced) return { dot: 'dot--warn', text: 'device clock', title: 'Not synced yet — showing this device’s own clock.' };
  if (!inf.verified) {
    return { dot: 'dot--warn', text: `server ±${inf.accuracyMs} ms`,
             title: 'Synced to the console, but the console could not reach an NTP server to check its own clock.' };
  }
  const n = inf.ntp;
  return {
    dot: 'dot--ok',
    text: `NTP ±${inf.accuracyMs} ms`,
    title: `Synced to the console, which measures itself against ${n.server} (stratum ${n.stratum}): `
      + `${n.offsetMs >= 0 ? '+' : ''}${n.offsetMs} ms off, ${n.corrected ? 'corrected' : 'inside the noise, left alone'}.`,
  };
}

function deviceLine(inf) {
  if (inf.deviceMs == null) return '—';
  const v = inf.deviceMs, a = Math.abs(v);
  if (a < 50) return 'on time';
  const amt = a >= 1000 ? `${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)} s` : `${a} ms`;
  return `${amt} ${v > 0 ? 'fast' : 'slow'}`;
}

/* ── mount ────────────────────────────────────────────────────────────
   variant 'home'  compact: readout, rail, facts, dial on wide screens
   variant 'idle'  the full-screen display: big dial with the 24-hour ring,
                   big readout, date and facts; the caller supplies the rest */
export function mountChrono(el, { variant = 'home' } = {}) {
  startSync();
  const idle = variant === 'idle';

  el.classList.add('ch', `ch--${variant}`);
  el.innerHTML = idle ? `
    <div class="ch-dialwrap">${dialHTML()}</div>
    <div class="ch-side">
      <div class="ch-readbox">
        <div class="ch-read" aria-hidden="true"><span class="ch-hh">--</span><span class="ch-sep">:</span><span class="ch-mm">--</span><span class="ch-sep">:</span><span class="ch-ss">--</span></div>
        ${railHTML()}
      </div>
      <p class="ch-date"></p>
      <p class="ch-line">
        <span class="ch-zone"></span>
        <span class="ch-src"><span class="dot"></span><span class="ch-src-t"></span></span>
        <span class="ch-dev"></span>
      </p>
      <time class="sr-only ch-sr"></time>
      <div class="ch-slot"></div>
    </div>` : `
    <div class="ch-main">
      <div class="ch-readbox">
        <div class="ch-read" aria-hidden="true"><span class="ch-hh">--</span><span class="ch-sep">:</span><span class="ch-mm">--</span><span class="ch-sep">:</span><span class="ch-ss">--</span></div>
        ${railHTML()}
      </div>
      <div class="titleblock ch-tb">
        <div class="tb"><span class="tb-k">Date</span><span class="tb-v ch-date"></span></div>
        <div class="tb"><span class="tb-k">Zone</span><span class="tb-v ch-zone"></span></div>
        <div class="tb"><span class="tb-k">Source</span><span class="tb-v ch-src"><span class="dot"></span> <span class="ch-src-t"></span></span></div>
        <div class="tb"><span class="tb-k">This device</span><span class="tb-v ch-dev"></span></div>
      </div>
      <time class="sr-only ch-sr"></time>
    </div>
    <div class="ch-dialwrap">${dialHTML()}</div>`;

  const q = (s) => el.querySelector(s);
  const $hh = q('.ch-hh'), $mm = q('.ch-mm'), $ss = q('.ch-ss');
  const rail = [...el.querySelectorAll('.ch-rail i')];
  const hands = {
    h: q('.ch-hand--h'), m: q('.ch-hand--m'), s: q('.ch-hand--s'),
    t: q('.ch-trail'),
  };

  let lastSec = -1, lastMin = -1, raf = 0, stepTimer = 0, flashTimer = 0;

  /** Everything interpolated below is generated from a Date, but innerHTML
    still gets an escape — the rule is the rule. */
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const paintFacts = () => {
    const t = now(), inf = info(), p = parts(t);
    const abbr = zoneAbbr(t);
    const zone = `${zoneCity(inf.zone)} · ${utcOffset(t)}${abbr ? ` · ${abbr}` : ''}`;
    const src = sourceLine(inf);
    if (idle) {
      // Two lines by design rather than wherever the box happens to run out:
      // the date, then where in the year it falls.
      q('.ch-date').innerHTML = `${esc(longDate(t))}<span class="ch-date-b">week ${
        isoWeek(p.date)} · day ${dayOfYear(p.date)}</span>`;
    } else {
      q('.ch-date').textContent = shortDate(t);
    }
    q('.ch-zone').textContent = zone;
    q('.ch-zone').title = inf.zone;
    q('.ch-src .dot').className = `dot ${src.dot}`;
    q('.ch-src-t').textContent = src.text;
    q('.ch-src').title = src.title;
    q('.ch-dev').textContent = idle ? `this device ${deviceLine(inf)}` : deviceLine(inf);
    q('.ch-sr').textContent = `${p.hh}:${p.mm}, ${longDate(t)}, ${zone}`;
    q('.ch-sr').setAttribute('datetime', new Date(t).toISOString());
  };

  const paintSecond = (p) => {
    $hh.textContent = p.hh; $mm.textContent = p.mm; $ss.textContent = p.ss;
    const s = p.s;
    // A full redraw on the minute, then one mark per second after it.
    if (s === 0 || lastSec === -1 || s < lastSec) rail.forEach((r, i) => r.classList.toggle('on', i <= s));
    else rail[s]?.classList.add('on');
    el.classList.toggle('is-approach', s >= 55);
    if (s === 0 && lastSec !== -1) {
      el.classList.add('is-top');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.classList.remove('is-top'), 900);
    }
    if (p.m !== lastMin) { lastMin = p.m; paintFacts(); }
    lastSec = s;
  };

  const paintHands = (p, smooth) => {
    const sec = p.s + (smooth ? p.ms / 1000 : 0);
    const min = p.m + sec / 60;
    const hr = (p.h % 12) + min / 60;
    hands.s.style.transform = `rotate(${sec * 6}deg)`;
    if (hands.t) hands.t.style.transform = `rotate(${sec * 6}deg)`;
    hands.m.style.transform = `rotate(${min * 6}deg)`;
    hands.h.style.transform = `rotate(${hr * 30}deg)`;
  };

  // Smooth: one frame loop, text only when the second changes.
  const frame = () => {
    const p = parts(now());
    if (p.s !== lastSec) paintSecond(p);
    paintHands(p, true);
    raf = requestAnimationFrame(frame);
  };
  // Reduced motion: the hand steps once a second, like a quartz watch, and
  // nothing sweeps.
  const step = () => {
    const t = now(), p = parts(t);
    paintSecond(p); paintHands(p, false);
    stepTimer = setTimeout(step, 1000 - (t % 1000) + 4);
  };
  const run = () => {
    cancelAnimationFrame(raf); clearTimeout(stepTimer);
    el.classList.toggle('is-reduced', REDUCED.matches);
    if (REDUCED.matches) step(); else raf = requestAnimationFrame(frame);
  };
  run();
  REDUCED.addEventListener('change', run);
  const offSync = onChange(paintFacts);
  paintFacts();

  return {
    el,
    destroy() {
      cancelAnimationFrame(raf); clearTimeout(stepTimer); clearTimeout(flashTimer);
      REDUCED.removeEventListener('change', run);
      offSync();
    },
  };
}

