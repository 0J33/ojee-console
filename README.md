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
  cheap, safe direction.
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
  "health": "/api/health",
  "capabilities": ["sse"]
}
```

| Path | What it is |
|---|---|
| `GET /module.json` | the manifest above |
| `GET /ui/index.js` | ES module, default-exports `{ mount(el, ctx), setView?, unmount() }` |
| `GET /api/health` | `{ ok: true }`, or `{ ok: false, reason }` to report itself degraded |
| `/api/*` | everything else; the caller is already authenticated |

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

### Overview facts (optional)

The console's front page is a dashboard, not a launcher. It is built entirely
out of what modules say about themselves, through one optional endpoint:

```
GET /{id}/api/summary
{
  "status": "ok" | "warn" | "err",
  "headline": "3 hosts \u00b7 1 needs attention",
  "facts":  [ { "k": "disinteg", "v": "12% cpu" }, ... ],   // up to 4 are shown
  "alerts": [ { "text": "loq is offline", "severity": "warn", "view": "hosts" } ]
}
```

A module opts in by declaring `"summary"` in `capabilities`. Alerts are
clickable: the console opens that module at `view`, so the front page is a way
into the thing that is wrong rather than a place that merely mentions it.

Modules that do not implement it get a plain card, which is the point of making
it optional — the shell still knows nothing about what any module *means*.

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

A module can raise a notification on the phone by emitting an SSE event named
`notify` on its existing `/api/events` stream:

```
event: notify
data: {"title":"LOQ is throttling","body":"CPU held at 97°C for 30s","tag":"loq:thermal"}
```

The console forwards it to the native app as a local notification, dedupli-
cated to one per `tag` per five minutes. This is deliberately one-directional:
the console never parses module state or knows what a module's events *mean*,
so a module that never emits `notify` never notifies and costs nothing.

Only modules that declare `"sse"` in `capabilities` are subscribed to. In a
browser this does nothing at all — see [`native/`](native/).

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
npm test          # 48 unit tests — node:test, no dependencies
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

The chrome is [ojee-ui](../ojee-ui) — `ojee-ui.css` for the visual language and `chrome.js` for
the interactive parts (toast, focus-trapped modal, the scoped api/sse pair, `ModuleHost`). Both
are vendored into `public/` rather than fetched at runtime: a design system that fails to load
leaves an unstyled login form, which is exactly when you least want one. Refresh with
`bash scripts/sync-ui.sh`.

The shell and every module's standalone shell run the *same* `chrome.js`. That is what stops
`ModuleHost` and the `ctx` object existing twice and drifting apart.

Icons regenerate from a single glyph with `python3 scripts/make-icons.py <glyph.svg>` — favicon,
`.ico`, apple-touch and both PWA sizes, cyan on `#08080e`, centred at 55.6% with a 22.2% margin
so iOS and Android masking never crops into it.

Branding is `config/console.json` plus an optional theme file. See ojee-ui's
`themes/_template.css`.

---

## Licence

MIT.
