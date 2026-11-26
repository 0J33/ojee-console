# ojee-console

A tailnet-only control console. One shell, one login, any number of independent
modules — each of which is its own repo, its own container, and runs perfectly well on its own.

The shell owns exactly four things: **auth**, **chrome**, **routing**, and **knowing whether your
modules are actually up**. Everything you look at comes from a module.

---

## Auth: three gates

```
   request
      │
      ▼
 ┌──────────────┐   not on the tailnet → 404, no login form, nothing to attack
 │ 1. Tailscale │
 └──────┬───────┘
        ▼
 ┌──────────────┐   valid device cookie → skip TOTP, mint a session
 │ 3. Device    │
 └──────┬───────┘
        ▼ (no device)
 ┌──────────────┐   6 digits, replay-guarded, failure-rate-limited
 │ 2. TOTP      │
 └──────────────┘
```

**Gate 1 — Tailscale.** `tailscale whois` on the peer address, falling back to CIDR membership
when the CLI is unavailable. A caller we cannot place on the tailnet gets **404, not 403** — a 403
confirms something is here. No login form is ever rendered off-tailnet, so the TOTP prompt has no
public attack surface at all.

**Gate 2 — TOTP.** Six digits, `window: 1` for clock drift, plus two things a bare
`authenticator.verify()` does not give you:

- a **replay guard**, because a 90-second acceptance window means a code seen once can be
  re-used for the rest of it. Consumed `(secret, timestep)` pairs are refused.
- a limiter that counts **failures, not attempts**, bucketed by tailnet identity. Counting
  attempts would let you lock yourself out by signing in ten times; a bucket keyed on IP would
  merge everyone behind one exit node.

**Gate 3 — 30-day device trust.** Tick the box and the console mints a 256-bit token, stores only
its SHA-256, and hands you a cookie. Three properties:

- **Only the hash is stored.** If the store leaks, it hands over no working credential.
- **The token rotates on every use.** A stolen cookie stops being a silent 30-day skeleton key and
  becomes self-detecting: the moment either copy is used, the other is stale. A stale token
  **revokes the device outright** — we cannot tell thief from owner, so one TOTP re-entry is the
  cheap, safe direction. The one exception is a 30-second grace for the **same tailnet user and
  node**: requests that raced the rotation (a page whose session just lapsed) get the same
  successor back, never a new one. Anyone else, or anything later, still revokes.
- **Trust is bound to the tailnet peer** that created it. A cookie exfiltrated off the tailnet
  fails twice over.

Sessions are short (12h) and stateless. A device-minted session carries its `deviceId` and is
checked against the store on every request, so **revoking a device kills its live sessions
immediately** rather than leaving them alive for the rest of the TTL.

---

## The module contract

A module serves one file and the console can mount it:

```jsonc
GET /module.json
{
  "id": "home",
  "name": "Home",
  "version": "1.0.0",
  "views": [ { "id": "overview", "label": "Overview", "icon": "i-grid" } ],
  "ui": "/ui/index.js",
  "assistant": "/ui/assistant.js",
  "health": "/api/health",
  "capabilities": ["sse"]
}
```

| Path | What it is |
|---|---|
| `GET /module.json` | the manifest above |
| `GET /ui/index.js` | ES module, default-exports `{ mount(el, ctx), setView?, unmount() }` |
| `GET /api/health` | `{ ok: true }`, or `{ ok: false, reason }` to report itself degraded |
| `GET /api/summary` | optional — what the Overview row shows (below) |
| `/api/*` | everything else; the caller is already authenticated |

`assistant` is optional and behaves like `ui`: a root-relative path to an ES module the shell can
import **without** mounting the module first. The console's overview and idle screen use it to open
a module's dialog straight from an icon. Anything else the manifest declares stays inside the
module — the shell passes through a fixed list of fields (`id`, `name`, `version`, `status`,
`views`, `ui`, `assistant`, `capabilities`, `icon`, `quickActions`, `header`, `viewTabs`, `nav`).

**`examples/demo-module/`** is the reference implementation — ~150 lines, no dependencies, and it
exercises every part of the contract including SSE. It is also what the test suite mounts, so the
contract is verified on every run rather than only described here.

### Mounted vs standalone

- **Mounted** — the console proxies `/{id}/*` to the module and asserts the caller in
  `X-Console-User`, signed with `X-Console-Auth`. The module never implements login and never
  renders chrome.
- **Standalone** — the module serves itself, with ojee-ui's generic
  [`standalone.html`](../ojee-ui/standalone.html) as its shell. Same module code, same
  `/ui/index.js`, same `ModuleHost`.

Standalone costs a module about twenty lines: vendor `ojee-ui.css`, `chrome.js` and
`standalone.html`, set two `<meta>` values, serve them. See the bottom of
`examples/demo-module/server.js`.

