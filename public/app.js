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
  esc, icon, toast, modal, relTime, ModuleHost, parseHash,
} from '/chrome.js';
import { mountChrono } from '/chrono.js';
import { pref, setPref, onPrefs } from '/prefs.js';
import * as timesync from '/timesync.js';

// The native bridge. Every export is a no-op in a browser, so the shell has
// one code path rather than a web build and an app build.
import * as nativeBridge from '/native.js';
import * as movement from '/movement/stage.js';

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
  else if (module === 'idle') parts.push('clock');
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

  /* The bottom bar is four fixed places, however many modules there are.

     It used to be one tab per module, cut off at five — so the sixth module
     had no way in on a phone, and Overview never had a tab at all. A bar that
     grows with the module list cannot fit a phone for long. Now: Overview; a
     Modules tab that opens every module in a sheet (and wears the icon and name
     of the one you are in, so it still says where you are); Jump; Settings. */
  const where = state.active.module;
  const cur = where && state.modules.find((m) => m.id === where);
  $('#tabbar').innerHTML = `
    <button class="tabitem${where === null ? ' active' : ''}" data-tab="overview">
      ${icon('i-grid', 'ic ic--lg')}<span>Overview</span></button>
    <button class="tabitem${cur ? ' active' : ''}" data-tab="modules" aria-haspopup="dialog" aria-expanded="${moduleSheetOpen}">
      ${icon(cur ? moduleIcon(cur) : 'i-devices', 'ic ic--lg')}<span>${cur ? esc(cur.name) : 'Modules'}</span></button>
    <button class="tabitem" data-tab="jump">${icon('i-search', 'ic ic--lg')}<span>Jump</span></button>
    <button class="tabitem${where === 'settings' ? ' active' : ''}" data-tab="settings">
      ${icon('i-cog', 'ic ic--lg')}<span>Settings</span></button>`;
  if (moduleSheetOpen) paintModuleSheet();

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

/* ── the modules sheet (phones) ──────────────────────────────────────────
   Every module, one row each, with its status and the one-line headline its
   summary gives the overview — so the sheet is also the quickest status board
   on a phone, not only a list of links. A module that is down stays in the
   list, struck through, carrying its reason: hiding it would make a bad deploy
   look like a feature that was never built. */
let moduleSheetOpen = false;
let moduleSheetEl = null;

function moduleRow(m) {
  const ready = m.status === 'ready';
  const views = ready ? (m.views || []) : [];
  const href = ready ? `#/${esc(m.id)}${views[0] ? `/${esc(views[0].id)}` : ''}` : '#/settings';
  const sum = state.summaries.get(m.id);
  const dot = ready
    ? (sum?.status === 'err' ? 'dot--err' : sum?.status === 'warn' ? 'dot--warn' : 'dot--ok')
    : m.status === 'degraded' ? 'dot--warn' : 'dot--err';
  const line = ready ? (sum?.headline || '') : (m.reason || m.status);
  const on = state.active.module === m.id;
  return `
    <a class="msheet-row${on ? ' is-on' : ''}${ready ? '' : ' is-down'}" href="${href}" ${on ? 'aria-current="page"' : ''}>
      ${icon(moduleIcon(m), 'ic msheet-ic')}
      <span class="msheet-name">${esc(m.name)}</span>
      <span class="dot ${dot}"></span>
      <span class="msheet-line">${esc(line)}</span>
    </a>`;
}

function paintModuleSheet() {
  if (!moduleSheetEl) return;
  const mods = state.modules.filter((m) => m.enabled);
  moduleSheetEl.querySelector('.msheet-list').innerHTML = mods.map(moduleRow).join('');
}

function openModuleSheet() {
  if (moduleSheetOpen) return closeModuleSheet();
  moduleSheetOpen = true;
  const opener = document.activeElement;
  const el = document.createElement('div');
  el.className = 'msheet-backdrop';
  el.innerHTML = `
    <div class="msheet" role="dialog" aria-modal="true" aria-label="Modules">
      <div class="msheet-grip" aria-hidden="true"></div>
      <div class="msheet-list"></div>
      <a class="msheet-foot" href="#/idle">${icon('i-full', 'ic')}<span>Idle display</span></a>
    </div>`;
  document.body.appendChild(el);
  moduleSheetEl = el;
  paintModuleSheet();
  $('#tabbar [data-tab="modules"]')?.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => el.classList.add('is-open'));
  // A tap on the dim area, not on the sheet, dismisses it.
  el.addEventListener('click', (e) => { if (e.target === el) closeModuleSheet(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeModuleSheet(); } });
  (el.querySelector('.msheet-row.is-on') || el.querySelector('.msheet-row'))?.focus();
  el._opener = opener;
}

function closeModuleSheet() {
  if (!moduleSheetOpen) return;
  moduleSheetOpen = false;
  const el = moduleSheetEl;
  moduleSheetEl = null;
  $('#tabbar [data-tab="modules"]')?.setAttribute('aria-expanded', 'false');
  if (!el) return;
  el.classList.remove('is-open');
  const done = () => el.remove();
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 400);                       // reduced motion has no transition to end
  if (el._opener && document.contains(el._opener)) el._opener.focus?.();
}

/* The bar is redrawn on every navigation, so it listens once, at the top. */
document.getElementById('tabbar')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  switch (b.dataset.tab) {
    case 'overview': closeModuleSheet(); location.hash = '#/'; break;
    case 'modules': openModuleSheet(); break;
    case 'jump': closeModuleSheet(); openPalette(); break;
    case 'settings': closeModuleSheet(); location.hash = '#/settings'; break;
    default: break;
  }
});

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
  router: 'i-router',
  peripherals: 'i-mouse',
  music: 'i-music',
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

  // The module's own object, in a strip above its screens. It belongs to the
  // shell, not the module: it survives every mount and unmount, and a module
  // needs no code of its own to have one.
  paintModuleHead(m);

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

