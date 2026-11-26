/* ojee.console prototype — The Lit Panel. Vanilla, no build. All data is sample data. */
(function () {
  const D = window.DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MOD = { home: 'Home', net: 'Network', fleet: 'Machines', remote: 'Remote', agent: 'Agent', music: 'Music', desk: 'Desk' };
  const MODICON = { home: 'i-home', net: 'i-signal', fleet: 'i-machines', remote: 'i-desktop', agent: 'i-agent', music: 'i-music', desk: 'i-keyboard' };

  const prefs = { h12: true, arabic: false, held: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('oc-prefs') || '{}')); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem('oc-prefs', JSON.stringify(prefs)); } catch (e) {} };
  const ui = { machines: 'hosts', agent: 'claude', svcHost: 'All', svcQ: '', range: '24h', smsUnlocked: false, confirm: null, procQ: '' };
  window.CLOCK_OFFSET = 0;

  /* ------------------------------------------------------------ nav */
  const ROUTES = [
    { id: 'now', label: 'Now', icon: 'i-now' },
    { id: 'home', label: 'Home', icon: 'i-home' },
    { id: 'machines', label: 'Machines', icon: 'i-machines' },
    { id: 'agent', label: 'Agent', icon: 'i-agent' },
    { id: 'me', label: 'Me', icon: 'i-me' },
  ];
  const needs = () => ({
    machines: D.alerts.length + D.services.filter(s => s.state === 'warn' || s.state === 'err').length - D.alerts.filter(a => a.service).length,
    agent: D.agent.sessions.filter(s => s.state === 'waiting').length + D.agent.workflows.filter(w => w.last === 'fail' && w.on).length,
  });
  const route = () => { const h = location.hash.slice(1); return ROUTES.some(r => r.id === h) ? h : 'now'; };

  function renderNav() {
    const n = needs(), cur = route();
    const badge = id => n[id] ? `<span class="badge">${n[id]}</span>` : '';
    $('#railnav').innerHTML = ROUTES.map(r => `<a href="#${r.id}" ${r.id === cur ? 'aria-current="page"' : ''}>${ic(r.icon)}<span>${r.label}</span>${badge(r.id)}</a>`).join('');
    const i = ROUTES.findIndex(r => r.id === cur);
    $('#tabbar').innerHTML = `<span class="tab-ind" style="width:calc((100% - 8px)/5);transform:translateX(${i * 100}%)"></span>` +
      ROUTES.map(r => `<a href="#${r.id}" ${r.id === cur ? 'aria-current="page"' : ''}>${ic(r.icon)}<span>${r.label}</span>${badge(r.id)}</a>`).join('');
  }

  /* ------------------------------------------------------------ time */
  const now = () => new Date(Date.now() + window.CLOCK_OFFSET);
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const dg = s => prefs.arabic ? String(s).replace(/\d/g, d => AR[d]) : String(s);
  const p2 = n => String(n).padStart(2, '0');
  function timeParts(d = now()) {
    let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM';
    if (prefs.h12) h = h % 12 || 12;
    return { hm: dg(`${prefs.h12 ? h : p2(h)}:${p2(d.getMinutes())}`), s: dg(p2(d.getSeconds())), ap: prefs.h12 ? ap : '', sec: d.getSeconds() };
  }
  const dateLine = (d = now()) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const ticksHtml = sec => Array.from({ length: 60 }, (_, i) => `<i class="${i < sec ? 'on' : i === sec ? 'now' : ''}"></i>`).join('');
  function clockHtml(big) {
    const t = timeParts();
    return `<span class="num" data-hm>${t.hm}</span><span class="num">:</span><span class="num sec" data-s>${t.s}</span>${t.ap ? `<span class="ampm" data-ap>${t.ap}</span>` : ''}`;
  }
  function tickClock() {
    if (prefs.held) return;
    const t = timeParts();
    $$('[data-hm]').forEach(e => e.textContent = t.hm);
    $$('[data-s]').forEach(e => e.textContent = t.s);
    $$('[data-ap]').forEach(e => e.textContent = t.ap);
    $$('.ticks[data-live]').forEach(e => { const k = e.children; for (let i = 0; i < 60; i++) k[i].className = i < t.sec ? 'on' : i === t.sec ? 'now' : ''; });
  }

  /* ------------------------------------------------------------ bits */
  const stateWord = s => ({ ok: 'Running', warn: 'Needs you', err: 'Down', off: 'Stopped', running: 'Running', waiting: 'Waiting for you', done: 'Done' }[s] || s);
  const dotCls = s => ({ ok: '', running: '', warn: 'warn', waiting: 'warn', err: 'err', off: 'off', done: 'off' }[s] ?? '');
  const st = s => `<span class="state"><span class="dot ${dotCls(s)}"></span>${stateWord(s)}</span>`;
  const toggle = (act, on, label, extra = '') => `<button class="toggle" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="${act}" ${extra}></button>`;
  const meter = (pct, cls = '') => `<div class="meter ${cls}"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div>`;
  const lvl = (v, warn, err) => v >= err ? 'err' : v >= warn ? 'warn' : '';
  function spark(vals, color = 'var(--cream-2)', h = 34) {
    const w = 200, mx = Math.max(...vals) * 1.15, mn = 0;
    const pts = vals.map((v, i) => [i / (vals.length - 1) * w, h - (v - mn) / (mx - mn) * (h - 4) - 2]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d} L ${w} ${h} L 0 ${h} Z" fill="${color}" opacity=".16"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/></svg>`;
  }
  /* the grille: perforated holes lit as a dot-matrix bar chart. Each column is one sample;
     scrub it to read a value. `tone(v)` picks a function colour for a column. */
  const wave = (n, base, amp, seed, f = 0.45) => Array.from({ length: n }, (_, i) => +(base + Math.sin(i * f + seed) * amp + Math.sin(i * 1.7 + seed * 3) * amp * 0.35).toFixed(1));
  const SERIES = {
    temp: [26.1, 25.8, 25.6, 25.4, 25.2, 25.1, 25.3, 25.9, 26.8, 27.6, 28.4, 29.1, 29.6, 29.9, 30.1, 29.8, 29.2, 28.4, 26.9, 25.9, 25.6, 25.5, 25.5, 25.5],
    cpu: [38, 41, 40, 44, 52, 61, 48, 45, 50, 47, 55, 49, 46, 47, 52, 48, 47, 66, 71, 58, 50, 47, 49, 47],
    ping: wave(24, 10, 3, 1.2).map(v => Math.max(4, v)),
    agent: [0, 0, 0, 1, 0, 0, 0, 0, 2, 3, 3, 2, 4, 5, 3, 2, 3, 4, 6, 5, 4, 3, 2, 2],
    battery: [100, 97, 93, 90, 86, 83, 80, 77, 75, 72, 70, 68, 66, 64],
  };
  function grille(vals, { rows = 5, min = Math.min(...vals), max = Math.max(...vals), tone = () => '', left = '', right = '', unit = '', label = '', fmt = v => v } = {}) {
    const src = vals; if (vals.length < 24) { const k = Math.ceil(24 / vals.length); vals = vals.flatMap(v => Array(k).fill(v)); }
    const cols = vals.length, P = 10, R = 3.2;
    let g = '';
    vals.forEach((v, c) => {
      const lvl = Math.max(1, Math.min(rows, Math.round((v - min) / ((max - min) || 1) * (rows - 1)) + 1));
      const t = tone(v);
      let holes = '';
      for (let r = 0; r < rows; r++) holes += `<circle class="${r < lvl ? (r === lvl - 1 ? 'on top ' : 'on body ') + t : 'h'}" cx="${c * P + P / 2}" cy="${(rows - 1 - r) * P + P / 2}" r="${R}"/>`;
      g += `<g data-i="${c}">${holes}</g>`;
    });
    const lastV = vals[vals.length - 1];
    return `<div class="grille scrub" data-vals="${vals.join(',')}" data-unit="${esc(unit)}" role="img" aria-label="${esc(label)}, now ${fmt(lastV)}${unit}">
      <svg viewBox="0 0 ${cols * P} ${rows * P}" aria-hidden="true">${g}</svg>
      <div class="grille-foot"><span>${left}</span><b data-read>${fmt(lastV)}${unit} now</b><span>${right}</span></div></div>`;
  }
  function lineChart(vals, { min = -110, max = -80, color = 'var(--cream-2)', label = 'dBm', span = '24h' } = {}) {
    const w = 640, h = 200, pl = 44, pr = 10, pt = 12, pb = 26;
    const x = i => pl + i / (vals.length - 1) * (w - pl - pr), y = v => pt + (max - v) / (max - min) * (h - pt - pb);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const grid = [-80, -90, -100, -110].map(v => `<line x1="${pl}" x2="${w - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--seam)"/><text x="${pl - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
    const good = `<rect x="${pl}" y="${y(-80)}" width="${w - pl - pr}" height="${y(-95) - y(-80)}" fill="${color}" opacity=".05"/>`;
    const lbls = `<text x="${pl}" y="${h - 6}">${span} ago</text><text x="${w - pr}" y="${h - 6}" text-anchor="end">now</text>`;
    const lo = Math.min(...vals), li = vals.indexOf(lo);
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Signal over the last ${span}, lowest ${lo} ${label}">${good}${grid}${lbls}
      <path d="${d} L ${x(vals.length - 1)} ${h - pb} L ${pl} ${h - pb} Z" fill="${color}" opacity=".12"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(li)}" cy="${y(lo)}" r="4" fill="var(--hold)"/><text x="${x(li)}" y="${y(lo) + 18}" text-anchor="middle" style="fill:var(--hold)">${lo}</text>
      <circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="4.5" fill="${color}"/></svg>`;
  }
  const head = (title, actions = '', date = '') => `<header class="phead"><div class="phead-text">${date ? `<p class="eyebrow-date">${date}</p>` : ''}<h1 class="ptitle">${title}</h1></div>
    <div class="phead-actions">${actions}<button class="search-pill" data-act="palette" aria-label="Jump">${ic('i-search', 's')}<span>Jump to…</span><kbd>/</kbd></button>
    <button class="iconbtn" data-act="notifs" aria-label="Notifications">${ic('i-bell')}${D.notifications.length ? `<span class="badge">${D.notifications.length}</span>` : ''}</button></div></header>`;

  /* ------------------------------------------------------------ NOW */
  function attnCard(a) {
    return `<div class="attn ${a.sev === 'err' ? 'err' : ''}">
      <span class="attn-icon">${ic('i-warn')}</span>
      <p class="attn-title">${esc(a.title)}</p><p class="attn-meta">${esc(a.meta)}</p>
      <div class="attn-actions"><button class="btn sm tonal" data-act="restart-svc" data-name="${a.service}">${ic('i-restart', 's')}Restart</button>
      <button class="btn sm tonal" data-act="mute-alert" data-id="${a.id}">${ic('i-bellx', 's')}Mute 1 h</button>
      <button class="btn sm go" data-act="host" data-id="${a.host}">open</button></div></div>`;
  }
  function spokenLine() {
    const n = D.alerts.length + D.agent.sessions.filter(s => s.state === 'waiting').length;
    const words = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things'];
    if (!n) return `<p class="spoken"><span class="lamp"></span>All running. Nothing needs you.</p>`;
    return `<p class="spoken"><span class="lamp stop"></span>${words[n] || n + ' things'} need${n === 1 ? 's' : ''} you.</p>`;
  }
  function unit({ cls = '', href, sub, label, icon, state, obj, led, num, meta, grilleHtml = '', quick = '' }) {
    return `<div class="tile ${cls}">
      <a class="tile-link" href="${href}" ${sub ? `data-sub="${sub}"` : ''} aria-label="${esc(label)}"></a>
      <div class="tile-label">${ic(icon, 's')}${label}<span class="state">${state}</span></div>
      <div class="unit-body"><div class="tile-body"><span class="tile-num num">${num}</span><span class="tile-meta">${meta}</span></div>
        <div class="tile-obj" data-obj="${obj}" ${led ? `data-led="${led}"` : ''}></div></div>
      ${grilleHtml}${quick ? `<div class="tile-quick">${quick}</div>` : ''}</div>`;
  }
  function pageNow() {
    const ac = D.home.ac, r = D.router, hosts = D.hosts, up = hosts.filter(h => h.status !== 'off').length;
    const svcOk = D.services.filter(s => s.state === 'ok').length;
    const waiting = D.agent.sessions.filter(s => s.state === 'waiting').length, running = D.agent.sessions.filter(s => s.state === 'running').length;
    const mouse = D.desk[0], hp = D.desk[2];
    const fleetWarn = D.alerts.some(a => a.module === 'fleet');
    const lamp = (cls, word) => `<span class="lamp ${cls}"></span>${word}`;
    const hours = ['00:00', '', 'now'];
    const extra = waiting ? `<div class="group" style="padding:4px"><button class="row" data-act="session" data-id="s2"><span class="row-icon warn">${ic('i-terminal', 's')}</span><span class="row-text"><span class="row-title">rep. scale test is waiting for you</span><span class="row-sub">Claude · personal · asks about the 07:10 weigh-in fixture</span></span><span class="row-end"><span class="hide-sm">answer</span>${ic('i-chev', 's chev')}</span></button></div>` : '';
    return `<div class="page">
      ${head('Now', '', dateLine() + ' · Cairo')}
      <div class="now-top">
        <div class="brief">${spokenLine()}<div class="attn-list">${D.alerts.map(attnCard).join('')}${extra}</div>
          <p class="sub">7 of 7 modules ready · local control, no cloud</p></div>
        <div class="tile clock-tile" data-act="idle" role="button" tabindex="0" aria-label="Open the clock">
          <div class="clock-obj" data-obj="clock"></div>
          <div class="clock-main">
            <div class="tile-label">${ic('i-clock', 's')}clock<span class="state">${lamp('', 'ntp ±' + D.ntp.offsetMs + ' ms')}</span></div>
            <div class="clock-time">${clockHtml()}</div>
            <div class="ticks" data-live>${ticksHtml(now().getSeconds())}</div>
            <div class="clock-facts"><span>rate <b>${D.ntp.rateMs} ms/day</b></span><span>synced <b>${D.ntp.lastSync}</b></span><span>this device <b>on time</b></span></div>
          </div>
        </div>
      </div>
      <div class="now-grid">
        <div class="bento">
          ${unit({ href: '#home', label: 'home', icon: 'i-home', state: ac.on ? lamp('', 'cooling') : lamp('off', 'ac off'), obj: 'dial',
            num: ac.on ? ac.set + '<span class="u">°c set</span>' : 'off', meta: `inside ${ac.inside}° · outside ${ac.outside}°`,
            grilleHtml: grille(SERIES.temp, { min: 24, max: 31, label: 'Inside temperature today', left: '00:00', right: 'now', unit: '°', tone: v => v >= 29 ? 'stop' : '' }),
            quick: `<button class="round sm ${ac.on ? 'on' : ''}" data-act="ac-power" aria-label="Turn the AC ${ac.on ? 'off' : 'on'}" aria-pressed="${ac.on}">${ic('i-power', 's')}</button>` })}
          ${unit({ href: '#machines', sub: 'network', label: 'network', icon: 'i-signal', state: r.data ? lamp('', r.net.toLowerCase()) : lamp('off', 'data off'), obj: 'radio',
            num: r.rsrp + '<span class="u">dbm</span>', meta: `${r.quality} · ↓ ${r.down} ↑ ${r.up} Mb/s`,
            grilleHtml: grille(r.history['24h'], { min: -108, max: -86, label: 'Signal, last 24 hours', left: '24 h ago', right: 'now', unit: ' dBm', tone: v => v <= -100 ? 'stop' : '' }) })}
          ${unit({ href: '#machines', sub: 'hosts', cls: fleetWarn ? 'attn-ring' : '', label: 'machines', icon: 'i-machines', state: fleetWarn ? lamp('stop', '1 needs you') : lamp('', 'all well'), obj: 'stack', led: fleetWarn ? 'stop' : 'run',
            num: up + `<span class="u">of ${hosts.length} up</span>`, meta: `${svcOk} of ${D.services.length} services running`,
            grilleHtml: grille(SERIES.cpu, { min: 0, max: 100, label: 'disinteg CPU, last 24 hours', left: 'disinteg cpu', right: 'now', unit: '%', tone: v => v >= 65 ? 'hold' : '' }) })}
          ${unit({ href: '#machines', sub: 'hosts', label: 'remote', icon: 'i-desktop', state: lamp('', 'tailnet'), obj: 'tv',
            num: hosts.filter(h => h.remote).length + `<span class="u">of ${hosts.length} reachable</span>`, meta: 'loq 8 ms · hp 21 ms',
            grilleHtml: grille(SERIES.ping, { min: 0, max: 20, label: 'Latency to LOQ, last 24 hours', left: 'loq latency', right: 'now', unit: ' ms', fmt: v => Math.round(v) }),
            quick: `<button class="round sm" data-act="remote" data-id="loq" data-mode="desktop" aria-label="Open LOQ's desktop">${ic('i-desktop', 's')}</button>` })}
          ${unit({ href: '#agent', label: 'agent', icon: 'i-agent', state: waiting ? lamp('hold', waiting + ' waiting') : lamp('', 'idle'), obj: 'calc',
            num: running + '<span class="u">running</span>', meta: `${D.agent.workflows.filter(w => w.on).length} workflows on · week ${D.agent.usage[0].week}%`,
            grilleHtml: grille(SERIES.agent, { min: 0, max: 6, label: 'Claude turns per hour today', left: 'turns / hour', right: 'now', unit: '' }) })}
          ${unit({ href: '#home', label: 'desk', icon: 'i-keyboard', state: lamp('', '3 connected'), obj: 'desk',
            num: mouse.battery + '<span class="u">% mouse</span>', meta: `headphones ${hp.battery}% · keyboard wired`,
            grilleHtml: grille(SERIES.battery, { min: 0, max: 100, label: 'Mouse battery, last 14 days', left: '14 days', right: 'today', unit: '%', tone: v => v < 20 ? 'stop' : '' }) })}
        </div>
        <div class="group activity">
          <div class="group-head" style="padding:6px 12px 2px"><h2>today</h2><span class="meta">since midnight</span></div>
          ${D.activity.map(a => `<button class="row" data-act="activity" data-title="${esc(a.title)}"><span class="row-icon ${a.cls === 'warn' || a.cls === 'err' ? a.cls : ''}">${ic(a.icon, 's')}</span><span class="row-text"><span class="row-title">${esc(a.title)}</span><span class="row-sub">${esc(a.sub)}</span></span><span class="row-end">${a.when}</span></button>`).join('')}
          <div class="group-head" style="padding:12px 12px 2px"><h2>now playing</h2></div>
          <button class="row" data-act="player"><span class="row-icon">${ic('i-music', 's')}</span><span class="row-text"><span class="row-title">${D.music.title}</span><span class="row-sub">${D.music.artist} · on ${D.music.device}</span></span>${ic('i-chev', 's chev')}</button>
          <div style="height:150px;position:relative;margin:4px"><div data-obj="turntable" style="position:absolute;inset:0"></div></div>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------ HOME */
  function pageHome() {
    const ac = D.home.ac, p = D.home.presence;
    const modes = [['cool', 'Cool', 'i-snow'], ['heat', 'Heat', 'i-sun'], ['fan', 'Fan', 'i-fan'], ['dry', 'Dry', 'i-drop'], ['auto', 'Auto', 'i-auto']];
    const fans = ['auto', 'low', 'mid', 'high'];
    return `<div class="page">
      ${head('Home', `<span class="chip sm" style="pointer-events:none">${ic('i-pin', 's')}${p.here ? 'You’re home' : 'Away'}</span>`)}
      <div class="cols">
        <div class="stack">
          <div class="tile climate ${ac.on ? '' : 'off'}">
            <div class="climate-top"><div><div class="tile-label">${ic('i-fan', 's')}${ac.name}<span class="state">${ac.on ? '<span class="lamp"></span>' + ac.mode : '<span class="lamp off"></span>off'}</span></div>
              <div class="tile-meta" style="margin-top:4px">${ac.on ? `Cooling since ${ac.since} · LAN, no cloud` : 'Off · LAN, no cloud'}</div></div>
              <button class="round ${ac.on ? 'on' : ''}" style="margin-left:auto" data-act="ac-power" aria-pressed="${ac.on}" aria-label="Turn the AC ${ac.on ? 'off' : 'on'}">${ic('i-power')}</button></div>
            <div class="climate-grid"><div class="stack" style="gap:18px">
            <div class="setpoint"><button class="round" data-act="ac-temp" data-d="-1" aria-label="Colder">${ic('i-minus')}</button>
              <span class="num" aria-live="polite">${ac.set}°</span>
              <button class="round" data-act="ac-temp" data-d="1" aria-label="Warmer">${ic('i-plus')}</button></div>
            <div class="readouts"><div class="readout"><span>inside</span><b class="num">${ac.inside}°</b></div><div class="readout"><span>outside</span><b class="num">${ac.outside}°</b></div><div class="readout"><span>humidity</span><b class="num">${ac.humidity}%</b></div></div></div>
              <div class="dial" id="dial" data-obj="dial" data-value="${ac.set}" role="slider" tabindex="0" aria-label="Setpoint" aria-valuemin="16" aria-valuemax="30" aria-valuenow="${ac.set}"><span class="dial-read">drag to turn · 16–30°</span></div></div>
            <div class="ctl-row"><span class="lbl">Mode</span><div class="seg" role="group" aria-label="Mode">${modes.map(([k, l, i]) => `<button data-act="ac-mode" data-v="${k}" aria-pressed="${ac.mode === k}">${ic(i, 's')}${l}</button>`).join('')}</div></div>
            <div class="ctl-row"><span class="lbl">Fan</span><div class="seg" role="group" aria-label="Fan">${fans.map(k => `<button data-act="ac-fan" data-v="${k}" aria-pressed="${ac.fan === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
          </div>
          <div class="section"><div class="group-head"><h2>Scenes</h2><span class="meta">One tap sets everything</span></div>
            <div class="scenes">${D.home.scenes.map(s => `<button class="scene" data-act="scene" data-id="${s.id}">${ic(s.icon, 'l')}<span><b>${s.name}</b><small>${s.sub}</small></span></button>`).join('')}</div></div>
        </div>
        <div class="stack">
          <div class="group"><button class="row" data-act="presence"><span class="row-icon ${p.here ? 'ok' : ''}">${ic('i-pin', 's')}</span><span class="row-text"><span class="row-title">${p.here ? `You’re home since ${p.since}` : 'You’re away'}</span><span class="row-sub">${p.via} · ±${p.acc} m · seen ${p.seen}</span></span>${ic('i-chev', 's chev')}</button></div>
          <div class="section"><div class="group-head"><h2>Automations</h2><span class="meta">${D.home.automations.filter(a => a.on).length} on</span></div>
            <div class="group">${D.home.automations.map(a => `<div class="row"><span class="row-text"><span class="row-title">${esc(a.name)}</span><span class="row-sub">${a.sub}</span></span>${toggle('auto-toggle', a.on, a.name, `data-id="${a.id}"`)}</div>`).join('')}</div></div>
          <div class="section"><div class="group-head"><h2>Desk</h2><span class="meta">Over USB and Bluetooth</span></div>
            <div class="group">${D.desk.map(d => `<button class="row" data-act="desk" data-id="${d.id}"><span class="row-icon desk">${ic(d.icon, 's')}</span><span class="row-text"><span class="row-title">${d.name}</span><span class="row-sub">${d.detail} · ${d.link}</span></span><span class="row-end">${d.battery != null ? `<span class="num">${d.battery}%</span>` : '<span class="hide-sm">Wired</span>'}${ic('i-chev', 's chev')}</span></button>`).join('')}</div></div>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------ MACHINES */
  function hostTile(h) {
    const led = h.status === 'warn' ? 'stop' : h.status === 'err' ? 'stop' : 'run';
    return `<div class="tile host ${h.status === 'warn' ? 'attn-ring' : ''}">
      <a class="tile-link" href="#machines" data-act="host" data-id="${h.id}" aria-label="${h.name} details"></a>
      <div class="tile-label">${st(h.status)}</div>
      <div class="unit-body"><div class="tile-body"><div class="host-name">${h.name}</div><div class="host-role">${h.role}</div></div><div class="tile-obj" data-obj="${h.obj}" data-led="${led}"></div></div>
      <div class="host-stats">
        <div class="host-stat"><span>cpu</span><b class="num">${h.cpu}<span class="u">%</span></b>${meter(h.cpu, lvl(h.cpu, 80, 95))}</div>
        <div class="host-stat"><span>memory</span><b class="num">${h.mem}<span class="u">%</span></b>${meter(h.mem, lvl(h.mem, 85, 93))}</div>
        <div class="host-stat"><span>disk</span><b class="num">${h.disk}<span class="u">%</span></b>${meter(h.disk, lvl(h.disk, 90, 96))}</div>
      </div>
      <div class="host-actions">${h.remote ? `<button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="desktop">${ic('i-desktop', 's')}Desktop</button>` : ''}
        <button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="terminal">${ic('i-terminal', 's')}Terminal</button>
        <button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="files">${ic('i-folder', 's')}Files</button></div>
    </div>`;
  }
  function svcRow(s, opts = {}) {
    const busy = ui.restarting === s.name;
    return `<div class="row"><span class="row-icon ${s.state === 'warn' ? 'warn' : s.state === 'err' ? 'err' : s.state === 'off' ? '' : 'ok'}">${ic(s.kind === 'container' ? 'i-box' : 'i-machines', 's')}</span>
      <span class="row-text"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${opts.noHost ? '' : esc(s.host) + ' · '}${s.kind ? s.kind + ' · ' : ''}${esc(s.note)}</span></span>
      <span class="row-end"><span class="hide-sm">${stateWord(s.state)}</span><button class="btn sm ghost ${busy ? 'busy' : ''}" data-act="restart-svc" data-name="${esc(s.name)}" aria-label="Restart ${esc(s.name)}">${ic('i-restart', 's')}<span class="hide-sm">${busy ? 'Restarting' : 'Restart'}</span></button></span></div>`;
  }
  function pageMachines() {
    const sub = ui.machines, n = needs();
    const chips = [['hosts', 'Machines', n.machines], ['services', 'Services', D.services.filter(s => s.state === 'warn').length], ['network', 'Network', 0]];
    let body = '';
    if (sub === 'hosts') {
      body = `${D.alerts.map(attnCard).join('')}<div class="cols-3">${D.hosts.map(hostTile).join('')}</div>`;
    } else if (sub === 'services') {
      const hostsF = ['All', ...D.hosts.map(h => h.name)];
      const list = D.services.filter(s => (ui.svcHost === 'All' || s.host === ui.svcHost) && s.name.toLowerCase().includes(ui.svcQ.toLowerCase()));
      body = `<div class="toolbar"><label class="field">${ic('i-search', 's')}<input id="svc-q" type="search" placeholder="Filter services" value="${esc(ui.svcQ)}" autocomplete="off"></label>
        <div class="chips">${hostsF.map(h => `<button class="chip sm" data-act="svc-host" data-v="${h}" aria-pressed="${ui.svcHost === h}">${h}</button>`).join('')}</div></div>
        <div class="group" id="svc-list">${list.length ? list.map(s => svcRow(s)).join('') : `<div class="row"><span class="row-text"><span class="row-title">No service matches “${esc(ui.svcQ)}”</span><span class="row-sub">Clear the filter or pick All machines.</span></span></div>`}</div>`;
    } else {
      const r = D.router, ranges = ['1h', '6h', '24h', '48h'];
      body = `<div class="cols">
        <div class="stack">
          <div class="tile router-tile">
            <div class="tile-obj" data-obj="radio" style="position:absolute;right:12px;top:14px;width:42%;height:200px"></div>
            <div class="tile-label">${ic('i-signal', 's')}${r.model}</div>
            <div class="sig"><span class="num">${r.rsrp}</span><span style="font:var(--t-label)">dBm · ${r.quality}</span></div>
            <div class="readouts"><div class="readout"><span>Down</span><b class="num">${r.down} <small style="font-size:.6em">Mb/s</small></b></div><div class="readout"><span>Up</span><b class="num">${r.up} <small style="font-size:.6em">Mb/s</small></b></div><div class="readout"><span>SINR</span><b class="num">${r.sinr} dB</b></div></div>
            <div class="carriers">${r.carriers.map(c => `<div class="carrier"><b>${c.band}</b>${c.what} · ${c.v}</div>`).join('')}</div>
            <div class="readouts"><div class="readout"><span>Today</span><b class="num">${r.today} GB</b></div><div class="readout"><span>This month</span><b class="num">${r.month} GB</b></div><div class="readout"><span>Up for</span><b class="num">${r.uptime}</b></div></div>
          </div>
          <div class="section"><div class="group-head"><h2>Signal history</h2><div class="chips">${ranges.map(x => `<button class="chip sm" data-act="range" data-v="${x}" aria-pressed="${ui.range === x}">${x}</button>`).join('')}</div></div>
            <div class="group" style="padding:10px">${grille(r.history[ui.range], { min: -108, max: -86, rows: 8, label: 'Signal, last ' + ui.range, left: ui.range + ' ago', right: 'now', unit: ' dBm', tone: v => v <= -100 ? 'stop' : v <= -95 ? 'hold' : '' })}<p class="row-sub wrap" style="margin:8px 4px 0">Each column is one reading. Yellow is fair (−95 to −100 dBm), red is poor (below −100). Drag across it to read a value.</p></div></div>
        </div>
        <div class="stack">
          <div class="section"><div class="group-head"><h2>Manage</h2></div>
            <div class="group">
              <div class="row"><span class="row-icon net">${ic('i-signal', 's')}</span><span class="row-text"><span class="row-title">Mobile data</span><span class="row-sub">${r.data ? 'On · every device is online' : 'Off · the Wi-Fi stays up, nothing reaches the internet'}</span></span>${toggle('data-toggle', r.data, 'Mobile data')}</div>
              <button class="row" data-act="router-restart"><span class="row-icon">${ic('i-restart', 's')}</span><span class="row-text"><span class="row-title">Restart the router</span><span class="row-sub">Everything drops for about 90 seconds</span></span>${ic('i-chev', 's chev')}</button>
              ${ui.confirm === 'router' ? `<div class="confirm"><p>Restart now? Every device loses the internet for about 90 seconds, this console included.</p><button class="btn sm ghost" data-act="confirm-cancel">Cancel</button><button class="btn sm danger solid" data-act="router-restart-go">Restart</button></div>` : ''}
              <button class="row" data-act="sms"><span class="row-icon">${ic(ui.smsUnlocked ? 'i-sms' : 'i-lock', 's')}</span><span class="row-text"><span class="row-title">Operator messages</span><span class="row-sub">${ui.smsUnlocked ? r.sms.length + ' messages from WE' : 'Locked · needs the router’s admin password'}</span></span>${ic('i-chev', 's chev')}</button>
              <div class="row"><span class="row-icon">${ic('i-box', 's')}</span><span class="row-text"><span class="row-title">Firmware</span><span class="row-sub">11.0.2.5 · up to date</span></span></div>
            </div></div>
          <div class="section"><div class="group-head"><h2>On the Wi-Fi</h2><span class="meta">${r.clients.length} devices</span></div>
            <div class="group">${r.clients.map(c => `<div class="row"><span class="row-icon">${ic(c.kind, 's')}</span><span class="row-text"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${c.ip} · ${c.band}</span></span></div>`).join('')}</div></div>
        </div>
      </div>`;
    }
    return `<div class="page">${head('Machines')}
      <div class="chips" role="tablist">${chips.map(([k, l, b]) => `<button class="chip" role="tab" data-act="sub" data-page="machines" data-v="${k}" aria-selected="${sub === k}">${l}${b ? `<span class="badge">${b}</span>` : ''}</button>`).join('')}</div>
      ${body}</div>`;
  }

  /* ------------------------------------------------------------ AGENT */
  function pageAgent() {
    const sub = ui.agent, A = D.agent;
    const chips = [['claude', 'Claude', A.sessions.filter(s => s.state === 'waiting').length], ['workflows', 'Workflows', A.workflows.filter(w => w.last === 'fail' && w.on).length], ['assistant', 'Assistant', 0], ['services', 'Services', 0]];
    let body = '';
    if (sub === 'claude') {
      body = `<div class="cols"><div class="section"><div class="group-head"><h2>Sessions</h2><button class="btn sm tonal" data-act="new-session">${ic('i-plus', 's')}New session</button></div>
        <div class="group">${A.sessions.map(s => `<button class="row" data-act="session" data-id="${s.id}"><span class="row-icon ${s.state === 'waiting' ? 'warn' : s.state === 'running' ? 'agent' : ''}">${ic('i-terminal', 's')}</span><span class="row-text"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${esc(s.dir)} · ${s.age}</span></span><span class="row-end">${st(s.state)}${ic('i-chev', 's chev')}</span></button>`).join('')}</div></div>
        <div class="section"><div class="group-head"><h2>Usage</h2><span class="meta">Resets Monday 09:00</span></div>
        <div class="group" style="padding:16px"><div class="usage">${A.usage.map(u => `<div class="usage-row"><span>${u.acct} · week</span><div class="meter" style="--mark:var(--cream-2)"><i style="width:${u.week}%"></i></div><b class="num">${u.week}%</b></div><div class="usage-row"><span>${u.acct} · 5 h</span><div class="meter" style="--mark:var(--cream-2)"><i style="width:${Math.max(2, u.five)}%"></i></div><b class="num">${u.five}%</b></div>`).join('')}</div>
        <p class="row-sub wrap" style="margin:14px 0 0">When personal runs out, new sessions start on work. Pings go to Discord.</p></div></div></div>`;
    } else if (sub === 'workflows') {
      body = `<div class="cols"><div class="section"><div class="group-head"><h2>n8n workflows</h2><span class="meta">${A.workflows.filter(w => w.on).length} of ${A.workflows.length} on</span></div>
        <div class="group">${A.workflows.map(w => `<div class="row"><span class="row-icon ${w.last === 'fail' ? 'err' : 'agent'}">${ic('i-flow', 's')}</span><span class="row-text"><span class="row-title">${esc(w.name)}</span><span class="row-sub">${w.last === 'fail' ? 'Failed' : 'Ran'} ${w.when}</span></span>${toggle('wf-toggle', w.on, w.name, `data-id="${w.id}"`)}</div>`).join('')}</div></div>
        <div class="section"><div class="group-head"><h2>Recent runs</h2></div>
        <div class="group">${A.runs.map(r => `<div class="row"><span class="row-icon ${r.ok ? 'ok' : 'err'}">${ic(r.ok ? 'i-check' : 'i-x', 's')}</span><span class="row-text"><span class="row-title">${esc(r.wf)}</span><span class="row-sub">${r.when} · ${r.took}</span></span>${r.ok ? '' : `<button class="btn sm ghost" data-act="rerun" data-name="${esc(r.wf)}">${ic('i-restart', 's')}Run again</button>`}</div>`).join('')}</div></div></div>`;
    } else if (sub === 'assistant') {
      const o = A.odysseus;
      body = `<div class="cols"><div class="tile" style="min-height:280px">
          <div class="tile-obj" data-obj="calc" style="position:absolute;right:10px;top:10px;width:46%;height:180px"></div>
          <div class="tile-label">${ic('i-agent', 's')}Odysseus</div>
          <div class="tile-body"><span class="tile-head">Ready · v${o.version}</span><span class="tile-meta">Answers with ${o.model} through OpenCode on the HP box</span>
          <div style="margin-top:12px"><button class="btn go" data-act="ask">${ic('i-chat', 's')}Open a chat</button></div></div></div>
        <div class="section"><div class="group-head"><h2>Runs on</h2></div><div class="group">${o.containers.map(c => `<div class="row"><span class="row-icon ok">${ic('i-box', 's')}</span><span class="row-text"><span class="row-title">${c}</span><span class="row-sub">container · ojee-hp-zorin</span></span>${st('ok')}</div>`).join('')}</div></div></div>`;
    } else {
      body = `<div class="section"><div class="group-head"><h2>What the Agent runs on</h2><span class="meta">All machines’ services are in Machines</span></div>
        <div class="group">${A.services.map(s => svcRow({ ...s, host: 'ojee-hp-zorin', kind: 'container' }, { noHost: true })).join('')}</div></div>`;
    }
    return `<div class="page">${head('Agent')}
      <div class="chips" role="tablist">${chips.map(([k, l, b]) => `<button class="chip" role="tab" data-act="sub" data-page="agent" data-v="${k}" aria-selected="${sub === k}">${l}${b ? `<span class="badge">${b}</span>` : ''}</button>`).join('')}</div>
      ${body}</div>`;
  }

  /* ------------------------------------------------------------ ME */
  function pageMe() {
    return `<div class="page">${head('Me')}
      <div class="cols">
        <div class="stack">
          <div class="group"><div class="row"><span class="row-icon" style="width:48px;height:48px;background:var(--go);color:var(--on-key)">${ic('i-me')}</span><span class="row-text"><span class="row-title" style="font-size:1.0625rem">ojee</span><span class="row-sub">Signed in with TOTP · this device is trusted until 15 Dec</span></span></div></div>
          <div class="section"><div class="group-head"><h2>Notifications</h2><span class="meta">Modules say when, you say where</span></div>
            <div class="group">${D.routing.map(r => `<div class="row"><span class="row-icon ${r.mod}">${ic(MODICON[r.mod], 's')}</span><span class="row-text"><span class="row-title wrap">${r.label}</span><span class="row-sub">${MOD[r.mod]}</span></span>
              <span class="row-end"><button class="chip sm" data-act="route-ch" data-id="${r.id}" data-ch="app" aria-pressed="${r.app}">App</button><button class="chip sm" data-act="route-ch" data-id="${r.id}" data-ch="discord" aria-pressed="${r.discord}">Discord</button></span></div>`).join('')}</div></div>
          <div class="section"><div class="group-head"><h2>Clock</h2></div>
            <div class="group">
              <div class="row"><span class="row-icon">${ic('i-clock', 's')}</span><span class="row-text"><span class="row-title">12-hour time</span><span class="row-sub">${prefs.h12 ? '8:08 PM' : '20:08'}</span></span>${toggle('pref-h12', prefs.h12, '12-hour time')}</div>
              <div class="row"><span class="row-icon">${ic('i-auto', 's')}</span><span class="row-text"><span class="row-title">Arabic numerals</span><span class="row-sub">${prefs.arabic ? '٨:٠٨' : 'Off · 8:08'}</span></span>${toggle('pref-ar', prefs.arabic, 'Arabic numerals')}</div>
              <div class="row"><span class="row-icon ok">${ic('i-check', 's')}</span><span class="row-text"><span class="row-title">${D.ntp.source}</span><span class="row-sub">Offset ±${D.ntp.offsetMs} ms · synced ${D.ntp.lastSync}</span></span></div>
            </div></div>
        </div>
        <div class="stack">
          <div class="section"><div class="group-head"><h2>Trusted devices</h2><span class="meta">30 days each</span></div>
            <div class="group">${D.trusted.map(d => `<div class="row"><span class="row-icon">${ic(d.icon, 's')}</span><span class="row-text"><span class="row-title">${d.name}</span><span class="row-sub">${d.where} · ${d.until}</span></span>${d.current ? '<span class="row-end">This device</span>' : `<button class="btn sm danger" data-act="revoke" data-id="${d.id}">Revoke</button>`}</div>
              ${ui.confirm === d.id ? `<div class="confirm"><p>Revoke ${d.name}? It signs out now and needs a TOTP code next time.</p><button class="btn sm ghost" data-act="confirm-cancel">Cancel</button><button class="btn sm danger solid" data-act="revoke-go" data-id="${d.id}">Revoke</button></div>` : ''}`).join('')}</div></div>
          <div class="section"><div class="group-head"><h2>Modules</h2><span class="meta">${D.modules.length} of ${D.modules.length} ready</span></div>
            <div class="group">${D.modules.map(m => `<div class="row"><span class="row-text"><span class="row-title">${m.name}</span><span class="row-sub">v${m.v} · its own container</span></span>${st(m.state)}</div>`).join('')}</div></div>
          <button class="btn ghost block" data-act="signout">Sign out</button>
          <p class="row-sub wrap" style="text-align:center">Sample data. ojee.console prototype, The Grille.</p>
        </div>
      </div></div>`;
  }

  /* ------------------------------------------------------------ player */
  const mmss = s => `${Math.floor(s / 60)}:${p2(Math.floor(s % 60))}`;
  const coverArt = cls => `<span class="cover ${cls}" style="background:radial-gradient(120% 90% at 20% 15%, #ff9fd0 0, transparent 50%), radial-gradient(90% 90% at 85% 80%, #5b6cff 0, transparent 55%), linear-gradient(140deg, #3a1450, #10162e)"></span>`;
  function renderPlayers() {
    const m = D.music, pct = m.at / m.len * 100;
    window.MUSIC_PLAYING = m.playing;
    const pp = `<button class="round sm" data-act="mu-play" aria-label="${m.playing ? 'Pause' : 'Play'}">${ic(m.playing ? 'i-pause' : 'i-play', 's')}</button>`;
    $('#railplayer').innerHTML = `<div class="player-top" data-act="player">${coverArt('')}<div class="np"><b>${m.title}</b><span>${m.artist} · on ${m.device}</span></div>${pp}</div><div class="prog"><i data-prog style="width:${pct}%"></i></div>`;
    $('#miniplayer').innerHTML = `<span data-act="player" style="display:contents">${coverArt('')}<div class="np" data-act="player"><b>${m.title}</b><span>${m.artist} · on ${m.device}</span></div></span>${pp}<button class="round sm" data-act="mu-next" aria-label="Next">${ic('i-next', 's')}</button><div class="prog"><i data-prog style="width:${pct}%"></i></div>`;
    $('#railplayer').onclick = e => { if (!e.target.closest('[data-act="mu-play"]')) openPlayer(); };
  }
  function sheetPlayer() {
    const m = D.music;
    return `<div class="sheet-head"><div><h2 id="sheet-title">Now playing</h2><p>Spotify · playing on ${m.device}</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="tile" style="padding:18px;gap:16px">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:center">${coverArt('lg')}<div class="sheet-hero" style="height:auto;aspect-ratio:1"><div class="obj" data-obj="turntable"></div></div></div>
        <div class="np"><b style="font-size:1.375rem;font-weight:650;letter-spacing:-.02em">${m.title}</b><span>${m.artist} · ${m.album}</span></div>
        <div><div class="prog" style="height:6px"><i data-prog style="width:${m.at / m.len * 100}%"></i></div><div class="times" style="margin-top:6px"><span class="num" data-at>${mmss(m.at)}</span><span class="num">−${mmss(m.len - m.at)}</span></div></div>
        <div class="player-keys">
          <button class="round sm ${m.shuffle ? 'on' : ''}" data-act="mu-shuffle" aria-pressed="${m.shuffle}" aria-label="Shuffle">${ic('i-flow', 's')}</button>
          <button class="round" data-act="mu-prev" aria-label="Previous">${ic('i-prev')}</button>
          <button class="round big" data-act="mu-play" aria-label="${m.playing ? 'Pause' : 'Play'}">${ic(m.playing ? 'i-pause' : 'i-play', 'l')}</button>
          <button class="round" data-act="mu-next" aria-label="Next">${ic('i-next')}</button>
          <button class="round sm ${m.repeat ? 'on' : ''}" data-act="mu-repeat" aria-pressed="${m.repeat}" aria-label="Repeat">${ic('i-restart', 's')}</button>
        </div>
        <label style="display:flex;gap:12px;align-items:center;font:var(--t-meta)">Volume<input id="mu-vol" type="range" min="0" max="100" value="${m.volume}" style="flex:1;accent-color:var(--go)"><b class="num" data-vol>${m.volume}</b></label>
      </div>
      <div class="section"><div class="group-head"><h2>Play on</h2></div><div class="chips">${m.devices.map(d => `<button class="chip" data-act="mu-dev" data-v="${esc(d)}" aria-pressed="${m.device === d}">${ic(d.includes('iPhone') ? 'i-phone' : d.includes('speaker') ? 'i-music' : 'i-laptop', 's')}${d}</button>`).join('')}</div></div>
      <div class="section"><div class="group-head"><h2>Up next</h2></div><div class="group">${m.queue.map(q => `<div class="row"><span class="row-text"><span class="row-title">${q.t}</span><span class="row-sub">${q.a}</span></span></div>`).join('')}</div></div>`;
  }
  const openPlayer = () => openSheet(sheetPlayer);

  /* ------------------------------------------------------------ sheets */
  function sheetHost(id) {
    const h = D.hosts.find(x => x.id === id || x.name === id) || D.hosts[2];
    const svcs = D.services.filter(s => s.host === h.name);
    const procs = D.processes.filter(p => p.name.toLowerCase().includes(ui.procQ.toLowerCase()));
    return `<div class="sheet-head"><div><h2 id="sheet-title">${h.name}</h2><p>${h.role} · up ${h.up}</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="tile" style="padding:18px;gap:14px">
        <div class="tile-obj" data-obj="${h.obj}" data-led="${h.status === 'warn' ? 'stop' : 'run'}" style="position:absolute;right:12px;top:10px;width:40%;height:140px"></div>
        <div class="tile-label">${st(h.status)}</div>
        <div style="position:relative;z-index:2;max-width:56%"><span class="legend">cpu, last 15 minutes</span></div>
        ${grille(h.spark, { min: 0, max: 100, rows: 6, label: 'CPU, last 15 minutes', left: '15 min ago', right: 'now', unit: '%', tone: v => v >= 65 ? 'hold' : '' })}
        <div class="host-stats" style="margin-top:6px">
          <div class="host-stat"><span>cpu</span><b class="num">${h.cpu}<span class="u">%</span></b>${meter(h.cpu)}</div>
          <div class="host-stat"><span>memory</span><b class="num">${h.mem}<span class="u">%</span></b>${meter(h.mem, lvl(h.mem, 85, 93))}</div>
          <div class="host-stat"><span>disk</span><b class="num">${h.disk}<span class="u">%</span></b>${meter(h.disk, lvl(h.disk, 90, 96))}</div></div>
        <div class="host-actions">${h.remote ? `<button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="desktop">${ic('i-desktop', 's')}Desktop</button>` : ''}<button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="terminal">${ic('i-terminal', 's')}Terminal</button><button class="btn sm" data-act="remote" data-id="${h.id}" data-mode="files">${ic('i-folder', 's')}Files</button></div>
      </div>
      <div class="group" style="padding:14px 16px"><div class="kv">
        <span>CPU temperature</span><span></span><b class="num">${h.temp} °C</b>
        <span>Swap</span><span></span><b class="num">${h.swap}%</b>
        <span>GPU</span><span></span><b>${h.gpu}</b>
        <span>Network</span><span></span><b class="num">${h.net}</b>
        ${h.battery != null ? `<span>Battery</span><span></span><b class="num">${h.battery}%</b>` : ''}
        <span>SMART</span><span></span><b style="color:var(--run)">Passed</b>
      </div></div>
      ${h.disk >= 90 ? `<div class="attn"><span class="attn-icon">${ic('i-warn')}</span><p class="attn-title">/ is ${h.disk}% full</p><p class="attn-meta">Under 10% free ext4 fragments badly. 4.1 GB is old journal.</p><div class="attn-actions"><button class="btn sm tonal" data-act="toast" data-msg="Journal vacuumed to 500 MB">Vacuum journal</button></div></div>` : ''}
      <div class="section"><div class="group-head"><h2>Services</h2><span class="meta">${svcs.length}</span></div><div class="group">${svcs.map(s => svcRow(s, { noHost: true })).join('') || '<div class="row"><span class="row-sub">No services reported.</span></div>'}</div></div>
      <div class="section"><div class="group-head"><h2>Processes</h2><span class="meta">Top by CPU</span></div>
        <label class="field">${ic('i-search', 's')}<input id="proc-q" type="search" placeholder="Filter processes" value="${esc(ui.procQ)}"></label>
        <div class="group" id="proc-list">${procs.map(p => `<div class="row"><span class="row-text"><span class="row-title" style="font-family:var(--mono);font-size:.8438rem">${esc(p.name)}</span></span><span class="row-end"><span class="num">${p.cpu}%</span><span class="hide-sm">${p.mem}</span></span></div>`).join('')}</div></div>
      <div class="section"><div class="group-head"><h2>Journal · terraria-api</h2></div>
        <div class="term"><span class="d">19:31:04</span> terraria-api[2210]: listening on :7878
<span class="d">19:58:41</span> <span class="w">terraria-api[2210]: heap out of memory</span>
<span class="d">19:58:42</span> systemd[1]: terraria-api.service: Main process exited, code=killed
<span class="d">19:58:47</span> systemd[1]: terraria-api.service: Scheduled restart job
<span class="d">20:02:10</span> <span class="w">terraria-api[2388]: heap out of memory</span>
<span class="d">20:02:16</span> <span class="p">terraria-api[2412]: listening on :7878</span></div></div>`;
  }
  function sheetRemote(id, mode) {
    const h = D.hosts.find(x => x.id === id) || D.hosts[0];
    const tabs = [['desktop', 'Desktop', 'i-desktop'], ['terminal', 'Terminal', 'i-terminal'], ['files', 'Files', 'i-folder']].filter(t => t[0] !== 'desktop' || h.remote);
    let body = '';
    if (mode === 'desktop') body = `<div class="screen"><div class="win" style="left:6%;top:10%;width:48%;height:56%"></div><div class="win" style="left:44%;top:30%;width:46%;height:58%"></div><span style="position:relative">Connected · 2 monitors · 1920 × 1080</span></div>
      <p class="row-sub wrap">Your primary display stays where it is. Tap to click, two fingers to scroll.</p>
      <div class="toolbar"><button class="btn tonal" data-act="toast" data-msg="Full screen on the remote desktop">${ic('i-expand', 's')}Full screen</button><button class="btn tonal" data-act="toast" data-msg="Keyboard opened">${ic('i-keyboard', 's')}Keyboard</button><button class="btn tonal" data-act="toast" data-msg="Clipboard sent to ${h.name}">${ic('i-check', 's')}Send clipboard</button><button class="btn danger" data-act="close">Disconnect</button></div>`;
    if (mode === 'terminal') body = `<div class="term" id="term"><span class="p">ojee@${h.name}</span>:~$ uptime
 20:14:02 up ${h.up},  load average: 0.42, 0.51, 0.47
<span class="p">ojee@${h.name}</span>:~$ </div>
      <form class="composer" data-form="term"><label class="field">${ic('i-terminal', 's')}<input id="term-in" type="text" placeholder="Type a command" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="round sm on" aria-label="Run">${ic('i-send', 's')}</button></form>`;
    if (mode === 'files') body = `<div class="toolbar"><span class="chip sm" style="pointer-events:none">${ic('i-folder', 's')}/home/ojee</span><button class="btn sm tonal" data-act="toast" data-msg="Pick a file to upload to ${h.name}">${ic('i-plus', 's')}Upload</button></div>
      <div class="group">${[['Code', 'folder', '—'], ['Downloads', 'folder', '—'], ['.config', 'folder', '—'], ['stream-diag.log', 'file', '182 KB'], ['backup-2026-11-14.tar.zst', 'file', '4.2 GB']].map(([n, k, s]) => `<button class="row" data-act="toast" data-msg="${k === 'folder' ? 'Opened ' + n : 'Downloading ' + n}"><span class="row-icon ${k === 'folder' ? 'remote' : ''}">${ic(k === 'folder' ? 'i-folder' : 'i-box', 's')}</span><span class="row-text"><span class="row-title">${n}</span><span class="row-sub">${k === 'folder' ? 'Folder' : s}</span></span>${ic('i-chev', 's chev')}</button>`).join('')}</div>`;
    return `<div class="sheet-head"><div><h2 id="sheet-title">${h.name}</h2><p>Remote · ${h.id === 'loq' ? '8' : '21'} ms over the tailnet</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="chips">${tabs.map(([k, l, i]) => `<button class="chip" data-act="remote" data-id="${h.id}" data-mode="${k}" aria-pressed="${mode === k}">${ic(i, 's')}${l}</button>`).join('')}</div>${body}`;
  }
  function sheetDesk(id) {
    const d = D.desk.find(x => x.id === id), s = d.settings;
    let body = '';
    if (id === 'mouse') body = `<div class="section"><div class="group-head"><h2>DPI stage</h2><span class="meta">Read back after each write</span></div><div class="seg" style="--mark:var(--go);color:var(--cream)">${s.dpi.map((v, i) => `<button data-act="dpi" data-v="${i}" aria-pressed="${s.stage === i}">${v}</button>`).join('')}</div></div>
      <div class="section"><div class="group-head"><h2>Polling rate</h2></div><div class="seg" style="--mark:var(--go);color:var(--cream)">${s.polling.map(v => `<button data-act="poll" data-v="${v}" aria-pressed="${s.poll === v}">${v >= 1000 ? v / 1000 + 'k' : v} Hz</button>`).join('')}</div></div>
      <div class="group"><div class="row"><span class="row-text"><span class="row-title">Motion sync</span><span class="row-sub">Steadier tracking, 1 ms more latency</span></span>${toggle('dset', s.motionSync, 'Motion sync', 'data-k="motionSync" data-id="mouse"')}</div>
      <div class="row"><span class="row-text"><span class="row-title">Angle snapping</span><span class="row-sub">Straightens lines you draw</span></span>${toggle('dset', s.angleSnap, 'Angle snapping', 'data-k="angleSnap" data-id="mouse"')}</div>
      <div class="row"><span class="row-text"><span class="row-title">Debounce</span><span class="row-sub">${s.debounce} ms</span></span></div></div>`;
    if (id === 'kbd') body = `<div class="group" style="padding:16px"><label style="display:flex;flex-direction:column;gap:10px;font:var(--t-label)">Actuation, all keys <input id="act-r" type="range" min="0.1" max="3.4" step="0.1" value="${s.actuation}" style="accent-color:var(--go)"><span class="row-sub" data-act-v>${s.actuation.toFixed(1)} mm</span></label></div>
      <div class="group"><div class="row"><span class="row-text"><span class="row-title">Rapid trigger</span><span class="row-sub">Resets after ${s.rapidSens} mm of travel up</span></span>${toggle('dset', s.rapid, 'Rapid trigger', 'data-k="rapid" data-id="kbd"')}</div>
      <div class="row"><span class="row-text"><span class="row-title">Lighting</span><span class="row-sub">${s.lighting}</span></span></div><div class="row"><span class="row-text"><span class="row-title">Profile</span><span class="row-sub">${s.profile} of 4</span></span></div></div>`;
    if (id === 'cmf') body = `<div class="section"><div class="group-head"><h2>Noise control</h2></div><div class="seg" style="--mark:var(--go);color:var(--cream)">${['off', 'transparency', 'low', 'mid', 'high'].map(v => `<button data-act="anc" data-v="${v}" aria-pressed="${s.anc === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>
      <div class="group"><div class="row"><span class="row-text"><span class="row-title">EQ</span><span class="row-sub">${s.eq}</span></span></div>
      <div class="row"><span class="row-text"><span class="row-title">Spatial audio</span><span class="row-sub">Head tracking off</span></span>${toggle('dset', s.spatial, 'Spatial audio', 'data-k="spatial" data-id="cmf"')}</div>
      <div class="row"><span class="row-text"><span class="row-title">Low latency</span><span class="row-sub">For games, costs some range</span></span>${toggle('dset', s.lowLatency, 'Low latency', 'data-k="lowLatency" data-id="cmf"')}</div></div>`;
    return `<div class="sheet-head"><div><h2 id="sheet-title">${d.name}</h2><p>${d.kind} · ${d.link}${d.battery != null ? ' · battery ' + d.battery + '%' : ''}</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="tile" style="height:170px"><div data-obj="desk" style="position:absolute;inset:0"></div></div>${body}`;
  }
  function sheetSession(id) {
    const s = D.agent.sessions.find(x => x.id === id);
    return `<div class="sheet-head"><div><h2 id="sheet-title">${esc(s.name)}</h2><p>${esc(s.dir)} · ${s.acct} · ${s.age}</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="toolbar">${st(s.state)}<span style="flex:1"></span><button class="btn sm tonal" data-act="toast" data-msg="Opening the live terminal (tmux)">${ic('i-terminal', 's')}Terminal</button>${s.state !== 'done' ? `<button class="btn sm danger" data-act="stop-session" data-id="${s.id}">Stop</button>` : ''}</div>
      <div class="thread" id="thread">${s.log.map(l => `<div class="bubble them">${esc(l)}</div>`).join('')}</div>
      <form class="composer" data-form="session" data-id="${s.id}"><label class="field"><input id="sess-in" type="text" placeholder="${s.state === 'waiting' ? 'Answer Claude' : 'Message this session'}" autocomplete="off"></label><button class="round sm on" aria-label="Send">${ic('i-send', 's')}</button></form>`;
  }
  function sheetNewSession() {
    return `<div class="sheet-head"><div><h2 id="sheet-title">New Claude session</h2><p>Runs unattended on ojee-hp-zorin</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <label class="field">${ic('i-folder', 's')}<input id="ns-dir" type="text" value="~/Code/" autocomplete="off"></label>
      <label class="field">${ic('i-chat', 's')}<input id="ns-p" type="text" placeholder="What should it do?" autocomplete="off"></label>
      <div class="chips"><button class="chip" aria-pressed="true">personal</button><button class="chip" aria-pressed="false">work</button></div>
      <button class="btn go block" data-act="start-session">Start session</button>`;
  }
  function sheetNotifs() {
    const icon = { warn: 'i-warn', err: 'i-x', info: 'i-check' };
    return `<div class="sheet-head"><div><h2 id="sheet-title">Notifications</h2><p>From every module, newest first</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="group">${D.notifications.map(n => `<div class="row"><span class="row-icon ${n.sev === 'info' ? n.module : n.sev}">${ic(icon[n.sev], 's')}</span><span class="row-text"><span class="row-title">${esc(n.title)}</span><span class="row-sub">${MOD[n.module]} · ${n.when}</span></span></div>`).join('')}</div>
      <a class="btn ghost block" href="#me" data-act="close">Choose where each kind goes</a>`;
  }
  function sheetAsk() {
    return `<div class="sheet-head"><div><h2 id="sheet-title">Ask Odysseus</h2><p>Reads every module. Can act with your OK.</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="chips">${['Why did terraria-api restart?', 'Cool the flat to 23°', 'What failed overnight?'].map(q => `<button class="chip sm" data-act="ask-q" data-q="${esc(q)}">${q}</button>`).join('')}</div>
      <div class="thread" id="thread"><div class="bubble them">Everything else is running. disinteg’s terraria-api ran out of memory twice since 19:31, and the 03:00 backup timed out.</div></div>
      <form class="composer" data-form="ask"><label class="field"><input id="ask-in" type="text" placeholder="Ask about anything you run" autocomplete="off"></label><button class="round sm on" aria-label="Send">${ic('i-send', 's')}</button></form>`;
  }
  function sheetSms() {
    if (!ui.smsUnlocked) return `<div class="sheet-head"><div><h2 id="sheet-title">Operator messages</h2><p>The router keeps these behind its admin password</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <form class="stack" data-form="unlock"><label class="field">${ic('i-lock', 's')}<input id="pw" type="password" placeholder="Router admin password" autocomplete="off"></label><button class="btn go block">unlock</button></form>`;
    return `<div class="sheet-head"><div><h2 id="sheet-title">Operator messages</h2><p>Unlocked for this session</p></div><button class="iconbtn" data-act="close" aria-label="Close">${ic('i-x')}</button></div>
      <div class="group">${D.router.sms.map((s, i) => `<div class="row"><span class="row-icon net">${ic('i-sms', 's')}</span><span class="row-text"><span class="row-title">${s.from} · ${s.at}</span><span class="row-sub wrap">${esc(s.text)}</span></span><button class="btn sm danger" data-act="sms-del" data-i="${i}">Delete</button></div>`).join('')}</div>
      <form class="composer" data-form="sms"><label class="field"><input id="sms-in" type="text" placeholder="Text to WE (e.g. *550#)" autocomplete="off"></label><button class="round sm on" aria-label="Send">${ic('i-send', 's')}</button></form>`;
  }

  let sheetFn = null, lastFocus = null;
  function openSheet(fn) {
    sheetFn = fn; lastFocus = document.activeElement;
    const sh = $('#sheet'), sc = $('#scrim');
    $('#sheetbody').innerHTML = fn();
    $('#sheetbody').scrollTop = 0;
    sh.hidden = false; sc.hidden = false;
    requestAnimationFrame(() => { sh.classList.add('in'); sc.classList.add('in'); });
    setTimeout(() => sh.focus({ preventScroll: true }), 60);
  }
  function refreshSheet() { if (sheetFn && !$('#sheet').hidden) { const st = $('#sheetbody').scrollTop; $('#sheetbody').innerHTML = sheetFn(); $('#sheetbody').scrollTop = st; } }
  function closeSheet() {
    const sh = $('#sheet'), sc = $('#scrim');
    if (sh.hidden) return;
    sh.classList.remove('in'); sc.classList.remove('in'); sh.style.transform = '';
    setTimeout(() => { sh.hidden = true; sc.hidden = true; sheetFn = null; }, 380);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }
  // drag to close on the phone sheet
  (function () {
    const grab = $('#sheetgrab'), sh = $('#sheet'); let y0 = null, dy = 0;
    grab.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; sh.classList.add('dragging'); grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 == null) return; sh.classList.remove('dragging'); y0 = null; if (dy > 110) closeSheet(); else sh.style.transform = ''; };
    grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
  })();

  /* ------------------------------------------------------------ idle clock */
  function openIdle() {
    const el = $('#idle');
    el.innerHTML = `<button class="iconbtn idle-close" data-act="idle-close" aria-label="Close the clock">${ic('i-x')}</button>
      <div class="idle-obj"><div data-obj="clock" style="position:absolute;inset:0"></div></div>
      <div class="idle-time">${clockHtml()}</div>
      <div class="ticks" data-live>${ticksHtml(now().getSeconds())}</div>
      <div class="idle-facts"><span>${dateLine()}</span><span>${D.ntp.zone}</span><span>Source <b>${D.ntp.source}</b></span><span>Offset <b>±${D.ntp.offsetMs} ms</b></span><span>Rate <b>${D.ntp.rateMs} ms/day</b></span></div>
      <div class="idle-bar"><button class="chip sm" data-act="pref-h12" aria-pressed="${prefs.h12}">12 h</button><button class="chip sm" data-act="pref-ar" aria-pressed="${prefs.arabic}">٣ Arabic</button><button class="chip sm" data-act="hold" aria-pressed="${prefs.held}">Hold still <kbd>L</kbd></button><button class="chip sm" data-act="fullscreen">${ic('i-expand', 's')}Full screen</button></div>`;
    el.hidden = false;
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  }
  const closeIdle = () => { $('#idle').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };

  /* ------------------------------------------------------------ palette */
  const PAL_ITEMS = () => [
    { t: 'Now', s: 'Page', i: 'i-now', go: '#now' }, { t: 'Home', s: 'Page', i: 'i-home', go: '#home' },
    { t: 'Machines', s: 'Page', i: 'i-machines', go: '#machines', sub: ['machines', 'hosts'] }, { t: 'Services', s: 'Machines', i: 'i-box', go: '#machines', sub: ['machines', 'services'] },
    { t: 'Network', s: 'Machines', i: 'i-signal', go: '#machines', sub: ['machines', 'network'] }, { t: 'Agent', s: 'Page', i: 'i-agent', go: '#agent' },
    { t: 'Claude sessions', s: 'Agent', i: 'i-terminal', go: '#agent', sub: ['agent', 'claude'] }, { t: 'Workflows', s: 'Agent', i: 'i-flow', go: '#agent', sub: ['agent', 'workflows'] },
    { t: 'Me and notifications', s: 'Page', i: 'i-me', go: '#me' },
    ...D.hosts.map(h => ({ t: h.name, s: 'Machine', i: 'i-machines', act: () => openSheet(() => sheetHost(h.id)) })),
    ...D.hosts.filter(h => h.remote).map(h => ({ t: `Desktop on ${h.name}`, s: 'Remote', i: 'i-desktop', act: () => openSheet(() => sheetRemote(h.id, 'desktop')) })),
    { t: D.home.ac.on ? 'Turn the AC off' : 'Turn the AC on', s: 'Action', i: 'i-power', act: () => act('ac-power') },
    ...D.home.scenes.map(s => ({ t: `Scene: ${s.name}`, s: 'Action', i: s.icon, act: () => runScene(s.id) })),
    { t: 'Restart terraria-api', s: 'Action', i: 'i-restart', act: () => restartSvc('terraria-api') },
    { t: 'Open the clock', s: 'Action', i: 'i-clock', act: openIdle }, { t: 'Ask Odysseus', s: 'Action', i: 'i-chat', act: () => openSheet(sheetAsk) },
    { t: 'Now playing', s: 'Music', i: 'i-music', act: openPlayer },
    ...D.desk.map(d => ({ t: d.name, s: 'Desk', i: d.icon, act: () => openSheet(() => sheetDesk(d.id)) })),
  ];
  let palSel = 0, palList = [];
  function renderPalette() {
    const q = $('#palette-q').value.toLowerCase().trim();
    palList = PAL_ITEMS().filter(x => !q || (x.t + ' ' + x.s).toLowerCase().includes(q)).slice(0, 12);
    palSel = Math.min(palSel, Math.max(0, palList.length - 1));
    $('#palette-list').innerHTML = palList.length ? palList.map((x, i) => `<li role="option" data-i="${i}" aria-selected="${i === palSel}"><span class="row-icon">${ic(x.i)}</span>${esc(x.t)}<small>${x.s}</small></li>`).join('') : `<li aria-disabled="true">Nothing matches. Try a machine, a page or an action.</li>`;
  }
  function openPalette() { $('#palette').hidden = false; $('#palette-q').value = ''; palSel = 0; renderPalette(); $('#palette-q').focus(); }
  const closePalette = () => { $('#palette').hidden = true; };
  function runPal(i) {
    const x = palList[i]; if (!x) return; closePalette();
    if (x.sub) ui[x.sub[0]] = x.sub[1];
    if (x.go) { if (location.hash === x.go) render(); else location.hash = x.go; }
    if (x.act) x.act();
  }
  $('#palette-q').addEventListener('input', () => { palSel = 0; renderPalette(); });
  $('#palette-q').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palList.length - 1); renderPalette(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); renderPalette(); e.preventDefault(); }
    if (e.key === 'Enter') runPal(palSel);
  });
  $('#palette-list').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); li && runPal(+li.dataset.i); });
  $('#palette').addEventListener('click', e => { if (e.target.id === 'palette') closePalette(); });

  /* ------------------------------------------------------------ actions */
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ic('i-check') + esc(msg);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 240); }, 2400);
  }
  function restartSvc(name) {
    ui.restarting = name; render(); refreshSheet();
    setTimeout(() => {
      const s = D.services.find(x => x.name === name) || D.agent.services.find(x => x.name === name);
      if (s) { s.state = 'ok'; s.note = 'restarted just now'; }
      D.alerts = D.alerts.filter(a => a.service !== name);
      D.hosts.forEach(h => { if (h.name === 'disinteg' && !D.alerts.length) h.status = h.disk >= 90 ? 'ok' : 'ok'; });
      ui.restarting = null; render(); refreshSheet(); toast(`${name} restarted`);
    }, 1400);
  }
  function runScene(id) {
    const ac = D.home.ac;
    if (id === 'cool') Object.assign(ac, { on: true, set: 22, fan: 'high', mode: 'cool' });
    if (id === 'sleep') Object.assign(ac, { on: true, set: 26, fan: 'low', mode: 'cool' });
    if (id === 'away') Object.assign(ac, { on: false });
    if (id === 'dry') Object.assign(ac, { on: true, set: 25, mode: 'dry', fan: 'auto' });
    render(); toast(`${D.home.scenes.find(s => s.id === id).name} is on`);
  }
  function reply(thread, text, who = 'them') { const b = document.createElement('div'); b.className = 'bubble ' + who; b.textContent = text; thread.appendChild(b); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  const ANSWERS = {
    'Why did terraria-api restart?': 'It ran out of heap at 19:58 and 20:02. Its memory grew about 40 MB a minute after the 19:31 start. Restarting clears it for an hour or so; raising --max-old-space-size or fixing the world cache would stop it.',
    'Cool the flat to 23°': 'Done. The living room AC is cooling to 23° on auto fan.',
    'What failed overnight?': 'One thing: Daily backup to NVME timed out after 5 minutes at 03:00. The NVME was mounted read-only after the 02:40 suspend. Remount it and run the workflow again?',
  };

  function act(a, el = {}) {
    const d = el.dataset || {};
    const ac = D.home.ac;
    switch (a) {
      case 'close': closeSheet(); break;
      case 'palette': openPalette(); break;
      case 'notifs': openSheet(sheetNotifs); break;
      case 'ask': openSheet(sheetAsk); break;
      case 'player': openPlayer(); break;
      case 'idle': openIdle(); break;
      case 'idle-close': closeIdle(); break;
      case 'hold': prefs.held = !prefs.held; savePrefs(); el.setAttribute('aria-pressed', prefs.held); if (!prefs.held) tickClock(); break;
      case 'fullscreen': (document.fullscreenElement ? document.exitFullscreen() : $('#idle').requestFullscreen()).catch(() => toast('Full screen is not available here')); break;
      case 'pref-h12': prefs.h12 = !prefs.h12; savePrefs(); render(); if (!$('#idle').hidden) openIdle(); break;
      case 'pref-ar': prefs.arabic = !prefs.arabic; savePrefs(); render(); if (!$('#idle').hidden) openIdle(); break;
      case 'ac-power': ac.on = !ac.on; render(); toast(ac.on ? `AC on, cooling to ${ac.set}°` : 'AC off'); break;
      case 'ac-temp': ac.set = Math.max(16, Math.min(30, ac.set + +d.d)); render(); break;
      case 'ac-mode': ac.mode = d.v; render(); break;
      case 'ac-fan': ac.fan = d.v; render(); break;
      case 'scene': runScene(d.id); break;
      case 'auto-toggle': { const x = D.home.automations.find(z => z.id === d.id); x.on = !x.on; el.setAttribute('aria-checked', x.on); break; }
      case 'presence': toast('Last fix 2 min ago, ±12 m. Fixes over 500 m are ignored.'); break;
      case 'desk': openSheet(() => sheetDesk(d.id)); break;
      case 'dpi': D.desk[0].settings.stage = +d.v; D.desk[0].detail = `${D.desk[0].settings.dpi[+d.v]} DPI · stage ${+d.v + 1} of 4`; refreshSheet(); render(); toast(`DPI set to ${D.desk[0].settings.dpi[+d.v]}, read back`); break;
      case 'poll': D.desk[0].settings.poll = +d.v; refreshSheet(); toast(`Polling ${d.v} Hz, read back`); break;
      case 'anc': D.desk[2].settings.anc = d.v; D.desk[2].detail = `Noise ${d.v === 'off' ? 'control off' : d.v === 'transparency' ? 'transparency' : 'cancelling ' + d.v}`; refreshSheet(); render(); break;
      case 'dset': { const s = D.desk.find(x => x.id === d.id).settings; s[d.k] = !s[d.k]; el.setAttribute('aria-checked', s[d.k]); break; }
      case 'sub': ui[d.page] = d.v; render(); break;
      case 'svc-host': ui.svcHost = d.v; render(); break;
      case 'restart-svc': restartSvc(d.name); break;
      case 'mute-alert': D.alerts = D.alerts.filter(x => x.id !== d.id); render(); toast('Muted for 1 hour'); break;
      case 'host': openSheet(() => sheetHost(d.id)); break;
      case 'remote': { const fn = () => sheetRemote(d.id, d.mode); if (!$('#sheet').hidden) { sheetFn = fn; refreshSheet(); } else openSheet(fn); break; }
      case 'range': ui.range = d.v; render(); break;
      case 'data-toggle': D.router.data = !D.router.data; render(); toast(D.router.data ? 'Mobile data on' : 'Mobile data off'); break;
      case 'router-restart': ui.confirm = 'router'; render(); break;
      case 'router-restart-go': ui.confirm = null; render(); toast('Router restarting. Back in about 90 s'); break;
      case 'confirm-cancel': ui.confirm = null; render(); break;
      case 'sms': openSheet(sheetSms); break;
      case 'sms-del': D.router.sms.splice(+d.i, 1); refreshSheet(); toast('Message deleted'); break;
      case 'revoke': ui.confirm = d.id; render(); break;
      case 'revoke-go': D.trusted = D.trusted.filter(x => x.id !== d.id); ui.confirm = null; render(); toast('Device revoked'); break;
      case 'route-ch': { const r = D.routing.find(x => x.id === d.id); r[d.ch] = !r[d.ch]; el.setAttribute('aria-pressed', r[d.ch]); break; }
      case 'wf-toggle': { const w = D.agent.workflows.find(x => x.id === d.id); w.on = !w.on; el.setAttribute('aria-checked', w.on); renderNav(); break; }
      case 'rerun': toast(`${d.name} started`); break;
      case 'session': openSheet(() => sheetSession(d.id)); break;
      case 'stop-session': { const s = D.agent.sessions.find(x => x.id === d.id); s.state = 'done'; s.age = 'stopped just now'; refreshSheet(); render(); toast('Session stopped'); break; }
      case 'new-session': openSheet(sheetNewSession); break;
      case 'start-session': { const p = $('#ns-p').value.trim() || 'New session'; D.agent.sessions.unshift({ id: 's' + Date.now(), name: p.slice(0, 40), dir: $('#ns-dir').value, state: 'running', age: 'just now', acct: 'personal', log: ['Starting in ' + $('#ns-dir').value + '…'] }); closeSheet(); render(); toast('Session started'); break; }
      case 'ask-q': { const th = $('#thread'); reply(th, d.q, 'me'); setTimeout(() => { reply(th, ANSWERS[d.q] || 'Looking…'); if (d.q.includes('23°')) { ac.on = true; ac.set = 23; render(); } }, 650); break; }
      case 'activity': toast(d.title); break;
      case 'signout': toast('Signed out (prototype)'); break;
      case 'toast': toast(d.msg); break;
      case 'mu-play': D.music.playing = !D.music.playing; renderPlayers(); refreshSheet(); break;
      case 'mu-next': case 'mu-prev': { const q = D.music.queue; if (a === 'mu-next') { const n = q.shift(); q.push({ t: D.music.title, a: D.music.artist }); D.music.title = n.t; D.music.artist = n.a; } D.music.at = 0; renderPlayers(); refreshSheet(); break; }
      case 'mu-shuffle': D.music.shuffle = !D.music.shuffle; refreshSheet(); break;
      case 'mu-repeat': D.music.repeat = !D.music.repeat; refreshSheet(); break;
      case 'mu-dev': D.music.device = d.v; renderPlayers(); refreshSheet(); toast(`Playing on ${d.v}`); break;
    }
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('a.tile-link[data-sub]'); if (link) ui.machines = link.dataset.sub;
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'A' && el.dataset.act === 'host') e.preventDefault();
    e.stopPropagation();
    act(el.dataset.act, el);
  });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { if (!$('#palette').hidden) closePalette(); else if (!$('#idle').hidden) closeIdle(); else closeSheet(); return; }
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); return; }
    if (typing) return;
    if (e.key === 'a' && $('#sheet').hidden) { e.preventDefault(); openSheet(sheetAsk); }
    if (e.key === 'l' && !$('#idle').hidden) { const b = $('#idle [data-act="hold"]'); act('hold', b); }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement.matches('.clock-tile')) { e.preventDefault(); openIdle(); }
  });
  document.addEventListener('submit', e => {
    const f = e.target; e.preventDefault();
    if (f.dataset.form === 'term') {
      const i = $('#term-in'), v = i.value.trim(); if (!v) return; const t = $('#term');
      const out = { ls: 'Code  Downloads  Music  stream-diag.log', whoami: 'ojee', 'df -h /': 'Filesystem  Size  Used Avail Use% Mounted on\n/dev/sda2   228G  207G   21G  91% /' }[v] || `${v.split(' ')[0]}: ran (prototype)`;
      t.innerHTML = t.innerHTML.replace(/:~\$ $/, `:~$ ${esc(v)}\n${esc(out)}\n<span class="p">ojee@${t.textContent.match(/ojee@([\w-]+)/)[1]}</span>:~$ `); i.value = ''; t.scrollTop = t.scrollHeight;
    }
    if (f.dataset.form === 'session') { const i = $('#sess-in'), v = i.value.trim(); if (!v) return; const s = D.agent.sessions.find(x => x.id === f.dataset.id); s.log.push('You: ' + v); reply($('#thread'), v, 'me'); i.value = ''; setTimeout(() => { reply($('#thread'), 'Got it. Carrying on.'); if (s.state === 'waiting') { s.state = 'running'; render(); } }, 700); }
    if (f.dataset.form === 'ask') { const i = $('#ask-in'), v = i.value.trim(); if (!v) return; reply($('#thread'), v, 'me'); i.value = ''; setTimeout(() => reply($('#thread'), ANSWERS[v] || 'In the real console Odysseus answers here, from what every module reports.'), 650); }
    if (f.dataset.form === 'unlock') { if (!$('#pw').value) { $('#pw').placeholder = 'Type the router’s admin password'; $('#pw').focus(); return; } ui.smsUnlocked = true; refreshSheet(); render(); }
    if (f.dataset.form === 'sms') { const i = $('#sms-in'); if (i.value.trim()) { toast('Sent to WE'); i.value = ''; } }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'svc-q') { ui.svcQ = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#svc-q'); n.focus(); n.setSelectionRange(pos, pos); }
    if (e.target.id === 'proc-q') { ui.procQ = e.target.value; const pos = e.target.selectionStart; refreshSheet(); const n = $('#proc-q'); n.focus(); n.setSelectionRange(pos, pos); }
    if (e.target.id === 'mu-vol') { D.music.volume = +e.target.value; $('[data-vol]').textContent = e.target.value; }
    if (e.target.id === 'act-r') { D.desk[1].settings.actuation = +e.target.value; $('[data-act-v]').textContent = (+e.target.value).toFixed(1) + ' mm'; }
  });
  $('#scrim').addEventListener('click', closeSheet);

  /* scrub a grille to read a column */
  function scrub(g, x) {
    const vals = g.dataset.vals.split(',').map(Number), r = g.querySelector('svg').getBoundingClientRect();
    const i = Math.max(0, Math.min(vals.length - 1, Math.floor((x - r.left) / r.width * vals.length)));
    g.querySelectorAll('g.col-hot').forEach(c => c.classList.remove('col-hot'));
    g.querySelector(`g[data-i="${i}"]`).classList.add('col-hot');
    g.querySelector('[data-read]').textContent = `${vals[i]}${g.dataset.unit}${i === vals.length - 1 ? ' now' : ''}`;
  }
  function unscrub(g) {
    const vals = g.dataset.vals.split(',');
    g.querySelectorAll('g.col-hot').forEach(c => c.classList.remove('col-hot'));
    g.querySelector('[data-read]').textContent = `${vals[vals.length - 1]}${g.dataset.unit} now`;
  }
  document.addEventListener('pointermove', e => { const g = e.target.closest && e.target.closest('.grille[data-vals]'); if (g) scrub(g, e.clientX); });
  document.addEventListener('pointerout', e => { const g = e.target.closest && e.target.closest('.grille[data-vals]'); if (g && !g.contains(e.relatedTarget)) unscrub(g); });

  /* the thermostat dial: drag up or around to turn, arrow keys step a degree */
  function setDial(v, live) {
    const ac = D.home.ac; ac.set = Math.max(16, Math.min(30, v));
    const d = $('#dial'); if (d) { d.dataset.value = ac.set; d.setAttribute('aria-valuenow', ac.set); }
    const n = $('.setpoint .num'); if (n) n.textContent = ac.set + '°';
    if (!live) render();
  }
  let dialDrag = null;
  document.addEventListener('pointerdown', e => {
    const d = e.target.closest && e.target.closest('#dial'); if (!d) return;
    dialDrag = { y: e.clientY, x: e.clientX, v: D.home.ac.set }; d.setPointerCapture(e.pointerId); e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!dialDrag) return;
    const dv = Math.round(((dialDrag.y - e.clientY) + (e.clientX - dialDrag.x)) / 16);
    if (dialDrag.v + dv !== D.home.ac.set) { setDial(dialDrag.v + dv, true); try { navigator.vibrate && navigator.vibrate(4); } catch (err) {} }
  });
  document.addEventListener('pointerup', () => { if (!dialDrag) return; const changed = dialDrag.v !== D.home.ac.set; dialDrag = null; setDial(D.home.ac.set, false); if (changed) toast(`AC set to ${D.home.ac.set}°`); });
  document.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement.id === 'dial') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setDial(D.home.ac.set + 1, false); $('#dial').focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setDial(D.home.ac.set - 1, false); $('#dial').focus(); }
    }
  });

  /* ------------------------------------------------------------ render */
  const PAGES = { now: pageNow, home: pageHome, machines: pageMachines, agent: pageAgent, me: pageMe };
  let lastRoute = null;
  function render() {
    const r = route(), main = $('#main'), y = scrollY;
    main.innerHTML = PAGES[r]();
    if (r === lastRoute) { main.firstElementChild.style.animation = 'none'; scrollTo(0, y); } else { scrollTo(0, 0); }
    lastRoute = r;
    renderNav();
    document.title = (r === 'now' ? '' : ROUTES.find(x => x.id === r).label + ' · ') + 'ojee.console';
  }
  addEventListener('hashchange', () => { closeSheet(); render(); });

  render(); renderPlayers();
  setInterval(tickClock, 250);
  setInterval(() => {
    const m = D.music; if (!m.playing) return;
    m.at = Math.min(m.len, m.at + 1); if (m.at >= m.len) m.at = 0;
    $$('[data-prog]').forEach(e => e.style.width = (m.at / m.len * 100) + '%');
    const a = $('[data-at]'); if (a) a.textContent = mmss(m.at);
  }, 1000);
})();
