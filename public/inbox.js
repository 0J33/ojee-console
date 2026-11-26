/* ============================================================
   ojee.console — the inbox, the bell and blocking toasts.

   One inbox for every module. Its state comes from the server
   (/api/notify/stream, event `inbox`), so every device shows the same
   list; this file only draws it and sends what the person does:

     Snooze 1h · Mute this kind · Done — each with Undo
     a digest line for non-blocking updates ("5 updates")
     quiet hours in the footer

   Toasts appear only for raises the server marked toast-worthy
   (blocking kinds, or kinds set to "Toast" in Settings), and only once
   per raise however many tabs are open (notify.js arbitrates).
   ============================================================ */
import { esc, toast as plainToast } from '/chrome.js';
import { ic, col, ago, tag } from '/ojee-ui3.js';
import * as notifyClient from '/notify.js';

const $ = (s) => document.querySelector(s);
const EMPTY = { open: [], snoozed: [], resolved: [], muted: [], updates: [], quiet: null };
let snap = EMPTY;
let isOpenNow = false;
let onChange = () => {};
let iconFor = () => 'i-alert';
const undo = new Map();     // key -> { kind: 'snooze'|'mute'|'done', label, prev, kindId, until, at }
let foldUpdates = false;
let foldResolved = false;

export const snapshot = () => snap;
export const isOpen = () => isOpenNow;

const sevOf = (it) => (it.blocking || it.severity === 'critical' || it.severity === 'err' ? 'err' : it.severity === 'warn' ? 'warn' : 'n');
const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  if (j.inbox) setSnap(j.inbox);
  return j;
}

function setSnap(s) {
  snap = { ...EMPTY, ...(s || {}) };
  // Undo rows outlive the item they replaced for a short while only.
  const now = Date.now();
  for (const [k, u] of undo) if (now - u.at > 12_000) undo.delete(k);
  if (isOpenNow) paint();
  onChange(snap);
}

/* ── actions ────────────────────────────────────────────────────────── */
export async function snooze(key, minutes = 60) {
  const it = snap.open.find((x) => x.key === key);
  try {
    const j = await post('/api/inbox/snooze', { key, minutes });
    undo.set(key, { kind: 'snooze', label: it?.title || '', until: j.until, at: Date.now() });
    if (!isOpenNow) actionToast('Snoozed for 1 hour', `Back at ${hm(j.until)}.`, 'Undo', () => unsnooze(key));
    paintIfOpen();
  } catch (e) { plainToast('err', 'Could not snooze', e.message); }
}

async function unsnooze(key) {
  undo.delete(key);
  try { await post('/api/inbox/unsnooze', { key }); } catch (e) { plainToast('err', 'Could not undo', e.message); }
}

async function mute(key) {
  const it = [...snap.open, ...snap.snoozed].find((x) => x.key === key);
  if (!it) return;
  try {
    const j = await post('/api/notify/mute', { kind: it.kind });
    undo.set(key, { kind: 'mute', label: it.kindLabel || it.kind, kindId: it.kind, prev: j.prev ?? null, at: Date.now() });
    paintIfOpen();
  } catch (e) { plainToast('err', 'Could not mute', e.message); }
}

async function unmute(kindId, prev, key) {
  if (key) undo.delete(key);
  try { await post('/api/notify/unmute', { kind: kindId, prev }); } catch (e) { plainToast('err', 'Could not unmute', e.message); }
}

async function done(key) {
  const it = snap.open.find((x) => x.key === key);
  try {
    await post('/api/inbox/dismiss', { key });
    undo.set(key, { kind: 'done', label: it?.title || '', at: Date.now() });
    paintIfOpen();
  } catch (e) { plainToast('err', 'Could not mark done', e.message); }
}

async function undone(key) {
  undo.delete(key);
  try { await post('/api/inbox/undismiss', { key }); } catch (e) { plainToast('err', 'Could not undo', e.message); }
}

