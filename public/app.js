/* ============================================================
   ojee.console — the shell runtime (2026-11 redesign).

   The shell owns four things: auth (server side), chrome, routing, and
   knowing whether modules are up. Every screen except Overview and
   Settings comes from a module: the shell fetches each manifest, builds
   one nav, imports the module's UI and hands it a root element and ctx.

     export default {
       async mount(el, ctx) { ... },   // render into el
       async setView(view) { ... },    // optional: switch view in place
       async unmount() { ... },
     }

   Chrome: a sidebar at ≥1200px; below that a top bar and a bottom tab
   bar. One of the two is always on screen. ⌘K / Ctrl+K / "/" opens the
   command palette. The bell opens the one inbox (inbox.js).
   ============================================================ */
import { esc, icon, toast, modal, relTime, ModuleHost, parseHash, makeApi } from '/chrome.js';
import { ic, mv, tag, spark, placeSegs, col, ago, openSheet } from '/ojee-ui3.js';
import * as nativeBridge from '/native.js';
import * as inbox from '/inbox.js';
import * as settingsPage from '/settings.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  modules: [],
  branding: null,
  session: null,
  summaries: new Map(),   // moduleId -> summary (+ _at)
  active: { module: null, view: null },
  lastRoute: null,
  updatedAt: 0,
};

/* Default nav icons for the modules this console knows; a manifest `icon` wins. */
const MODULE_ICONS = {
  fleet: 'i-server', remote: 'i-monitor', agent: 'i-term', router: 'i-wifi', home: 'i-house',
  peripherals: 'i-mouse', health: 'i-heart', music: 'i-music', demo: 'i-box',
};
// The console's own modules keep the console's icons (Claude is a terminal, not a chip).
const moduleIcon = (m) => MODULE_ICONS[m?.id] || m?.icon || 'i-box';
const usable = (m) => m && (m.status === 'ready' || (m.status === 'degraded' && !!m.ui));
const navModules = () => state.modules.filter((m) => m.enabled && m.nav !== false);
const modById = (id) => state.modules.find((m) => m.id === id);

/* ── module host ────────────────────────────────────────────────────── */
const host = new ModuleHost({
  el: null,
  base: '',
  onUnauthorized: () => location.reload(),
  // ctx.header: the page header the shell draws above a module.
  //   ctx.header.setSub(text)   the line under the title (defaults to the summary headline)
  //   ctx.header.actions        an element in the header's right side, for the module's buttons
  extendCtx: () => ({
    header: {
      setSub: (t) => { const p = $('#phead .ph p'); if (p) p.textContent = t || ''; },
      get actions() { return $('#phead .acts'); },
    },
    // ctx.sheet({ title, sub, body, actions, width }) — side sheet on desktop,
    // bottom sheet on phones (ojee-ui3 openSheet). Returns { el, body, close, done }.
    sheet: (opts) => openSheet(opts),
    ui3: true,
  }),
});

