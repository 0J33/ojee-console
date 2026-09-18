/* ============================================================
   ojee-console — the shell runtime.

   Owns the chrome and nothing else. Every screen you actually look
   at comes from a module: the shell fetches each module's manifest,
   builds one nav out of all of them, dynamically imports the
   module's UI entry point, and hands it a root element plus a
   context object.

   The contract a module implements:

     export default {
       async mount(el, ctx) { ... },   // render into el
       async unmount() { ... },        // tear down listeners/streams
     }

   ctx gives a module everything it would otherwise reach for
   globally — api(), sse(), toast(), modal(), icon() — so a module
   never touches document outside its own root and never ships a
   second copy of the shell's utilities.
   ============================================================ */
import {
  esc, icon, toast, modal, relTime, clock, ModuleHost, parseHash,
} from '/chrome.js';

// The native bridge. Every export is a no-op in a browser, so the shell has
// one code path rather than a web build and an app build.
import * as nativeBridge from '/native.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  modules: [],
  branding: null,
  session: null,
  active: { module: null, view: null },
  mounted: null,          // the currently mounted module's default export
  loaded: new Map(),      // moduleId -> imported UI module
  summaries: new Map(),   // moduleId -> { status, headline, facts, alerts }
};

/* ── utilities ────────────────────────────────────────────────────────
   esc / icon / toast / modal / relTime / clock / ModuleHost all come from
   ojee-ui's chrome.js. They used to be defined here, which meant a module
   running STANDALONE had no way to get them without reimplementing the lot —
   so "runs standalone" was a claim nothing tested. Moving them into the
   design system keeps one implementation and one dependency direction.
   ──────────────────────────────────────────────────────────────────── */

/** Shared host: mounts a module UI, owns its lifecycle and its ctx. */
const host = new ModuleHost({
  el: null,                       // set on boot, once #view exists
  base: '',                       // rewritten per module before each mount
  onUnauthorized: () => location.reload(),
});

/* ── shell chrome ─────────────────────────────────────────────────────── */

/** "ojee.console" — the wordmark as one string. */
function brandName() {
  const b = state.branding;
  if (!b) return 'console';
  return `${b.wordmark}${b.wordmarkAccent}${b.wordmarkTail}`;
}

/**
 * The tab title says where you are: `ojee.console · fleet · hosts`.
 *
 * It used to say `ojee.console · console`, which spends the one piece of text
 * a background tab gets on repeating the app's own name — and with several
 * tabs open, every one of them looked identical.
 */
function setTitle() {
  const { module, view } = state.active;
  const parts = [brandName()];
  if (module === 'settings') parts.push('settings');
  else if (module) {
    const m = state.modules.find((x) => x.id === module);
    parts.push((m?.name || module).toLowerCase());
    const label = m?.views?.find((v) => v.id === view)?.label;
    // Only when it adds something: "fleet · fleet" is the bug we just fixed.
    if (label && label.toLowerCase() !== (m?.name || '').toLowerCase()) {
      parts.push(label.toLowerCase());
    }
  } else parts.push('overview');
  document.title = parts.join(' · ');
}

function renderBranding() {
  const b = state.branding;
  if (!b) return;
  setTitle();
  $('#nav-logo').innerHTML =
    `${esc(b.wordmark)}<span class="dot-accent">${esc(b.wordmarkAccent)}</span>${esc(b.wordmarkTail)}`;
  $('#sb-note').textContent = b.tagline || '';
  if (b.theme) {
    $('#theme-link').href = `/themes/${b.theme}.css`;
  }
}

/** Every view of every ready module, flattened into one nav. */
function navEntries() {
  const out = [];
  for (const m of state.modules) {
    if (!m.enabled) continue;
    if (m.status === 'ready' && m.views.length) {
      for (const v of m.views) {
        out.push({ moduleId: m.id, viewId: v.id, label: v.label, icon: v.icon || 'i-grid', module: m });
      }
    } else {
      // Keep a placeholder so a broken module is visible as broken. See
      // registry.js — hiding it makes a bad deploy look like a missing feature.
      out.push({ moduleId: m.id, viewId: null, label: m.name, icon: 'i-warn', module: m, unavailable: true });
    }
  }
  return out;
}