/* ── drawing ────────────────────────────────────────────────────────── */
function itemHTML(it) {
  const sev = sevOf(it);
  const since = it.count > 1 && it.countSince ? `<span>×${it.count} since ${hm(it.countSince)}</span>` : '';
  return `<div class="it" data-key="${esc(it.key)}">
    <span class="sev" style="--c:${col(sev)}">${ic(iconFor(it))}</span>
    <div>
      <div class="t"><span>${esc(it.title)}</span>${it.count > 1 ? `<span class="tag m">×${it.count}</span>` : ''}</div>
      ${it.body ? `<div class="d">${esc(it.body)}</div>` : ''}
      <div class="mt m"><span>${esc(it.moduleName || it.module)}</span><span>${esc(ago(it.raisedAt || it.lastAt))} ago</span>${since}</div>
      <div class="a">
        ${it.route ? `<a class="btn sm${it.blocking ? ' pri' : ''}" href="${esc(it.route)}" data-close>${esc(it.action || 'Open')}</a>` : ''}
        <button class="btn sm" type="button" data-i="snooze">${ic('clock', 's')}Snooze 1h</button>
        ${it.blocking ? '' : `<button class="btn sm ghost" type="button" data-i="mute">${ic('belloff', 's')}Mute this kind</button>`}
        ${it.source === 'events' ? `<button class="btn sm ghost" type="button" data-i="done" title="Mark done; it comes back if raised again">${ic('check', 's')}Done</button>` : ''}
      </div>
    </div></div>`;
}

function undoHTML(key, u) {
  const text = u.kind === 'mute' ? `Muted “${esc(u.label)}” — change it any time in Settings`
    : u.kind === 'done' ? `Marked done · ${esc(u.label)}`
      : `Snoozed for 1 hour · back at <span class="m">${hm(u.until)}</span>`;
  return `<div class="it done" data-key="${esc(key)}"><span class="sev">${ic(u.kind === 'mute' ? 'belloff' : u.kind === 'done' ? 'check' : 'clock')}</span>
    <div><div class="t">${text}</div><div class="a"><button class="btn sm ghost" type="button" data-i="undo">Undo</button></div></div></div>`;
}