/* ── theme ──────────────────────────────────────────────────────────── */
export function applyTheme(t, { animate = true } = {}) {
  const d = document.documentElement;
  if (animate) d.classList.add('theming');
  if (t === 'system') d.removeAttribute('data-theme'); else d.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#0a0a0a' : '#fafafa'; m.removeAttribute('media'); });
  try { localStorage.setItem('ojee.theme', t); } catch { /* private mode */ }
  nativeBridge.setTheme?.(dark ? 'dark' : 'light');
  if (animate) setTimeout(() => d.classList.remove('theming'), 260);
}
export async function setTheme(t) {
  applyTheme(t);
  await fetch('/api/ui', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
}
const currentTheme = () => { try { return localStorage.getItem('ojee.theme') || 'dark'; } catch { return 'dark'; } };

/* ── chrome ─────────────────────────────────────────────────────────── */
function wordmark() {
  const b = state.branding || {};
  return `<a class="wm" href="#/" aria-label="${esc(`${b.wordmark || 'ojee'}${b.wordmarkAccent || '.'}${b.wordmarkTail || 'console'}`)} — Overview">${esc(b.wordmark || 'ojee')}<b>${esc(b.wordmarkAccent || '.')}</b><span>${esc(b.wordmarkTail || 'console')}</span></a>`;
}

/** Open inbox items per module, for nav counts. */
function moduleCounts() {
  const out = new Map();
  for (const it of inbox.snapshot().open || []) {
    const id = it.module === 'console' ? (it.route || '').replace(/^#\//, '').split('/')[0] : it.module;
    const c = out.get(id) || { n: 0, err: false };
    c.n += 1;
    if (it.blocking || it.severity === 'critical') c.err = true;
    if (it.severity === 'warn') c.warn = true;
    out.set(id, c);
  }
  return out;
}

function navState(m) {
  if (!m.enabled) return 'disabled';
  if (m.status === 'ready') return 'ok';
  if (m.quietOffline && (m.status === 'unreachable' || m.status === 'degraded')) return 'offline';
  return 'down';
}

function quietLine() {
  const q = inbox.snapshot().quiet;
  if (!q || !q.on) return 'Quiet hours off';
  return q.active ? `Quiet until ${q.to}` : `Quiet hours from ${q.from}`;
}

function renderSide() {
  const counts = moduleCounts();
  const where = state.active.module;
  const nOpen = (inbox.snapshot().open || []).length;
  const errOpen = (inbox.snapshot().open || []).some((x) => x.blocking || x.severity === 'critical');
  const user = state.session?.user ? String(state.session.user).split('@')[0] : '';
  $('#side').innerHTML = `
    ${wordmark()}
    <button class="kbtn" type="button" data-act="palette">${ic('search', 's')}<span>Search or run…</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl '}K</kbd></button>
    <a class="nav" href="#/" ${where === null ? 'aria-current="page"' : ''}>${ic('grid')}<span>Overview</span></a>
    ${navModules().map((m) => {
      const s = navState(m);
      const c = counts.get(m.id);
      const title = s === 'down' ? ` title="${esc(m.reason || 'Not responding')}"` : s === 'offline' ? ' title="Offline"' : '';
      return `<a class="nav${s === 'down' ? ' down' : ''}${s === 'offline' ? ' offline' : ''}" href="#/${esc(m.id)}" ${where === m.id ? 'aria-current="page"' : ''}${title}>${ic(s === 'down' ? 'i-warn' : moduleIcon(m))}<span>${esc(m.name)}</span>${c ? `<span class="cnt${c.err ? ' err' : c.warn ? ' warn' : ''}">${c.n}</span>` : s === 'offline' ? '<span class="off">offline</span>' : ''}</a>`;
    }).join('')}
    <div class="grow"></div>
    <button class="nav" type="button" data-act="inbox" aria-expanded="${inbox.isOpen()}" aria-controls="inbox">${ic('inbox')}<span>Inbox</span>${nOpen ? `<span class="cnt${errOpen ? ' err' : ' warn'}">${nOpen}</span>` : ''}</button>
    <a class="nav" href="#/settings" ${where === 'settings' ? 'aria-current="page"' : ''}>${ic('sliders')}<span>Settings</span></a>
    <div class="side-foot">
      <div class="ln">${ic('moon')}<span>${esc(quietLine())}</span></div>
      ${user ? `<div class="ln">${ic('user')}<span>${esc(user)}</span></div>` : ''}
    </div>`;
}

/** Bottom tabs: five at most. With more destinations, the rest go under More. */
function tabPlan() {
  const mods = navModules();
  if (mods.length + 2 <= 5) return { tabs: mods, more: [], settingsTab: true };
  return { tabs: mods.slice(0, 3), more: mods.slice(3), settingsTab: false };
}

function renderTopbar() {
  const open = inbox.snapshot().open || [];
  const err = open.some((x) => x.blocking || x.severity === 'critical');
  const { settingsTab } = tabPlan();
  $('#topbar').innerHTML = `
    ${wordmark()}
    <button class="ib" type="button" data-act="palette" aria-label="Search or run">${ic('search', 'l')}</button>
    <button class="ib${inbox.isOpen() ? ' on' : ''}" type="button" data-act="inbox" aria-label="Inbox, ${open.length} open" aria-expanded="${inbox.isOpen()}">${ic('bell', 'l')}${open.length ? `<span class="bdg${err ? '' : ' warn'}"></span>` : ''}</button>
    ${settingsTab ? '' : `<a class="ib" href="#/settings" aria-label="Settings">${ic('sliders', 'l')}</a>`}`;
}

function renderTabbar() {
  const counts = moduleCounts();
  const where = state.active.module;
  const { tabs, more, settingsTab } = tabPlan();
  const inMore = more.some((m) => m.id === where) || (!settingsTab && where === 'settings');
  const moreBadge = more.some((m) => counts.get(m.id));
  $('#tabbar').innerHTML = `
    <a class="tab" href="#/" ${where === null ? 'aria-current="page"' : ''}>${ic('grid')}<span>Overview</span></a>
    ${tabs.map((m) => {
      const s = navState(m);
      return `<a class="tab${s === 'down' ? ' down' : ''}" href="#/${esc(m.id)}" ${where === m.id ? 'aria-current="page"' : ''}>${ic(moduleIcon(m))}<span>${esc(m.name)}</span>${counts.get(m.id) ? `<span class="bdg${counts.get(m.id).err ? '' : ' warn'}"></span>` : ''}</a>`;
    }).join('')}
    ${settingsTab
      ? `<a class="tab" href="#/settings" ${where === 'settings' ? 'aria-current="page"' : ''}>${ic('sliders')}<span>Settings</span></a>`
      : `<button class="tab" type="button" data-act="more" ${inMore ? 'aria-current="page"' : ''} aria-expanded="${moreOpen}" aria-controls="more">${ic('more')}<span>More</span>${moreBadge ? '<span class="bdg warn"></span>' : ''}</button>`}`;
}

function renderChrome() {
  renderSide();
  renderTopbar();
  renderTabbar();
  if (moreOpen) paintMore();
}

/* ── More sheet (phones and portrait) ───────────────────────────────── */
let moreOpen = false;
function paintMore() {
  const { more } = tabPlan();
  const where = state.active.module;
  const row = (href, iconName, name, sub, cur, s) => `
    <a class="row" href="${href}" ${cur ? 'aria-current="page"' : ''}>
      <span class="sic">${ic(iconName)}</span>
      <span class="grow"><span class="t">${esc(name)}</span>${sub ? `<span class="d">${sub}</span>` : ''}</span>
      ${s || ''}${ic('chev', 's')}</a>`;
  $('#more').innerHTML = `<div class="grab" data-grab><i></i></div>
    <div class="ih"><h2>More</h2><button class="ib" type="button" data-act="more-close" aria-label="Close">${ic('x')}</button></div>
    <div class="ibody rows">
      ${more.map((m) => {
        const s = navState(m);
        const sum = state.summaries.get(m.id);
        const sub = s === 'offline' ? 'Offline' : s === 'down' ? esc(m.reason || 'Not responding') : esc(sum?.headline || '');
        return row(`#/${esc(m.id)}`, moduleIcon(m), m.name, sub, where === m.id, s === 'down' ? '<span class="dot err"></span>' : '');
      }).join('')}
      ${row('#/settings', 'i-sliders', 'Settings', 'Notifications, theme, devices', where === 'settings')}
    </div>`;
}
function setMore(open) {
  if (open === moreOpen) return;
  if (open) inbox.close();
  moreOpen = open;
  const el = $('#more');
  if (open) { paintMore(); void el.offsetWidth; }
  el.classList.toggle('open', open);
  el.setAttribute('aria-hidden', String(!open));
  $('#scrim').classList.toggle('on', open || inbox.isOpen());
  renderTabbar();
  if (open) el.querySelector('[data-act="more-close"]')?.focus({ preventScroll: true, focusVisible: false });
  else el.style.transform = '';
}
inbox.bindSheetDrag($('#more'), () => setMore(false));

/* ── page header ────────────────────────────────────────────────────── */
function pageHeader(title, sub, acts = '') {
  return `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="acts">${acts}</div></div>`;
}

function renderModuleHeader(m) {
  const sum = state.summaries.get(m.id);
  if (m.header === false) { $('#phead').innerHTML = ''; return; }
  $('#phead').innerHTML = pageHeader(m.name, sum?.headline || '');
}

function renderVtabs(m) {
  const nav = $('#vtabs');
  const views = (m?.views || []).filter((v) => !v.hidden);
  if (!m || views.length < 2 || m.viewTabs === false) { nav.hidden = true; nav.innerHTML = ''; return; }
  nav.hidden = false;
  nav.innerHTML = views.map((v) => `<a href="#/${esc(m.id)}/${esc(v.id)}" ${state.active.view === v.id ? 'aria-current="page"' : ''}>${esc(v.label)}</a>`).join('');
  nav.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function setTitle() {
  const { module, view } = state.active;
  const parts = ['ojee.console'];
  if (module === 'settings') parts.push('settings');
  else if (module) {
    const m = modById(module);
    parts.push((m?.name || module).toLowerCase());
    const label = m?.views?.find((v) => v.id === view)?.label;
    if (label && label.toLowerCase() !== (m?.name || '').toLowerCase()) parts.push(label.toLowerCase());
  } else parts.push('overview');
  document.title = parts.reverse().join(' · ');
}

/* ── overview ───────────────────────────────────────────────────────── */
const sevOf = (it) => (it.blocking || it.severity === 'critical' || it.severity === 'err' ? 'err' : it.severity === 'warn' ? 'warn' : 'n');
const KIND_ICONS = [[/question|ask|input|permission|needs/i, 'i-ask'], [/temp|heat|therm/i, 'i-temp'], [/login|auth|account/i, 'i-login'], [/data|plan|quota|pace|usage/i, 'i-gauge'], [/down|offline|unreach|respond/i, 'i-power'], [/disk|storage/i, 'i-archive'], [/battery/i, 'i-zap']];
export const itemIcon = (it) => {
  const s = `${it.kind} ${it.kindLabel}`;
  for (const [re, name] of KIND_ICONS) if (re.test(s)) return name;
  return sevOf(it) === 'n' ? 'i-info' : 'i-alert';
};

/* Several open items of one kind from one module are one row on the
   Overview ("4 alerts from Machines" + what they are); the inbox keeps
   them apart, which is where each one is acted on. */
function groupNeeds(open) {
  const by = new Map();
  for (const it of open) {
    const k = `${it.module}|${it.kind}|${sevOf(it)}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(it);
  }
  const out = [];
  for (const list of by.values()) {
    if (list.length < 3 || list.some((x) => x.blocking)) { out.push(...list); continue; }
    const first = list[0];
    const generic = /\.(alert|other)$/.test(first.kind) || /module-down/.test(first.kind);
    out.push({
      ...first,
      group: list.map((x) => x.key),
      title: generic ? `${list.length} alerts from ${first.moduleName || first.module}` : `${list.length} × ${first.kindLabel || first.title}`,
      body: list.map((x) => x.title).join(' · '),
      count: 1,
      raisedAt: Math.max(...list.map((x) => x.raisedAt || 0)),
    });
  }
  return out;
}