function paintModuleHead(m) {
  const head = $('#modhead');
  if (!head) return;
  const sum = state.summaries.get(m.id);
  const ready = m.status === 'ready';
  const jewelClass = !ready ? (m.status === 'degraded' ? 'jewel--warn' : 'jewel--err')
    : sum?.status === 'err' ? 'jewel--err' : sum?.status === 'warn' ? 'jewel--warn' : 'jewel--ok';
  head.hidden = false;
  // No box is reserved for an object that does not exist: a module this build
  // has no model for would otherwise get a 240px hole above its own page.
  const dial = movement.has(m.id)
    ? `<span class="modhead-dial" data-dial="${esc(m.id)}" data-mv-grab aria-hidden="true"></span>`
    : '';
  // The same readings the plate gives this module, so the column beside its
  // screens is not a picture with a caption.
  const facts = (sum?.facts || []).slice(0, 3).map((f) => `
    <div class="comp-fact"><dt>${esc(f.k)}</dt><span class="lead"></span><dd>${esc(String(f.v))}</dd></div>`).join('');
  head.innerHTML = `
    ${dial}
    <div class="modhead-read">
      <span class="modhead-name"><i class="jewel ${jewelClass}"></i>${esc(m.name)}</span>
      <span class="modhead-line">${esc(sum?.headline || (ready ? 'running' : m.reason || 'unavailable'))}</span>
      ${facts ? `<dl class="modhead-facts">${facts}</dl>` : ''}
    </div>`;
  document.body.classList.add('is-module');
  fitView();
  bindModels(`mod:${m.id}`, [m.id]);
  paintCrowns();
  // Landed here directly, with no launcher visit behind it, there is no
  // summary yet: ask for this one and paint again.
  if (!sum && ready && (m.capabilities || []).includes('summary')) {
    refreshSummaries(m.id).then(() => {
      if (state.active.module === m.id && state.summaries.get(m.id)) paintModuleHead(m);
    });
  }
}