function renderNav() {
  renderSidenav();
  const entries = navEntries();
  const isActive = (e) =>
    e.moduleId === state.active.module && (e.viewId === state.active.view || e.viewId === null);

  // Only the ACTIVE module's views. Listing every module's views side by side
  // produced twelve undifferentiated links with no indication which app each
  // belonged to — and it grows with every module. Switching apps is the
  // launcher's job, or the palette's; this row is for moving inside one.
  const mine = state.active.module
    ? entries.filter((e) => e.moduleId === state.active.module && e.viewId)
    : [];
  const nav = $('#nav-links');
  nav.hidden = mine.length < 2;
  nav.innerHTML = mine.map((e) => `
    <a class="nav-link${isActive(e) ? ' active' : ''}${e.unavailable ? ' nav-link--down' : ''}"
       href="#/${esc(e.moduleId)}/${esc(e.viewId)}"
       ${e.unavailable ? `title="${esc(e.module.reason || 'unavailable')}"` : ''}
       >${esc(e.label)}</a>`).join('');

  // The tab bar is one entry per MODULE, not per view — five modules is a
  // reasonable bottom bar; five modules times four views is not.
  const perModule = [];
  for (const e of entries) if (!perModule.some((x) => x.moduleId === e.moduleId)) perModule.push(e);
  $('#tabbar').innerHTML = perModule.slice(0, 5).map((e) => `
    <button class="tabitem${e.moduleId === state.active.module ? ' active' : ''}"
            data-goto="#/${esc(e.moduleId)}${e.viewId ? `/${esc(e.viewId)}` : ''}"
            ${e.unavailable ? 'data-down="1"' : ''}>
      ${icon(moduleIcon(e.module), 'ic ic--lg')}<span>${esc(e.module.name)}</span>
    </button>`).join('');
  $('#tabbar').querySelectorAll('.tabitem').forEach((b) => {
    b.addEventListener('click', () => { location.hash = b.dataset.goto; });
  });

  // The level the bottom bar cannot carry: the ACTIVE module's views. Hidden
  // above 860px, where nav-links already lists everything, and hidden for a
  // single-view module, where there is nothing to choose.
  const strip = $('#viewstrip');
  if (strip) {
    const mine = entries.filter((e) => e.moduleId === state.active.module && e.viewId);
    strip.dataset.single = mine.length > 1 ? '0' : '1';
    strip.innerHTML = mine.map((e) => `
      <a class="${e.viewId === state.active.view ? 'active' : ''}"
         role="tab" aria-selected="${e.viewId === state.active.view}"
         href="#/${esc(e.moduleId)}/${esc(e.viewId)}">${esc(e.label)}</a>`).join('');
    strip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

/* The sidebar is the console's map: every module, every view, always. A nav
   that only lists the active module's views answers "where am I" and never
   "what else is there". */
/**
 * Icons, in order of preference: what the module declares, a guess from its
 * id, then a generic one.
 *
 * The bug this replaces: the sidebar used `views[0].icon`, and since almost
 * every module's first view is an overview drawn with `i-grid`, Overview,
 * Fleet and Home all rendered the same square. An icon that is the same for
 * everything is decoration, not navigation.
 */
const MODULE_ICONS = {
  fleet: 'i-server',
  home: 'i-house',
  remote: 'i-monitor',
  agent: 'i-cpu',
  loq: 'i-gauge',
  code: 'i-log',
  backups: 'i-shield',
};
const moduleIcon = (m) => m?.icon || MODULE_ICONS[m?.id] || 'i-box';

function renderSidenav() {
  const el = $('#sidenav');
  if (!el) return;
  const mods = state.modules.filter((m) => m.enabled);
  if (!mods.length) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;

  const overviewActive = !state.active.module;
  el.innerHTML = `
    <a class="sn-item sn-item--home${overviewActive ? ' is-on' : ''}" href="#/">
      ${icon('i-grid', 'ic')}<span>Overview</span>
    </a>
    ${mods.map((m) => {
      const active = state.active.module === m.id;
      const views = m.status === 'ready' ? (m.views || []) : [];
      const first = views[0]?.id;
      const href = `#/${esc(m.id)}${first ? `/${esc(first)}` : ''}`;
      const sum = state.summaries.get(m.id);
      const dot = m.status === 'ready'
        ? (sum?.status === 'err' ? 'dot--err' : sum?.status === 'warn' ? 'dot--warn' : 'dot--ok')
        : m.status === 'degraded' ? 'dot--warn' : 'dot--err';
      return `
      <div class="sn-group${active ? ' is-open' : ''}">
        <a class="sn-item${active ? ' is-on' : ''}${m.status === 'ready' ? '' : ' is-down'}"
           href="${m.status === 'ready' ? href : '#/settings'}"
           ${m.status === 'ready' ? '' : `title="${esc(m.reason || 'unavailable')}"`}>
          ${icon(moduleIcon(m), 'ic')}
          <span>${esc(m.name)}</span>
          <span class="dot ${dot}"></span>
        </a>
        ${active && views.length > 1 ? `
          <div class="sn-views">
            ${views.map((v) => `
              <a class="sn-view${state.active.view === v.id ? ' is-on' : ''}"
                 href="#/${esc(m.id)}/${esc(v.id)}">${esc(v.label)}</a>`).join('')}
          </div>` : ''}
      </div>`;
    }).join('')}
    <a class="sn-item sn-item--foot" href="#/settings">${icon('i-cog', 'ic')}<span>Settings</span></a>`;
}

function renderChrome() {
  const ready = state.modules.filter((m) => m.status === 'ready').length;
  const enabled = state.modules.filter((m) => m.enabled).length;
  const down = state.modules.filter((m) => m.enabled && m.status !== 'ready');

  $('#hud-modules').textContent = `${ready}/${enabled}`;
  $('#hud-state').textContent = down.length === 0 ? 'nominal' : `${down.length} down`;
  $('#hudbar .seg--live').classList.toggle('seg--degraded', down.length > 0);
  $('#hud-user').textContent = state.session?.user?.split('@')[0] || '—';
  $('#sb-conn').textContent = down.length ? `${down.map((m) => m.id).join(', ')} unavailable` : 'all modules ready';
  $('#sb-conn').classList.toggle('warn', down.length > 0);
}

/* ── module mounting ──────────────────────────────────────────────────── */

function renderUnavailable(m) {
  const retry = m.status === 'unreachable' || m.status === 'degraded';
  const btn = host.error(`${m.name} is ${m.status}`, m.reason || 'No further detail was reported.',
    { retry });
  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    await refreshModules({ force: true });
    route();
  });
}

async function mountModule(m, viewId) {
  if (m.status !== 'ready') {
    await host.unmount();
    return renderUnavailable(m);
  }

  if (!m.ui) {
    await host.unmount();
    host.error(`${m.name} ships no UI`,
      'Its manifest declares no ui entry point, so there is nothing for the console to render. It may still be usable through its API.',
      { retry: false });
    return;
  }

  // Point the host at this module before mounting: ctx.api('/state') must
  // resolve to /{id}/api/state, and ctx.sse likewise.
  host.base = `/${m.id}`;

  // Cache-bust on version, or a redeployed module is served from the browser's
  // module cache and the new build is silently invisible.
  const url = `/${m.id}${m.ui}${m.version ? `?v=${encodeURIComponent(m.version)}` : ''}`;

  try {
    await host.mount(m, viewId, url);
  } catch (e) {
    console.error(`[${m.id}] mount failed`, e);
    // host.mount already rendered the failure and returned its retry button.
    const btn = $('#view [data-retry]');
    btn?.addEventListener('click', () => mountModule(m, viewId));
  }
}

/* ── settings (shell-owned, not a module) ─────────────────────────────── */

/* ── command palette ──────────────────────────────────────────────────── */

/**
 * Jump to any module, any view, or Settings — by typing.
 *
 * Tab bars and strips do not scale: four modules with twelve views between
 * them is already a wall of links, and every new module makes it worse. A
 * palette is O(1) to use no matter how many destinations exist, and it gives
 * the keyboard a first-class path that clicking through two nav levels never
 * did.
 *
 * `/` opens it (and Ctrl/Cmd+K, which is what people try first). Typing
 * filters; Enter goes.
 */
let paletteOpen = false;

function paletteItems() {
  const out = [];
  for (const m of state.modules.filter((x) => x.enabled)) {
    const views = m.views || [];
    const down = m.status !== 'ready';
    const hint = m.status === 'ready' ? null : (m.reason || 'unavailable');
    if (!views.length) {
      out.push({ group: m.name, label: m.name, hint: hint || 'module',
                 href: `#/${m.id}`, icon: moduleIcon(m), down });
      continue;
    }
    // The row carries the VIEW name only; the module name is the group
    // header above it. Repeating "Home · " on five consecutive rows spent
    // the widest column in the panel saying the same word five times.
    for (const v of views) {
      out.push({ group: m.name, label: v.label, hint: hint || 'view',
                 href: `#/${m.id}/${v.id}`, icon: v.icon || 'i-grid', down });
    }
  }
  out.push({ group: 'Console', label: 'Home', hint: 'launcher', href: '#/', icon: 'i-grid' });
  out.push({ group: 'Console', label: 'Settings', hint: 'devices, session',
             href: '#/settings', icon: 'i-cog' });
  return out;
}