function needRow(it) {
  const sev = sevOf(it);
  return `<li class="need" data-key="${esc(it.key)}">
    <span class="sev" style="--c:${col(sev)}">${ic(itemIcon(it))}</span>
    <div class="b"><div class="t"><span>${esc(it.title)}</span>${it.blocking ? tag('Blocking', 'err') : ''}${it.count > 1 ? `<span class="tag m">×${it.count}</span>` : ''}${it.group ? `<span class="tag m">×${it.group.length}</span>` : ''}</div>${it.body ? `<div class="d">${esc(it.body)}</div>` : ''}</div>
    <a class="mm m" href="#/${esc(it.module === 'console' ? '' : it.module)}">${esc(it.moduleName || it.module)} · ${esc(ago(it.raisedAt || it.lastAt))}</a>
    <div class="a">${it.route ? `<a class="btn sm${it.blocking ? ' pri' : ''}" href="${esc(it.route)}">${esc(it.action || 'Open')}</a>` : ''}<button class="btn sm ghost" type="button" data-snooze="${esc((it.group || [it.key]).join('\n'))}">${ic('clock', 's')}Snooze${it.group ? ' all' : ''}</button></div>
  </li>`;
}

/* A number reads in tabular mono; a phrase ("off at the wall") reads as text. */
const isFigure = (v) => /^[\s\d.,:%°/+\-−–—~<>×]*$/.test(String(v ?? '')) || /^[\d.,]+\s?[a-zA-Z%°/]{0,3}$/.test(String(v ?? ''));
/* "4 stopped of 43" → a mono figure and the words after it, small and dim,
   so every value in a row shares one baseline rhythm. */