That cheapness is deliberate. This deployment retired its per-module subdomains and runs
everything mounted, so nothing in daily use would ever notice standalone mode rotting — and
standalone is precisely what makes each repo useful to someone who only wants one piece of
this. So it is tested rather than promised: `npm run test:dom` boots the demo module with no
console in front of it and checks its shell, nav, mount, SSE and deep links all work.

### What the shell hands a module

`ctx.api()` and `ctx.sse()` are scoped to the module, so it never hardcodes its own mount point:

```js
export default {
  async mount(el, ctx) {
    const state = await ctx.api('/state');          // → /home/api/state
    ctx.sse('/events', { onMessage: (d) => ... });  // reconnects, auto-cleans
    el.innerHTML = render(state);
  },
  async setView(view) { /* switch view WITHOUT remounting */ },
  async unmount() { /* drop listeners */ },
};
```

Also on `ctx`: `toast`, `modal` (focus-trapped, promise-returning), `icon`, `esc`, `onCleanup`,
`navigate`, `capabilities`.

Implementing `setView` matters. Without it, clicking between a module's own views tears it down
and re-imports it, dropping its SSE stream every time.

### A broken module stays visible

A module that fails its health check keeps its nav entry, struck through and marked, carrying the
reason — and its screen explains what happened with a retry. Hiding it would make a bad deploy
look like a feature that was never built, which is the single most confusing failure mode a
modular app has.

---

### Icons

A manifest may declare `"icon": "i-server"` for the module itself. Without one the shell used to
draw the first view's icon — and since almost every module opens on an overview drawn with
`i-grid`, Overview, Fleet and Home all rendered the same square. An icon that is the same for
everything is decoration, not navigation, so unknown modules now get a generic glyph instead of
Overview's.

Available symbols are ojee-ui's `icons3.svg` (Lucide-style line icons; the
old Material ids are kept as aliases), inlined into `public/index.html` by
`scripts/sync-ui.sh`.

### Overview: what a module says about itself (optional)

The console's front page is Needs-you (the inbox) and then one dense row per
system, built entirely out of what modules say about themselves through one
optional endpoint (declare `"summary"` in `capabilities`):

```jsonc
GET /{id}/api/summary
{
  "status": "ok" | "warn" | "err",
  "headline": "3 hosts · 1 needs attention",        // the row's status line and the page subtitle
  "statusText": "Running hot",                        // optional: a shorter status line than the headline

  // 2026-11 — the row's numbers. Up to 4 are shown; a number reads in
  // tabular mono, a phrase in text. `status` colours the value (warn/err).
  "metrics": [ { "label": "CPU temp", "value": 98, "unit": "°C", "status": "err" }, ... ],

  // 2026-11 — the row's sparkline (about 2 h). Points oldest → newest;
  // null is a gap. `threshold` draws a dashed line; `status` colours it.
  "spark": { "label": "CPU °C · 2h", "points": [74, 76, 91, 98], "threshold": 90,
             "status": "err", "min": 0, "max": 100, "unit": "°", "cap": "max 98" },

  // 2026-11 — optional: one row per thing instead of one per module
  // (Machines: LOQ, HP, disinteg). Each takes the same fields as above plus
  // name, icon (i-*), tag, view (where the row links).
  "rows": [ { "name": "LOQ", "icon": "i-laptop", "tag": "Linux", "status": "err",
              "statusText": "Running hot", "view": "hosts", "metrics": [...], "spark": {...} } ],

  "facts":  [ { "k": "disinteg", "v": "12% cpu" } ],  // still read when `metrics` is absent
  "alerts": [ { "text": "loq is offline", "severity": "warn", "view": "hosts",
                "key": "loq-offline", "notify": "fleet.host-down", "action": "Open" } ],
  "quick":  { "<quick action id>": { "on": true } }    // state of the manifest's quickActions
}
```

Everything new is optional and additive: a module that still sends only
`status/headline/facts/alerts` gets a row with its facts as the numbers.
Alerts become inbox items (see Notifications) under a stable key — give
them `key` (a subject that stays the same while the words change) and
`notify` (one of your declared kinds) and they are deduplicated, held,
grouped and configurable per kind.

**Quick actions** (`quickActions` in the manifest: `[{ id, label, icon }]`)
are one tap from the module's overview row and from ⌘K; the shell fires
`POST /{id}/api/quick/{actionId}` and repaints from the summary's `quick`.

### What the shell draws around a module

- A page header: the module's name and its summary `headline` (live).
  `ctx.header.setSub(text)` replaces the line; `ctx.header.actions` is an
  element on the header's right for the module's own buttons. A module that
  draws its own header sets `"header": false` in its manifest.
- View tabs, for a module with more than one view (`"viewTabs": false` to
  draw your own).
