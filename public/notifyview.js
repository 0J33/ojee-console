/* ============================================================
   ojee-console — Settings → Notifications.

   One page for every notification any module can send: per type,
   App (phone app / desktop app / browser) and Discord, a cooldown,
   and the type's own parameters (a time, a threshold, work hours);
   quiet hours; the Discord webhooks; a test per channel; and what
   was sent recently and why something was not.

   The settings live on the server (DATA_DIR/notifications.json), so
   every device sees the same. Only "show notifications on this
   device" is per device.
   ============================================================ */

import * as N from '/notify.js';

const DAYS = [['sun', 'S'], ['mon', 'M'], ['tue', 'T'], ['wed', 'W'], ['thu', 'T'], ['fri', 'F'], ['sat', 'S']];
const DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

let H = null;          // { el, esc, icon, toast, modal, relTime }
let V = null;          // the server's view
let offHistory = null;
let saveTimer = 0;
let pending = {};

const api = async (path, opts = {}) => {
  const r = await fetch(`/api/notify${path}`, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

const effective = (t) => {
  const p = V.prefs.types[t.id] || {};
  const params = Object.fromEntries((t.params || []).map((x) => [x.key, x.default]));
  return {
    app: typeof p.app === 'boolean' ? p.app : t.defaultChannels.includes('app'),
    discord: typeof p.discord === 'boolean' ? p.discord : t.defaultChannels.includes('discord'),
    cooldownMin: Number.isFinite(p.cooldownMin) ? p.cooldownMin : (Number.isFinite(t.cooldownMin) ? t.cooldownMin : 5),
    params: { ...params, ...(p.params || {}) },
  };
};

/* ── saving ───────────────────────────────────────────────────────── */

function queue(patch, { now = false } = {}) {
  // Deep-merge type patches so two quick changes to one type both land.
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'types') {
      pending.types ||= {};
      for (const [id, t] of Object.entries(v)) pending.types[id] = { ...(pending.types[id] || {}), ...t, ...(t.params ? { params: { ...(pending.types[id]?.params || {}), ...t.params } } : {}) };
    } else if (typeof v === 'object' && v) pending[k] = { ...(pending[k] || {}), ...v };
    else pending[k] = v;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, now ? 0 : 450);
}

async function flush() {
  const body = pending; pending = {};
  if (!Object.keys(body).length) return;
  try {
    V = await api('/prefs', { method: 'PUT', body: JSON.stringify(body) });
    H?.toast('ok', 'Saved', 'Every device and module uses this now.', { ms: 1600 });
  } catch (e) {
    H?.toast('err', 'Not saved', e.message);
  }
}

/* ── pieces ───────────────────────────────────────────────────────── */

const line = (k, v) => `<div class="fieldline"><span class="fl-k">${H.esc(k)}</span><span class="fl-lead"></span><span class="fl-v">${v}</span></div>`;
const togrow = (key, on, label, icn) => `<button type="button" class="togrow" data-tog="${key}" data-on="${on ? 1 : 0}" aria-pressed="${on}">
  <span class="tlabel">${icn ? H.icon(icn) : ''}${H.esc(label)}</span><span class="toggle"><span class="track"></span></span></button>`;

function paramField(t, p, value) {
  const id = `nt-${t.id.replace(/\W/g, '-')}-${p.key}`;
  const data = `data-type="${H.esc(t.id)}" data-param="${H.esc(p.key)}" data-ptype="${p.type}"`;
  let ctl;
  if (p.type === 'time') ctl = `<input id="${id}" class="input nt-in" type="time" value="${H.esc(value)}" ${data}>`;
  else if (p.type === 'number') ctl = `<span class="nt-num"><input id="${id}" class="input nt-in" type="number" inputmode="numeric" value="${H.esc(value)}" min="${p.min ?? ''}" max="${p.max ?? ''}" step="${p.step ?? 1}" ${data}>${p.unit ? `<span class="meta">${H.esc(p.unit)}</span>` : ''}</span>`;
  else if (p.type === 'weekday') ctl = `<select id="${id}" class="select nt-in" ${data}>${DAYS.map(([d]) => `<option value="${d}"${d === value ? ' selected' : ''}>${DAY_NAMES[d]}</option>`).join('')}</select>`;
  else if (p.type === 'weekdays') {
    const on = new Set(Array.isArray(value) ? value : []);
    ctl = `<div class="segctl nt-days" role="group" aria-label="${H.esc(p.label || 'Days')}">${DAYS.map(([d, l]) => `<button type="button" aria-pressed="${on.has(d)}" title="${DAY_NAMES[d]}" aria-label="${DAY_NAMES[d]}" data-day="${d}" ${data}>${l}</button>`).join('')}</div>`;
  } else if (p.type === 'boolean') ctl = `<input id="${id}" type="checkbox" ${value ? 'checked' : ''} ${data}>`;
  return `<div class="field nt-param"><label for="${id}">${H.esc(p.label || p.key)}</label>${ctl}</div>`;
}