function valueHTML(x) {
  const v = x.value ?? '—';
  const status = x.status && x.status !== 'ok' ? x.status : null;
  if (isFigure(v)) return mv(v, x.unit || '', status);
  const m = /^([−\-+]?[\d][\d.,:]*)\s*([a-zA-Z%°/]{0,4})\s+(.+)$/.exec(String(v)) || /^([−\-+]?[\d][\d.,:]*)\s*([a-zA-Z%°/]{0,4})$/.exec(String(v));
  if (!m) return mv(v, '', status, 'txt');
  const style = status ? ` style="--c:${col(status)}"` : '';
  return `<div class="mv"${style} title="${esc(v)}">${esc(m[1])}${m[2] ? `<span class="u">${esc(m[2])}</span>` : ''}${m[3] ? `<span class="w">${esc(m[3])}</span>` : ''}</div>`;
}
function metricCells(list) {
  return list.slice(0, 4).map((x) => `<div class="metric"><div class="ml">${esc(x.label)}</div>${valueHTML(x)}</div>`).join('')
    + Array.from({ length: Math.max(0, 2 - list.length) }, () => '<div></div>').join('');
}

function sparkCell(sp, status) {
  if (!sp || !Array.isArray(sp.points) || sp.points.filter((v) => v != null).length < 2) return '<div class="spw"></div>';
  const last = [...sp.points].reverse().find((v) => v != null);
  const s = sp.status || (status === 'err' || status === 'warn' ? status : null);
  return `<div class="spw">${spark(sp.points, { status: s && s !== 'ok' ? s : null, threshold: sp.threshold ?? null, min: sp.min ?? null, max: sp.max ?? null, height: 30, label: sp.label || '' })}
    <div class="cap"><span>${esc(sp.label || '')}</span><span class="m">${esc(sp.cap ?? (last != null ? `${Math.round(last * 10) / 10}${sp.unit || ''}` : ''))}</span></div></div>`;
}

function stLine(status, text, live) {
  return `<span class="st"><span class="dot${live ? ' live' : ''}" style="--c:${col(status)}"></span><span>${esc(text)}</span></span>`;
}

/** Quick-action chips for a module, with their state from the summary. */
function quickChips(m, sum) {
  const acts = m.quickActions || [];
  if (!acts.length || m.status !== 'ready') return '';
  const quick = sum?.quick || {};
  return `<div class="qa">${acts.map((a) => {
    const q = quick[a.id];
    const on = q && typeof q === 'object' && 'on' in q ? !!q.on : null;
    return `<button class="chip" type="button" data-qa="${esc(m.id)}:${esc(a.id)}" data-qa-label="${esc(`${m.name}: ${a.label}`)}"${on !== null ? ` aria-pressed="${on}"` : ''}>${a.icon ? ic(a.icon) : ''}<span>${esc(a.label)}</span></button>`;
  }).join('')}</div>`;
}

/** One system row; `r` is a summary or one of its `rows`. The name is the
    row's link, stretched over the row, so quick actions can sit inside it. */
function systemRow(m, r, { href, iconName, name, status, statusText, line, quick = '' } = {}) {
  const metrics = Array.isArray(r?.metrics) && r.metrics.length ? r.metrics
    : (r?.facts || []).slice(0, 4).map((f) => ({ label: f.k, value: f.v }));
  return `<div class="srow">
    <div class="n"><span class="sic">${ic(iconName)}</span><div><a class="sname stretch" href="${href}"><span>${esc(name)}</span>${r?.tag ? tag(r.tag) : ''}</a>${stLine(status, statusText)}</div></div>
    ${line ? `<div class="line">${esc(line)}</div>` : `<div class="mets">${metricCells(metrics)}</div>`}
    ${sparkCell(r?.spark, status)}
    <span class="chev">${ic('chev')}</span>
    ${quick}</div>`;
}