function clearModuleHead() {
  document.body.classList.remove('is-module');
  const head = $('#modhead');
  if (!head) return;
  head.hidden = true;
  head.innerHTML = '';
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
  out.push({ group: 'Console', label: 'Idle display', hint: 'full-screen clock',
             href: '#/idle', icon: 'i-monitor' });
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

let homeChrono = null;
let idleRig = null;

function teardownHome() {
  homeChrono?.destroy(); homeChrono = null;
  idleRig?.stop(); idleRig = null;
  document.body.classList.remove('is-idle');
}

/* ---------- the plate ----------
   One movement fills the screen: the calibre at its centre with the figures
   under it, and the five modules as sub-dials ringed around it, each holding
   its own object and what it reports. There is no card grid here on purpose —
   a repeating panel per module is the arrangement this whole world exists to
   refuse, and it is what the first build shipped by reflex.

   The ring is placed in script rather than CSS because it is trigonometry
   against a measured box, and because the same routine serves the launcher
   and the idle display at two different scales. */

/* ── the watch's companion ───────────────────────────────────────────────
   A module that opens up in place (music) is not a register in the column:
   it sits beside the watch, the way a player sits beside a watch on a desk,
   and what it is playing is read under the time. One click on either opens
   it. Everything else stays in the column, which is what gives the column
   back its room. */
const isCompanion = (m) => !!(m?.focus && movement.has(m.id));

function splitCompanions(mods) {
  const companions = mods.filter(isCompanion).slice(0, 1);
  return { companions, ring: mods.filter((m) => !companions.includes(m)) };
}

function companionHTML(m) {
  const ready = m.status === 'ready';
  return `
    <a class="ov-companion" href="#/${esc(m.id)}" ${ready ? `data-focus="${esc(m.id)}"` : ''}
       aria-label="${esc(m.name)}${ready ? ' — open the player' : ' — unavailable'}" data-state="${ready ? 'ok' : 'down'}">
      <span class="ov-companion-dial" data-dial="${esc(m.id)}"></span>
    </a>`;
}

const npClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* The line under the time: title, artist, and how far through. Its bar and
   time are moved on a one-second beat between the module's reports, which
   arrive only when something changes. */
let npTimer = 0;
function npPos(sum) {
  const md = sum?.model || {};
  const d = Number(md.durationMs) || 0;
  const base = (Number(md.progress) || 0) * d;
  const run = md.playing && sum._at ? Date.now() - sum._at : 0;
  return { d, p: Math.min(d, base + run) };
}

function paintNowPlaying() {
  const slots = ['#ov-np', '#idle-np'].map((q) => $(q)).filter(Boolean);
  if (!slots.length) return;
  const m = splitCompanions(state.modules.filter((x) => x.enabled)).companions[0];
  const sum = m && state.summaries.get(m.id);
  const md = sum?.model || {};
  let html = '';
  if (m && m.status === 'ready' && sum) {
    if (!md.connected) {
      html = `<a class="np np--quiet" href="#/${esc(m.id)}">${icon('i-music')}<span class="np-title">${esc(sum.headline || 'Not connected')}</span></a>`;
    } else if (md.title) {
      const { d, p } = npPos(sum);
      html = `
        <a class="np${md.playing ? ' is-playing' : ''}" href="#/${esc(m.id)}" data-focus="${esc(m.id)}"
           aria-label="${esc(`${md.playing ? 'Playing' : 'Paused'}: ${md.title} by ${md.artist || 'unknown'} — open the player`)}">
          ${icon(md.playing ? 'i-music' : 'i-pause')}
          <span class="np-title">${esc(md.title)}</span>
          <span class="np-artist">${esc(md.artist || '')}</span>
          <span class="np-bar" aria-hidden="true"><i style="--f:${d ? (p / d).toFixed(4) : 0}"></i></span>
          <span class="np-time" aria-hidden="true">${npClock(p)}</span>
        </a>`;
    }
  }
  for (const el of slots) if (el.innerHTML !== html) el.innerHTML = html;
  clearInterval(npTimer);
  if (md.playing && md.title) {
    npTimer = setInterval(() => {
      const live = ['#ov-np', '#idle-np'].map((q) => $(q)).filter(Boolean);
      const cur = m && state.summaries.get(m.id);
      if (!live.length || !cur) { clearInterval(npTimer); return; }
      const { d, p } = npPos(cur);
      for (const el of live) {
        el.querySelector('.np-bar i')?.style.setProperty('--f', d ? (p / d).toFixed(4) : '0');
        const t = el.querySelector('.np-time');
        if (t) t.textContent = npClock(p);
      }
    }, 1000);
  }
}

/** One module, as a line on the plate: its object, its headline, and the
    two or three readings worth knowing before you open it. The name is
    printed on the object's dial the way a register's is printed on a watch,
    so the headline never wears a label above it. */
function complication(m, i, factCount = 2) {
  const sum = state.summaries.get(m.id);
  const ready = m.status === 'ready';
  const views = m.views || [];
  const href = ready ? `#/${esc(m.id)}${views[0] ? `/${esc(views[0].id)}` : ''}` : '#/settings';
  const facts = (sum?.facts || []).slice(0, factCount).map((f) => `
    <div class="comp-fact"><dt>${esc(f.k)}</dt><span class="lead"></span><dd>${esc(String(f.v))}</dd></div>`).join('');
  const st = !ready ? 'down' : (sum?.status || 'ok');

  return `
    <a class="comp" href="${href}" data-state="${esc(st)}" data-obj="${movement.has(m.id) ? '1' : '0'}" style="--i:${i}">
      <span class="comp-dial" data-dial="${esc(m.id)}">
        <span class="comp-mark">${esc(m.name)}</span>
      </span>
      <span class="comp-read">
        <span class="comp-head">${esc(sum?.headline || (ready ? 'running' : m.reason || 'unavailable'))}</span>
        ${facts ? `<dl class="comp-facts">${facts}</dl>` : ''}
      </span>
    </a>`;
}

/* Something wrong rides the barrel: the mainspring is what everything in a
   movement depends on, so an alert is engraved beside it with a leader line
   rather than banded across the page in a bordered box. */
function barrelAlertHTML(alerts) {
  if (!alerts.length) return '';
  const worst = alerts.some((a) => a.severity === 'err') ? 'err' : 'warn';
  return `
    <div class="ov-barrel ov-barrel--${worst}">
      <span class="ov-barrel-leader" aria-hidden="true"></span>
      <div class="ov-barrel-body">
        <span class="ov-barrel-count">${alerts.length} ${alerts.length > 1 ? 'things need' : 'thing needs'} attention</span>
        ${alerts.slice(0, 3).map((a) => `
          <a class="ov-barrel-item" href="#/${esc(a.module.id)}${a.view ? `/${esc(a.view)}` : ''}">${esc(a.text)}</a>`).join('')}
      </div>
    </div>`;
}

/* The callout from the alert to the mainspring it is about. One polyline: a
   short shelf off the text, then a straight run to wherever the barrel has
   turned to, and a tick on the end. It is drawn rather than styled because
   the barrel is part of a turning object — where it lands changes every
   frame — and it is hidden whenever there is nothing to point at or nothing
   to point with, so no stroke is ever left orphaned in the field. */
function drawLeader() {
  const svg = $('#ov-leader') || $('#idle-leader');
  if (!svg) return;
  const stg = svg.parentElement;
  const block = stg?.querySelector('.ov-barrel');
  const hide = () => { if (svg.dataset.on) { delete svg.dataset.on; svg.innerHTML = ''; } };
  if (!block || !block.firstElementChild || !stage) { hide(); return; }
  const to = stage.partPoint('clock', 'barrel');
  // The barrel is on the back of the watch. When the dial is toward you the
  // barrel is behind it, and a leader to a part you cannot see is a line to
  // nowhere — so it waits until the watch turns round. Facing, not depth:
  // a part off the centre of a turning object can be nearer than the camera
  // than the side it is on.
  if (!to || !(to.facing > 0.25)) { hide(); return; }

  const sb = stg.getBoundingClientRect();
  const bb = block.getBoundingClientRect();
  // The block sits above the movement, so the shelf leaves from whichever
  // side of it the barrel has turned to.
  const left = to.x > bb.right;
  const x0 = (left ? bb.right : bb.left) - sb.left;
  const y0 = bb.top + bb.height / 2 - sb.top;
  const x1 = x0 + (left ? 18 : -18);
  const x2 = to.x - sb.left;
  const y2 = to.y - sb.top;

  svg.dataset.on = '1';
  svg.dataset.sev = block.classList.contains('ov-barrel--err') ? 'err' : 'warn';
  // Built once and then moved: this runs on every frame the movement draws,
  // and re-parsing two tags sixty times a second to change four numbers is
  // work for nothing.
  let line = svg.firstElementChild;
  if (!line || line.tagName !== 'polyline') {
    svg.innerHTML = '<polyline/><circle r="3"/>';
    line = svg.firstElementChild;
  }
  const dot = svg.lastElementChild;
  line.setAttribute('points', `${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y0.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  dot.setAttribute('cx', x2.toFixed(1));
  dot.setAttribute('cy', y2.toFixed(1));
}

/* The plate is exactly one screenful — nothing on the home screen is below
   the fold, ever. The chrome around it (two bars, the nav, the status strip)
   is measured rather than guessed, because it changes with the viewport and
   a hard-coded number is a scrollbar waiting for a narrower window. */
let fitBase = 0;
let fitOver = 0;
function fitView() {
  const el = $('#view');
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  const bar = $('.statusbar')?.getBoundingClientRect().height || 0;
  const h = Math.max(360, window.innerHeight - top - bar);
  /* The correction below is remembered. This runs on every repaint, and it
     used to start again from the uncorrected height each time: for one frame
     the plate was 40px taller, the scene caught that frame, and every object
     on it dropped and came back up every twenty seconds. The measurement
     starts over only when the room itself changes. */
  if (h !== fitBase) { fitBase = h; fitOver = 0; }
  document.documentElement.style.setProperty('--view-h', `${Math.round(Math.max(360, h - fitOver))}px`);
  // Where the page's content actually starts, under whatever chrome is
  // sticky above it. A sticky column needs it, and it is not a constant:
  // the bars differ by viewport and the safe area differs by device.
  document.documentElement.style.setProperty('--chrome-top', `${Math.round(el.getBoundingClientRect().top)}px`);
  // Then check the answer. Padding below the view, a wrapper's own margin, a
  // scrollbar that appeared because of the first guess — all of them are
  // cheaper to measure once than to enumerate in CSS.
  requestAnimationFrame(() => {
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0) {
      fitOver += over;
      document.documentElement.style.setProperty('--view-h', `${Math.round(Math.max(360, h - fitOver))}px`);
    }
  });
}

function renderLauncher() {
  const mods = state.modules.filter((m) => m.enabled);
  const alerts = overviewAlerts();

  if (!mods.length) {
    teardownHome();
    $('#view').innerHTML = `<div class="empty">${icon('i-warn', 'ic ic--xl')}
      <b>No modules configured</b>
      <span>Add one to config/console.json and reload.</span></div>`;
    return;
  }

  if (!$('#view > .ov')) {
    teardownHome();
    $('#view').innerHTML = `
      <section class="ov">
        <h1 class="sr-only">Overview</h1>
        <div class="ov-stage" id="ov-stage">
          <div class="ov-side">
            <div class="ov-alert" id="ov-barrel"></div>
            <div class="ov-movement">
              <div class="ov-cal" id="ov-cal" data-mv-grab aria-hidden="true"></div>
              <div class="ov-companions" id="ov-companions"></div>
            </div>
            <div class="ov-core">
              <div class="ov-clock" id="ov-clock"></div>
              <div class="np-slot" id="ov-np"></div>
              <div class="ov-regulator"><div id="ov-rate"></div></div>
              <div class="ov-caseline" id="ov-caseline"></div>
              <div class="ov-case">
                ${crownHTML()}
                ${displayHTML()}
                <a class="iconbtn" href="#/idle" aria-label="Idle display" title="Idle display">${icon('i-full')}</a>
              </div>
            </div>
          </div>
          <div class="ov-ring" id="ov-ring"></div>
          <svg class="ov-leader" id="ov-leader" aria-hidden="true"></svg>
        </div>
        <footer class="ov-foot">
          <span class="meta ov-keys">
            <span class="ov-key">Press <kbd class="kbd">/</kbd> to jump anywhere</span>
            <span class="ov-key"><kbd class="kbd">L</kbd> holds the movement still</span>
          </span>
          <a class="lc-link" href="#/settings">${icon('i-cog')} Settings</a>
        </footer>
      </section>`;
    homeChrono = mountChrono($('#ov-clock'), { variant: 'home' });
    fitBase = 0;  // a fresh plate is measured afresh
  }
  const { ring, companions } = splitCompanions(mods);
  $('#ov-ring').innerHTML = ring.map((m, i) => complication(m, i, 2)).join('');
  $('#ov-companions').innerHTML = companions.map(companionHTML).join('');
  paintNowPlaying();
  $('#ov-barrel').innerHTML = barrelAlertHTML(alerts);
  $('#ov-rate').innerHTML = rateHTML();
  $('#ov-caseline').innerHTML = caselineHTML();
  watchRate();
  fitView();
  bindModels('launcher', mods.map((m) => m.id));
  paintCrowns();
}

/* ── the movement ─────────────────────────────────────────────────────────
   One scene for the whole console. It is created the first time a screen
   wants an object in it and torn down when the last one leaves, and every
   screen binds its own boxes: the launcher binds the calibre and one dial
   per module, the idle display binds the same set larger, a module page
   binds its own object in the header strip.

   Nothing here is load-bearing. If three.js never arrives the dials stay
   empty, the host is marked, and every word, number and control on the page
   is exactly where it was. */

let stage = null;
let stageFor = null;          // which screen the current bindings belong to
let crownLocked = movement.initialLock();

function mvHost() { return $('#mv'); }

let stagePending = null;

/* Bloom is a screen effect, not an object one, so the same setting reads
   differently at different sizes: five objects at 130px have their lines
   packed close enough that each line's glow overlaps its neighbours and sums
   into a halo, while one object at 330px has those lines three times further
   apart, each glowing alone. A module's page shows exactly one object and
   shows it big, so it gets a little less; the idle display, read from across
   a room, a little more. */
const bloomFor = (screen) => (screen === 'idle' ? 0.95 : screen.startsWith('mod:') ? 0.85 : 0.85);

async function ensureStage(screen) {
  const host = mvHost();
  if (!host) return null;
  if (stage && stageFor === screen) return stage;
  // Every one of these screens paints more than once — on first route, again
  // when the summaries land, again on each poll — and each paint asks for the
  // stage. Without one in-flight promise to wait on, two paints a frame apart
  // each build a scene and the console ends up with two of everything.
  if (stagePending && stageFor === screen) return stagePending;

  /* ONE scene, for as long as the page lives.
     Building a fresh one per screen meant a new WebGL context, a new
     composer and a fresh import of every model on every navigation — and a
     browser keeps only a handful of live contexts, reclaiming the old ones
     when it gets round to it. A few trips between screens and the newest
     scene is the one that gets refused: objects that arrive late, or never.
     What actually changes between screens is which objects are in the scene
     and which boxes they sit in. */
  if (stage) {
    stage.reset();
    stage.setBloom(bloomFor(screen));
    stageFor = screen;
    return stage;
  }
  stageFor = screen;
  stagePending = movement.create(host, {
    now: () => timesync.now(),
    locked: crownLocked,
    bloom: bloomFor(screen),
    onLock: (v) => { crownLocked = v; paintCrowns(); },
    // The movement turns, so the callout on its barrel is redrawn with it.
    onFrame: () => drawLeader(),
  }).then((made) => {
    // A later screen may have won while this was loading; its own call owns
    // the stage, and this one's result is thrown away rather than leaked.
    if (stageFor !== screen) { made?.destroy(); return stage; }
    stage = made;
    stagePending = null;
    return stage;
  });
  return stagePending;
}

function teardownStage() {
  stage?.destroy();
  stage = null;
  stagePending = null;
  stageFor = null;
}

/* The crown: one control, wherever it appears, freezing every rotation so
   the thing can be read. A movement that will not hold still is jewellery. */
function paintCrowns() {
  paintDisplaySwitches();
  document.querySelectorAll('.crown').forEach((b) => {
    b.setAttribute('aria-pressed', crownLocked ? 'true' : 'false');
    b.querySelector('.crown-label').textContent = crownLocked ? 'locked' : 'turning';
    b.title = crownLocked ? 'Let the movement turn  (L)' : 'Hold the movement still  (L)';
  });
}

function toggleCrown() {
  crownLocked = !crownLocked;
  movement.rememberLock(crownLocked);
  stage?.setLocked(crownLocked);
  paintCrowns();
}

const crownHTML = () => `
  <button class="crown" type="button" data-crown aria-pressed="${crownLocked ? 'true' : 'false'}">
    <span class="crown-label">${crownLocked ? 'locked' : 'turning'}</span>
  </button>`;

/* ── the two display switches ─────────────────────────────────────────────
   Which clock the readout keeps, and which half of the watch's bilingual
   day wheel is showing. They sit beside the crown, because that is where
   this console puts the controls that change what the movement shows
   rather than what it is doing — and because a setting buried two screens
   away is a setting nobody finds.

   Each button says what it IS, not what it would become: reading "12H" off
   a clock showing 12-hour is how every switch on an instrument works. The
   title says what pressing it does. */
const DISPLAY_SWITCHES = [
  { key: 'clock24', on: '24H', off: '12H',
    onTitle: 'Reading 24-hour — switch to 12-hour', offTitle: 'Reading 12-hour — switch to 24-hour' },
  { key: 'dayLang', on: 'ع', off: 'EN',
    onTitle: 'Day wheel in Arabic — switch to English', offTitle: 'Day wheel in English — switch to Arabic' },
];

const switchOn = (sw) => (sw.key === 'clock24' ? pref('clock24') === true : pref('dayLang') === 'ar');

const displayHTML = () => DISPLAY_SWITCHES.map((sw) => {
  const on = switchOn(sw);
  return `<button class="dtog" type="button" data-dtog="${sw.key}" aria-pressed="${on}"
    title="${esc(on ? sw.onTitle : sw.offTitle)}"><span class="dtog-l">${esc(on ? sw.on : sw.off)}</span></button>`;
}).join('');

function paintDisplaySwitches() {
  for (const sw of DISPLAY_SWITCHES) {
    const on = switchOn(sw);
    document.querySelectorAll(`[data-dtog="${sw.key}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.dtog-l').textContent = on ? sw.on : sw.off;
      b.title = on ? sw.onTitle : sw.offTitle;
    });
  }
}