function typeRow(g, t) {
  const e = effective(t);
  const sev = t.severity === 'critical' ? '<span class="vtag vtag--err">critical</span>' : t.severity === 'warn' ? '<span class="vtag vtag--warn">warn</span>' : '';
  const byModule = t.discordBy === 'module';
  return `<div class="nt-type${e.app || e.discord ? '' : ' nt-type--off'}" data-type-row="${H.esc(t.id)}">
    <div class="nt-main">
      <div class="nt-name"><b>${H.esc(t.label)}</b>${sev}</div>
      ${t.description ? `<p class="nt-desc">${H.esc(t.description)}</p>` : ''}
      ${t.note ? `<p class="nt-desc nt-note">${H.icon('i-warn', 'ic')}<span>${H.esc(t.note)}</span></p>` : ''}
      ${t.params?.length ? `<div class="nt-params">${t.params.map((p) => paramField(t, p, e.params[p.key])).join('')}</div>` : ''}
    </div>
    <div class="nt-side">
      <div class="segctl nt-ch" role="group" aria-label="Channels for ${H.esc(t.label)}">
        <button type="button" data-ch="app" data-type="${H.esc(t.id)}" aria-pressed="${e.app}">App</button>
        <button type="button" data-ch="discord" data-type="${H.esc(t.id)}" aria-pressed="${e.discord}"${byModule ? ` title="Sent by the module itself, so it still arrives when the console is down"` : ''}>Discord${byModule ? '*' : ''}</button>
      </div>
      <label class="nt-cd"><span class="meta">cooldown</span><input class="input nt-in nt-cdin" type="number" min="0" max="1440" step="1" inputmode="numeric" value="${e.cooldownMin}" data-cooldown="${H.esc(t.id)}" aria-label="Cooldown in minutes for ${H.esc(t.label)}"><span class="meta">min</span></label>
    </div>
  </div>`;
}

function hookSelect(name, value, { inherit = false } = {}) {
  const opts = V.prefs.webhooks.map((w) => `<option value="${H.esc(w.id)}"${w.id === value ? ' selected' : ''}>${H.esc(w.name)} ${H.esc(w.hint)}</option>`).join('');
  return `<select class="select nt-hook" data-hook="${H.esc(name)}" aria-label="Discord webhook">${inherit ? `<option value=""${value ? '' : ' selected'}>Default webhook</option>` : `<option value=""${value ? '' : ' selected'}>${V.prefs.webhooks.length ? 'First available' : 'None configured'}</option>`}${opts}</select>`;
}

function moduleSection(g) {
  const dot = g.status === 'ready' ? 'dot--ok' : g.status === 'disabled' ? '' : 'dot--warn';
  const consoleDiscord = g.types.some((t) => t.discordBy !== 'module');
  const link = V.links[g.module];
  const byModule = g.types.some((t) => t.discordBy === 'module');
  return `<section class="panel nt-mod" data-module="${H.esc(g.module)}">
    <div class="panel-head nt-modhead">
      <span class="nt-modname">${H.icon(g.icon || 'i-box')}<span class="label">${H.esc(g.name)}</span><span class="dot ${dot}" title="${H.esc(g.status)}"></span>
        ${g.notify ? `<span class="meta">${link?.connected ? 'listening' : 'not connected'}</span>` : g.module === 'console' ? '' : '<span class="meta">via overview alerts</span>'}</span>
      <span class="nt-modtools">
        ${consoleDiscord && g.module !== 'console' ? hookSelect(g.module, V.prefs.discord.modules[g.module] || '', { inherit: true }) : ''}
        ${g.moduleTest?.includes('discord') ? `<button type="button" class="btn btn--sm btn--ghost" data-modtest="${H.esc(g.module)}">${H.icon('i-send')} Test its Discord</button>` : ''}
      </span>
    </div>
    <div class="nt-types">${g.types.map((t) => typeRow(g, t)).join('')}</div>
    ${byModule ? '<p class="meta nt-foot">* Discord for these is sent by the module itself with its own webhook — so it still arrives when this box is down — using the choices made here.</p>' : ''}
  </section>`;
}