function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  // The registry re-polls on a timer, but a palette that opens on a stale copy
  // offers destinations that no longer exist — and the one time you notice is
  // when you jump to a module that was removed. Refresh in the background and
  // rebuild if the answer changed.
  const signature = () => state.modules.map((m) => `${m.id}:${m.status}:${(m.views || []).map((v) => v.id).join(',')}`).join('|');
  const before = signature();
  refreshModules({ force: true }).then(() => {
    if (paletteOpen && signature() !== before) { close(); openPalette(); }
  }).catch(() => {});

  const all = paletteItems();
  let sel = 0;

  const host = document.createElement('div');
  host.className = 'cp-backdrop';
  host.innerHTML = `
    <div class="cp" role="dialog" aria-modal="true" aria-label="Jump to">
      <div class="cp-field">
        ${icon('i-search', 'ic')}
        <input class="cp-input" type="text" placeholder="Jump to…" aria-label="Jump to"
               autocomplete="off" spellcheck="false">
        <kbd class="kbd">ESC</kbd>
      </div>
      <ul class="cp-list" role="listbox"></ul>
    </div>`;
  document.body.appendChild(host);

  const input = host.querySelector('.cp-input');
  const list = host.querySelector('.cp-list');

  const matches = (q) => {
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.filter((i) => i.label.toLowerCase().includes(t) || i.hint.toLowerCase().includes(t));
  };

  let shown = all;

  /**
   * Rows are built ONCE and then shown, hidden and highlighted in place.
   *
   * This used to rebuild every row's markup on every keystroke and on every
   * arrow press — which means re-parsing HTML, re-resolving an <svg><use>
   * per row against the page sprite, and throwing away the DOM you were
   * about to scroll. That is why it felt heavy to type in.
   */
  let group = null;
  const empty = document.createElement('li');
  empty.className = 'cp-empty';
  empty.textContent = 'Nothing matches that.';
  const rows = all.map((i, n) => {
    if (i.group !== group) {
      const head = document.createElement('li');
      head.className = 'cp-group';
      head.setAttribute('role', 'presentation');
      head.textContent = i.group;
      head.dataset.group = i.group;
      list.append(head);
      group = i.group;
    }
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.className = `cp-item${i.down ? ' cp-item--down' : ''}`;
    li.dataset.n = String(n);
    li.innerHTML = `${icon(i.icon, 'ic')}
      <span class="cp-label">${esc(i.label)}</span>
      <span class="cp-hint">${esc(i.hint)}</span>`;
    list.append(li);
    return li;
  });
  list.append(empty);

  const paint = () => {
    shown = matches(input.value);
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    const visible = new Set(shown);
    const groupsWithRows = new Set();
    all.forEach((item, n) => {
      const on = visible.has(item);
      rows[n].hidden = !on;
      if (on) groupsWithRows.add(item.group);
    });
    // A group header with nothing under it is a heading for an empty list.
    for (const head of list.querySelectorAll('.cp-group')) {
      head.hidden = !groupsWithRows.has(head.dataset.group);
    }
    empty.hidden = shown.length > 0;
    const selected = shown[sel];
    all.forEach((item, n) => {
      const on = item === selected;
      rows[n].classList.toggle('is-sel', on);
      rows[n].setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (selected) rows[all.indexOf(selected)].scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    paletteOpen = false;
    document.removeEventListener('keydown', onKey, true);
    host.remove();
  };
  const go = () => {
    const item = shown[sel];
    if (!item) return;
    close();
    location.hash = item.href;
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); return; }
    if (e.key === 'Enter') { e.preventDefault(); go(); }
  };

  input.addEventListener('input', () => { sel = 0; paint(); });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-n]');
    if (!li) return;
    // data-n indexes the FULL list; sel indexes the filtered one.
    const item = all[Number(li.dataset.n)];
    const at = shown.indexOf(item);
    if (at < 0) return;
    sel = at;
    go();
  });
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });
  document.addEventListener('keydown', onKey, true);

  paint();
  input.focus();
}

