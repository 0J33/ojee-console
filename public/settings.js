/* ============================================================
   ojee.console — Settings.

   #/settings/notifications  every alert kind of every module, one table:
                             Toast / Inbox / Off, its threshold, Discord
   #/settings/delivery       this device, Web Push, Discord webhooks
   #/settings/appearance     theme (follows you to every device)
   #/settings/devices        session, trusted devices, widget keys
   #/settings/modules        what the registry sees

   Changes save as you make them (debounced), server side, so every
   device agrees. "Mute this kind" in the inbox writes the same setting.
   ============================================================ */
import { esc, toast, modal, relTime } from '/chrome.js';
import { ic, placeSegs } from '/ojee-ui3.js';
import * as N from '/notify.js';

const SECTIONS = [
  ['notifications', 'Notifications'],
  ['delivery', 'Delivery'],
  ['appearance', 'Appearance'],
  ['devices', 'Devices'],
  ['modules', 'Modules'],
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let H = null;        // { el, section, applyTheme, setTheme, currentTheme, modules, refreshModules, session }
let V = null;        // /api/notify view
let pending = null;
let saveTimer = null;
let mounted = false;

export const isMounted = () => mounted;

/* ── saving ─────────────────────────────────────────────────────────── */
function queue(patch, { now = false } = {}) {
  pending = merge(pending || {}, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, now ? 0 : 500);
}
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
  return out;
}
async function flush() {
  if (!pending) return;
  const body = pending;
  pending = null;
  try {
    const r = await fetch('/api/notify/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    V = await r.json();
    const s = H?.el?.querySelector('[data-saved]');
    if (s) { s.textContent = 'Saved'; s.classList.add('on'); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('on'), 1600); }
  } catch (e) { toast('err', 'Not saved', e.message); }
}

/* ── helpers ────────────────────────────────────────────────────────── */
const effective = (t) => {
  const p = V.prefs.types?.[t.id] || {};
  const params = {};
  for (const x of t.params || []) params[x.key] = x.default;
  let channel = ['toast', 'inbox', 'off'].includes(p.channel) ? p.channel
    : t.channel || (t.blocking ? 'toast' : ((t.defaultChannels || ['app']).length ? 'inbox' : 'off'));
  if (p.app === false && !p.channel) channel = 'off';
  const discordDefault = typeof t.discord === 'boolean' ? t.discord : (t.defaultChannels || []).includes('discord');
  return { channel, discord: typeof p.discord === 'boolean' ? p.discord : discordDefault, params: { ...params, ...(p.params || {}) } };
};
const sw = (on, attrs, label) => `<button class="sw" type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${attrs}></button>`;
const seg = (key, value, opts, label) => `<div class="seg sm" data-seg="${esc(key)}" role="group" aria-label="${esc(label)}"><span class="ind"></span>${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join('')}</div>`;

function paramInput(t, p, value) {
  const id = `p-${t.id}-${p.key}`.replace(/[^a-z0-9-]/gi, '-');
  const attrs = `id="${id}" data-type="${esc(t.id)}" data-param="${esc(p.key)}" aria-label="${esc(`${t.label}: ${p.label || p.key}`)}"`;
  let input = '';
  if (p.type === 'number') input = `<input class="in num" type="number" inputmode="decimal" ${attrs} value="${esc(value ?? '')}"${p.min != null ? ` min="${p.min}"` : ''}${p.max != null ? ` max="${p.max}"` : ''}${p.step != null ? ` step="${p.step}"` : ''}>`;
  else if (p.type === 'time') input = `<input class="in" type="time" ${attrs} value="${esc(value ?? '')}">`;
  else if (p.type === 'boolean') input = sw(!!value, `data-type="${esc(t.id)}" data-param="${esc(p.key)}" data-bool="1"`, `${t.label}: ${p.label || p.key}`);
  else if (p.type === 'weekday') input = `<select class="in select" ${attrs}>${DAYS.map((d, i) => `<option value="${i}"${Number(value) === i ? ' selected' : ''}>${d}</option>`).join('')}</select>`;
  else if (p.type === 'weekdays') {
    const on = new Set((Array.isArray(value) ? value : []).map(String));
    input = `<span class="btns" role="group" aria-label="${esc(`${t.label}: ${p.label || p.key}`)}">${DAYS.map((d, i) => `<button type="button" class="chip" data-days="${esc(t.id)}|${esc(p.key)}" data-day="${i}" aria-pressed="${on.has(String(i)) || on.has(d.toLowerCase())}">${d.slice(0, 2)}</button>`).join('')}</span>`;
  }
  else return '';
  return `<label class="cond" for="${id}"><span>${esc(p.label || p.key)}</span>${input}${p.unit ? `<span class="unit">${esc(p.unit)}</span>` : ''}</label>`;
}