function systemsRows() {
  const out = [];
  for (const m of navModules()) {
    const s = navState(m);
    const sum = state.summaries.get(m.id);
    const base = { href: `#/${esc(m.id)}`, iconName: moduleIcon(m), name: m.name };
    if (s === 'offline') { out.push(systemRow(m, null, { ...base, status: 'n', statusText: 'Offline', line: 'Asleep or off the network — it comes back by itself.' })); continue; }
    if (s === 'down') { out.push(systemRow(m, null, { ...base, status: 'err', statusText: 'Not responding', line: m.reason || 'The module is not answering.' })); continue; }
    if (!m.summary) { out.push(systemRow(m, null, { ...base, status: 'ok', statusText: 'Running', line: 'Open it for details.' })); continue; }
    if (!sum) { out.push(systemRow(m, null, { ...base, status: 'n', statusText: 'Loading…', line: ' ' })); continue; }
    const status = sum.status === 'err' ? 'err' : sum.status === 'warn' ? 'warn' : 'ok';
    if (Array.isArray(sum.rows) && sum.rows.length) {
      for (const r of sum.rows.slice(0, 8)) {
        const rs = r.status === 'err' ? 'err' : r.status === 'warn' ? 'warn' : r.status === 'off' ? 'n' : 'ok';
        out.push(systemRow(m, r, {
          href: `#/${esc(m.id)}${r.view ? `/${esc(r.view)}` : ''}`,
          iconName: /^i-[a-z0-9-]+$/.test(r.icon || '') ? r.icon : base.iconName,
          name: r.name || m.name, status: rs, statusText: r.statusText || r.headline || '',
        }));
      }
      const q = quickChips(m, sum);
      if (q) out[out.length - 1] = out[out.length - 1].replace(/<\/div>$/, `${q}</div>`);
    } else {
      out.push(systemRow(m, sum, { ...base, status, statusText: sum.statusText || sum.headline || (status === 'ok' ? 'Healthy' : ''), quick: quickChips(m, sum) }));
    }
  }
  return out;
}

function renderOverview() {
  if (state.active.module !== null) return;
  const snap = inbox.snapshot();
  const open = snap.open || [];
  const errCount = open.filter((x) => sevOf(x) === 'err').length;
  const down = navModules().filter((m) => navState(m) === 'down').length;
  const sub = open.length
    ? `${open.length} ${open.length === 1 ? 'thing needs' : 'things need'} you${down ? '' : ' · everything else is healthy'}`
    : down ? `${down} ${down === 1 ? 'module is' : 'modules are'} not responding` : 'All clear · every system is healthy';
  const upd = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
  $('#phead').innerHTML = pageHeader('Overview', sub, `<span class="upd m">Updated ${esc(upd)}</span>`);
  const rows = systemsRows();
  const snoozedN = (snap.snoozed || []).length;
  $('#view').innerHTML = `
    <section class="sec">
      <div class="sh"><h2>Needs you</h2>${open.length ? `<span class="cnt${errCount ? ' err' : ' warn'}">${open.length}</span>` : ''}
        <div class="r"><button class="btn sm ghost" type="button" data-act="inbox">Open inbox${ic('chev', 's')}</button></div></div>
      <ul class="panel needs">${open.length ? groupNeeds(open).slice(0, 8).map(needRow).join('')
        : `<li class="empty ok">${ic('check')}<div>Nothing needs you.${snoozedN ? ` ${snoozedN} snoozed ${snoozedN === 1 ? 'item returns' : 'items return'} on schedule.` : ''}</div></li>`}
        ${groupNeeds(open).length > 8 ? `<li class="need more"><button class="btn sm ghost" type="button" data-act="inbox">${groupNeeds(open).length - 8} more in the inbox${ic('chev', 's')}</button></li>` : ''}</ul>
    </section>
    <section class="sec">
      <div class="sh"><h2>Systems</h2><span class="note">${rows.length} tracked · live</span></div>
      <div class="panel srows${rows.some((r) => r.includes('class="sp')) ? '' : ' nospark'}">${rows.join('') || `<div class="empty">${ic('box')}<b>No modules</b><p>Add one to config/console.json. See the README for the module contract.</p></div>`}</div>
    </section>`;
}