/** `/` and Ctrl/Cmd+K, but never while the user is typing into something. */
function wirePalette() {
  document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openPalette(); return; }
    if (e.key === '/' && !typing && !paletteOpen) { e.preventDefault(); openPalette(); }
  });
}

/* ── launcher ─────────────────────────────────────────────────────────── */

/**
 * The front door.
 *
 * Every module as a card, with what it actually is and whether it is live —
 * so the first screen answers "what have I got and is it working", which is
 * the question you have on opening this. Previously there was no home at all:
 * the router picked whichever module happened to be ready and dropped you in
 * it, which is disorienting and hides everything else.
 *
 * Cards, not a list: each one carries a status lamp, a view count and a live
 * detail line, and that is more than a row can hold legibly.
 */
/* The front door. It used to be a row of launch tiles: it said what existed
   and nothing about how any of it was doing, so the first thing you did on
   arriving was click into each module to check. Now the modules report, and
   anything wrong is stated here before the tiles. */
function overviewAlerts() {
  const alerts = [];
  for (const m of state.modules.filter((x) => x.enabled)) {
    if (m.status !== 'ready') {
      alerts.push({ severity: m.status === 'degraded' ? 'warn' : 'err', module: m,
                    text: `${m.name} is ${m.status === 'degraded' ? 'degraded' : 'unreachable'}${m.reason ? ` — ${m.reason}` : ''}` });
      continue;
    }
    for (const a of state.summaries.get(m.id)?.alerts || []) {
      alerts.push({ severity: a.severity || 'warn', module: m, text: a.text, view: a.view });
    }
  }
  return alerts;
}

