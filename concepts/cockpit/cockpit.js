/* ============================================================
   cockpit concept — runtime.

   A local demo: every value below is synthetic, shaped like the
   real modules' /api/summary so the concept can be judged against
   what the console actually reports. The band says SIM DATA and
   the SIM keys switch between a normal, a caution and a warning
   state, so the alerting can be seen without breaking anything.
   ============================================================ */

import { mountAirframe } from './airframe.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
/* times go through here so every colon can be centred (see .col) */
const tt = (s) => esc(s).replace(/:/g, '<span class="col">:</span>');
// A separator stays at the end of its line: it is bound to the word before
// it, and the space after it is left free to break. A number binds only to
// a word, never across a separator, so no token outgrows a narrow callout.
const keep = (s) => String(s).replace(/ · /g, '\u00a0· ').replace(/(\w) (?=\d)/g, '$1\u00a0').replace(/(\d\S*) (?=\w)/g, '$1\u00a0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

/* Home first, as the console orders it. */
const SYSTEMS = [
  { id: 'home',   zone: 'ecs',  code: 'ECS',  name: 'Home',   role: 'environmental control' },
  { id: 'fleet',  zone: 'eng',  code: 'ENG',  name: 'Fleet',  role: 'power plant' },
  { id: 'remote', zone: 'dlnk', code: 'DLNK', name: 'Remote', role: 'datalink' },
  { id: 'agent',  zone: 'msn',  code: 'MSN',  name: 'Agent',  role: 'mission computer' },
];
const byZone = Object.fromEntries(SYSTEMS.map((s) => [s.zone, s]));
const RANK = { warning: 2, caution: 1, ok: 0 };

/* ── synthetic data ─────────────────────────────────────────────────── */
const T0 = Date.now();
let scen = 'nom', scenAt = Date.now();

function sample() {
  const s = (Date.now() - T0) / 1000;
  const wob = (p, a, ph = 0) => Math.sin(s / p + ph) * a;
  const caut = scen !== 'nom', warn = scen === 'warn';

  const home = { in: 25.5 + wob(90, 0.25), set: 26, out: 28.0 + wob(140, 0.4, 1), fan: 'low', presence: 'home' };
  const hosts = [
    { n: 'HP · Zorin', load: 34 + wob(23, 6) },
    { n: 'LOQ · Linux', load: 18 + wob(31, 5, 2) },
    { n: 'disinteg', load: warn ? 0 : 41 + wob(19, 7, 4) },
  ];
  const svc = warn ? 27 : 39;
  const links = [
    { n: 'LOQ · Linux', ms: 72 + wob(7, 9) },
    { n: 'HP · Zorin', ms: 0.6 + Math.abs(wob(5, 0.4)) },
    { n: 'disinteg', ms: warn ? null : 11 + wob(9, 3, 1) },
  ];
  const reach = links.filter((l) => l.ms != null).length;

  const data = {
    home: {
      status: 'ok',
      headline: `Bedroom AC on · cool ${home.set}°`,
      facts: [['Bedroom AC', `cool · ${home.set}° · fan ${home.fan}`],
              ['Temp', `${home.in.toFixed(1)}° in · ${home.out.toFixed(1)}° out`],
              ['Presence', home.presence]],
      inst: home,
    },
    fleet: {
      status: warn ? 'caution' : 'ok',
      headline: warn ? 'disinteg · 12 services not reporting' : '3 hosts · all healthy',
      facts: [['Machines', warn ? '2 of 3 up' : '3 up'], ['Services', `${svc} of 39 running`]],
      inst: { hosts, svc },
    },
    remote: {
      status: warn ? 'warning' : 'ok',
      headline: warn ? 'disinteg unreachable · link lost' : '3 of 3 reachable',
      facts: [['Reachable', `${reach} of 3`],
              ['Latency', `${links.filter((l) => l.ms != null).map((l) => `${l.n[0].toUpperCase()} ${Math.max(1, Math.round(l.ms))}`).join(' · ')} ms`]],
      inst: { links, reach },
    },
    agent: {
      status: caut ? 'caution' : 'ok',
      headline: caut ? 'Odysseus backup 3 days old' : '0 workflows active',
      facts: [['Workflows', '0 active of 1'], ['Odysseus', caut ? 'backup 3 days old' : 'healthy'], ['Stack', 'all 6 up']],
      inst: { wf: 0, wfTot: 1, ody: caut ? 'bkup' : 'ok', stack: 6 },
    },
  };

  const messages = [];
  for (const sys of SYSTEMS) {
    const d = data[sys.id];
    if (d.status !== 'ok') messages.push({ key: `${sys.code}:${d.headline}`, lvl: d.status, code: sys.code, zone: sys.zone, text: d.headline });
  }
  messages.sort((a, b) => RANK[b.lvl] - RANK[a.lvl]);
  return { data, messages };
}

/* ── clock ──────────────────────────────────────────────────────────── */
const fmt = {
  hms: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  hmsZ: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }),
  date: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  dateZ: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  off: new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }),
  abbr: new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }),
};
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const city = (zone.split('/').pop() || zone).replace(/_/g, ' ');
function utcOffset(d) {
  const raw = fmt.off.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = raw.match(/GMT([+-])?(\d+)?(?::(\d+))?/);
  return !m || !m[1] ? 'UTC' : `UTC${m[1] === '-' ? '−' : '+'}${m[2]}${m[3] ? `:${m[3]}` : ''}`;
}
function abbr(d) {
  const v = fmt.abbr.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || '';
  return /^[A-Z]{2,5}$/.test(v) ? v : '';
}