/* ── summaries ──────────────────────────────────────────────────────── */
async function refreshSummaries(only) {
  const mods = state.modules.filter((m) => m.enabled && m.status === 'ready' && m.summary && (!only || m.id === only));
  await Promise.all(mods.map(async (m) => {
    try {
      const res = await fetch(`/${m.id}/api/summary`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const sum = await res.json();
      sum._at = Date.now();
      state.summaries.set(m.id, sum);
    } catch { state.summaries.delete(m.id); }
  }));
  state.updatedAt = Date.now();
}

async function refreshModules({ force = false } = {}) {
  const res = await fetch(force ? '/api/modules/refresh' : '/api/modules', { method: force ? 'POST' : 'GET' });
  if (!res.ok) return;
  state.modules = (await res.json()).modules || [];
}

/* ── quick actions ──────────────────────────────────────────────────── */
async function runQuick(modId, id, label, { quiet = false } = {}) {
  try {
    const res = await fetch(`/${modId}/api/quick/${encodeURIComponent(id)}`, { method: 'POST' });
    if (!res.ok) {
      let detail = String(res.status);
      try { const j = await res.json(); detail = j.error || detail; } catch { /* not JSON */ }
      throw new Error(detail);
    }
    if (!quiet) toast('ok', label, 'Done');
  } catch (err) {
    toast('err', label, err.message || String(err));
  }
  await refreshSummaries(modId);
  if (state.active.module === null) renderOverview();
}

/* ── a module's assistant (manifest `assistant`), in the shared sheet ── */
let assistantSheet = null;
async function openAssistant(m) {
  if (assistantSheet) return;
  let mod;
  try { mod = await import(`/${m.id}${m.assistant}${m.version ? `?v=${encodeURIComponent(m.version)}` : ''}`); } catch (err) {
    console.error('[assistant] load failed', err);
    toast('err', 'The Assistant could not be loaded', '');
    return;
  }
  assistantSheet = openSheet({ title: 'Assistant', sub: m.name, flush: true, width: 520, onClose: () => { assistantSheet?.handle?.hide?.(); assistantSheet = null; } });
  try {
    assistantSheet.handle = await mod.mountAssistantModal(assistantSheet.body, {
      base: `/${m.id}`, api: makeApi(`/${m.id}`, { onUnauthorized: () => location.reload() }),
      icon, esc, toast, modal, relTime, close: () => assistantSheet?.close(),
    });
    assistantSheet?.handle?.show?.();
  } catch (err) {
    console.error('[assistant] mount failed', err);
    assistantSheet?.close();
    toast('err', 'The Assistant could not be opened', '');
  }
}

/* ── command palette ────────────────────────────────────────────────
   ⌘K / Ctrl+K / "/". Opened many times a day, so it does not animate. */
let paletteOpen = false;

function paletteItems() {
  const out = [{ group: 'Go to', label: 'Overview', hint: 'needs you · systems', icon: 'i-grid', href: '#/' }];
  for (const m of navModules()) {
    const s = navState(m);
    out.push({ group: 'Go to', label: m.name, hint: s === 'down' ? (m.reason || 'not responding') : s === 'offline' ? 'offline' : (state.summaries.get(m.id)?.headline || 'module'), icon: moduleIcon(m), href: `#/${m.id}`, down: s === 'down' });
    const views = (m.views || []).filter((v) => !v.hidden);
    if (views.length > 1) for (const v of views) out.push({ group: 'Go to', label: `${m.name} › ${v.label}`, hint: 'view', icon: v.icon && /^i-/.test(v.icon) ? v.icon : moduleIcon(m), href: `#/${m.id}/${v.id}` });
  }
  for (const m of state.modules.filter((x) => x.enabled && x.status === 'ready')) {
    const quick = state.summaries.get(m.id)?.quick || {};
    for (const a of m.quickActions || []) {
      const q = quick[a.id];
      const stateHint = q && typeof q === 'object' && 'on' in q ? (q.on ? 'on' : 'off') : typeof q === 'string' ? q : '';
      out.push({ group: 'Actions', label: `${m.name}: ${a.label}`, hint: stateHint || 'run', icon: a.icon || 'i-zap', run: () => runQuick(m.id, a.id, `${m.name}: ${a.label}`) });
    }
  }
  const asst = state.modules.find((x) => x.enabled && x.status === 'ready' && x.assistant);
  if (asst) out.push({ group: 'Actions', label: 'Ask the Assistant', hint: asst.name, icon: 'i-assistant', run: () => openAssistant(asst) });
  const theme = currentTheme();
  out.push(
    { group: 'Console', label: 'Inbox', hint: `${(inbox.snapshot().open || []).length} open`, icon: 'i-inbox', run: () => inbox.open() },
    { group: 'Console', label: 'Notification settings', hint: 'every alert kind', icon: 'i-bell', href: '#/settings/notifications' },
    { group: 'Console', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', hint: 'theme', icon: theme === 'light' ? 'i-moon' : 'i-sun', run: () => setTheme(theme === 'light' ? 'dark' : 'light') },
    { group: 'Console', label: 'Devices and sessions', hint: 'trusted devices', icon: 'i-shield', href: '#/settings/devices' },
    { group: 'Console', label: 'Re-check modules', hint: 'health probe', icon: 'i-refresh', run: async () => { await refreshModules({ force: true }); renderChrome(); route(); } },
    { group: 'Console', label: 'Settings', hint: 'all', icon: 'i-sliders', href: '#/settings' },
  );
  return out;
}

function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  inbox.close(); setMore(false);
  const all = paletteItems();
  let sel = 0;
  let shown = all;
  const opener = document.activeElement;
  const root = $('#cmdk-root');
  root.innerHTML = `<div class="cmdk-bg"><div class="cmdk" role="dialog" aria-modal="true" aria-label="Search or run">
    <div class="cmdk-in">${ic('search')}<input type="text" placeholder="Go to a module, or run an action…" aria-label="Search or run" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdk-list"><kbd>esc</kbd></div>
    <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
    <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div></div>`;
  const bg = root.firstElementChild;
  const input = root.querySelector('input');
  const list = root.querySelector('.cmdk-list');
  const score = (i, t) => {
    const l = i.label.toLowerCase();
    if (l.startsWith(t)) return 0;
    if (l.split(/[\s›:]+/).some((w) => w.startsWith(t))) return 1;
    if (l.includes(t)) return 2;
    if (i.hint.toLowerCase().includes(t)) return 3;
    return -1;
  };
  const paint = () => {
    const t = input.value.trim().toLowerCase();
    shown = t ? all.map((i) => [i, score(i, t)]).filter(([, s]) => s >= 0).sort((a, b) => a[1] - b[1]).map(([i]) => i) : all;
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    let group = null;
    list.innerHTML = shown.length ? shown.map((i, n) => {
      const head = !t && i.group !== group ? `<div class="cmdk-g" role="presentation">${esc(i.group)}</div>` : '';
      group = i.group;
      return `${head}<div class="cmdk-it${i.down ? ' down' : ''}" role="option" id="cmdk-${n}" data-n="${n}" aria-selected="${n === sel}">${ic(i.icon || 'i-chev')}<span class="lbl">${esc(i.label)}</span><span class="hint">${esc(i.hint)}</span></div>`;
    }).join('') : '<div class="cmdk-empty">Nothing matches that.</div>';
    input.setAttribute('aria-activedescendant', shown.length ? `cmdk-${sel}` : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    paletteOpen = false;
    document.removeEventListener('keydown', onKey, true);
    root.innerHTML = '';
    opener?.focus?.({ preventScroll: true });
  };
  const go = () => {
    const item = shown[sel];
    if (!item) return;
    close();
    if (item.run) item.run(); else location.hash = item.href;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); return; }
    if (e.key === 'Enter') { e.preventDefault(); go(); return; }
    if (e.key === 'Tab') e.preventDefault();
  };
  input.addEventListener('input', () => { sel = 0; paint(); });
  list.addEventListener('click', (e) => { const r = e.target.closest('[data-n]'); if (!r) return; sel = Number(r.dataset.n); go(); });
  list.addEventListener('mousemove', (e) => {
    const r = e.target.closest('[data-n]');
    if (!r || Number(r.dataset.n) === sel) return;
    list.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
    sel = Number(r.dataset.n); r.setAttribute('aria-selected', 'true');
  });
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  document.addEventListener('keydown', onKey, true);
  paint();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (paletteOpen) return; openPalette(); return; }
  if (e.key === '/' && !typing && !paletteOpen && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openPalette(); return; }
  // `a` asks the Assistant from the Overview, when a module offers one.
  if ((e.key === 'a' || e.key === 'A') && !typing && !paletteOpen && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat && state.active.module === null && !document.querySelector('.modal-backdrop, .sheet')) {
    const asst = state.modules.find((x) => x.enabled && x.status === 'ready' && x.assistant);
    if (asst) { e.preventDefault(); openAssistant(asst); return; }
  }
  if (e.key === 'Escape' && !paletteOpen && !document.querySelector('.modal-backdrop')) {
    if (inbox.isOpen()) { inbox.close(); return; }
    if (moreOpen) setMore(false);
  }
});