function moduleCard(m, i) {
  const ready = m.status === 'ready';
  const views = m.views || [];
  const first = views[0]?.id;
  const href = ready ? `#/${esc(m.id)}${first ? `/${esc(first)}` : ''}` : '#/settings';
  const sum = state.summaries.get(m.id);
  const dot = !ready ? (m.status === 'degraded' ? 'dot--warn' : 'dot--err')
    : sum?.status === 'err' ? 'dot--err' : sum?.status === 'warn' ? 'dot--warn' : 'dot--ok';

  const facts = (sum?.facts || []).slice(0, 4).map((f) => `
    <div class="ov-fact"><dt>${esc(f.k)}</dt><dd>${esc(String(f.v))}</dd></div>`).join('');

  return `
    <a class="ov-card${ready ? '' : ' ov-card--down'}" href="${href}" style="--i:${i}">
      <span class="ov-card-head">
        ${icon(moduleIcon(m), 'ic ic--lg')}
        <span class="ov-card-name">${esc(m.name)}</span>
        <span class="dot ${dot}"></span>
      </span>
      <span class="ov-card-line">${esc(sum?.headline || (ready
        // A module with no summary says nothing rather than counting its own
        // tabs at you: "4 views" is a fact about the navigation, not about
        // anything happening.
        ? 'running'
        : m.reason || 'unavailable'))}</span>
      ${facts ? `<dl class="ov-facts">${facts}</dl>` : ''}
    </a>`;
}