/* ── sections ───────────────────────────────────────────────────────── */
function quietPanel() {
  const q = V.prefs.quiet;
  return `<div class="panel">
    <div class="set"><div class="t">Quiet hours</div><div class="d">Nothing toasts or pushes in this window. Blocking items still come through.</div>
      <div class="ctrl">${sw(q.on, 'data-q="on"', 'Quiet hours')}</div></div>
    <div class="set wrap"><div class="t">From – to</div><div class="d">Local time${V.tz ? ` · ${esc(V.tz)}` : ''}</div>
      <div class="ctrl"><input class="in" type="time" data-q="from" value="${esc(q.from)}" aria-label="Quiet hours start"><span class="unit">to</span><input class="in" type="time" data-q="to" value="${esc(q.to)}" aria-label="Quiet hours end"></div></div>
    <div class="set"><div class="t">Blocking breaks through</div><div class="d">A question Claude is waiting on, sustained critical heat, a host down.</div>
      <div class="ctrl">${sw(q.critical !== false, 'data-q="critical"', 'Blocking breaks through quiet hours')}</div></div>
  </div>`;
}

function kindsTable() {
  const hasHook = (V.prefs.webhooks || []).length > 0;
  const groups = V.catalogue.filter((g) => g.types.length);
  return `<div class="panel clip"><div class="scroll"><table class="t kinds">
    <thead><tr><th>Alert</th><th>Delivery</th><th>Condition</th><th class="r">Discord</th></tr></thead>
    <tbody>${groups.map((g) => `
      <tr class="grp"><td colspan="4"><span class="gname">${ic(g.icon || 'i-box', 's')}${esc(g.name)}</span>${g.status && g.status !== 'ready' ? `<span class="tag">${g.quietOffline ? 'offline' : esc(g.status)}</span>` : ''}</td></tr>
      ${g.types.map((t) => {
        const e = effective(t);
        const params = (t.params || []).map((p) => paramInput(t, p, e.params[p.key])).filter(Boolean).join('');
        const byModule = t.discordBy === 'module';
        return `<tr data-row="${esc(t.id)}" class="${e.channel === 'off' ? 'is-off' : ''}">
          <td class="kname"><div class="t">${esc(t.label)}${t.blocking ? ` ${'<span class="tag err">Blocking</span>'}` : ''}</div>${t.description ? `<div class="d">${esc(t.description)}</div>` : ''}</td>
          <td>${seg(`ch:${t.id}`, e.channel, [['toast', 'Toast'], ['inbox', 'Inbox'], ['off', 'Off']], `${t.label} delivery`)}</td>
          <td class="cc"><div class="conds">${params || '<span class="muted">—</span>'}</div></td>
          <td class="r">${sw(e.discord, `data-discord="${esc(t.id)}"${!hasHook && !byModule ? ' disabled title="Add a Discord webhook under Delivery first"' : ''}`, `${t.label} to Discord`)}</td>
        </tr>`;
      }).join('')}`).join('')}
    </tbody></table></div></div>`;
}