/* ── clicks the shell owns ──────────────────────────────────────────── */
document.addEventListener('click', async (e) => {
  const qa = e.target.closest?.('[data-qa]');
  if (qa) {
    e.preventDefault();
    const [mod, id] = qa.dataset.qa.split(':');
    qa.setAttribute('aria-busy', 'true');
    // Optimistic: a toggle flips at once and settles to what the module reports.
    if (qa.hasAttribute('aria-pressed')) qa.setAttribute('aria-pressed', String(qa.getAttribute('aria-pressed') !== 'true'));
    await runQuick(mod, id, qa.dataset.qaLabel || id, { quiet: true });
    qa.removeAttribute('aria-busy');
    return;
  }
  const a = e.target.closest?.('[data-act], [data-snooze]');
  if (!a) {
    // Following any in-app link closes the sheets.
    const link = e.target.closest?.('a[href^="#/"]');
    if (link) { if (moreOpen) setMore(false); }
    return;
  }
  if (a.dataset.snooze) {
    e.preventDefault();
    const keys = a.dataset.snooze.split('\n');
    if (keys.length > 1) await inbox.snoozeMany(keys, 60);
    else await inbox.snooze(keys[0], 60);
    return;
  }
  switch (a.dataset.act) {
    case 'palette': e.preventDefault(); openPalette(); break;
    case 'inbox': e.preventDefault(); setMore(false); inbox.toggle(); break;
    case 'more': e.preventDefault(); setMore(!moreOpen); break;
    case 'more-close': e.preventDefault(); setMore(false); break;
    default: break;
  }
});
$('#scrim').addEventListener('click', () => { inbox.close(); setMore(false); });

/* ── module mounting ────────────────────────────────────────────────── */
function renderUnavailable(m) {
  const s = navState(m);
  const offline = s === 'offline';
  const el = $('#view');
  el.innerHTML = `<div class="panel"><div class="empty${offline ? '' : ''}">
    ${ic(offline ? 'i-moon' : 'i-warn', 'xl')}
    <b>${esc(offline ? `${m.name} is offline` : `${m.name} is not responding`)}</b>
    <p>${esc(offline ? 'The machine it runs on is asleep or off the network. This page fills in by itself when it is back.' : (m.reason || 'No further detail was reported.'))}</p>
    <button class="btn sm" type="button" data-retry>${ic('refresh', 's')}Try again</button>
  </div></div>`;
  el.querySelector('[data-retry]')?.addEventListener('click', async (ev) => {
    ev.currentTarget.setAttribute('aria-busy', 'true');
    await refreshModules({ force: true });
    renderChrome();
    route({ force: true });
  });
}

async function mountModule(m, viewId) {
  if (!usable(m)) { await host.unmount(); renderUnavailable(m); return; }
  if (!m.ui) {
    await host.unmount();
    $('#view').innerHTML = `<div class="panel"><div class="empty">${ic('box', 'xl')}<b>${esc(m.name)} has no screen</b><p>Its manifest declares no ui entry point. It may still be usable through its API.</p></div></div>`;
    return;
  }
  host.base = `/${m.id}`;
  const url = `/${m.id}${m.ui}${m.version ? `?v=${encodeURIComponent(m.version)}` : ''}`;
  try {
    await host.mount(m, viewId, url);
  } catch (err) {
    console.error(`[${m.id}] mount failed`, err);
    $('#view [data-retry]')?.addEventListener('click', () => route({ force: true }));
  }
  $('#view').dataset.module = m.id;
}

/* ── live overview: modules with quick actions push their state ──────
   A module's own /api/events `state` event refreshes its row at once, so a
   quick-action chip follows the AC being switched from the remote too. */