let clkMode = 'loc';
const clk = {
  root: $('.clk'), facts: $('#clk-facts'), sr: $('#clk-sr'),
  hh: $('.clk-hh'), mm: $('.clk-mm'), ss: $('.clk-ss'), strip: $('#tape-strip'), tape: $('.tape'),
};
let pps = 12, tapeW = 0, lastSec = -1, markUntil = 0;

function buildTape() {
  tapeW = clk.tape.clientWidth;
  pps = Math.max(8, tapeW / 22);           // ±11 seconds visible either side of the lubber
  let h = '';
  for (let n = 0; n < 180; n++) {
    const v = ((n - 60) % 60 + 60) % 60, x = (n * pps).toFixed(1);
    const hk = v === 0 ? ' hk' : '';
    h += `<i class="${v % 5 === 0 ? 't5' : ''}${hk}" style="left:${x}px"></i>`;
    if (v % 5 === 0) h += `<b class="${hk.trim()}" style="left:${x}px">${String(v).padStart(2, '0')}</b>`;
  }
  clk.strip.innerHTML = h;
  clk.strip.style.width = `${180 * pps}px`;
}

function paintFacts(now) {
  const d = new Date(now);
  const rows = [];
  const next = new Date(Math.ceil((now + 1) / 60000) * 60000);
  if (clkMode === 'utc') {
    rows.push(['Date', fmt.dateZ.format(d).replace(/,/g, '')], ['Zone', 'UTC · Zulu'], ['Local', `${fmt.hms.format(d)} ${city}`]);
  } else if (clkMode === 'hack') {
    rows.push(['Mark', `${fmt.hms.format(next)} local`], ['Now', fmt.hms.format(d)], ['Zone', `${city} · ${utcOffset(d)}`]);
  } else {
    rows.push(['Date', fmt.date.format(d).replace(/,/g, '')], ['Zone', `${city} · ${utcOffset(d)}${abbr(d) ? ` · ${abbr(d)}` : ''}`], ['UTC', `${fmt.hmsZ.format(d)}Z`]);
  }
  rows.push(['Source', 'device clock · sim']);
  clk.facts.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${tt(v)}</dd></div>`).join('');
  clk.sr.textContent = `${fmt.hms.format(d)} ${city}`;
}

function paintClock(now) {
  const d = new Date(now);
  const sec = Math.floor(now / 1000);
  if (sec !== lastSec) {
    lastSec = sec;
    const s = d.getSeconds();
    let hh, mm, ss, ghost = false;
    clk.root.classList.toggle('is-hack', clkMode === 'hack');
    if (clkMode === 'utc') {
      [hh, mm, ss] = fmt.hmsZ.format(d).split(':');
    } else if (clkMode === 'hack') {
      // The fixed mask holds: HH and MM stay in place, ghosted, while the
      // seconds count down to the mark.
      const left = s === 0 ? 60 : 60 - s;
      if (s === 0) markUntil = now + 1000;
      if (now < markUntil) { [hh, mm, ss] = fmt.hms.format(d).split(':'); }
      else { hh = '00'; mm = '00'; ss = String(left).padStart(2, '0'); ghost = true; }
      clk.root.classList.toggle('is-final', now >= markUntil && left <= 5);
      clk.root.classList.toggle('is-mark', now < markUntil);
    } else {
      [hh, mm, ss] = fmt.hms.format(d).split(':');
    }
    if (clkMode !== 'hack') clk.root.classList.remove('is-final', 'is-mark');
    clk.hh.textContent = hh; clk.mm.textContent = mm; clk.ss.textContent = ss;
    clk.hh.style.color = ghost ? 'var(--ghost)' : ''; clk.mm.style.color = ghost ? 'var(--ghost)' : '';
    paintFacts(now);
    $('#band-utc').innerHTML = tt(fmt.hmsZ.format(d));
  }
  // the tape runs continuously under the lubber
  const v = (now / 1000) % 60;
  const at = REDUCED.matches ? Math.floor(v) : v;
  clk.strip.style.transform = `translate3d(${(tapeW / 2 - (at + 60) * pps).toFixed(2)}px,0,0)`;
}

$$('[data-clk]').forEach((b) => b.addEventListener('click', () => {
  clkMode = b.dataset.clk;
  $$('[data-clk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  lastSec = -1; markUntil = 0;
}));

/* ── own-ship ───────────────────────────────────────────────────────── */
let selZone = null;
const af = mountAirframe($('#af-host'), { systems: SYSTEMS, onSelect: (z) => select(z), detailEl: $('#af-detail') });

function select(zone) {
  selZone = zone || null;
  af.select(selZone);
  $$('[data-zone]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.zone || null) === selZone)));
  paintDetail();
}
$$('[data-zone]').forEach((b) => b.addEventListener('click', () => select(b.dataset.zone || null)));

function paintDetail() {
  const el = $('#af-detail');
  if (!selZone) { el.hidden = true; return; }
  const sys = byZone[selZone], d = last.data[sys.id];
  el.hidden = false;
  el.dataset.st = d.status;
  el.innerHTML = `
    <h3><i class="lamp"></i>${esc(sys.code)} · ${esc(sys.name)}</h3>
    <p>${esc(sys.role)} — ${esc(d.headline)}</p>
    <dl class="facts">${d.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

/* ── cautions ───────────────────────────────────────────────────────── */
let cautPage = 'sys';
$$('[data-caut]').forEach((b) => b.addEventListener('click', () => {
  cautPage = b.dataset.caut;
  $$('[data-caut]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  paintCaut(true);
}));

const LOG = (() => {
  const now = Date.now(), m = 60000;
  return [
    [now - 4 * m, 'ECS', 'Bedroom AC set to cool 26°'],
    [now - 18 * m, 'DLNK', 'LOQ · Linux session opened'],
    [now - 41 * m, 'ENG', 'all 39 services reporting'],
    [now - 73 * m, 'MSN', 'workflow nightly-digest finished'],
    [now - 126 * m, 'ECS', 'presence changed to home'],
  ];
})();
const since = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
};

let cautHTML = '';
function paintCaut(force) {
  const { data, messages } = last;
  let h = '';
  if (cautPage === 'sys') {
    // Fixed mask: every system owns a slot of the same height with the same
    // three detail rows, drawn whether or not anything is wrong; a missing row
    // is a ghost rule. Severity reorders the slots and lights them — it never
    // resizes them, so nothing on the panel jumps when a caution arrives.
    const order = [...SYSTEMS].sort((a, b) => RANK[data[b.id].status] - RANK[data[a.id].status]);
    h = '<div class="slots">' + order.map((sys) => {
      const d = data[sys.id];
      const rows = d.facts.slice(0, 3).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`);
      while (rows.length < 3) rows.push('<div class="gh"><dt></dt><dd></dd></div>');
      return `
        <div class="slot st-${d.status}" data-row="${sys.zone}" role="button" tabindex="0"
             aria-label="${esc(`${sys.code} ${sys.name}: ${d.headline}`)}">
          <i class="lamp"></i>
          <span class="slot-id"><b>${esc(sys.code)}</b><span>${esc(sys.name)}</span></span>
          <span class="slot-h">${esc(keep(d.headline))}</span>
          <dl class="facts slot-f">${rows.join('')}</dl>
        </div>`;
    }).join('') + '</div>';
  } else if (cautPage === 'caut') {
    h = messages.length
      ? messages.map((m) => `
          <div class="msg ${m.lvl}"><span class="msg-l">${m.lvl}</span><span class="msg-c">${esc(m.code)}</span>
            <span class="msg-t">${esc(m.text)}</span><span class="msg-a">${since(scenAt)}</span></div>`).join('')
      : `<p class="none">no active cautions · <b>all normal</b></p>`;
  } else {
    h = LOG.map(([t, c, x]) => `<div class="log"><time>${since(t)} ago</time><span>${esc(c)}</span><span>${esc(x)}</span></div>`).join('')
      + '<p class="foot-note">sim log · synthetic entries</p>';
  }
  if (!force && h === cautHTML) return;
  cautHTML = h;
  $('#caut-body').innerHTML = h;
  $$('[data-row]').forEach((r) => {
    const go = () => select(r.dataset.row);
    r.addEventListener('click', go);
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

/* ── instruments ────────────────────────────────────────────────────── */
function scale(min, max, step, major, labelEvery) {
  let h = '<span class="sc-line"></span>';
  for (let v = min; v <= max + 1e-9; v += step) {
    const x = ((v - min) / (max - min)) * 100;
    const maj = Math.abs(v % major) < 1e-9;
    h += `<i class="${maj ? 'maj' : ''}" style="left:${x}%"></i>`;
    if (Math.abs(v % labelEvery) < 1e-9) h += `<em style="left:${x}%">${v}</em>`;
  }
  return h;
}
const pct = (v, a, b) => `${Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100)).toFixed(2)}%`;

let instBuilt = false;
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const logX = (ms) => `${(Math.log10(Math.max(1, Math.min(1000, ms))) / 3 * 100).toFixed(2)}%`;
const ANN = [['wf-run', 'wf run'], ['wf-idle', 'wf idle'], ['wf-fail', 'wf fail'], ['ody-ok', 'ody ok'], ['ody-bkup', 'ody bkup'], ['stack', 'stack']];

function buildInst() {
  $('#inst-home').innerHTML = `
    <div class="win-row"><span class="win"><em>in</em><b id="h-in">--</b></span><span class="win win--mg"><em>set</em><b id="h-set">--</b></span><span class="win"><em>out</em><b id="h-out">--</b></span></div>
    <div class="scale" id="h-scale">${scale(18, 34, 1, 2, 4)}<span class="ptr out" id="h-p-out"></span><span class="ptr set" id="h-p-set"></span><span class="ptr in" id="h-p-in"></span></div>
    <p class="memo" id="h-memo"></p>`;
  // ENG: one vertical gauge per host, like engine N1 tapes, and the services
  // as a fixed matrix of cells — 39 of them, lit or ghosted.
  $('#inst-fleet').innerHTML = `
    <div class="eng">
      <div class="vgs" id="f-vgs">${[0, 1, 2].map((i) => `
        <div class="vg" id="f-vg-${i}">
          <b class="vg-v">--</b>
          <div class="vg-t">${[0, 25, 50, 75, 100].map((v) => `<i style="bottom:${v}%"></i>`).join('')}<u style="bottom:85%"></u><s class="vg-f"></s></div>
          <span class="vg-n">--</span>
        </div>`).join('')}
      </div>
      <div class="svc"><div class="cells" id="f-cells">${'<i></i>'.repeat(39)}</div><span class="svc-k">svc <b id="f-svc">--</b></span></div>
    </div>`;
  // DLNK: every link on one logarithmic latency tape, the way a single tape
  // carries several bugs, with a lamp legend beneath.
  $('#inst-remote').innerHTML = `
    <div class="ltape">
      <div class="scale scale--log">${'<span class="sc-line"></span>'}${LOG_TICKS.map((v) => `<i class="${[1, 10, 100, 1000].includes(v) ? 'maj' : ''}" style="left:${logX(v)}"></i>`).join('')}${[1, 10, 100, 1000].map((v) => `<em style="left:${logX(v)}">${v === 1000 ? '1k' : v}</em>`).join('')}
        <span class="bug" id="r-bug-0"><b>L</b></span><span class="bug" id="r-bug-1"><b>H</b></span><span class="bug" id="r-bug-2"><b>D</b></span>
      </div>
      <span class="ltape-k">ms</span>
    </div>
    <div class="legend" id="r-legend"></div>`;
  // MSN: an annunciator panel — legends drawn unlit, lit only by state —
  // and the stack as six cells.
  $('#inst-agent').innerHTML = `
    <div class="ann" id="a-ann">${ANN.map(([id, t]) => `<span class="ann-c" data-ann="${id}">${t}</span>`).join('')}</div>
    <div class="svc svc--row"><div class="cells cells--6" id="a-cells">${'<i></i>'.repeat(6)}</div><span class="svc-k">stack <b id="a-stack">--</b></span></div>`;
  instBuilt = true;
}

function paintInst() {
  if (!instBuilt) buildInst();
  const { data } = last;
  for (const sys of SYSTEMS) {
    const p = $(`.inst[data-sys="${sys.id}"]`);
    p.dataset.st = data[sys.id].status;
    p.querySelector('.sk-title').dataset.st = data[sys.id].status;
  }
  const h = data.home.inst;
  $('#h-in').textContent = `${h.in.toFixed(1)}°`; $('#h-set').textContent = `${h.set}°`; $('#h-out').textContent = `${h.out.toFixed(1)}°`;
  $('#h-p-in').style.left = pct(h.in, 18, 34); $('#h-p-set').style.left = pct(h.set, 18, 34); $('#h-p-out').style.left = pct(h.out, 18, 34);
  $('#h-memo').textContent = `cool · fan ${h.fan} · presence ${h.presence}`;

  const f = data.fleet.inst;
  f.hosts.forEach((x, i) => {
    const g = $(`#f-vg-${i}`), down = x.load <= 0;
    const lvl = down ? 'wrn' : x.load >= 85 ? 'wrn' : x.load >= 70 ? 'cau' : '';
    g.querySelector('.vg-v').textContent = down ? 'off' : `${Math.round(x.load)}`;
    g.querySelector('.vg-v').className = `vg-v ${down ? 'wrn' : lvl}`;
    g.querySelector('.vg-f').className = `vg-f ${lvl}`;
    g.querySelector('.vg-f').style.transform = `scaleY(${down ? 0 : (x.load / 100).toFixed(3)})`;
    // the limit mark is drawn dim, and lights only once it is crossed
    g.querySelector('u').className = x.load >= 85 ? 'crossed' : '';
    g.querySelector('.vg-n').textContent = x.n.split(' ')[0].slice(0, 4).toLowerCase() === 'disi' ? 'dsn' : x.n.split(' ')[0].slice(0, 3).toLowerCase();
    g.dataset.down = String(down);
  });
  $$('#f-cells i').forEach((c, i) => { c.className = i < f.svc ? 'on' : 'cau'; });
  $('#f-svc').textContent = `${f.svc}/39`; $('#f-svc').className = f.svc < 39 ? 'cau' : '';

  const r = data.remote.inst;
  const tags = ['L', 'H', 'D'];
  r.links.forEach((l, i) => {
    const b = $(`#r-bug-${i}`), lost = l.ms == null;
    b.style.left = lost ? '100%' : logX(l.ms);
    b.className = `bug${lost ? ' lost' : ''}`;
  });
  $('#r-legend').innerHTML = r.links.map((l, i) => {
    const lost = l.ms == null;
    return `<span class="lg${lost ? ' lost' : ''}"><i class="lamp" data-st="${lost ? 'warning' : 'ok'}"></i><b>${tags[i]}</b>${esc(l.n.split(' ')[0])}<em>${lost ? 'no link' : `${l.ms < 1 ? '<1' : Math.round(l.ms)} ms`}</em></span>`;
  }).join('');

  const a = data.agent.inst;
  const lit = {
    'wf-run': a.wf > 0 ? 'ok' : '', 'wf-idle': a.wf === 0 ? 'memo' : '', 'wf-fail': '',
    'ody-ok': a.ody === 'ok' ? 'ok' : '', 'ody-bkup': a.ody === 'ok' ? '' : 'caution', stack: a.stack === 6 ? 'ok' : 'caution',
  };
  $$('#a-ann [data-ann]').forEach((c) => { c.dataset.lit = lit[c.dataset.ann] || ''; });
  $$('#a-cells i').forEach((c, i) => { c.className = i < a.stack ? 'on' : ''; });
  $('#a-stack').textContent = `${a.stack}/6`;
}

/* ── master caution / warning ──────────────────────────────────────── */
const acked = new Set();
let lastKeys = new Set();
function paintBand() {
  const { messages } = last;
  const keys = new Set(messages.map((m) => m.key));
  for (const k of [...acked]) if (!keys.has(k)) acked.delete(k);   // cleared cautions forget their ack
  const fresh = [...keys].filter((k) => !lastKeys.has(k));
  lastKeys = keys;
  for (const [id, lvl] of [['#mc-caut', 'caution'], ['#mc-warn', 'warning']]) {
    const ms = messages.filter((m) => m.lvl === lvl);
    const unacked = ms.filter((m) => !acked.has(m.key));
    const b = $(id);
    b.classList.toggle('is-lit', unacked.length > 0);
    if (fresh.some((k) => ms.some((m) => m.key === k))) b.classList.add('is-new');
    if (!unacked.length) b.classList.remove('is-new');
    b.setAttribute('aria-pressed', String(unacked.length > 0));
    b.title = unacked.length ? 'Press to acknowledge' : 'No unacknowledged ' + (lvl === 'caution' ? 'cautions' : 'warnings');
  }
  const w = messages.filter((m) => m.lvl === 'warning').length, c = messages.filter((m) => m.lvl === 'caution').length;
  const st = $('#band-status');
  st.dataset.st = w ? 'warning' : c ? 'caution' : 'ok';
  const long = !w && !c ? 'all systems normal'
    : [w && `${w} warning${w > 1 ? 's' : ''}`, c && `${c} caution${c > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
  const short = !w && !c ? 'all normal' : [w && `${w} warn`, c && `${c} caut`].filter(Boolean).join('<br>');
  st.innerHTML = `<span class="long">${long}</span><span class="short">${short}</span>`;
}
for (const [id, lvl] of [['#mc-caut', 'caution'], ['#mc-warn', 'warning']]) {
  $(id).addEventListener('click', () => {
    last.messages.filter((m) => m.lvl === lvl).forEach((m) => acked.add(m.key));
    paintBand();
  });
}

$$('[data-sim]').forEach((b) => b.addEventListener('click', () => {
  scen = b.dataset.sim; scenAt = Date.now();
  $$('[data-sim]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  refresh();
}));

/* ── refresh ────────────────────────────────────────────────────────── */
let last = sample();
function refresh() {
  last = sample();
  for (const sys of SYSTEMS) {
    const d = last.data[sys.id];
    af.setStatus(sys.zone, d.status, keep(d.headline));
  }
  paintBand(); paintCaut(); paintInst();
  if (selZone) paintDetail();
}

/* ── phone soft-bar ─────────────────────────────────────────────────── */
const portals = ['#p-clk', '#p-sys', '#p-caut', '#p-inst'].map((s) => $(s));
const io = new IntersectionObserver((ents) => {
  const vis = new Map();
  ents.forEach((e) => vis.set(e.target.id, e.intersectionRatio));
  let best = null, br = 0;
  for (const p of portals) { const r = vis.get(p.id) ?? (p._r || 0); p._r = r; if (r > br) { br = r; best = p.id; } }
  $$('#softbar a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${best}`)));
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });
portals.forEach((p) => io.observe(p));
$$('#softbar a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  $(a.getAttribute('href')).scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
}));