function toggleDisplay(key) {
  if (key === 'clock24') setPref('clock24', !pref('clock24'));
  else if (key === 'dayLang') setPref('dayLang', pref('dayLang') === 'ar' ? 'en' : 'ar');
}

/* What each object is told about its module. A module that describes its own
   state in `summary.model` gets its object driven properly; one that does not
   still gets its status, so it recolours and dims like the rest. */
function modelState(m) {
  const sum = state.summaries.get(m.id);
  const status = m.status !== 'ready'
    ? (m.status === 'degraded' ? 'warn' : 'err')
    : (sum?.status || 'ok');
  // `base` lets a model turn a module-relative path (a cover image) into
  // one the page can load.
  return { status, ...(sum?.model || {}), base: `/${m.id}` };
}

function bindModels(screen, ids) {
  ensureStage(screen).then((st) => {
    if (!st) return;
    st.bind('clock', screen === 'idle' ? '#idle-cal' : '#ov-cal', { fill: 0.92 });
    // On a module's own page its object is the only one in the scene and it
    // gets the room the calibre gets on the plate — the same object at 56px
    // in a header strip was a smudge, and it is the one thing on that page
    // the module is about. On the plate it is one of five in a column, so it
    // keeps the register's fill.
    const fill = screen.startsWith('mod:') ? 0.85 : 0.78;
    // The watch's companion shares the watch's row at the watch's size, so
    // it fills its box the way the watch fills its own.
    const fillFor = (id) => (!screen.startsWith('mod:') && isCompanion(state.modules.find((x) => x.id === id)) ? 0.96 : fill);
    const binds = ids.map((id) => st.bind(id, `[data-dial="${id}"]`, { fill: fillFor(id) }));
    // Once now, for anything already in the scene, and once more when the
    // models that were still loading have landed. The stage holds state for
    // a model that has not arrived, so neither of these can be too early —
    // but a page that never pushes again must not be left showing defaults.
    pushModelStates();
    Promise.all(binds).then(() => pushModelStates());
  });
}