function notificationsSection() {
  return `
    <section class="sec"><div class="sh"><h2>Quiet hours</h2><span class="note">every device</span><div class="r"><span class="saved" data-saved aria-live="polite"></span></div></div>${quietPanel()}</section>
    <section class="sec"><div class="sh"><h2>Alerts</h2><span class="note">Toast = toast, push and inbox · Inbox = inbox and badge, no sound · Off = muted</span></div>${kindsTable()}</section>`;
}

async function deliverySection() {
  const kind = N.deviceKind();
  const perm = await N.permission();
  const permWord = { granted: 'Allowed', denied: 'Blocked in the browser', default: 'Not asked yet', prompt: 'Not asked yet', unavailable: 'Not available here' }[perm] || perm;
  const sup = N.pushSupport();
  const st = sup.ok ? await N.pushState() : { id: null };
  const myDev = st.id ? (V.push?.devices || []).find((d) => d.id === st.id) : null;
  const pushRow = sup.why === 'app' ? '' : !sup.ok
    ? `<div class="set"><div class="t">Push with the console closed</div><div class="d">${sup.why === 'ios-browser' ? 'On iPhone: Share → Add to Home Screen, open the console from that icon, then come back here.' : sup.why === 'insecure' ? 'Needs https.' : 'Not supported in this browser.'}</div></div>`
    : myDev
      ? `<div class="set"><div class="t">Push is on</div><div class="d">${esc(myDev.label)} · toasts arrive even with the console closed</div><div class="ctrl"><button class="btn sm ghost" type="button" data-act="push-test" data-id="${esc(myDev.id)}">${ic('send', 's')}Test</button><button class="btn sm" type="button" data-act="push-off">Turn off</button></div></div>`
      : `<div class="set"><div class="t">Push with the console closed</div><div class="d">Blocking alerts reach this device even when no console is open.</div><div class="ctrl"><button class="btn sm pri" type="button" data-act="push-on">${ic('bell', 's')}Enable</button></div></div>`;
  const devs = V.push?.devices || [];
  const hooks = V.prefs.webhooks || [];
  return `
    <section class="sec"><div class="sh"><h2>This device</h2><span class="note">${esc(kind)}</span></div><div class="panel">
      <div class="set"><div class="t">Toasts on this device</div><div class="d">Permission: ${esc(permWord)} · stream ${N.connected() ? 'connected' : 'connecting'}</div><div class="ctrl">${sw(N.deviceEnabled(), 'data-act="device"', 'Toasts on this device')}</div></div>
      ${pushRow}
      <div class="set"><div class="t">Send a test</div><div class="d">To every open console${devs.length ? ` and ${devs.length} push device${devs.length === 1 ? '' : 's'}` : ''}.</div><div class="ctrl"><button class="btn sm" type="button" data-act="test-app">${ic('send', 's')}Send</button></div></div>
    </div></section>
    ${devs.length ? `<section class="sec"><div class="sh"><h2>Push devices</h2><span class="cnt">${devs.length}</span></div><div class="panel rows">${devs.map((d) => `
      <div class="row"><span class="sic">${ic('devices')}</span><span class="grow"><span class="t">${esc(d.label)}${d.id === st.id ? ' <span class="tag">this device</span>' : ''}</span><span class="d">last delivered ${d.lastOkAt ? esc(relTime(d.lastOkAt)) : 'never'}${d.lastError ? ` · last error: ${esc(d.lastError)}` : ''}</span></span>
        <button class="btn sm ghost" type="button" data-act="push-test" data-id="${esc(d.id)}">Test</button><button class="btn sm danger" type="button" data-act="push-del" data-id="${esc(d.id)}">Remove</button></div>`).join('')}</div></section>` : ''}
    <section class="sec"><div class="sh"><h2>Discord</h2><span class="note">only for the alerts you switch on in the table</span></div><div class="panel rows">
      ${hooks.map((w) => `<div class="row"><span class="sic">${ic('link')}</span><span class="grow"><span class="t">${esc(w.name)}${V.prefs.discord.default === w.id ? ' <span class="tag">default</span>' : ''}</span><span class="d m">${esc(w.hint)}${w.source === 'env' ? ' · from the environment' : ''}</span></span>
        <button class="btn sm ghost" type="button" data-act="hook-test" data-id="${esc(w.id)}">Test</button>${w.source === 'env' ? '' : `<button class="btn sm danger" type="button" data-act="hook-del" data-id="${esc(w.id)}">Remove</button>`}</div>`).join('')}
      ${hooks.length > 1 || V.catalogue.some((g) => g.moduleTest?.length) ? V.catalogue.filter((g) => g.module !== 'console' && g.types.some((t) => effective(t).discord || t.discordBy === 'module')).map((g) => `
        <div class="row"><span class="sic">${ic(g.icon || 'i-box')}</span><span class="grow"><span class="t">${esc(g.name)}</span><span class="d">sends to</span></span>
          ${hooks.length ? `<select class="in select" data-hookfor="${esc(g.module)}" aria-label="${esc(g.name)} Discord webhook"><option value="">Default</option>${hooks.map((w) => `<option value="${esc(w.id)}"${V.prefs.discord.modules?.[g.module] === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select>` : ''}
          ${(g.moduleTest || []).includes('discord') ? `<button class="btn sm ghost" type="button" data-act="module-test" data-id="${esc(g.module)}">Test its own sender</button>` : ''}</div>`).join('') : ''}
      <form class="row hookform" data-form="hook">
        <input class="in" name="name" placeholder="Name" maxlength="40" aria-label="Webhook name" autocomplete="off">
        <input class="in grow" name="url" placeholder="https://discord.com/api/webhooks/…" aria-label="Webhook URL" autocomplete="off" spellcheck="false">
        <button class="btn sm" type="submit">${ic('plus', 's')}Add</button>
      </form>
    </div></section>`;
}

function appearanceSection() {
  const t = H.currentTheme();
  return `<section class="sec"><div class="sh"><h2>Appearance</h2><span class="note">follows you to every device</span></div><div class="panel">
    <div class="set"><div class="t">Theme</div><div class="d">Dark is the default.</div>
      <div class="ctrl">${seg('theme', t, [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], 'Theme')}</div></div>
  </div></section>`;
}

async function devicesSection() {
  const s = H.session() || {};
  const [{ devices, current, trustDays }, { keys }] = await Promise.all([
    fetch('/api/devices').then((r) => r.json()),
    fetch('/api/widget-keys').then((r) => r.json()),
  ]);
  return `
    <section class="sec"><div class="sh"><h2>This session</h2></div><div class="panel">
      <div class="set"><div class="t">${esc(s.user || '—')}</div><div class="d m">${esc(s.peer?.node || '—')} · signed in by ${esc(s.via === 'device-trust' ? 'trusted device' : 'TOTP')}</div>
        <div class="ctrl"><button class="btn sm" type="button" data-act="signout">${ic('exit', 's')}Sign out</button></div></div>
    </div></section>
    <section class="sec"><div class="sh"><h2>Trusted devices</h2><span class="note">skip TOTP for ${trustDays} days</span>${devices.length ? '<div class="r"><button class="btn sm ghost danger" type="button" data-act="revoke-all">Revoke all</button></div>' : ''}</div>
      <div class="panel rows">${devices.length ? devices.map((d) => `
        <div class="row"><span class="sic">${ic('shield')}</span><span class="grow"><span class="t">${esc(d.label)}${d.id === current ? ' <span class="tag acc">this device</span>' : ''}</span><span class="d">last used ${esc(relTime(d.lastSeenAt))} · expires ${esc(relTime(d.expiresAt))} · ${d.uses} use${d.uses === 1 ? '' : 's'}</span></span>
          <button class="btn sm danger" type="button" data-act="revoke" data-id="${esc(d.id)}" data-current="${d.id === current}">Revoke</button></div>`).join('')
        : `<div class="empty">${ic('shield')}<b>No trusted devices</b><p>Tick “trust this device” at sign-in to skip TOTP for ${trustDays} days in that browser.</p></div>`}</div></section>
    <section class="sec"><div class="sh"><h2>Phone widgets</h2><span class="note">Scriptable keys: read widget data, switch the AC</span><div class="r"><button class="btn sm" type="button" data-act="wk-new">${ic('plus', 's')}New key</button></div></div>
      <div class="panel rows">${keys.length ? keys.map((k) => `
        <div class="row"><span class="sic">${ic('key')}</span><span class="grow"><span class="t">${esc(k.label)}</span><span class="d">made ${esc(relTime(k.createdAt))} · ${k.lastUsedAt ? `last used ${esc(relTime(k.lastUsedAt))}` : 'never used'}</span></span>
          <button class="btn sm danger" type="button" data-act="wk-del" data-id="${esc(k.id)}">Revoke</button></div>`).join('')
        : `<div class="empty">${ic('key')}<b>No widget keys</b><p>Make one to use the console's widgets in Scriptable on your phone.</p></div>`}</div></section>`;
}

function modulesSection() {
  const mods = H.modules();
  const word = (m) => (m.status === 'ready' ? ['ok', 'Ready'] : m.status === 'disabled' ? ['n', 'Disabled'] : m.quietOffline && m.status === 'unreachable' ? ['n', 'Offline'] : m.status === 'degraded' ? ['warn', 'Degraded'] : ['err', m.status[0].toUpperCase() + m.status.slice(1)]);
  return `<section class="sec"><div class="sh"><h2>Modules</h2><span class="note">${mods.filter((m) => m.status === 'ready').length} of ${mods.filter((m) => m.enabled).length} ready</span><div class="r"><button class="btn sm ghost" type="button" data-act="recheck">${ic('refresh', 's')}Re-check</button></div></div>
    <div class="panel clip"><div class="scroll"><table class="t">
      <thead><tr><th>Module</th><th>Status</th><th>Version</th><th class="r">Latency</th></tr></thead>
      <tbody>${mods.map((m) => {
        const [s, w] = word(m);
        return `<tr><td><b>${esc(m.name)}</b> <span class="muted m">${esc(m.id)}</span></td>
          <td><span class="st"><span class="dot" style="--c:${s === 'ok' ? 'var(--ok)' : s === 'warn' ? 'var(--warn)' : s === 'err' ? 'var(--err)' : 'var(--fg-3)'}"></span><span>${esc(w)}</span></span>${m.reason && m.status !== 'disabled' ? `<div class="muted reason">${esc(m.reason)}</div>` : ''}</td>
          <td class="m">${esc(m.version || '—')}</td><td class="r m">${m.latencyMs != null ? `${m.latencyMs} ms` : '—'}</td></tr>`;
      }).join('')}</tbody></table></div></div></section>`;
}

/* ── render ─────────────────────────────────────────────────────────── */
async function render() {
  const sec = SECTIONS.some(([id]) => id === H.section) ? H.section : 'notifications';
  const tabs = `<div class="settabs"><div class="seg" data-seg="settings-tabs" role="tablist" aria-label="Settings sections"><span class="ind"></span>${SECTIONS.map(([id, l]) => `<a href="#/settings/${id}" role="tab" aria-selected="${id === sec}" ${id === sec ? 'aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</div></div>`;
  let body = '';
  if (sec === 'notifications' || sec === 'delivery') {
    if (!V) V = await (await fetch('/api/notify')).json();
    body = sec === 'notifications' ? notificationsSection() : await deliverySection();
  } else if (sec === 'appearance') body = appearanceSection();
  else if (sec === 'devices') body = await devicesSection();
  else body = modulesSection();
  if (!mounted) return;
  H.el.innerHTML = `<div class="settings" data-section="${sec}">${tabs}${body}</div>`;
  placeSegs(H.el);
}

export async function mount(el, helpers) {
  const same = mounted && H?.el === el;
  H = { ...helpers, el };
  mounted = true;
  V = null;
  if (!same) {
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('submit', onSubmit);
  }
  el.innerHTML = `<div class="panel pad stack" aria-busy="true"><div class="skeleton" style="height:16px;width:30%"></div><div class="skeleton" style="height:140px"></div></div>`;
  await render();
}

export function unmount() {
  if (!mounted) return;
  mounted = false;
  flush();
  H.el.removeEventListener('click', onClick);
  H.el.removeEventListener('change', onChange);
  H.el.removeEventListener('submit', onSubmit);
  H.el.innerHTML = '';
}

/* ── events ─────────────────────────────────────────────────────────── */
async function confirmDanger(title, text, label) {
  return modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Cancel', value: false, variant: 'ghost' }, { label, value: true, variant: 'danger solid' }] });
}

async function onClick(e) {
  const segBtn = e.target.closest('.seg[data-seg] > button');
  if (segBtn) {
    const segEl = segBtn.parentElement;
    const key = segEl.dataset.seg;
    if (segBtn.getAttribute('aria-pressed') === 'true') return;
    segEl.querySelectorAll(':scope > button').forEach((b) => b.setAttribute('aria-pressed', String(b === segBtn)));
    placeSegs(segEl.parentElement);
    const v = segBtn.dataset.v;
    if (key === 'theme') { await H.setTheme(v); return; }
    if (key.startsWith('ch:')) {
      const id = key.slice(3);
      segEl.closest('tr')?.classList.toggle('is-off', v === 'off');
      queue({ types: { [id]: { channel: v } } });
    }
    return;
  }
  const swEl = e.target.closest('.sw');
  if (swEl && !swEl.disabled && !swEl.dataset.act) {
    const on = swEl.getAttribute('aria-checked') !== 'true';
    swEl.setAttribute('aria-checked', String(on));
    if (swEl.dataset.q) queue({ quiet: { [swEl.dataset.q]: on } });
    else if (swEl.dataset.discord) queue({ types: { [swEl.dataset.discord]: { discord: on } } });
    else if (swEl.dataset.bool) queue({ types: { [swEl.dataset.type]: { params: { [swEl.dataset.param]: on } } } });
    return;
  }
  const day = e.target.closest('[data-days]');
  if (day) {
    const on = day.getAttribute('aria-pressed') !== 'true';
    day.setAttribute('aria-pressed', String(on));
    const [tid, key] = day.dataset.days.split('|');
    const all = [...day.parentElement.querySelectorAll('[data-day]')].filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => DAYS[Number(x.dataset.day)].toLowerCase().slice(0, 3));
    queue({ types: { [tid]: { params: { [key]: all } } } });
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'device': {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      N.setDeviceEnabled(on);
      if (on && ['default', 'prompt'].includes(await N.permission())) await N.requestPermission();
      break;
    }
    case 'test-app': {
      const r = await fetch('/api/notify/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'app' }) }).then((x) => x.json()).catch(() => null);
      toast(r?.ok ? 'ok' : 'err', r?.ok ? 'Test sent' : 'Test failed', r?.ok ? `${r.clients} open console${r.clients === 1 ? '' : 's'}${r.push ? ` · push ${r.push.sent} sent` : ''}` : '');
      break;
    }
    case 'push-on': {
      const r = await N.enablePush({ publicKey: V.push.publicKey, label: N.guessLabel() });
      if (!r.ok) toast('err', 'Push not enabled', r.error);
      else { V = r.view; toast('ok', 'Push is on'); }
      render();
      break;
    }
    case 'push-off': await N.disablePush(); V = null; render(); break;
    case 'push-test': {
      const r = await fetch(`/api/notify/push/${encodeURIComponent(id)}/test`, { method: 'POST' }).then((x) => x.json()).catch(() => ({}));
      toast(r.ok ? 'ok' : 'err', r.ok ? 'Push test sent' : 'Push test failed', r.error || '');
      break;
    }
    case 'push-del': {
      if (!(await confirmDanger('Remove push device', 'It stops getting notifications until it enables push again.', 'Remove'))) return;
      V = await fetch(`/api/notify/push/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((x) => x.json());
      render();
      break;
    }
    case 'hook-test': {
      const r = await fetch('/api/notify/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'discord', webhook: id }) }).then((x) => x.json()).catch(() => ({}));
      toast(r.ok ? 'ok' : 'err', r.ok ? 'Sent to Discord' : 'Discord test failed', r.error || (r.status ? `HTTP ${r.status}` : ''));
      break;
    }
    case 'hook-del': {
      if (!(await confirmDanger('Remove webhook', 'Alerts set to Discord stop going there.', 'Remove'))) return;
      V = await fetch(`/api/notify/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((x) => x.json());
      render();
      break;
    }
    case 'module-test': {
      const r = await fetch('/api/notify/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'discord', module: id }) }).then((x) => x.json()).catch(() => ({}));
      toast(r.ok ? 'ok' : 'err', r.ok ? 'The module sent a test' : 'Module test failed', r.error || '');
      break;
    }
    case 'signout': await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; break;
    case 'revoke': {
      const cur = b.dataset.current === 'true';
      if (!(await confirmDanger('Revoke device', cur ? 'This is the device you are using. You will need a TOTP code the next time you sign in here.' : 'That device will need a TOTP code the next time it signs in.', 'Revoke'))) return;
      await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('ok', 'Device revoked');
      render();
      break;
    }
    case 'revoke-all': {
      if (!(await confirmDanger('Revoke all devices', 'Every trusted device, including this one, will need a TOTP code. You are signed out now.', 'Revoke all'))) return;
      await fetch('/api/devices/revoke-all', { method: 'POST' });
      location.href = '/login';
      break;
    }
    case 'wk-new': {
      const r = await fetch('/api/widget-keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Scriptable widgets' }) });
      if (!r.ok) { toast('err', 'Could not make a key', `HTTP ${r.status}`); return; }
      const k = await r.json();
      const body = document.createElement('div');
      body.className = 'stack';
      body.innerHTML = `<p>Copy it now and paste it into Scriptable when a widget asks. It is not shown again.</p>
        <input class="in m" readonly spellcheck="false" autocomplete="off" style="width:100%"><button class="btn sm" type="button">${ic('copy', 's')}Copy key</button>`;
      const input = body.querySelector('input'); input.value = k.key;
      const copy = body.querySelector('button');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(k.key); copy.textContent = 'Copied'; } catch { input.focus(); input.select(); copy.textContent = 'Selected — copy it'; }
      });
      await modal({ title: 'Widget key', body, actions: [{ label: 'Done', value: true, variant: 'primary' }] });
      render();
      break;
    }
    case 'wk-del': {
      if (!(await confirmDanger('Revoke widget key', 'Widgets using this key stop updating until they get a new one.', 'Revoke'))) return;
      await fetch(`/api/widget-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
      render();
      break;
    }
    case 'recheck': {
      b.setAttribute('aria-busy', 'true');
      await H.refreshModules();
      render();
      break;
    }
    default: break;
  }
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.hookfor) { queue({ discord: { modules: { [t.dataset.hookfor]: t.value || null } } }, { now: true }); return; }
  if (t.dataset.q && (t.dataset.q === 'from' || t.dataset.q === 'to')) { if (t.value) queue({ quiet: { [t.dataset.q]: t.value } }); return; }
  if (t.dataset.param && t.dataset.type) {
    const v = t.type === 'number' || t.tagName === 'SELECT' ? Number(t.value) : t.value;
    if (t.type === 'number' && !Number.isFinite(v)) return;
    queue({ types: { [t.dataset.type]: { params: { [t.dataset.param]: v } } } });
  }
}

async function onSubmit(e) {
  const f = e.target.closest('[data-form="hook"]');
  if (!f) return;
  e.preventDefault();
  const name = f.elements.name.value.trim() || 'Webhook';
  const url = f.elements.url.value.trim();
  const r = await fetch('/api/notify/webhooks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast('err', 'Webhook not added', j.error || `HTTP ${r.status}`); return; }
  V = j;
  toast('ok', 'Webhook added');
  render();
}