function paint() {
  const el = $('#inbox');
  const open = snap.open || [];
  const blocking = open.filter((x) => x.blocking);
  const rest = open.filter((x) => !x.blocking);
  const undoRows = [...undo.entries()].filter(([k]) => !open.some((x) => x.key === k));
  const updates = snap.updates || [];
  const q = snap.quiet;
  const summaryOf = (list) => {
    const by = new Map();
    for (const u of list) by.set(u.moduleName || u.module, (by.get(u.moduleName || u.module) || 0) + 1);
    return [...by.entries()].slice(0, 4).map(([n, c]) => `${c} ${n}`).join(', ');
  };
  let quietText = '';
  if (q) {
    if (!q.on) quietText = 'Quiet hours are off';
    else if (q.active) quietText = `Quiet hours until <span class="m">${esc(q.to)}</span> · blocking still comes through`;
    else quietText = `Quiet hours <span class="m">${esc(q.from)}–${esc(q.to)}</span>`;
  }
  el.innerHTML = `<div class="grab" data-grab><i></i></div>
    <div class="ih"><h2 id="inbox-title">Inbox</h2>${open.length ? `<span class="tag m">${open.length} open</span>` : ''}<button class="ib" type="button" data-i="close" aria-label="Close inbox">${ic('x')}</button></div>
    <div class="ibody">
      ${blocking.length ? `<div class="ig">${ic('alert', 's')}Blocking · these toast</div>${blocking.map(itemHTML).join('')}` : ''}
      ${rest.length ? `<div class="ig">Needs attention</div>${rest.map(itemHTML).join('')}` : ''}
      ${undoRows.length ? `${undoRows.map(([k, u]) => undoHTML(k, u)).join('')}` : ''}
      ${!open.length && !undoRows.length ? `<div class="empty ok">${ic('check')}<div>Nothing needs you.</div></div>` : ''}
      ${(snap.snoozed || []).filter((x) => !undo.has(x.key)).length ? `<div class="ig">${ic('clock', 's')}Snoozed</div>${snap.snoozed.filter((x) => !undo.has(x.key)).map((it) => `<div class="it done" data-key="${esc(it.key)}"><span class="sev">${ic('clock')}</span><div><div class="t">${esc(it.title)}</div><div class="mt m"><span>${esc(it.moduleName)}</span><span>back at ${hm(it.snoozedUntil)}</span></div><div class="a"><button class="btn sm ghost" type="button" data-i="undo-snooze">Bring back now</button></div></div></div>`).join('')}` : ''}
      ${updates.length ? `<button class="fold" type="button" data-i="fold-updates" aria-expanded="${foldUpdates}">${ic('chev', 's rot')}<span><b>${updates.length} ${updates.length === 1 ? 'update' : 'updates'}</b> · ${esc(summaryOf(updates))}</span></button>
        ${foldUpdates ? `<div class="feed">${updates.map((u) => `<div class="ev"><span class="tm m">${hm(u.at)}</span><span class="rail"><span class="dot" style="--c:${col(u.severity === 'warn' ? 'warn' : u.severity === 'critical' ? 'err' : 'n')}"></span></span><span class="tx"><b>${esc(u.moduleName || u.module)}</b> ${esc(u.title)}</span></div>`).join('')}</div>` : ''}` : ''}
      ${(snap.resolved || []).length ? `<button class="fold" type="button" data-i="fold-resolved" aria-expanded="${foldResolved}">${ic('chev', 's rot')}<span><b>${snap.resolved.length} resolved</b> · last 6 hours</span></button>
        ${foldResolved ? snap.resolved.map((it) => `<div class="it resolved"><span class="sev" style="--c:var(--ok)">${ic('check')}</span><div><div class="t">${esc(it.title)}</div><div class="mt m"><span>${esc(it.moduleName)}</span><span>${it.dismissed ? 'marked done' : 'cleared'} ${hm(it.resolvedAt)}</span>${it.count > 1 ? `<span>×${it.count}</span>` : ''}</div></div></div>`).join('') : ''}` : ''}
      ${(snap.muted || []).map((m) => `<div class="fold muted">${ic('belloff', 's')}<span>Muted · ${esc(m.label)} <span class="m">· ${m.count} today</span></span><button class="btn sm ghost" type="button" data-i="unmute" data-kind="${esc(m.kind)}">Unmute</button></div>`).join('')}
    </div>
    <div class="ifoot">${ic('moon', 's')}<span>${quietText}</span><a class="btn sm ghost r" href="#/settings/notifications" data-close>Rules</a></div>`;
}

function paintIfOpen() { if (isOpenNow) paint(); }

/* ── open / close ───────────────────────────────────────────────────── */
let opener = null;
export function open() {
  if (isOpenNow) return;
  isOpenNow = true;
  opener = document.activeElement;
  const el = $('#inbox');
  paint();
  void el.offsetWidth;
  // On desktop it opens beside the sidebar, where its Inbox entry is.
  el.classList.toggle('at-side', matchMedia('(min-width: 1200px)').matches);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'inbox-title');
  $('#scrim').classList.add('on');
  $('#scrim').classList.toggle('light', true);
  el.querySelector('[data-i="close"]')?.focus({ preventScroll: true });
  onChange(snap);
}

export function close() {
  if (!isOpenNow) return;
  isOpenNow = false;
  const el = $('#inbox');
  el.classList.remove('open');
  el.style.transform = '';
  el.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('#more.open')) $('#scrim').classList.remove('on');
  onChange(snap);
  if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
}

export function toggle() { if (isOpenNow) close(); else open(); }