function renderLauncher() {
  const mods = state.modules.filter((m) => m.enabled);
  const ready = mods.filter((m) => m.status === 'ready').length;
  const peer = state.session?.peer?.display || state.session?.user || '';
  const alerts = overviewAlerts();

  if (!mods.length) {
    $('#view').innerHTML = `<div class="empty">${icon('i-warn', 'ic ic--xl')}
      <b>No modules configured</b>
      <span>Add one to config/console.json and reload.</span></div>`;
    return;
  }

  $('#view').innerHTML = `
    <section class="ov">
      <header class="ov-head">
        <h1 class="h1">Overview</h1>
        <span class="meta">${ready} of ${mods.length} modules ready${peer ? ` · ${esc(peer)}` : ''}</span>
      </header>

      <div class="ov-verdict ${alerts.length ? 'is-bad' : 'is-ok'}">
        ${icon(alerts.length ? 'i-warn' : 'i-shield', 'ic')}
        <div class="ov-verdict-body">
          ${alerts.length
            ? `<strong>${alerts.length} thing${alerts.length > 1 ? 's need' : ' needs'} attention</strong>
               <div class="ov-alerts">${alerts.slice(0, 6).map((a) => `
                 <a class="ov-alert ov-alert--${esc(a.severity)}"
                    href="#/${esc(a.module.id)}${a.view ? `/${esc(a.view)}` : ''}">${esc(a.text)}</a>`).join('')}</div>`
            : `<strong>Everything is healthy.</strong>
               <span class="meta">Every module is up and reporting.</span>`}
        </div>
      </div>

      <div class="ov-grid">${mods.map(moduleCard).join('')}</div>

      <footer class="ov-foot">
        <span class="meta">Press <kbd class="kbd">/</kbd> to jump anywhere</span>
        <a class="lc-link" href="#/settings">${icon('i-cog')} Settings</a>
      </footer>
    </section>`;
}