/** Push live state into every bound object, including the alert that rides
    the mainspring barrel. */
function pushModelStates() {
  if (!stage) return;
  const mods = state.modules.filter((m) => m.enabled);
  for (const m of mods) stage.setState(m.id, modelState(m));
  const alerts = overviewAlerts();
  const worst = alerts.some((a) => a.severity === 'err') ? 'err'
    : alerts.length ? 'warn' : null;
  stage.setAlert(worst);
}

/* ── opening an object up ─────────────────────────────────────────────────
   A module may declare a `focus` UI. Clicking its object on the plate then
   opens the object where it is rather than navigating away: it travels to
   the middle of the screen, turns square on, grows, and everything else
   steps back. The module's UI is laid over exactly the parts of the object
   the model says are for it — its screen, its keys — so the thing you
   clicked is the thing you use.

   The camera is orthographic, so "exactly" is exact: a model unit is a
   known number of pixels at a known box size, and the DOM is placed by
   the same arithmetic the stage uses to place the object. */

let focusOpen = null;         // { id, el, opener, ui, place }

const focusable = (m) => !!(m && m.status === 'ready' && m.focus && movement.has(m.id));

function focusArea() {
  // The room the page has: right of the side nav, between the bars.
  const v = $('#view')?.getBoundingClientRect();
  const tab = $('#tabbar');
  const tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0;
  const top = Math.max(0, Math.min(v?.top ?? 0, 120));
  const left = v ? Math.max(0, v.left) : 0;
  const right = v ? Math.min(window.innerWidth, v.right) : window.innerWidth;
  return { left, top, width: right - left, height: window.innerHeight - tabH - top };
}

