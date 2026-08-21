/* ============================================================
   demo-module — the reference UI entry point.

   A module's UI is a plain ES module with a default export:

     export default {
       async mount(el, ctx)   render into el
       async setView(viewId)  optional — switch view WITHOUT remounting
       async unmount()        tear down
     }

   `ctx` carries everything the module would otherwise reach for
   globally, so a module never touches document outside `el` and
   never ships a second copy of the shell's utilities:

     ctx.api(path, opts)   fetch scoped to /{moduleId}/api
     ctx.sse(path, hs)     EventSource scoped the same way, with
                           reconnection and automatic teardown
     ctx.toast(kind, ...)  transient message
     ctx.modal({...})      focus-trapped dialog, returns a promise
     ctx.icon(name, cls)   <svg><use> against the shell sprite
     ctx.esc(s)            HTML-escape
     ctx.onCleanup(fn)     run fn on unmount
     ctx.view              the view id being mounted
     ctx.capabilities      what the manifest declared

   Implementing setView matters: without it, clicking between this
   module's own views tears the module down and re-imports it,
   which drops the SSE stream every time.
   ============================================================ */

let root = null;
let ctx = null;
let current = 'status';
let snapshot = null;
let stream = null;

/* ── rendering ────────────────────────────────────────────────────────── */

function viewStatus() {
  const s = snapshot || {};
  const on = !!s.power;
  return `
    <div class="stack-lg">
      <div class="section-head">
        <span class="idx">01</span>
        <h2 class="h2">Status</h2>
        <span class="spacer"></span>
        <span class="meta" id="demo-live">connecting</span>
      </div>

      <div class="grid grid--2" style="gap:2px">
        <div class="panel corners"><span class="c"></span>
          <div class="panel-head"><span class="label">Reading</span>
            <span class="badge"><span class="dot ${on ? 'dot--live' : ''}"></span>${on ? 'running' : 'standby'}</span>
          </div>
          <div class="value" id="demo-reading">${s.reading ?? '—'}<sup style="font-size:1rem">°C</sup></div>
          <div class="meta">target ${s.target ?? '—'}°C</div>
        </div>

        <div class="panel stack">
          <div class="panel-head"><span class="label">Control</span></div>
          <button class="btn powerbtn${on ? '' : ' btn--ghost'}" id="demo-power">
            ${ctx.icon('i-power', 'ic ic--lg')} ${on ? 'Turn off' : 'Turn on'}
          </button>
          <div class="dialbtns" style="margin-top:var(--s-3)">
            <button class="stepbtn" id="demo-down" aria-label="Lower target" ${on ? '' : 'disabled'}>−</button>
            <input class="range" id="demo-target" type="range" min="16" max="30" step="1"
                   value="${s.target ?? 24}" aria-label="Target temperature" ${on ? '' : 'disabled'}>
            <button class="stepbtn" id="demo-up" aria-label="Raise target" ${on ? '' : 'disabled'}>+</button>
          </div>
          <div class="fieldline"><span class="fl-k">target</span><span class="fl-lead"></span>
            <span class="fl-v fl-v--accent" id="demo-target-label">${s.target ?? '—'}°C</span></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><span class="label">Identity</span></div>
        <div class="fieldline"><span class="fl-k">console asserts</span><span class="fl-lead"></span>
          <span class="fl-v">${ctx.esc(s.user || '—')}</span></div>
        <p class="meta" style="margin-top:var(--s-2)">
          Signed in X-Console-Auth by the shell. A module verifies it rather than trusting the header.
        </p>
      </div>
    </div>`;
}

function viewLog() {
  const events = snapshot?.events || [];
  return `
    <div class="stack-lg">
      <div class="section-head">
        <span class="idx">02</span>
        <h2 class="h2">Log</h2>
        <span class="spacer"></span>
        <span class="meta">${events.length} event${events.length === 1 ? '' : 's'}</span>
      </div>
      <div class="panel">
        ${events.length ? events.map((e) => `
          <div class="logline">
            <time datetime="${new Date(e.at).toISOString()}">${new Date(e.at).toLocaleTimeString('en-GB', { hour12: false })}</time>
            <span class="lmsg">${ctx.esc(e.message)}</span>
          </div>`).join('')
        : `<div class="empty">${ctx.icon('i-log', 'ic ic--xl')}<b>Nothing yet</b>
             <p>Actions taken in Status appear here.</p></div>`}
      </div>
    </div>`;
}

function paint() {
  root.innerHTML = current === 'log' ? viewLog() : viewStatus();
  if (current === 'status') wireStatus();
}

/**
 * Update the live numbers WITHOUT re-rendering. A full repaint every two
 * seconds would fight the range input for focus and reset it mid-drag.
 */
function patchLive(data) {
  const reading = root.querySelector('#demo-reading');
  if (reading) reading.innerHTML = `${data.reading}<sup style="font-size:1rem">°C</sup>`;
  const live = root.querySelector('#demo-live');
  if (live) live.textContent = `live · ${new Date(data.at).toLocaleTimeString('en-GB', { hour12: false })}`;
}

function wireStatus() {
  const q = (s) => root.querySelector(s);

  q('#demo-power')?.addEventListener('click', async () => {
    const btn = q('#demo-power');
    btn.disabled = true;
    try {
      await ctx.api('/command', { method: 'POST', body: JSON.stringify({ power: !snapshot.power }) });
      await refresh();
    } catch (e) {
      ctx.toast('err', 'Command failed', e.message);
      btn.disabled = false;
    }
  });

  const target = q('#demo-target');
  const label = q('#demo-target-label');

  // Track the drag visually, commit on release. Committing on every input
  // event would post ~30 requests per drag, and a dropped connection
  // mid-drag would leave the device at whatever value happened to land last.
  target?.addEventListener('input', () => { label.textContent = `${target.value}°C`; });
  target?.addEventListener('change', () => commit(Number(target.value)));

  q('#demo-down')?.addEventListener('click', () => commit(Number(target.value) - 1));
  q('#demo-up')?.addEventListener('click', () => commit(Number(target.value) + 1));
}

async function commit(value) {
  const clamped = Math.max(16, Math.min(30, value));
  try {
    await ctx.api('/command', { method: 'POST', body: JSON.stringify({ target: clamped }) });
    await refresh();
  } catch (e) {
    ctx.toast('err', 'Could not set target', e.message);
  }
}

async function refresh() {
  snapshot = await ctx.api('/state');
  paint();
}

/* ── contract ─────────────────────────────────────────────────────────── */

export default {
  async mount(el, context) {
    root = el;
    ctx = context;
    current = context.view || 'status';

    await refresh();

    stream = ctx.sse('/events', {
      onMessage: (data) => {
        if (snapshot) Object.assign(snapshot, data);
        if (current === 'status') patchLive(data);
      },
      onError: (attempt) => {
        const live = root.querySelector('#demo-live');
        if (live) live.textContent = attempt ? `reconnecting (${attempt})` : 'reconnecting';
      },
      onOpen: () => {
        const live = root.querySelector('#demo-live');
        if (live) live.textContent = 'live';
      },
    });
  },

  async setView(view) {
    current = view || 'status';
    // Re-fetch so the log is current; the stream keeps running throughout.
    await refresh();
  },

  async unmount() {
    stream?.stop();
    stream = null;
    root = null;
    ctx = null;
    snapshot = null;
  },
};