function historyRows() {
  const h = V.history || [];
  if (!h.length) return '<p class="meta">Nothing sent yet.</p>';
  const word = (x) => H.esc(String(x || '—'));
  return `<div class="table-wrap"><table class="table nt-hist">
    <thead><tr><th>When</th><th>Notification</th><th>App</th><th>Discord</th></tr></thead>
    <tbody>${h.slice(0, 30).map((r) => `<tr>
      <td class="nt-when">${H.esc(H.relTime(r.at))}</td>
      <td><b>${H.esc(r.title)}</b><span class="meta"> · ${H.esc(r.moduleName || r.module)}${r.label ? ` · ${H.esc(r.label)}` : ''}</span></td>
      <td class="nt-res nt-res--${r.app === 'sent' || r.app === 'push only' ? 'ok' : 'no'}">${word(r.app)}${r.push ? `<span class="nt-pushres${/failed|gone/.test(r.push) ? ' nt-pushres--err' : ''}">${H.esc(r.push)}</span>` : ''}</td>
      <td class="nt-res nt-res--${r.discord === 'sent' || r.discord === 'by module' ? 'ok' : String(r.discord).startsWith('failed') ? 'err' : 'no'}">${word(r.discord)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function deviceBlock() {
  const kind = N.deviceKind();
  const perm = await N.permission();
  const on = N.deviceEnabled();
  const permWord = { granted: 'allowed', denied: 'blocked — change it in the system/browser settings', default: 'not asked yet', prompt: 'not asked yet', unavailable: 'not available here' }[perm] || perm;
  const canAsk = perm === 'default' || perm === 'prompt';
  // Where push works, "Enable notifications on this device" below asks for
  // permission itself; a second button that only half does it would confuse.
  const pushable = N.pushSupport().ok;
  const honest = {
    'phone app': 'Arrives while the app is open or was opened recently. When the app is fully closed, a phone cannot be woken without a push service, and this sideloaded build has none — Discord is how a closed app hears. What arrived while it was away (last 2 h, up to 5) shows when you open it.',
    'desktop app': 'Arrives while the desktop app is running, including hidden in the tray. Clicking one brings the window back on the right screen.',
    browser: N.pushActive()
      ? 'Push is on here: notifications arrive even when no console is open, and they always come as system notifications (the service worker shows them).'
      : 'Arrives while a console tab is open. A tab in the background shows a system notification; the tab you are looking at shows it in the corner instead. Turn on push below to get them with the console closed.',
  }[kind];
  return `
    ${line('This device', `<span class="fl-v--accent">${H.esc(kind)}</span>`)}
    ${line('Permission', H.esc(permWord))}
    ${line('Live stream', `<span id="nt-conn">${N.connected() ? 'connected' : 'connecting…'}</span> · ${V.clients} open console${V.clients === 1 ? '' : 's'}`)}
    <div class="togglegrid nt-devtog">${togrow('device', on, 'Show notifications on this device', 'i-bell')}</div>
    <div class="nt-btns">
      ${canAsk && !pushable ? `<button type="button" class="btn btn--sm" data-act="allow">${H.icon('i-bell')} Allow notifications</button>` : ''}
      <button type="button" class="btn btn--sm btn--ghost" data-act="test-app">${H.icon('i-send')} Send a test to every open console and push device</button>
    </div>
    <p class="nt-desc">${H.esc(honest)}</p>
    <div class="nt-push" id="nt-push">${await pushBlock()}</div>`;
}

/* ── Web Push: this device, and every subscribed device ───────────── */

let me = { id: null };      // this browser's push device id, if subscribed

async function pushBlock() {
  const sup = N.pushSupport();
  if (sup.why === 'app') return '';
  const head = '<div class="nt-pushhead"><span class="label">Push on this device</span></div>';
  if (sup.why === 'ios-browser') {
    return `${head}<div class="alert alert--info nt-ios" role="note">${H.icon('i-bell')}<div>
      <b>Add to Home Screen first</b>
      <p class="nt-desc">On iPhone, notifications with the console closed only work from the Home Screen app. In Safari tap <b>Share</b> → <b>Add to Home Screen</b>, then open the console from that icon, sign in, and come back here.</p>
    </div></div>`;
  }
  if (!sup.ok) {
    return `${head}${line('Push', sup.why === 'insecure' ? 'needs https' : 'not supported in this browser')}`;
  }
  const st = await N.pushState();
  const dev = st.id ? (V.push?.devices || []).find((d) => d.id === st.id) : null;
  me = { id: dev ? st.id : null };
  const perm = Notification.permission;
  if (dev) {
    return `${head}
      ${line('Push', `<span class="fl-v--accent">on</span> · ${H.esc(dev.label)}`)}
      <div class="nt-btns">
        <button type="button" class="btn btn--sm btn--ghost" data-pushtest="${H.esc(dev.id)}">${H.icon('i-send')} Send test</button>
        <button type="button" class="btn btn--sm btn--ghost" data-act="push-off">Turn off on this device</button>
      </div>`;
  }
  if (perm === 'denied') {
    return `${head}${line('Push', 'blocked')}<p class="nt-desc">Notifications are blocked for this site. Allow them in ${sup.ios ? 'Settings → Notifications → ojee' : 'the browser’s site settings'}, then reload.</p>`;
  }
  return `${head}
    <form class="nt-pushform" data-form="push">
      <div class="field"><label for="nt-plabel">Name this device</label><input id="nt-plabel" class="input" name="label" maxlength="60" value="${H.esc(N.guessLabel())}" autocomplete="off"></div>
      <button type="submit" class="btn" data-act="push-on">${H.icon('i-bell')} Enable notifications on this device</button>
    </form>
    <p class="nt-desc">Notifications then arrive even with the console closed${sup.ios ? ' — the Home Screen app does not need to be open' : ''}. They follow the same choices, quiet hours and cooldowns as everything else on this page.</p>`;
}

function pushDevicesPanel() {
  const list = V.push?.devices || [];
  const when = (t) => (t ? H.esc(H.relTime(t)) : '—');
  return `<section class="panel" id="nt-pushdevs">
    <div class="panel-head"><span class="label">Push devices</span><span class="meta">${list.length} device${list.length === 1 ? '' : 's'}</span></div>
    <div class="stack">
      ${list.length ? list.map((d) => `<div class="row nt-hookrow nt-pdev" data-pdev="${H.esc(d.id)}">
        <span class="stack nt-hookname">
          <span class="nt-pname"><input class="input nt-plabel" value="${H.esc(d.label)}" maxlength="60" data-pdlabel="${H.esc(d.id)}" aria-label="Name of ${H.esc(d.label)}">${d.id === me.id ? '<span class="vtag">this device</span>' : ''}</span>
          <span class="meta">added ${when(d.addedAt)} · last delivered ${when(d.lastOkAt)} · ${H.esc(d.service)}</span>
          ${d.lastError ? `<span class="meta nt-perr">last error ${when(d.lastErrorAt)}: ${H.esc(d.lastError)}</span>` : ''}
        </span>
        <span class="nt-btns">
          <button type="button" class="btn btn--sm btn--ghost" data-pushtest="${H.esc(d.id)}">${H.icon('i-send')} Send test</button>
          <button type="button" class="btn btn--sm btn--danger" data-pushdel="${H.esc(d.id)}">Remove</button>
        </span>
      </div>`).join('') : '<p class="nt-desc">No device has push yet. Open this page on the device — on iPhone, from the Home Screen icon — and tap Enable notifications on this device.</p>'}
      <p class="nt-desc">Each device here gets every App notification by Web Push, even with the console closed. A device whose browser dropped its subscription is removed on the next send.</p>
    </div>
  </section>`;
}

async function refreshPush() {
  if (!H?.el) return;
  const box = H.el.querySelector('#nt-push');
  if (box) box.innerHTML = await pushBlock();
  const panel = H.el.querySelector('#nt-pushdevs');
  if (panel) panel.outerHTML = pushDevicesPanel();
}

/* ── render ───────────────────────────────────────────────────────── */

async function render() {
  if (!H?.el.isConnected) return;
  const q = V.prefs.quiet;
  const hooks = V.prefs.webhooks;
  H.el.innerHTML = `
    <div class="grid grid--2 nt-top">
      <section class="panel">
        <div class="panel-head"><span class="label">On this device</span></div>
        <div class="stack" id="nt-device"><div class="skeleton" style="height:120px"></div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><span class="label">Quiet hours</span><span class="meta">${H.esc(V.tz || 'server time')}</span></div>
        <div class="stack">
          <div class="togglegrid">${togrow('quiet', q.on, 'Quiet hours')}${togrow('critical', q.critical, 'Let critical through')}</div>
          <div class="nt-params">
            <div class="field nt-param"><label for="nt-qf">From</label><input id="nt-qf" class="input nt-in" type="time" value="${H.esc(q.from)}" data-quiet="from"></div>
            <div class="field nt-param"><label for="nt-qt">Until</label><input id="nt-qt" class="input nt-in" type="time" value="${H.esc(q.to)}" data-quiet="to"></div>
          </div>
          <p class="nt-desc">Nothing is shown or sent in quiet hours, on any channel — except notifications marked critical, when that is on. Times are the box's (${H.esc(V.tz || 'server')}).</p>
        </div>
      </section>
    </div>
    ${pushDevicesPanel()}
    <section class="panel">
      <div class="panel-head"><span class="label">Discord</span><span class="meta">${hooks.length} webhook${hooks.length === 1 ? '' : 's'}</span></div>
      <div class="stack">
        ${hooks.length ? hooks.map((w) => `<div class="row nt-hookrow">
          <span class="stack nt-hookname"><b>${H.esc(w.name)}</b><span class="meta">${H.esc(w.hint)} · ${w.source === 'env' ? 'from the box’s environment' : 'added here'}${V.prefs.discord.default === w.id ? ' · default' : ''}</span></span>
          <span class="nt-btns">
            <button type="button" class="btn btn--sm btn--ghost" data-hooktest="${H.esc(w.id)}">${H.icon('i-send')} Test</button>
            ${w.source === 'saved' ? `<button type="button" class="btn btn--sm btn--danger" data-hookdel="${H.esc(w.id)}">Remove</button>` : ''}
          </span>
        </div>`).join('') : '<p class="nt-desc">No webhook yet. Add one below (Discord → channel settings → Integrations → Webhooks → Copy URL).</p>'}
        <div class="field"><label>Default webhook</label>${hookSelect('default', V.prefs.discord.default || '')}</div>
        <form class="nt-addhook" data-form="hook">
          <div class="field"><label for="nt-hn">Name</label><input id="nt-hn" class="input" name="name" maxlength="40" placeholder="Phone pings"></div>
          <div class="field nt-hookurl"><label for="nt-hu">Webhook URL</label><input id="nt-hu" class="input" name="url" type="url" autocomplete="off" spellcheck="false" placeholder="https://discord.com/api/webhooks/…" required></div>
          <button type="submit" class="btn btn--ghost">Add</button>
        </form>
        <p class="nt-desc">Webhook URLs stay on the box: this page only ever sees a name and the last four characters. Each module below can use its own.</p>
      </div>
    </section>
    ${V.catalogue.map(moduleSection).join('')}
    <section class="panel">
      <div class="panel-head"><span class="label">Recent</span><span class="meta">what was sent, and why not</span></div>
      <div id="nt-history">${historyRows()}</div>
    </section>`;
  H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
  // The "this device" tag in the list needs the id deviceBlock just found.
  const panel = H.el.querySelector('#nt-pushdevs');
  if (panel && me.id) panel.outerHTML = pushDevicesPanel();
}

/* ── events ───────────────────────────────────────────────────────── */

async function onClick(e) {
  const t = e.target;
  const tog = t.closest('[data-tog]');
  if (tog) {
    const on = tog.dataset.on !== '1';
    tog.dataset.on = on ? '1' : '0'; tog.setAttribute('aria-pressed', String(on));
    const k = tog.dataset.tog;
    if (k === 'device') {
      N.setDeviceEnabled(on);
      if (on && ['default', 'prompt'].includes(await N.permission())) await N.requestPermission();
      H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
      return;
    }
    if (k === 'quiet') queue({ quiet: { on } }, { now: true });
    if (k === 'critical') queue({ quiet: { critical: on } }, { now: true });
    return;
  }
  const ch = t.closest('[data-ch]');
  if (ch) {
    const on = ch.getAttribute('aria-pressed') !== 'true';
    ch.setAttribute('aria-pressed', String(on));
    const row = ch.closest('[data-type-row]');
    const both = [...row.querySelectorAll('[data-ch]')].some((b) => b.getAttribute('aria-pressed') === 'true');
    row.classList.toggle('nt-type--off', !both);
    queue({ types: { [ch.dataset.type]: { [ch.dataset.ch]: on } } }, { now: true });
    return;
  }
  const day = t.closest('[data-day]');
  if (day) {
    day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true'));
    const group = day.closest('.nt-days');
    const days = [...group.querySelectorAll('[data-day]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.day);
    queue({ types: { [day.dataset.type]: { params: { [day.dataset.param]: days } } } });
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'allow') {
    const r = await N.requestPermission();
    H.toast(r === 'granted' ? 'ok' : 'warn', 'Notifications', r === 'granted' ? 'Allowed on this device.' : `Permission: ${r}.`);
    H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
    return;
  }
  if (act === 'test-app') {
    try {
      const r = await api('/test', { method: 'POST', body: JSON.stringify({ channel: 'app' }) });
      const push = r.push ? ` and ${r.push.sent} push device${r.push.sent === 1 ? '' : 's'}${r.push.failed ? ` (${r.push.failed} failed)` : ''}` : '';
      H.toast('info', 'Test sent', `To ${r.clients} open console${r.clients === 1 ? '' : 's'}${push}. On this one it shows as a ${N.pushActive() || !document.hasFocus() ? 'system notification' : 'corner message (you are looking at it)'}.`);
    } catch (err) { H.toast('err', 'Test', err.message); }
    return;
  }
  const pt = t.closest('[data-pushtest]');
  if (pt) {
    pt.disabled = true;
    try {
      const r = await fetch(`/api/notify/push/${encodeURIComponent(pt.dataset.pushtest)}/test`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (j.catalogue) V = j;
      if (j.ok) H.toast('ok', 'Push sent', 'Accepted by the push service — it should show on that device now.');
      else H.toast('err', 'Push failed', j.gone ? 'The device dropped its subscription; it was removed.' : (j.error || `HTTP ${r.status}`));
    } catch (err) { H.toast('err', 'Push failed', err.message); }
    pt.disabled = false;
    await refreshPush();
    return;
  }
  const pd = t.closest('[data-pushdel]');
  if (pd) {
    const ok = await H.modal({ title: 'Remove this device?', body: '<p class="nt-desc">It stops getting push notifications. Enable it again from the device itself.</p>', actions: [{ label: 'Cancel', value: false, variant: 'ghost' }, { label: 'Remove', value: true, variant: 'danger' }] });
    if (!ok) return;
    try {
      if (pd.dataset.pushdel === me.id) await N.disablePush();
      else await api(`/push/${encodeURIComponent(pd.dataset.pushdel)}`, { method: 'DELETE' });
      V = await api('');
      await refreshPush();
    } catch (err) { H.toast('err', 'Not removed', err.message); }
    return;
  }
  if (act === 'push-off') {
    await N.disablePush();
    V = await api('');
    H.toast('ok', 'Push off', 'This device no longer gets push notifications.');
    H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
    const panel = H.el.querySelector('#nt-pushdevs');
    if (panel) panel.outerHTML = pushDevicesPanel();
    return;
  }
  const ht = t.closest('[data-hooktest]');
  if (ht) {
    ht.disabled = true;
    try { await api('/test', { method: 'POST', body: JSON.stringify({ channel: 'discord', webhook: ht.dataset.hooktest }) }); H.toast('ok', 'Discord', 'Test message sent — check the channel.'); } catch (err) { H.toast('err', 'Discord test failed', err.message); }
    ht.disabled = false;
    return;
  }
  const mt = t.closest('[data-modtest]');
  if (mt) {
    mt.disabled = true;
    try {
      const r = await api('/test', { method: 'POST', body: JSON.stringify({ channel: 'discord', module: mt.dataset.modtest }) });
      if (r.ok) H.toast('ok', 'Discord', r.detail || 'The module sent a test message — check the channel.');
      else H.toast('err', 'Module test failed', r.error || 'no answer');
    } catch (err) { H.toast('err', 'Module test failed', err.message); }
    mt.disabled = false;
    return;
  }
  const del = t.closest('[data-hookdel]');
  if (del) {
    const ok = await H.modal({ title: 'Remove webhook?', body: '<p class="nt-desc">Modules that used it go back to the default webhook.</p>', actions: [{ label: 'Cancel', value: false, variant: 'ghost' }, { label: 'Remove', value: true, variant: 'danger' }] });
    if (!ok) return;
    try { V = await api(`/webhooks/${encodeURIComponent(del.dataset.hookdel)}`, { method: 'DELETE' }); await render(); } catch (err) { H.toast('err', 'Not removed', err.message); }
  }
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.pdlabel) {
    api(`/push/${encodeURIComponent(t.dataset.pdlabel)}`, { method: 'PATCH', body: JSON.stringify({ label: t.value }) })
      .then((v) => { V = v; H?.toast('ok', 'Renamed', t.value, { ms: 1400 }); })
      .catch((err) => H?.toast('err', 'Not renamed', err.message));
    return;
  }
  if (t.dataset.quiet) { if (t.value) queue({ quiet: { [t.dataset.quiet]: t.value } }); return; }
  if (t.dataset.cooldown) { queue({ types: { [t.dataset.cooldown]: { cooldownMin: Math.max(0, Math.min(1440, Number(t.value) || 0)) } } }); return; }
  if (t.dataset.hook !== undefined && t.matches('select')) {
    if (t.dataset.hook === 'default') queue({ discord: { default: t.value || null } }, { now: true });
    else queue({ discord: { modules: { [t.dataset.hook]: t.value || null } } }, { now: true });
    return;
  }
  if (t.dataset.param) {
    let v = t.value;
    if (t.dataset.ptype === 'number') v = Number(v);
    if (t.dataset.ptype === 'boolean') v = t.checked;
    if (t.dataset.ptype === 'time' && !v) return;
    queue({ types: { [t.dataset.type]: { params: { [t.dataset.param]: v } } } });
  }
}

async function onSubmit(e) {
  const pf = e.target.closest('[data-form="push"]');
  if (pf) {
    e.preventDefault();
    // Nothing awaited before enablePush: it asks for permission first, and
    // iOS only asks inside the tap.
    const btn = pf.querySelector('button[type="submit"]');
    btn.disabled = true;
    const r = await N.enablePush({ publicKey: V.push.publicKey, label: pf.elements.label.value.trim() || N.guessLabel() });
    if (r.ok) {
      V = r.view?.catalogue ? r.view : await api('');
      H.toast('ok', 'Push on', 'This device now gets notifications even with the console closed. Send a test to check.');
      H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
      const panel = H.el.querySelector('#nt-pushdevs');
      if (panel) panel.outerHTML = pushDevicesPanel();
    } else {
      btn.disabled = false;
      H.toast('err', 'Push not enabled', r.error);
      // A refusal changes what this block should say (blocked, how to undo it).
      H.el.querySelector('#nt-device').innerHTML = await deviceBlock();
    }
    return;
  }
  const f = e.target.closest('[data-form="hook"]');
  if (!f) return;
  e.preventDefault();
  const body = Object.fromEntries(new FormData(f).entries());
  try {
    V = await api('/webhooks', { method: 'POST', body: JSON.stringify(body) });
    H.toast('ok', 'Webhook added', 'Use Test to check it posts.');
    await render();
  } catch (err) { H.toast('err', 'Not added', err.message); }
}

/* ── lifecycle ────────────────────────────────────────────────────── */

export async function mount(el, helpers) {
  H = { el, ...helpers };
  el.classList.add('nt');
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:180px"></div></div>';
  try {
    V = await api('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert--err" role="alert">${helpers.icon('i-warn')}<div>Could not load notification settings: ${helpers.esc(e.message)}</div></div>`;
    return;
  }
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
  offHistory = N.onHistory((rec) => {
    if (!V) return;
    V.history = [rec, ...(V.history || []).filter((r) => r.key !== rec.key)].slice(0, 30);
    const box = H?.el.querySelector('#nt-history');
    if (box) box.innerHTML = historyRows();
  });
  await render();
}

export function unmount() {
  if (pending && Object.keys(pending).length) flush();
  offHistory?.(); offHistory = null;
  if (H?.el) {
    H.el.removeEventListener('click', onClick);
    H.el.removeEventListener('change', onChange);
    H.el.removeEventListener('submit', onSubmit);
  }
  H = null;
}