/* ── idle ───────────────────────────────────────────────────────────── */
let stillTimer = 0;
const active = () => {
  document.body.classList.add('is-active');
  clearTimeout(stillTimer);
  stillTimer = setTimeout(() => document.body.classList.remove('is-active'), 2600);
};
function setIdle(on) {
  document.body.classList.toggle('is-idle', on);
  $('#idle-tools').hidden = !on;
  if (on) { select(null); active(); requestAnimationFrame(buildTape); }
  else { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); requestAnimationFrame(buildTape); }
}
$('#btn-idle').addEventListener('click', () => setIdle(true));
$('#btn-idle-m').addEventListener('click', () => setIdle(true));
$('#idle-x').addEventListener('click', () => setIdle(false));
$('#idle-fs').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
addEventListener('pointermove', () => { if (document.body.classList.contains('is-idle')) active(); });
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const idle = document.body.classList.contains('is-idle');
  if (e.key === 'i' || e.key === 'I') setIdle(!idle);
  else if (e.key === 'Escape' && idle && !document.fullscreenElement) setIdle(false);
  else if ((e.key === 'f' || e.key === 'F') && idle) $('#idle-fs').click();
});

/* ── go ─────────────────────────────────────────────────────────────── */
buildTape();
new ResizeObserver(buildTape).observe(clk.tape);
refresh();
setInterval(refresh, 1200);
(function loop() {
  paintClock(Date.now());
  requestAnimationFrame(loop);
})();
if (new URLSearchParams(location.search).has('idle')) setIdle(true);
