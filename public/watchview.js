/* ============================================================
   ojee-console — the watch, opened up.

   The panel beside the watch when it is opened (#/watch): four things
   the plate cannot show.

     Chronograph   a stopwatch with laps (its hand is on the watch), and
                   timers that say so wherever you are in the console
     Time zones    other places, each as a watch of its own
     Accuracy      how right this clock is, and a day of the host's
                   measurements against NTP
     Display       12/24-hour, the day wheel's language, the crown,
                   and when the idle display dims

   The shell owns the overlay and the watch; this owns the panel.
   mount(el, ctx) -> { destroy(), relayout() }
   ============================================================ */

import * as watch from '/watch.js';
import * as timesync from '/timesync.js';
import { pref, setPref, onPrefs } from '/prefs.js';

const TABS = [
  { id: 'chrono', label: 'Chronograph' },
  { id: 'zones', label: 'Time zones' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'display', label: 'Display' },
];
const PRESETS = [1, 3, 5, 10, 15, 25, 60];
const SUGGEST = ['Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Tokyo', 'Europe/Berlin', 'America/Los_Angeles', 'Asia/Riyadh'];

let lastTab = 'chrono';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtClock = (ms, zone) => new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric', minute: '2-digit', hour12: !pref('clock24'), timeZone: zone,
}).format(new Date(ms)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
const fmtDay = (ms, zone) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(new Date(ms));
const hh = (h) => (pref('clock24') ? `${String(h).padStart(2, '0')}:00` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`);

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function mount(el, ctx) {
  const { stage, icon, toast, crown } = ctx;
  let tab = lastTab;
  let raf = 0;
  let secT = 0;
  let history = null;
  let histT = 0;
  let showTable = false;
  let zoneIds = [];
  const offs = [];

  el.classList.add('wv');
  el.innerHTML = `
    <div class="wv-tabs" role="tablist" aria-label="Watch">
      ${TABS.map((t) => `<button type="button" role="tab" class="wv-tab" data-tab="${t.id}" id="wv-tab-${t.id}" aria-controls="wv-pane">${esc(t.label)}</button>`).join('')}
    </div>
    <div class="wv-pane" id="wv-pane" role="tabpanel"></div>`;
  const pane = el.querySelector('.wv-pane');

  /* ── tabs ── */
  function setTab(id) {
    tab = TABS.some((t) => t.id === id) ? id : 'chrono';
    lastTab = tab;
    el.querySelectorAll('.wv-tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    pane.setAttribute('aria-labelledby', `wv-tab-${tab}`);
    unbindZones();
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(secT); secT = 0;
    paint();
  }

  function paint() {
    if (tab === 'chrono') paintChrono();
    else if (tab === 'zones') paintZones();
    else if (tab === 'accuracy') paintAccuracy();
    else paintDisplay();
  }

  /* ── chronograph ── */
  function paintChrono() {
    const sw = watch.stopwatch;
    const laps = sw.laps;
    const lapRows = laps.map((t, i) => ({ n: i + 1, split: t - (laps[i - 1] || 0), total: t })).reverse();
    const best = laps.length > 1 ? Math.min(...lapRows.map((r) => r.split)) : null;
    const tl = watch.timers.list();
    pane.innerHTML = `
      <section class="wv-sec">
        <h3 class="wv-h">Stopwatch <span class="wv-hint">its hand is the brass one on the watch</span></h3>
        <div class="wv-sw" aria-live="off">${watch.fmtStopwatch(sw.elapsed())}</div>
        <div class="wv-row">
          <button type="button" class="wv-btn wv-btn--primary" data-sw="${sw.running ? 'stop' : 'start'}">${sw.running ? 'Stop' : (sw.active ? 'Resume' : 'Start')}</button>
          <button type="button" class="wv-btn" data-sw="${sw.running ? 'lap' : 'reset'}" ${!sw.active ? 'disabled' : ''}>${sw.running ? 'Lap' : 'Reset'}</button>
        </div>
        ${lapRows.length ? `
        <ol class="wv-laps">
          ${lapRows.map((r) => `<li class="${r.split === best ? 'is-best' : ''}"><span>Lap ${r.n}</span><b>${watch.fmtStopwatch(r.split)}</b><i>${watch.fmtStopwatch(r.total)}</i></li>`).join('')}
        </ol>` : ''}
      </section>
      <section class="wv-sec">
        <h3 class="wv-h">Timers</h3>
        <div class="wv-chips">
          ${PRESETS.map((m) => `<button type="button" class="wv-chip" data-preset="${m}">${m < 60 ? `${m} min` : '1 hour'}</button>`).join('')}
        </div>
        <form class="wv-row wv-custom" data-custom>
          <input class="wv-in wv-in--time" name="dur" inputmode="numeric" placeholder="mm:ss" aria-label="Duration, minutes and seconds" autocomplete="off">
          <input class="wv-in" name="label" placeholder="Label (optional)" maxlength="40" aria-label="Label" autocomplete="off">
          <button type="submit" class="wv-btn">Start</button>
        </form>
        <ul class="wv-timers">
          ${tl.map((t) => `
            <li class="wv-timer${t.done ? ' is-done' : ''}${t.endAt === null && !t.done ? ' is-paused' : ''}" data-id="${esc(t.id)}">
              <div class="wv-timer-top">
                <span class="wv-timer-label">${esc(t.label || `${watch.fmtTimer(t.durMs)} timer`)}</span>
                <b class="wv-timer-left" data-left>${t.done ? 'Done' : watch.fmtTimer(t.left)}</b>
              </div>
              <span class="wv-bar"><i data-bar style="--f:${t.done ? 1 : (1 - t.left / t.durMs).toFixed(4)}"></i></span>
              <div class="wv-timer-acts">
                ${t.done
                  ? `<button type="button" class="wv-link" data-t="restart">Again</button>`
                  : `<button type="button" class="wv-link" data-t="${t.endAt === null ? 'resume' : 'pause'}">${t.endAt === null ? 'Resume' : 'Pause'}</button>`}
                <button type="button" class="wv-link" data-t="plus">+1 min</button>
                <button type="button" class="wv-link wv-link--quiet" data-t="remove" aria-label="Remove timer">Remove</button>
              </div>
            </li>`).join('')}
        </ul>
      </section>`;
    const tick = () => {
      raf = 0;
      if (tab !== 'chrono') return;
      const r = pane.querySelector('.wv-sw');
      if (r) r.textContent = watch.fmtStopwatch(watch.stopwatch.elapsed());
      for (const t of watch.timers.list()) {
        const row = pane.querySelector(`.wv-timer[data-id="${CSS.escape(t.id)}"]`);
        if (!row || t.done) continue;
        row.querySelector('[data-left]').textContent = watch.fmtTimer(t.left);
        row.querySelector('[data-bar]').style.setProperty('--f', (1 - t.left / t.durMs).toFixed(4));
      }
      if (watch.stopwatch.running || tl.some((t) => !t.done && t.endAt !== null)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function parseDur(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s) * 60_000;                   // "5" = five minutes
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);                // h:mm:ss or mm:ss
    if (!m) return null;
    return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
  }

  async function askNotify() {
    // Asked for once, on the first timer: that is when it has a reason.
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    } catch { /* not offered here */ }
  }

  /* ── time zones ── */
  function unbindZones() {
    for (const id of zoneIds) stage?.unbind(id);
    zoneIds = [];
  }

  function paintZones() {
    const list = watch.zones.list();
    const now = timesync.now();
    const all = watch.zones.all();
    const room = list.length < watch.zones.max;
    pane.innerHTML = `
      <section class="wv-sec">
        <h3 class="wv-h">Time zones <span class="wv-hint">${list.length}/${watch.zones.max}</span></h3>
        ${list.length ? `
        <div class="wv-zones">
          ${list.map(({ id, zone: z, name }, i) => `
            <div class="wv-zone">
              <span class="wv-zone-dial" data-zdial="${i}" aria-hidden="true"></span>
              <div class="wv-zone-read">
                <input class="wv-zone-name" data-zname="${esc(id)}" value="${esc(name)}" placeholder="${esc(watch.zoneCity(z))}"
                       maxlength="40" autocomplete="off" spellcheck="false" title="Name this watch" aria-label="Name for ${esc(watch.zoneCity(z))}">
                <b class="wv-zone-time" data-ztime="${i}">${esc(fmtClock(now, z))}</b>
                <span class="wv-zone-sub"><span data-zsub="${i}">${esc(fmtDay(now, z))}</span> <b class="wv-zone-diff" data-zdiff="${i}">${esc(watch.zoneDiff(z))}</b></span>
                ${name ? `<span class="wv-zone-where">${esc(watch.zoneCity(z))}</span>` : ''}
              </div>
              <button type="button" class="wv-x" data-zremove="${esc(id)}" aria-label="Remove ${esc(name || watch.zoneCity(z))}">${icon('i-close')}</button>
            </div>`).join('')}
        </div>` : '<p class="wv-empty">No other zones yet. Each one you add gets a watch of its own.</p>'}
        ${room ? `
        <form class="wv-row wv-zadd" data-zadd>
          <input class="wv-in" name="zone" list="wv-zlist" placeholder="Add a city or zone — Tokyo, Europe/London…" aria-label="Time zone" autocomplete="off">
          <input class="wv-in wv-in--short" name="zname" maxlength="40" placeholder="Name (optional)" aria-label="Name for this watch" autocomplete="off">
          <datalist id="wv-zlist">${all.map((z) => `<option value="${esc(z)}">`).join('')}</datalist>
          <button type="submit" class="wv-btn">Add</button>
        </form>
        <div class="wv-chips">
          ${SUGGEST.filter((z) => !watch.zones.has(z) && watch.validZone(z)).slice(0, 5).map((z) => `<button type="button" class="wv-chip" data-zquick="${esc(z)}">${esc(watch.zoneCity(z))}</button>`).join('')}
        </div>` : ''}
      </section>`;
    // Each zone is a watch: the same calibre, told that zone's time, held
    // square on so it reads.
    list.forEach(({ zone: z }, i) => {
      const id = `zone:${i}`;
      zoneIds.push(id);
      stage?.bind(id, `[data-zdial="${i}"]`, { fill: 0.94, now: watch.zoneClock(z), clip: true }).then(() => {
        if (!zoneIds.includes(id)) return;
        stage.soloAdd(id);
        stage.hold(id, true);
      });
    });
    secT = setInterval(() => {
      const t = timesync.now();
      list.forEach(({ zone: z }, i) => {
        const a = pane.querySelector(`[data-ztime="${i}"]`);
        const b = pane.querySelector(`[data-zsub="${i}"]`);
        const c = pane.querySelector(`[data-zdiff="${i}"]`);
        if (a) a.textContent = fmtClock(t, z);
        if (b) b.textContent = fmtDay(t, z);
        if (c) c.textContent = watch.zoneDiff(z);
      });
    }, 1000);
  }

  function resolveZone(q) {
    const s = String(q || '').trim();
    if (!s) return null;
    if (watch.validZone(s)) return s;
    // A city typed on its own: find the zone that ends in it.
    const key = s.toLowerCase().replace(/\s+/g, '_');
    return watch.zones.all().find((z) => z.toLowerCase().split('/').pop() === key) || null;
  }

  /* ── accuracy ── */
  async function loadHistory() {
    try {
      const r = await fetch('/api/time/history', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (r.ok) history = await r.json();
    } catch { /* keep what we had */ }
    if (tab === 'accuracy') paintAccuracy();
  }

  function paintAccuracy() {
    const t = timesync.info();
    const ntp = history?.ntp || t.ntp || {};
    const dev = t.deviceMs;
    const facts = [
      ['Source', ntp.verified ? `${ntp.server} · stratum ${ntp.stratum}` : (ntp.error || 'measuring')],
      ['Host offset', ntp.verified ? `${ntp.offsetMs > 0 ? '+' : ''}${ntp.offsetMs} ms${ntp.corrected ? ' (corrected)' : ''}` : '—'],
      ['Round trip', ntp.verified ? `${ntp.delayMs} ms` : '—'],
      ['Checked', ntp.checkedAt ? ago(ntp.checkedAt) : '—'],
      ['This device', dev == null ? '—' : dev === 0 ? 'on time' : `${Math.abs(dev)} ms ${dev > 0 ? 'fast' : 'slow'}`],
    ];
    const h = history?.history || [];
    pane.innerHTML = `
      <section class="wv-sec">
        <h3 class="wv-h">Accuracy</h3>
        <div class="wv-big">${t.accuracyMs != null ? `±${t.accuracyMs}<small> ms</small>` : '—'}</div>
        <p class="wv-sub">${t.verified ? 'Checked against NTP' : 'Not yet checked against NTP'} · this browser synced ${t.syncedAt ? ago(t.syncedAt) : 'not yet'}</p>
        <dl class="wv-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><span class="lead"></span><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="wv-row"><button type="button" class="wv-btn" data-resync>Sync now</button></div>
      </section>
      <section class="wv-sec">
        <h3 class="wv-h">Host offset from NTP, last 24 hours
          ${h.length ? `<button type="button" class="wv-link" data-table>${showTable ? 'Chart' : 'Table'}</button>` : ''}</h3>
        ${!h.length ? '<p class="wv-empty">No measurements yet: one is taken every 15 minutes.</p>'
          : showTable ? tableHTML(h) : '<div class="wv-chart" data-chart></div>'}
      </section>`;
    if (h.length && !showTable) drawChart(pane.querySelector('[data-chart]'), h);
  }

  function tableHTML(h) {
    return `<div class="wv-tablewrap"><table class="wv-table">
      <thead><tr><th scope="col">Time</th><th scope="col">Offset</th><th scope="col">± (half round trip)</th><th scope="col">Server</th></tr></thead>
      <tbody>${h.slice().reverse().map((p) => `<tr><td>${esc(fmtClock(p.at))}</td><td>${p.offsetMs > 0 ? '+' : ''}${p.offsetMs} ms</td><td>${(p.delayMs / 2).toFixed(1)} ms</td><td>${esc(p.server)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  /* One series, one axis: the host's offset, with the measurement's own
     uncertainty (half the round trip) as a band around it — same unit, same
     scale, so the band says how much of any wiggle is real. */
  function drawChart(box, h) {
    const W = Math.max(260, box.clientWidth || 420);
    const H = 170;
    const m = { l: 44, r: 10, t: 10, b: 24 };
    const t1 = Date.now(); const t0 = t1 - 24 * 3600_000;
    const ext = Math.max(4, ...h.map((p) => Math.abs(p.offsetMs) + p.delayMs / 2));
    const Y = Math.ceil(ext / 2) * 2;
    const x = (at) => m.l + ((at - t0) / (t1 - t0)) * (W - m.l - m.r);
    const y = (v) => m.t + ((Y - v) / (2 * Y)) * (H - m.t - m.b);
    const pts = h.map((p) => [x(p.at), y(p.offsetMs)]);
    const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const band = `${h.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.offsetMs + p.delayMs / 2).toFixed(1)}`).join('')}${h.slice().reverse().map((p) => `L${x(p.at).toFixed(1)},${y(p.offsetMs - p.delayMs / 2).toFixed(1)}`).join('')}Z`;
    const xt = [];
    for (let k = 0; k <= 4; k += 1) {
      const at = t0 + k * 6 * 3600_000;
      const d = new Date(at);
      xt.push(`<text x="${x(at).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}">${k === 4 ? 'now' : esc(pref('clock24') ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : fmtClock(at))}</text>`);
    }
    box.innerHTML = `
      <svg class="wv-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Host clock offset from NTP over the last 24 hours, between ${-Y} and ${Y} milliseconds">
        <g class="wv-grid">
          <line x1="${m.l}" x2="${W - m.r}" y1="${y(Y)}" y2="${y(Y)}"/><line x1="${m.l}" x2="${W - m.r}" y1="${y(-Y)}" y2="${y(-Y)}"/>
          <line class="wv-zero" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>
        </g>
        <g class="wv-ax">
          <text x="${m.l - 8}" y="${y(Y) + 4}" text-anchor="end">+${Y} ms</text>
          <text x="${m.l - 8}" y="${y(0) + 4}" text-anchor="end">0</text>
          <text x="${m.l - 8}" y="${y(-Y) + 4}" text-anchor="end">−${Y} ms</text>
          ${xt.join('')}
        </g>
        <path class="wv-band" d="${band}"/>
        <path class="wv-line" d="${line}"/>
        <g class="wv-hover" hidden><line class="wv-cross" y1="${m.t}" y2="${H - m.b}"/><circle r="4.5"/></g>
        <rect class="wv-hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}"/>
      </svg>
      <div class="wv-tip" hidden></div>`;
    const svg = box.querySelector('svg');
    const hov = svg.querySelector('.wv-hover');
    const tip = box.querySelector('.wv-tip');
    const hit = svg.querySelector('.wv-hit');
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * W;
      let best = 0;
      for (let i = 1; i < pts.length; i += 1) if (Math.abs(pts[i][0] - px) < Math.abs(pts[best][0] - px)) best = i;
      const p = h[best];
      hov.hidden = false;
      hov.querySelector('line').setAttribute('x1', pts[best][0]); hov.querySelector('line').setAttribute('x2', pts[best][0]);
      hov.querySelector('circle').setAttribute('cx', pts[best][0]); hov.querySelector('circle').setAttribute('cy', pts[best][1]);
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(fmtClock(p.at))}</b><span>${p.offsetMs > 0 ? '+' : ''}${p.offsetMs} ms <i>±${(p.delayMs / 2).toFixed(1)}</i></span><span class="wv-tip-dim">${esc(p.server)}</span>`;
      const left = (pts[best][0] / W) * r.width;
      tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
    };
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointerleave', () => { hov.hidden = true; tip.hidden = true; });
  }

  /* ── display ── */
  function paintDisplay() {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const seg = (key, opts) => `
      <div class="wv-seg" role="group">
        ${opts.map(([v, label]) => `<button type="button" class="wv-segb" data-pref="${key}" data-val="${esc(JSON.stringify(v))}" aria-pressed="${pref(key) === v}">${esc(label)}</button>`).join('')}
      </div>`;
    pane.innerHTML = `
      <section class="wv-sec">
        <h3 class="wv-h">Display</h3>
        <div class="wv-set"><span class="wv-set-k">Clock</span>${seg('clock24', [[false, '12-hour'], [true, '24-hour']])}</div>
        <div class="wv-set"><span class="wv-set-k">Day wheel</span>${seg('dayLang', [['en', 'English'], ['ar', 'العربية']])}</div>
        <div class="wv-set"><span class="wv-set-k">Movement</span>
          <div class="wv-seg" role="group">
            <button type="button" class="wv-segb" data-crownset="turn" aria-pressed="${!crown.locked()}">Turning</button>
            <button type="button" class="wv-segb" data-crownset="lock" aria-pressed="${crown.locked()}">Locked</button>
          </div></div>
      </section>
      <section class="wv-sec">
        <h3 class="wv-h">Idle display</h3>
        <div class="wv-set"><span class="wv-set-k">Dim at night</span>${seg('nightDim', [[true, 'On'], [false, 'Off']])}</div>
        <div class="wv-set${pref('nightDim') ? '' : ' is-off'}"><span class="wv-set-k">From</span>
          <select class="wv-in wv-sel" data-hour="nightFrom" aria-label="Dim from" ${pref('nightDim') ? '' : 'disabled'}>${hours.map((h) => `<option value="${h}" ${pref('nightFrom') === h ? 'selected' : ''}>${esc(hh(h))}</option>`).join('')}</select>
          <span class="wv-set-k">until</span>
          <select class="wv-in wv-sel" data-hour="nightTo" aria-label="Dim until" ${pref('nightDim') ? '' : 'disabled'}>${hours.map((h) => `<option value="${h}" ${pref('nightTo') === h ? 'selected' : ''}>${esc(hh(h))}</option>`).join('')}</select>
        </div>
        <div class="wv-row"><a class="wv-btn" href="#/idle">Open the idle display</a></div>
      </section>`;
  }

  /* ── events ── */
  async function onClick(e) {
    const tb = e.target.closest('.wv-tab');
    if (tb) { setTab(tb.dataset.tab); return; }
    const s = e.target.closest('[data-sw]');
    if (s) { watch.stopwatch[s.dataset.sw](); return; }
    const pre = e.target.closest('[data-preset]');
    if (pre) { await askNotify(); watch.timers.add(Number(pre.dataset.preset) * 60_000); return; }
    const t = e.target.closest('[data-t]');
    if (t) {
      const id = t.closest('.wv-timer')?.dataset.id;
      const a = t.dataset.t;
      if (a === 'plus') watch.timers.extend(id, 60_000);
      else watch.timers[a]?.(id);
      return;
    }
    const zr = e.target.closest('[data-zremove]');
    if (zr) { watch.zones.remove(zr.dataset.zremove); return; }
    const zq = e.target.closest('[data-zquick]');
    if (zq) { watch.zones.add(zq.dataset.zquick); return; }
    if (e.target.closest('[data-resync]')) { await timesync.sync(); await loadHistory(); toast?.('ok', 'Synced', `±${timesync.info().accuracyMs} ms`); return; }
    if (e.target.closest('[data-table]')) { showTable = !showTable; paintAccuracy(); return; }
    const p = e.target.closest('[data-pref]');
    if (p) { setPref(p.dataset.pref, JSON.parse(p.dataset.val)); return; }
    const c = e.target.closest('[data-crownset]');
    if (c) { if ((c.dataset.crownset === 'lock') !== crown.locked()) crown.toggle(); paintDisplay(); }
  }
  async function onSubmit(e) {
    const f = e.target;
    if (f.matches('[data-custom]')) {
      e.preventDefault();
      const d = parseDur(f.elements.dur.value);
      if (!d) { toast?.('warn', 'Timer', 'Type minutes (5) or mm:ss (2:30).'); f.elements.dur.focus(); return; }
      await askNotify();
      watch.timers.add(d, f.elements.label.value);
    } else if (f.matches('[data-zadd]')) {
      e.preventDefault();
      const z = resolveZone(f.elements.zone.value);
      if (!z) { toast?.('warn', 'Time zone', 'No zone by that name. Try a city (Tokyo) or a zone (Asia/Tokyo).'); return; }
      if (!watch.zones.add(z, f.elements.zname?.value)) toast?.('info', 'Time zone', `That is ${watch.zones.max} already — remove one first.`);
    }
  }
  function onChangeEv(e) {
    const zn = e.target.closest('[data-zname]');
    if (zn) {
      watch.zones.rename(zn.dataset.zname, zn.value);
      // The store's own repaint is held off while an input has focus, and
      // this one still does as it commits; repaint once it has let go.
      setTimeout(() => { if (tab === 'zones' && !typing()) { unbindZones(); clearInterval(secT); paint(); } }, 0);
      return;
    }
    const s = e.target.closest('[data-hour]');
    if (s) setPref(s.dataset.hour, Number(s.value));
  }
  function onKey(e) {
    if (e.key === 'Enter' && e.target.matches('[data-zname]')) { e.preventDefault(); e.target.blur(); return; }
    const tb = e.target.closest('.wv-tab');
    if (!tb || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.id === tb.dataset.tab);
    const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(n);
    el.querySelector(`.wv-tab[data-tab="${n}"]`)?.focus();
  }
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChangeEv);
  el.addEventListener('keydown', onKey);
  // The panel scrolls on a phone, and the zone watches ride in it.
  const onScroll = () => stage?.sync();
  pane.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('scroll', onScroll, { passive: true });

  // Repaint what is on show when its data changes — but not a form someone
  // is typing in.
  const typing = () => el.contains(document.activeElement) && document.activeElement.matches('input');
  offs.push(watch.onChange(() => { if (!typing() && tab !== 'accuracy' && tab !== 'display') { const z = tab === 'zones'; if (z) unbindZones(); cancelAnimationFrame(raf); clearInterval(secT); paint(); } }));
  offs.push(onPrefs(() => { if (!typing()) { if (tab === 'zones') unbindZones(); clearInterval(secT); paint(); } }));
  offs.push(timesync.onChange(() => { if (tab === 'accuracy') paintAccuracy(); }));

  setTab(tab);
  loadHistory();
  histT = setInterval(loadHistory, 5 * 60_000);

  return {
    destroy() {
      unbindZones();
      cancelAnimationFrame(raf);
      clearInterval(secT); clearInterval(histT);
      offs.forEach((f) => f());
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
      el.removeEventListener('change', onChangeEv);
      el.removeEventListener('keydown', onKey);
      el.innerHTML = '';
    },
    relayout() { if (tab === 'accuracy' && !showTable) paintAccuracy(); },
  };
}