const liveFeeds = new Map();
function syncLiveFeeds() {
  const want = new Set(state.active.module === null
    ? state.modules.filter((m) => m.status === 'ready' && (m.quickActions || []).length && (m.capabilities || []).includes('sse')).map((m) => m.id)
    : []);
  for (const [id, es] of liveFeeds) if (!want.has(id)) { es.close(); liveFeeds.delete(id); }
  for (const id of want) {
    if (liveFeeds.has(id)) continue;
    let t = 0;
    const es = new EventSource(`/${id}/api/events?pace=ambient`);
    es.addEventListener('state', () => {
      clearTimeout(t);
      t = setTimeout(async () => { await refreshSummaries(id); if (state.active.module === null) renderOverview(); }, 250);
    });
    liveFeeds.set(id, es);
  }
}

/* ── routing ────────────────────────────────────────────────────────── */
let routing = false;
let routeAgain = false;
let pollTimer = null;

function startPoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    const mod = state.active.module;
    if (mod === null) { await refreshSummaries(); renderOverview(); return; }
    if (mod && mod !== 'settings') {
      await refreshSummaries(mod);
      const m = modById(mod);
      const p = $('#phead .ph p');
      const sum = state.summaries.get(mod);
      if (m && p && sum?.headline && p.dataset.custom !== '1') p.textContent = sum.headline;
    }
  }, 20_000);
}

function enter() {
  const page = $('#page');
  page.classList.remove('enter');
  void page.offsetWidth;
  page.classList.add('enter');
  $('#main').scrollTop = 0;
}

async function route({ force = false } = {}) {
  if (routing) { routeAgain = true; return; }
  routing = true;
  routeAgain = false;
  try {
    inbox.close();
    setMore(false);
    let { a: module, b: view } = parseHash();
    if (module === 'overview' || module === 'home-screen') module = null;
    const prev = { ...state.active };
    const sameModule = prev.module === module && module !== null && module !== 'settings';

    if (!module) {
      state.active = { module: null, view: null };
      if (settingsPage.isMounted()) settingsPage.unmount();
      await host.unmount();
      renderChrome(); setTitle();
      renderVtabs(null);
      $('#view').removeAttribute('data-module');
      if (prev.module !== null || force || !$('#view .srows')) enter();
      renderOverview();
      refreshSummaries().then(() => { if (state.active.module === null) renderOverview(); });
      syncLiveFeeds();
      return;
    }
    syncLiveFeeds();

    if (module === 'settings') {
      await host.unmount();
      state.active = { module: 'settings', view: view || null };
      renderChrome(); setTitle(); renderVtabs(null);
      $('#view').removeAttribute('data-module');
      if (prev.module !== 'settings') enter();
      $('#phead').innerHTML = pageHeader('Settings', 'Notifications, appearance, devices');
      await settingsPage.mount($('#view'), { section: view, applyTheme, setTheme, currentTheme, modules: () => state.modules, refreshModules: async () => { await refreshModules({ force: true }); renderChrome(); }, session: () => state.session, inbox });
      return;
    }
    if (settingsPage.isMounted()) settingsPage.unmount();

    const m = modById(module);
    if (!m || !m.enabled) { location.replace('#/'); return; }
    const views = m.views || [];
    const v = views.some((x) => x.id === view) ? view : (views[0]?.id || null);
    state.active = { module: m.id, view: v };
    renderChrome(); setTitle(); renderVtabs(m);

    if (sameModule && !force && host.mounted) {
      if (host.mounted.setView) { await host.setView(v); return; }
    }
    if (!sameModule || force) enter();
    renderModuleHeader(m);
    await mountModule(m, v);
    if (!state.summaries.has(m.id) && m.summary && m.status === 'ready') {
      refreshSummaries(m.id).then(() => {
        const p = $('#phead .ph p');
        const sum = state.summaries.get(m.id);
        if (state.active.module === m.id && p && !p.textContent && sum?.headline) p.textContent = sum.headline;
      });
    }
  } finally {
    routing = false;
    if (routeAgain) { routeAgain = false; route(); }
  }
}

/* ── boot ───────────────────────────────────────────────────────────── */
async function boot() {
  const [branding, session, ui] = await Promise.all([
    fetch('/api/branding').then((r) => r.json()).catch(() => null),
    fetch('/api/session').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/ui').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (!session) { location.href = '/login'; return; }
  if (ui?.theme && ui.theme !== currentTheme()) applyTheme(ui.theme, { animate: false });

  host.el = $('#view');
  state.branding = branding;
  state.session = session;

  inbox.start({
    onChange: () => {
      renderSide(); renderTopbar(); renderTabbar();
      if (state.active.module === null) renderOverview();
    },
    itemIcon,
  });

  await refreshModules();
  renderChrome();
  await route();
  refreshSummaries().then(() => { renderChrome(); if (state.active.module === null) renderOverview(); });
  startPoll();

  setInterval(async () => { await refreshModules(); renderChrome(); }, 30_000);
  try {
    const modEvents = new EventSource('/api/modules/events');
    modEvents.addEventListener('modules', (ev) => {
      try { state.modules = JSON.parse(ev.data).modules || []; } catch { return; }
      renderChrome();
      if (state.active.module === null) renderOverview();
    });
  } catch { /* the poll carries on */ }

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (currentTheme() === 'system') applyTheme('system', { animate: false }); });

  if (nativeBridge.isNative) {
    await nativeBridge.ready();
    if (state.modules.some((m) => m.id === 'home' && m.enabled)) nativeBridge.startLocation({ moduleId: 'home' });
  }
}

window.addEventListener('hashchange', () => route());
boot();

export { toast, modal, icon, esc, relTime, placeSegs };