- `ctx.sheet({ title, sub, body, actions, width })` — the shared sheet
  (ojee-ui3): a side sheet on desktop, a bottom sheet with drag-to-dismiss on
  phones. Returns `{ el, body, close, done }`.
- Modules render inside `.page` and use ojee-ui3 classes; layout queries are
  container queries on `app`.

Per deployment, `config/console.json` may also set for a module:
`"label"` (the nav name, e.g. `"Machines"` for fleet), `"nav": false`
(routable but not in the nav — Remote's full-screen sessions), and
`"quietOffline": true` (a module on a machine that sleeps: offline is shown
quietly and never raised as an alert).

At the top level, `"overviewOrder"` sets the order of the overview's Systems
rows: module ids, or `module:row` for a module that reports one row per thing
(`"fleet:loq"`). Default: `["home", "peripherals", "router", "agent",
"fleet:loq", "fleet:hp", "fleet:disinteg"]`. Rows it does not name follow, in
nav order. The nav, ⌘K and the Settings alert table keep the `modules` order.

### Modules that guard their own API

A module on the same host can trust `X-Console-Auth`. A module on a *different*
machine cannot: anything able to reach its port could send those headers. Such
a module keeps its own bearer token, and the console holds the credential:

```jsonc
{ "id": "loq", "name": "LOQ", "origin": "http://100.x.y.z:8300", "token": "..." }
```

`MODULE_<ID>_TOKEN` overrides it, which is how the token stays in the
environment rather than in a config file that a private deployment repo would
commit.

The console attaches it as `Authorization: Bearer` on every proxied request
**and** on the registry's manifest and health probes — without the latter a
guarded module reports itself unreachable and shows as down in the nav. Two
properties are enforced and tested:

- any `Authorization` the **browser** sends is stripped before the console
  attaches its own, so a client can never choose what the module sees;
- the token never appears in `/api/modules`, so reading the nav does not leak
  a module's upstream credential.

### Notifications (optional)

A module raises and resolves inbox items by emitting `event: notify` on its
`/api/events` stream, and lists its kinds in `module.json` — see
[Notifications](#notifications). Only modules that declare `"sse"` and
`"notify"` in `capabilities` are subscribed to.

## Notifications

One inbox for every module, shared by every device (`src/notify/inbox.js`,
persisted in `DATA_DIR/inbox.json`). Modules decide *when*; the console
decides *where*, with the person's settings (`DATA_DIR/notifications.json`).

**Items, not messages.** Every alert is one item with a stable key,
`module:kind:subject`. Changing numbers update the same item. An alert stated
on `/api/summary` must hold for `hold` checks (default 2, every 30 s) before
it raises, and be clear for `clearMin` minutes (default 5) before it resolves —
silently. A raise soon after resolving reopens the item as `×N since 16:38`.
A console that restarts remembers what was open: no replay burst.

**One event, one notification.** A raise is delivered once: to the inbox and
badge always; as a toast + Web Push only for kinds whose channel is `toast`
(blocking kinds by default — Claude asking, sustained critical heat, a host
down); to Discord only for kinds the person switched on. Quiet hours
(default 23:00–07:30) hold toasts back; blocking items break through.
Non-blocking happenings (`severity: info`) fold into a digest line, "5 updates".

**In the inbox:** primary action, Snooze 1h, Mute this kind (writes the
kind's setting to Off), Done (event items), each with Undo.

**Modules declare their kinds** in `module.json` (capability `notify` for
events, `summary` for alerts) so every kind appears in Settings →
Notifications, individually controllable — Toast / Inbox / Off, its
condition, Discord:

```jsonc
"notifications": [{
  "id": "fleet.cpu-temp",            // <module>.<kind>
  "label": "CPU temperature",
  "description": "Sustained heat on a host.",
  "severity": "critical",            // info | warn | critical
  "blocking": true,                  // toast + push by default, breaks quiet hours
  "channel": "toast",                // default: toast | inbox | off (blocking → toast, else inbox)
  "discord": false,                  // default Discord opt-in
  "hold": 2, "clearMin": 5,          // debounce for summary alerts
  "params": [                        // thresholds shown in Settings; the module applies them
    { "key": "celsius", "label": "Above", "type": "number", "unit": "°C", "default": 95, "min": 60, "max": 110 },
    { "key": "minutes", "label": "for", "type": "number", "unit": "min", "default": 5 }
  ],
  "view": "hosts",
  "source": "alerts"                 // raised as summary alerts with notify:"fleet.cpu-temp"
}]
```

The effective settings (channel, discord, params, quiet hours) are POSTed to
each notify module at `/api/notify/prefs` whenever they change, so a module
applies the thresholds itself.

**Events** — `event: notify` on the module's `/api/events`:
`{ id, key, state: "raise" | "resolve" | "update", title, body, severity, view|route, action }`.
`raise` (default for warn/critical and blocking kinds) opens or updates the
item `module:kind:key`; `resolve` closes it; `update` (default for info) goes
to the digest. Re-sending a raise for an open item never notifies twice.

Endpoints: `GET /api/inbox`, `POST /api/inbox/{snooze,unsnooze,dismiss,undismiss}`
(`{ key }`), `POST /api/notify/{mute,unmute}` (`{ kind, prev }`),
`/api/notify/stream` (`event: inbox` snapshot on connect and on every change;
`event: notify` for toast-worthy raises). `NOTIFY=local` runs the checks
read-only (no module subscriptions, no prefs pushed, no Discord or push) for
development in front of live modules; `NOTIFY=off` runs nothing.

## The phone app

[`native/`](native/) wraps this same shell as a Capacitor app pointed at your
tailnet origin. There is no second frontend: the app loads what the browser
loads. It adds local notifications, first-party background location replacing
OwnTracks, a persistent device-trust cookie, and an offline screen that says
"Tailscale is not connected" rather than "could not connect to server".

Android builds today; iOS needs a Mac for `npx cap add ios` and signing.

## Setup

```bash
npm install
cp .env.example .env
cp config/console.example.json config/console.json

npm run setup-totp                       # scan the QR, paste TOTP_SECRET into .env
openssl rand -hex 32                     # → SESSION_SECRET
vim config/console.json                  # branding + your modules

npm start
```

`config/console.json` is *what this deployment is* — branding, which modules exist, where they
live. No secrets, so a private deployment repo can commit it. `.env` is secrets only. That split
is what makes "public code, private deployment" real.

Point `MODULE_<ID>_ORIGIN` at container names in compose and you never have to edit the JSON for
an environment change.

---

## Tests

```bash
npm test          # 107 unit tests — node:test, no dependencies
npm run test:dom  # 26 end-to-end checks — agent-browser
```

The unit suite covers the properties that are easy to claim and hard to notice losing: replay
rejection, token rotation, clone detection, peer binding, IPv4-mapped-IPv6 normalisation (get it
wrong and the gate locks out the entire tailnet), signature scoping, and a registry that degrades
rather than hides.

The DOM suite boots the console against `examples/demo-module` plus a deliberately dead module and
drives a real browser through login, device trust, module mount, SSE liveness, deep links, the
degraded path, identity forgery, three viewports, and axe-core — then boots the same module
**standalone**, with no console, and checks it works there too.

It also asserts the login page is *styled*. That sounds trivial; it is not. The login page fetches
its CSS before any session exists, so those files need an explicit pre-auth allowlist — and when
that allowlist is wrong the page renders as bare HTML while the rest of the app, which loads its
CSS after authenticating, looks perfectly fine. Exactly that shipped once during development.

> axe reports ~345 `color-contrast` **incomplete** results. That is not a failure: the design
> system paints the root with a gradient and every surface above it with translucency, so axe has
> no single background to measure against. The token maths is asserted numerically in
> [ojee-ui](../ojee-ui)'s own suite instead. Only violations fail the build.

---

## Deployment

Behind Caddy on an always-on box, bound to the tailnet address:

```
console.ojee.net {
  import cf_tls
  # SSE must not be buffered. `encode gzip` holds frames until its window
  # fills, which stalls a live stream for tens of seconds.
  @sse path_regexp ^/[a-z0-9-]+/api/events
  handle @sse { reverse_proxy console:8100 { flush_interval -1 } }
  handle { encode gzip; reverse_proxy console:8100 }
}
```

`docker-compose.yml` mounts `tailscaled.sock` read-only so the gate can use `whois`. Without it
the gate still works via CIDR, but sessions cannot be attributed to a named user.

Persist `/data` — it holds the trusted-device store, and losing it makes every device re-enrol.

---

## Design system

The chrome is [ojee-ui](../ojee-ui) v3 — `ojee-ui3.css` (tokens, type and every
component), `ojee-ui3.js` (sparkline, segmented control, sheet helpers),
`icons3.svg` and self-hosted Geist / Geist Mono in `fonts/` — plus `chrome.js`
(toast, focus-trapped modal, the scoped api/sse pair, `ModuleHost`). All are
vendored into `public/` rather than fetched at runtime: a design system that
fails to load leaves an unstyled login form, which is exactly when you least
want one. Refresh with `bash scripts/sync-ui.sh` (it also inlines the sprite).

Mounted modules get `/ojee-ui3.css`, `/ojee-ui3.js` and the fonts from the
shell; they add only module CSS of their own.

Icons regenerate from a single glyph with `python3 scripts/make-icons.py <glyph.svg>`.

---

## Licence

MIT.