function placeFocus() {
  if (!focusOpen || !stage) return;
  const { el, layout } = focusOpen;
  const a = focusArea();
  const barH = 64;
  const bodyW = layout.body.w;
  const bodyH = layout.body.h + 0.2;                // the keys stand proud of the top
  // Pixels per model unit: as big as fits, capped where the player stops
  // gaining anything from more size.
  const k = Math.max(40, Math.min((a.width * (a.width < 600 ? 0.98 : 0.94)) / bodyW, ((a.height - barH) * 0.9) / bodyH, 960 / bodyW));
  const cx = a.left + a.width / 2;
  const cy = a.top + (a.height - barH) / 2 + 0.1 * k;
  const side = 4 * k;                                // fill 1: the box's side is the model's diameter
  const box = el.querySelector('.mfocus-box');
  Object.assign(box.style, { left: `${cx - side / 2}px`, top: `${cy - side / 2}px`, width: `${side}px`, height: `${side}px` });
  const put = (node, r) => {
    if (!node || !r) return;
    Object.assign(node.style, {
      left: `${cx + (r.x - r.w / 2) * k}px`, top: `${cy - (r.y + r.h / 2) * k}px`,
      width: `${r.w * k}px`, height: `${r.h * k}px`,
    });
  };
  put(el.querySelector('.mfocus-screen'), layout.screen);
  put(el.querySelector('.mfocus-deck'), layout.deck);
  const bar = el.querySelector('.mfocus-bar');
  bar.style.top = `${cy + (layout.body.h / 2) * k + 18}px`;
  bar.style.left = `${cx}px`;
  // The canvas is blended onto the page, so an object's dark body is
  // really a hole: the page behind shows through it. Opened up, the object
  // gets a solid plate of its own shape underneath.
  const plate = el.querySelector('.mfocus-plate');
  Object.assign(plate.style, {
    left: `${cx - (bodyW / 2) * k}px`, top: `${cy - (layout.body.h / 2) * k}px`,
    width: `${bodyW * k}px`, height: `${layout.body.h * k}px`,
    borderRadius: `${(layout.body.r ?? 0.13) * k}px`,
  });
  focusOpen.bodyRect = { l: cx - (bodyW / 2) * k, r: cx + (bodyW / 2) * k, t: cy - (bodyH / 2) * k, b: cy + (layout.body.h / 2) * k };
  stage.sync();
}

