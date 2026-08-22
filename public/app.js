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

function renderBranding() {
  const b = state.branding;
  if (!b) return;
  document.title = `${b.wordmark}${b.wordmarkAccent}${b.wordmarkTail} · console`;
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
  const entries = navEntries();
  const isActive = (e) =>
    e.moduleId === state.active.module && (e.viewId === state.active.view || e.viewId === null);

  $('#nav-links').innerHTML = entries.map((e) => `
    <a class="nav-link${isActive(e) ? ' active' : ''}${e.unavailable ? ' nav-link--down' : ''}"
       href="#/${esc(e.moduleId)}${e.viewId ? `/${esc(e.viewId)}` : ''}"
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
      ${icon(e.icon, 'ic ic--lg')}<span>${esc(e.module.name)}</span>
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

async function refreshModules({ force = false } = {}) {
  const res = await fetch(force ? '/api/modules/refresh' : '/api/modules', { method: force ? 'POST' : 'GET' });
  if (!res.ok) return;
  state.modules = (await res.json()).modules || [];
}

let routing = false;
async function route() {
  if (routing) return;
  routing = true;
  try {
    // parseHash is generic ({a, b}); here the two levels are module and view.
    const { a: module, b: view } = parseHash();

    if (module === 'settings') {
      state.active = { module: 'settings', view: null };
      renderNav();
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