/* Drag-to-dismiss for the phone sheet: 1:1 tracking, velocity flick, rubber-band upward. */
export function bindSheetDrag(el, dismiss) {
  let y0 = 0; let t0 = 0; let dy = 0; let drag = false;
  el.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-grab]');
    if (!h || matchMedia('(min-width: 1200px)').matches) return;
    drag = true; y0 = e.clientY; t0 = performance.now(); dy = 0;
    h.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    dy = e.clientY - y0;
    const d = dy < 0 ? -(Math.abs(dy) * 60) / (60 + Math.abs(dy)) : dy;
    el.style.transform = `translateY(${d}px)`;
  });
  const end = () => {
    if (!drag) return;
    drag = false;
    const v = dy / Math.max(1, performance.now() - t0);
    el.style.transition = '';
    el.style.transform = '';
    if (dy > el.offsetHeight * 0.3 || v > 0.11) dismiss();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ── blocking toasts ────────────────────────────────────────────────── */
function showToast(ev) {
  const stack = $('#toasts');
  if (!stack) return;
  const it = { ...ev, kind: ev.id, kindLabel: ev.label };
  const node = document.createElement('div');
  node.className = 'toast rich';
  node.setAttribute('role', ev.blocking ? 'alert' : 'status');
  node.innerHTML = `<span class="sev" style="--c:${col(sevOf(it))}">${ic(iconFor(it))}</span>
    <div><div class="t"></div><div class="d"></div>
      <div class="a">${ev.route ? `<a class="btn sm pri" href="${esc(ev.route)}" data-t="go"></a>` : ''}<button class="btn sm" type="button" data-t="later">Later</button></div></div>
    <button class="ib sm" type="button" data-t="x" aria-label="Dismiss">${ic('x', 's')}</button>`;
  node.querySelector('.t').textContent = ev.title || '';
  node.querySelector('.d').textContent = ev.body || '';
  const go = node.querySelector('[data-t="go"]');
  if (go) go.textContent = ev.action || 'Open';
  let timer = null;
  const remove = () => { clearTimeout(timer); node.classList.add('out'); setTimeout(() => node.remove(), 200); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(remove, ev.blocking ? 15_000 : 8000); };
  node.addEventListener('click', (e) => { if (e.target.closest('[data-t]')) remove(); });
  node.addEventListener('pointerenter', () => clearTimeout(timer));
  node.addEventListener('pointerleave', arm);
  // Paused while the tab is hidden: a toast nobody saw has not been read.
  const vis = () => { if (document.hidden) clearTimeout(timer); else arm(); };
  document.addEventListener('visibilitychange', vis, { once: true });
  stack.appendChild(node);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  arm();
}

/** A short confirmation with one action (Undo). */
function actionToast(title, detail, label, fn) {
  const stack = $('#toasts');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = 'toast toast--info';
  node.setAttribute('role', 'status');
  node.innerHTML = `<span class="dot"></span><div class="toast-txt"><b></b><span></span></div><button class="btn sm ghost" type="button">${esc(label)}</button>`;
  node.querySelector('b').textContent = title;
  node.querySelector('.toast-txt span').textContent = detail;
  const remove = () => { node.classList.add('out'); setTimeout(() => node.remove(), 200); };
  node.querySelector('button').addEventListener('click', () => { remove(); fn(); });
  stack.appendChild(node);
  setTimeout(remove, 6000);
}

/* ── start ──────────────────────────────────────────────────────────── */
export function start({ onChange: fn, itemIcon } = {}) {
  if (fn) onChange = fn;
  if (itemIcon) iconFor = itemIcon;
  const el = $('#inbox');
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) { close(); return; }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const row = b.closest('[data-key]');
    const key = row?.dataset.key;
    switch (b.dataset.i) {
      case 'close': close(); break;
      case 'snooze': await snooze(key, 60); break;
      case 'mute': await mute(key); break;
      case 'done': await done(key); break;
      case 'undo': {
        const u = undo.get(key);
        if (!u) break;
        if (u.kind === 'snooze') await unsnooze(key);
        else if (u.kind === 'mute') await unmute(u.kindId, u.prev, key);
        else await undone(key);
        break;
      }
      case 'undo-snooze': await unsnooze(key); break;
      case 'unmute': await unmute(b.dataset.kind, null); break;
      case 'fold-updates': foldUpdates = !foldUpdates; paint(); break;
      case 'fold-resolved': foldResolved = !foldResolved; paint(); break;
      default: break;
    }
  });
  bindSheetDrag(el, close);
  notifyClient.onInbox(setSnap);
  notifyClient.start({ toast: showToast });
  fetch('/api/inbox').then((r) => (r.ok ? r.json() : null)).then((s) => { if (s && snap === EMPTY) setSnap(s); }).catch(() => {});
}