async function renderSettings() {
  await host.unmount();
  const el = $('#view');
  el.innerHTML = `<div class="stack-lg">
    <div class="panel">
      <div class="panel-head"><span class="label">Session</span></div>
      <div class="stack" id="settings-session"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="label">Trusted devices</span>
        <button class="btn btn--sm btn--danger" id="revoke-all">Revoke all</button></div>
      <div id="settings-devices"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="label">Modules</span>
        <button class="btn btn--sm btn--ghost" id="refresh-modules">Re-check</button></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Module</th><th>Status</th><th>Version</th><th class="num">Latency</th></tr></thead>
        <tbody id="settings-modules"></tbody></table></div>
    </div>
  </div>`;

  const s = state.session || {};
  $('#settings-session').innerHTML = `
    <div class="fieldline"><span class="fl-k">user</span><span class="fl-lead"></span><span class="fl-v">${esc(s.user || '—')}</span></div>
    <div class="fieldline"><span class="fl-k">tailnet node</span><span class="fl-lead"></span><span class="fl-v">${esc(s.peer?.node || '—')}</span></div>
    <div class="fieldline"><span class="fl-k">signed in via</span><span class="fl-lead"></span><span class="fl-v fl-v--accent">${esc(s.via === 'device-trust' ? 'trusted device' : 'TOTP')}</span></div>
    <div class="fieldline"><span class="fl-k">identity source</span><span class="fl-lead"></span><span class="fl-v">${esc(s.peer?.source || '—')}</span></div>
    <div style="margin-top:var(--s-3)"><button class="btn btn--sm btn--ghost" id="sign-out">Sign out</button></div>`;

  $('#sign-out').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login';
  });

  const paintDevices = async () => {
    const { devices, current, trustDays } = await (await fetch('/api/devices')).json();
    const box = $('#settings-devices');
    if (!devices.length) {
      box.innerHTML = `<div class="empty">${icon('i-shield', 'ic ic--xl')}<b>No trusted devices</b>
        <p>Tick “trust this device” at sign-in to skip TOTP for ${trustDays} days on that browser.</p></div>`;
      return;
    }
    box.innerHTML = devices.map((d) => `
      <div class="row">
        <span class="stack" style="gap:2px;align-items:flex-start">
          <b style="color:var(--ink)">${esc(d.label)}${d.id === current ? ' · this device' : ''}</b>
          <span class="meta">last used ${esc(relTime(d.lastSeenAt))} · expires ${esc(relTime(d.expiresAt))} · ${d.uses} use${d.uses === 1 ? '' : 's'}</span>
        </span>
        <button class="btn btn--sm btn--danger" data-revoke="${esc(d.id)}">Revoke</button>
      </div>`).join('');
    box.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
      const isCurrent = b.dataset.revoke === current;
      const go = await modal({
        title: 'Revoke device',
        body: `<p style="color:var(--ink-2);font-size:0.78rem">${isCurrent
          ? 'This is the device you are using. You will need a TOTP code the next time you sign in here.'
          : 'That device will need a TOTP code the next time it signs in.'}</p>`,
        actions: [
          { label: 'Cancel', value: false, variant: 'ghost' },
          { label: 'Revoke', value: true, variant: 'danger' },
        ],
      });
      if (!go) return;
      await fetch(`/api/devices/${encodeURIComponent(b.dataset.revoke)}`, { method: 'DELETE' });
      toast('ok', 'Revoked', isCurrent ? 'This device will ask for TOTP next time.' : '');
      paintDevices();
    }));
  };
  await paintDevices();

  $('#revoke-all').addEventListener('click', async () => {
    const go = await modal({
      title: 'Revoke all devices',
      body: '<p style="color:var(--ink-2);font-size:0.78rem">Every trusted device, including this one, will need a TOTP code. You will be signed out immediately.</p>',
      actions: [
        { label: 'Cancel', value: false, variant: 'ghost' },
        { label: 'Revoke all', value: true, variant: 'danger' },
      ],
    });
    if (!go) return;
    await fetch('/api/devices/revoke-all', { method: 'POST' });
    location.href = '/login';
  });

  const paintModules = () => {
    $('#settings-modules').innerHTML = state.modules.map((m) => `
      <tr>
        <td>${esc(m.name)} <span class="meta">${esc(m.id)}</span></td>
        <td><span class="badge"><span class="dot ${statusDot(m.status)}"></span>${esc(m.status)}</span>
            ${m.reason ? `<div class="meta" style="margin-top:4px">${esc(m.reason)}</div>` : ''}</td>
        <td>${esc(m.version || '—')}</td>
        <td class="num">${m.latencyMs != null ? `${m.latencyMs} ms` : '—'}</td>
      </tr>`).join('');
  };
  paintModules();

  $('#refresh-modules').addEventListener('click', async () => {
    $('#refresh-modules').disabled = true;
    await refreshModules({ force: true });
    paintModules();
    renderNav();
    renderChrome();
    $('#refresh-modules').disabled = false;
    toast('info', 'Re-checked', `${state.modules.filter((m) => m.status === 'ready').length} ready`);
  });
}

const statusDot = (s) => s === 'ready' ? 'dot--ok' : s === 'disabled' ? '' : s === 'degraded' ? 'dot--warn' : 'dot--err';


/* ── routing ──────────────────────────────────────────────────────────── */

/* A module may describe itself in one object: how it is doing, the two or
   three numbers worth seeing from outside, and anything wrong. Modules that
   do not implement it still appear — with their health and nothing more. */