async function openFocus(m) {
  if (focusOpen || !stage || !focusable(m)) return false;
  const layout = stage.layoutOf(m.id);
  if (!layout?.screen || !layout?.body) return false;
  const el = document.createElement('div');
  el.className = 'mfocus';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', m.name);
  el.innerHTML = `
    <div class="mfocus-scrim"></div>
    <div class="mfocus-plate" aria-hidden="true"></div>
    <div class="mfocus-box" aria-hidden="true"></div>
    <div class="mfocus-ui">
      <div class="mfocus-screen"></div>
      <div class="mfocus-deck"></div>
      <div class="mfocus-bar">
        <button type="button" class="mfocus-lock" aria-pressed="true" title="Let it turn  (L)">${icon('i-unlock')}<span>Unlock</span></button>
        <a class="mfocus-more" href="#/${esc(m.id)}">${icon(moduleIcon(m))}<span>More</span></a>
        <button type="button" class="mfocus-close" aria-label="Close">${icon('i-close')}<span>Close</span></button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('is-focus');
  focusOpen = { id: m.id, el, layout, opener: document.activeElement, ui: null };
  placeFocus();
  if (!stage.focus(m.id, el.querySelector('.mfocus-box'), { fill: 1 })) { closeFocus(); return false; }
  requestAnimationFrame(() => el.classList.add('is-open'));

  // A drag that ends off the object is a spin, not a click outside it.
  let downAt = null;
  el.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; }, true);
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mfocus-close')) { closeFocus(); return; }
    if (e.target.closest('.mfocus-lock')) { setFocusFree(!focusOpen?.free); return; }
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    if (e.target.closest('.mfocus-screen, .mfocus-deck, .mfocus-bar')) return;
    // A click on the object's own body is a miss, not a dismissal.
    const b = focusOpen?.bodyRect;
    if (b && e.clientX > b.l && e.clientX < b.r && e.clientY > b.t && e.clientY < b.b) return;
    closeFocus();
  });

  const v = m.version ? `?v=${encodeURIComponent(m.version)}` : '';
  if (m.focus.css && !document.getElementById(`focus-css-${m.id}`)) {
    const l = document.createElement('link');
    l.id = `focus-css-${m.id}`; l.rel = 'stylesheet'; l.href = `/${m.id}${m.focus.css}${v}`;
    document.head.appendChild(l);
  }
  const screen = el.querySelector('.mfocus-screen');
  try {
    const mod = await import(`/${m.id}${m.focus.ui}${v}`);
    if (focusOpen?.el !== el) return true;
    focusOpen.ui = mod.mount({ screen, deck: el.querySelector('.mfocus-deck') }, { base: `/${m.id}` });
  } catch (err) {
    console.error(`[${m.id}] focus UI failed`, err);
    screen.innerHTML = `<p class="mfocus-err">${esc(m.name)} could not load its player.</p>`;
  }
  (el.querySelector('.mfocus-deck button:not(:disabled)') || el.querySelector('.mfocus-close'))?.focus({ preventScroll: true });
  return true;
}

/* Unlocked, the object is an object again: it sways, it can be spun, and it
   draws its own screen. Locked, it comes home square on and the live screen
   is laid back over it once it has arrived. */
function setFocusFree(free) {
  if (!focusOpen) return;
  focusOpen.free = !!free;
  const { el, id } = focusOpen;
  el.classList.toggle('is-free', focusOpen.free);
  stage?.setFixed(id, !focusOpen.free);
  const b = el.querySelector('.mfocus-lock');
  b.setAttribute('aria-pressed', String(!focusOpen.free));
  b.title = focusOpen.free ? 'Hold it square on  (L)' : 'Let it turn  (L)';
  b.innerHTML = `${icon(focusOpen.free ? 'i-lock' : 'i-unlock')}<span>${focusOpen.free ? 'Lock' : 'Unlock'}</span>`;
}

function closeFocus() {
  if (!focusOpen) return;
  const { id, el, opener, ui } = focusOpen;
  focusOpen = null;
  try { ui?.destroy?.(); } catch { /* the module's to clean up */ }
  stage?.unfocus(id);
  el.classList.remove('is-open');
  document.body.classList.remove('is-focus');
  let gone = false;
  const done = () => { if (!gone) { gone = true; el.remove(); } };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 450);
  if (opener?.isConnected) opener.focus?.({ preventScroll: true });
}

// Escape closes before anything else hears it: the idle display spends
// Escape on leaving, and a player that closes AND takes you off the idle
// screen is two things for one key.
document.addEventListener('keydown', (e) => {
  if (!focusOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeFocus(); return; }
  if (e.key === 'Tab') {
    const f = [...focusOpen.el.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    return;
  }
  if (e.target.closest?.('input:not([type=range])')) return;
  // L is this view's lock, not the crown's on the page behind; / is the
  // palette's, and the palette is behind.
  if (e.key === 'l' || e.key === 'L') { e.preventDefault(); e.stopImmediatePropagation(); setFocusFree(!focusOpen.free); return; }
  if (e.key === '/') e.stopImmediatePropagation();
}, true);
window.addEventListener('resize', () => placeFocus());

/* The plate's line for a module with a player follows it live — a new
   track shows up in seconds, not on the next twenty-second poll. The
   stream is the module's slow one: it only has to notice a change. */
const liveFeeds = new Map();  // id -> EventSource

function syncLiveFeeds() {
  const onPlate = state.active.module === null || state.active.module === 'idle';
  const want = new Set(onPlate
    ? state.modules.filter((m) => focusable(m) && (m.capabilities || []).includes('sse')).map((m) => m.id)
    : []);
  for (const [id, es] of liveFeeds) if (!want.has(id)) { es.close(); liveFeeds.delete(id); }
  for (const id of want) {
    if (liveFeeds.has(id)) continue;
    let t = 0;
    const es = new EventSource(`/${id}/api/events?pace=ambient`);
    es.addEventListener('state', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await refreshSummaries(id);
        pushModelStates();
        if (state.active.module === null) renderLauncher();
        else if (state.active.module === 'idle') renderIdle();
      }, 250);
    });
    liveFeeds.set(id, es);
  }
}

/** The NTP rate, drawn the way a watch is regulated: zero in the middle,
    the pointer where this clock actually sits against true time. */
let rateSub = null;
function watchRate() {
  rateSub?.();
  rateSub = timesync.onChange(() => {
    const box = $('#ov-rate');
    if (box) box.innerHTML = rateHTML();
  });
}

/* What the caseback says: the day, where this clock stands, and where its
   time comes from. */
function caselineHTML() {
  const t = timesync.info();
  const now = timesync.now();
  return `
    <span>${esc(timesync.shortDate(now))}</span>
    <span>${esc(timesync.zoneCity(t.zone))} · ${esc(timesync.zoneAbbr(now))}</span>
    <span>source <b>${t.verified ? 'NTP' : t.synced ? 'console' : 'device'}</b></span>`;
}

function rateHTML() {
  const t = timesync.info();
  // deviceMs is this machine's own clock against the reference: the number a
  // watch's rate scale shows, in the units a watch shows it in.
  const off = Number.isFinite(t.deviceMs) ? t.deviceMs : null;
  // +-250 ms of scale. Past that the pointer pins and the number still reads.
  const pos = off === null ? 50 : Math.max(2, Math.min(98, 50 + (off / 250) * 48));
  const acc = Number.isFinite(t.accuracyMs) ? `±${t.accuracyMs} ms` : 'unsynced';
  return `
    <div class="rate" title="This device's clock against the reference, and how well the reference is known">
      <span>rate</span>
      <div class="rate-scale"><span class="rate-pointer" style="left:${pos.toFixed(1)}%"></span></div>
      <span class="rate-value">${off === null ? '—' : `${off > 0 ? '+' : ''}${off} ms`}</span>
      <span class="rate-acc">${esc(acc)}</span>
    </div>`;
}

/* ── the idle display ─────────────────────────────────────────────────────
   #/idle: the home page for a monitor that is left on it. The chrome goes,
   the clock takes the screen, and the modules report underneath it. Built for
   being on all day: the screen is held awake, the pointer and controls hide
   when nobody is using them, the whole layout drifts a few pixels each minute
   so nothing sits on the same pixels for hours, and it dims at night. */

/* The idle display is the same movement, given the whole screen. It used to
   be a clock with a list of modules beside it; a list is not a scene, and the
   answer to "what is happening" should be readable from across the room. */

function startIdleRig(root) {
  const stage = root.querySelector('.idle-stage');
  const fsBtn = root.querySelector('.idle-fs');
  let lock = null, stillTimer = 0, minuteTimer = 0, enteredFs = false;
  const off = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

  // Keep the screen awake. Released by the browser whenever the tab is hidden,
  // so it is asked for again each time it comes back.
  const wake = async () => {
    try { if (!document.hidden && navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch { /* denied: harmless */ }
  };
  wake();
  on(document, 'visibilitychange', wake);

  // Pointer and controls hide after a few quiet seconds; any movement or
  // keyboard focus brings them back.
  const active = () => {
    root.classList.add('is-active');
    clearTimeout(stillTimer);
    stillTimer = setTimeout(() => root.classList.remove('is-active'), 2800);
  };
  active();
  on(root, 'pointermove', active);
  on(root, 'pointerdown', active);

  // Once a minute: drift a few pixels, and dim between 23:00 and 06:00.
  const minute = () => {
    const h = new Date(timesync.now()).getHours();
    root.classList.toggle('is-night', h >= 23 || h < 6);
    const d = () => Math.round((Math.random() * 2 - 1) * 6);
    stage.style.translate = `${d()}px ${d()}px`;
    minuteTimer = setTimeout(minute, 60_000 - (timesync.now() % 60_000) + 50);
  };
  minute();

  const paintFs = () => {
    const fs = !!document.fullscreenElement;
    fsBtn.innerHTML = icon(fs ? 'i-unfull' : 'i-full');
    fsBtn.setAttribute('aria-label', fs ? 'Leave full screen' : 'Full screen');
    fsBtn.title = `${fs ? 'Leave full screen' : 'Full screen'}  F`;
  };
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); enteredFs = true; }
    } catch { /* not allowed here: the display still works windowed */ }
  };
  paintFs();
  fsBtn.hidden = !document.fullscreenEnabled;
  on(fsBtn, 'click', toggleFs);
  on(document, 'fullscreenchange', paintFs);
  on(document, 'keydown', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
    // In full screen the browser spends Escape on leaving it; windowed, Escape
    // leaves the display.
    else if (e.key === 'Escape' && !document.fullscreenElement) location.hash = '#/';
  });

  return {
    stop() {
      off.forEach((f) => f());
      clearTimeout(stillTimer); clearTimeout(minuteTimer);
      lock?.release().catch(() => {});
      if (enteredFs && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}

function renderIdle() {
  const mods = state.modules.filter((m) => m.enabled);
  const alerts = overviewAlerts();

  if (!$('#view > .idle')) {
    teardownHome();
    document.body.classList.add('is-idle');
    $('#view').innerHTML = `
      <section class="idle" aria-label="Clock and status">
        <div class="ov-stage idle-stage" id="idle-stage">
          <div class="ov-side">
            <div class="ov-alert" id="idle-barrel"></div>
            <div class="ov-movement">
              <div class="ov-cal idle-cal" id="idle-cal" data-mv-grab aria-hidden="true"></div>
              <div class="ov-companions" id="idle-companions"></div>
            </div>
            <div class="ov-core">
              <div class="idle-clock" id="idle-clock"></div>
              <div class="np-slot" id="idle-np"></div>
            </div>
          </div>
          <div class="ov-ring" id="idle-ring"></div>
          <svg class="ov-leader" id="idle-leader" aria-hidden="true"></svg>
        </div>
        <div class="idle-tools">
          ${crownHTML()}
          ${displayHTML()}
          <button class="iconbtn idle-fs" type="button"></button>
          <a class="iconbtn" href="#/" aria-label="Leave the idle display" title="Leave  Esc">${icon('i-close')}</a>
        </div>
      </section>`;
    homeChrono = mountChrono($('#idle-clock'), { variant: 'idle' });
    fitBase = 0;
    idleRig = startIdleRig($('#view > .idle'));
  }
  const { ring, companions } = splitCompanions(mods);
  $('#idle-ring').innerHTML = ring.map((m, i) => complication(m, i, 3)).join('');
  $('#idle-companions').innerHTML = companions.map(companionHTML).join('');
  paintNowPlaying();
  $('#idle-barrel').innerHTML = barrelAlertHTML(alerts);
  fitView();
  bindModels('idle', mods.map((m) => m.id));
  paintCrowns();
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
      <div class="table-wrap"><table class="table set-mods">
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
      <div class="row set-dev">
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
        <td${m.version ? '' : ' data-empty'}>${esc(m.version || '—')}</td>
        <td class="num"${m.latencyMs != null ? '' : ' data-empty'}>${m.latencyMs != null ? `${m.latencyMs} ms` : '—'}</td>
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
async function refreshSummaries(only) {
  const mods = state.modules.filter((m) => m.enabled && m.status === 'ready'
    && (m.capabilities || []).includes('summary')
    && (!only || m.id === only));
  await Promise.all(mods.map(async (m) => {
    try {
      const res = await fetch(`/${m.id}/api/summary`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const sum = await res.json();
      // When this was true, so a line that runs on its own clock (the music
      // position) can carry on from it.
      sum._at = Date.now();
      state.summaries.set(m.id, sum);
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
    if (document.hidden) return;
    const open = state.active.module;
    if (open && open !== 'idle') {
      // On a module's own page only that module's line is on screen, so
      // only that module is asked. Its header is live either way — a strip
      // that says "running" while the module below it is on fire is worse
      // than a strip that says nothing.
      await refreshSummaries(open);
      pushModelStates();
      const m = state.modules.find((x) => x.id === open);
      if (m) paintModuleHead(m);
      return;
    }
    await refreshSummaries();
    pushModelStates();
    if (!open) { renderLauncher(); renderSidenav(); }
    else renderIdle();
  }, 20000);
}

function stopOverviewPoll() {
  if (overviewTimer) { clearInterval(overviewTimer); overviewTimer = null; }
}

window.addEventListener('resize', fitView);

document.addEventListener('click', (e) => {
  const opener = e.target.closest?.('[data-focus]');
  if (opener && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const id = opener.dataset.focus;
    const m = state.modules.find((x) => x.id === id);
    if (focusable(m) && stage?.layoutOf(id)) { e.preventDefault(); openFocus(m); return; }
  }
  const crown = e.target.closest?.('[data-crown]');
  if (crown) { e.preventDefault(); toggleCrown(); return; }
  const dtog = e.target.closest?.('[data-dtog]');
  if (dtog) { e.preventDefault(); toggleDisplay(dtog.dataset.dtog); }
});

// Another tab can flip these too, so the buttons follow the value rather
// than assuming they are the only thing that changes it.
onPrefs(paintDisplaySwitches);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'l' && e.key !== 'L') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = document.activeElement;
  if (t?.closest?.('input, textarea, [contenteditable]') || paletteOpen) return;
  e.preventDefault();
  toggleCrown();
});

async function route() {
  closeModuleSheet();
  closeFocus();
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
      clearModuleHead();
      refreshSummaries().then(() => {
        if (!state.active.module) { renderLauncher(); renderSidenav(); pushModelStates(); }
      });
      startOverviewPoll();
      syncLiveFeeds();
      return;
    }

    if (module === 'idle') {
      state.active = { module: 'idle', view: null };
      renderNav();
      setTitle();
      await host.unmount();
      clearModuleHead();
      renderIdle();
      refreshSummaries().then(() => {
        if (state.active.module === 'idle') { renderIdle(); pushModelStates(); }
      });
      startOverviewPoll();
      syncLiveFeeds();
      return;
    }

    stopOverviewPoll();
    syncLiveFeeds();
    teardownHome();

    if (module === 'settings') {
      state.active = { module: 'settings', view: null };
      renderNav();
      setTitle();
      clearModuleHead();
      teardownStage();
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

  // The hud clock reads the same reference as the home page, so two clocks on
  // one screen never disagree about which second it is.
  timesync.start();
  const hud = $('#hud-clock');
  const hudTick = () => {
    const t = timesync.now();
    hud.textContent = timesync.hms(t);
    setTimeout(hudTick, 1000 - (t % 1000) + 4);
  };
  hudTick();
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