async function refreshSummaries() {
  const mods = state.modules.filter((m) => m.enabled && m.status === 'ready'
    && (m.capabilities || []).includes('summary'));
  await Promise.all(mods.map(async (m) => {
    try {
      const res = await fetch(`/${m.id}/api/summary`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      state.summaries.set(m.id, await res.json());
    } catch {
      state.summaries.delete(m.id);
    }
  }));
}

async function refreshModules({ force = false } = {}) {
  const res = await fetch(force ? '/api/modules/refresh' : '/api/modules', { method: force ? 'POST' : 'GET' });
  if (!res.ok) return;
  state.modules = (await res.json()).modules || [];
}

let routing = false;
let overviewTimer = null;

function startOverviewPoll() {
  stopOverviewPoll();
  overviewTimer = setInterval(async () => {
    if (document.hidden || state.active.module) return;
    await refreshSummaries();
    if (!state.active.module) { renderLauncher(); renderSidenav(); }
  }, 20000);
}

function stopOverviewPoll() {
  if (overviewTimer) { clearInterval(overviewTimer); overviewTimer = null; }
}

async function route() {
  if (routing) return;
  routing = true;
  try {
    // parseHash is generic ({a, b}); here the two levels are module and view.
    const { a: module, b: view } = parseHash();

    // No module in the hash means the LAUNCHER, not "guess a module".
    // Diving straight into whichever module happened to be ready gave the app
    // no front door: you arrived somewhere arbitrary with no sense of what
    // else existed.
    if (!module || module === 'home-screen') {
      state.active = { module: null, view: null };
      renderNav();
      setTitle();
      await host.unmount();
      renderLauncher();
      // Paint immediately with what we know, then fill in what the modules
      // say about themselves.
      refreshSummaries().then(() => {
        if (!state.active.module) { renderLauncher(); renderSidenav(); }
      });
      startOverviewPoll();
      return;
    }

    stopOverviewPoll();

    if (module === 'settings') {
      state.active = { module: 'settings', view: null };
      renderNav();
      setTitle();
      await renderSettings();
      return;
    }

    let m = state.modules.find((x) => x.id === module && x.enabled);
    if (!m) {
      // Land on the first module that can actually render something; only
      // fall back to a broken one if nothing is ready.
      m = state.modules.find((x) => x.enabled && x.status === 'ready')
        || state.modules.find((x) => x.enabled);
      if (!m) {
        state.active = { module: null, view: null };
        renderNav();
        await host.unmount();
        host.error('No modules configured',
          'Add one to config/console.json and restart. See the README for the module contract.',
          { retry: false });
        return;
      }
      location.replace(`#/${m.id}${m.views?.[0] ? `/${m.views[0].id}` : ''}`);
      return;
    }

    const v = m.views?.some((x) => x.id === view) ? view : (m.views?.[0]?.id || null);
    const sameModule = state.active.module === m.id && host.mounted;
    state.active = { module: m.id, view: v };
    renderNav();
    setTitle();

    // Switching VIEW inside a mounted module is the module's business — let
    // it re-render in place rather than tearing down and re-importing, which
    // would drop its SSE stream on every tab click.
    if (sameModule && host.mounted?.setView) {
      await host.setView(v);
      return;
    }
    await mountModule(m, v);
  } finally {
    routing = false;
  }
}

/* ── boot ─────────────────────────────────────────────────────────────── */

async function boot() {
  const [branding, session] = await Promise.all([
    fetch('/api/branding').then((r) => r.json()).catch(() => null),
    fetch('/api/session').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  if (!session) { location.href = '/login'; return; }

  // The host renders into #view; it exists by now.
  host.el = $('#view');

  state.branding = branding;
  state.session = session;
  renderBranding();

  await refreshModules();
  renderNav();
  renderChrome();
  await route();

  // Keep the nav honest about module health without hammering the server.
  setInterval(async () => {
    await refreshModules();
    renderNav();
    renderChrome();
    // Rides along with the poll the nav already needs, rather than adding
    // a second timer that asks the same question.
    nativeBridge.noteModuleHealth(state.modules);
  }, 20000);

  clock($('#hud-clock'));
  wirePalette();
  $('#nav-jump')?.addEventListener('click', openPalette);

  // Inside the app only: dismiss the splash, forward module `notify` events
  // as local notifications, and post location to the home hub.
  if (nativeBridge.isNative) {
    await nativeBridge.ready();
    nativeBridge.noteModuleHealth(state.modules);   // baseline, notifies nothing
    nativeBridge.watchModules(state.modules);
    if (state.modules.some((m) => m.id === 'home' && m.enabled)) {
      nativeBridge.startLocation({ moduleId: 'home' });
    }
  }
}

window.addEventListener('hashchange', route);
boot();

export { toast, modal, icon, esc };
