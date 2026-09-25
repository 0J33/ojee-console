#!/usr/bin/env bash
# ============================================================
# ojee-console end-to-end checks, driven by agent-browser.
#
# Boots the console against examples/demo-module (the reference
# implementation of the module contract) plus a deliberately dead
# "ghost" module, then drives a real browser through the whole
# flow: login, device trust, module mount, SSE, deep links, the
# degraded-module path, and an axe-core audit.
#
#   bash tests/check-dom.sh
#
# Everything runs on throwaway ports with a throwaway TOTP secret
# and a temp data dir, so it never touches a real deployment.
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSOLE_PORT="${CONSOLE_TEST_PORT:-8399}"
DEMO_PORT="${DEMO_TEST_PORT:-8398}"
DEAD_PORT=8397          # nothing ever listens here — that is the point
BASE="http://127.0.0.1:${CONSOLE_PORT}"

TMP="$(mktemp -d)"
fail=0; pass=0
ok()  { pass=$((pass+1)); printf '  PASS  %s\n' "$*"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$*"; }

# A throwaway secret. Base32, 16 chars — valid for otplib, worthless to anyone.
TOTP_SECRET="JBSWY3DPEHPK3PXP"

cat > "$TMP/console.json" <<JSON
{
  "branding": { "name": "test", "wordmark": "test", "wordmarkAccent": ".", "wordmarkTail": "console", "tagline": "test run" },
  "modules": [
    { "id": "demo",  "name": "Demo",  "origin": "http://127.0.0.1:${DEMO_PORT}", "enabled": true },
    { "id": "ghost", "name": "Ghost", "origin": "http://127.0.0.1:${DEAD_PORT}", "enabled": true }
  ]
}
JSON

export PORT="$CONSOLE_PORT" HOST=127.0.0.1
export PUBLIC_ORIGIN="$BASE"
export SESSION_SECRET="test-session-secret-at-least-32-characters-long"
export MODULE_IDENTITY_SECRET="test-identity-secret"
export TOTP_SECRET
export ALLOW_LOOPBACK=true
export DATA_DIR="$TMP/data"
export CONSOLE_CONFIG="$TMP/console.json"
export AGENT_BROWSER_SESSION="ojee-console-test-$$"

PORT="$DEMO_PORT" node "$ROOT/examples/demo-module/server.js" >"$TMP/demo.log" 2>&1 &
DEMO_PID=$!
node "$ROOT/src/server.js" >"$TMP/console.log" 2>&1 &
CONSOLE_PID=$!

cleanup() {
  agent-browser close >/dev/null 2>&1
  kill "$DEMO_PID" "$CONSOLE_PID" >/dev/null 2>&1
  wait "$DEMO_PID" "$CONSOLE_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -fsS "$BASE/api/branding" >/dev/null 2>&1 && break
  sleep 0.15
done
if ! curl -fsS "$BASE/api/branding" >/dev/null 2>&1; then
  echo "console failed to start:"; cat "$TMP/console.log"; exit 1
fi

ev() { agent-browser eval "$1" 2>/dev/null | tail -n 1 | sed 's/^"//; s/"$//'; }
code() { node -e "const {authenticator}=require('otplib');console.log(authenticator.generate('$TOTP_SECRET'))"; }

echo ""
echo "=== auth ==========================================================="

# An unauthenticated navigation must land on the login page, and the login
# page must exist — the tailnet gate has already passed at this point.
agent-browser open "$BASE/" >/dev/null 2>&1
agent-browser wait 600 >/dev/null 2>&1
url=$(agent-browser get url 2>/dev/null | tail -n 1)
[[ "$url" == *"/login" ]] && ok "unauthenticated navigation lands on /login" \
                          || bad "expected /login, got ${url}"

# The login page must be STYLED. Its stylesheets are fetched before any
# session exists, so they need an explicit pre-auth allowlist — and when that
# allowlist is wrong the page silently renders as unstyled HTML while the rest
# of the app, which loads its CSS after authenticating, looks perfectly fine.
# Checking for the fields alone does not catch it; checking a computed value
# that can only come from ojee-ui.css does.
styled=$(ev "(() => {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg').trim();
  const font = getComputedStyle(document.body).fontFamily;
  if (!bg) return 'no tokens — ojee-ui.css did not load';
  if (!/mono/i.test(font)) return 'tokens loaded but body font is ' + font;
  return 'ok';
})()")
[ "$styled" = "ok" ] && ok "login page is styled (design system loaded pre-auth)" \
                     || bad "LOGIN PAGE UNSTYLED: ${styled}"

# ...and only the login chrome is readable without a session. Everything else
# must stay behind the gate.
leak=$(node -e '
  const base = process.argv[1];
  const allowed = ["/ojee-ui.css", "/app.css", "/favicon.svg", "/manifest.webmanifest", "/themes/paper.css"];
  const denied  = ["/index.html", "/app.js", "/api/modules", "/themes/../app.js"];
  (async () => {
    const bad = [];
    for (const p of allowed) {
      const r = await fetch(base + p, { redirect: "manual" });
      if (r.status !== 200) bad.push(`${p} should be 200, got ${r.status}`);
    }
    for (const p of denied) {
      const r = await fetch(base + p, { redirect: "manual" });
      if (r.status === 200) bad.push(`${p} LEAKED pre-auth`);
    }
    console.log(bad.length ? bad.join("; ") : "ok");
  })();
' "$BASE" 2>/dev/null)
[ "$leak" = "ok" ] && ok "pre-auth allowlist serves the login chrome and nothing else" \
                   || bad "pre-auth allowlist wrong: ${leak}"

# The code field must invite the right keyboard and the OS autofill path.
attrs=$(ev "(() => { const i = document.querySelector('#code');
  return [i.getAttribute('inputmode'), i.getAttribute('autocomplete')].join(',');
})()")
[ "$attrs" = "numeric,one-time-code" ] && ok "code field: numeric keypad + one-time-code autofill" \
                                      || bad "code field attrs are ${attrs}"

# Six digits should submit on their own — the button is under the keypad.
# Login lands on the PLATE, not inside whichever module happened to be ready
# first: the console has a front door, and arriving somewhere arbitrary is
# what it was built to stop.
agent-browser fill "#code" "$(code)" >/dev/null 2>&1
agent-browser wait 2200 >/dev/null 2>&1
url=$(agent-browser get url 2>/dev/null | tail -n 1)
[[ "$url" != *"/login"* ]] && ok "six digits auto-submit and land on the plate (${url})" \
                           || bad "after login, url is ${url}"

# Every enabled module gets a seat on it, each carrying its own headline —
# including the dead one, marked down. Hiding a module that will not start
# makes a broken deploy look like a feature that was never built.
plate=$(ev "(() => { const s = document.querySelector('.ov-stage');
  if (!s) return 'no plate';
  const seats = [...s.querySelectorAll('.comp')];
  const heads = seats.filter(c => c.querySelector('.comp-head')?.textContent.trim()).length;
  const ghost = seats.find(c => /ghost/i.test(c.textContent));
  return seats.length + '/' + heads + '/' + (ghost ? ghost.dataset.state : 'no-ghost'); })()")
[[ "$plate" == "2/2/down" ]] && ok "the plate seats every module with its headline, the dead one marked down (${plate})" \
                             || bad "plate seats/headlines/ghost are '${plate}', expected 2/2/down"

# The movement is one canvas over the whole viewport, never one per dial.
canvases=$(ev "document.querySelectorAll('canvas').length")
[[ "$canvases" -le 1 ]] && ok "one canvas for the whole scene (${canvases})" \
                        || bad "${canvases} canvases — a context per dial will be dropped by the browser"

echo ""
echo "=== module contract ================================================"

# Into a module from the plate, the way a reader would.
agent-browser open "$BASE/#/demo" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1

mounted=$(ev "!!document.querySelector('#demo-reading')")
[ "$mounted" = "true" ] && ok "module UI mounted into the shell" || bad "demo module did not mount"

nav=$(ev "[...document.querySelectorAll('.nav-link')].map(a => a.textContent.trim()).join('|')")
[[ "$nav" == *"Status"* && "$nav" == *"Log"* ]] && ok "module views appear in the shell nav (${nav})" \
                                                || bad "nav is '${nav}'"

# The dead module must still be listed. Hiding it makes a broken deploy look
# like a feature that was never built. The view row carries the ACTIVE
# module's views only — switching modules is the plate's job and the side
# rail's — so this asks the rail, which is where every module is listed.
ghost=$(ev "(() => { const a = [...document.querySelectorAll('#sidenav .sn-item')].find(x => /ghost/i.test(x.textContent));
  if (!a) return 'hidden';
  const marked = a.classList.contains('is-down') || !!a.querySelector('.dot--err, .dot--warn');
  return marked ? 'listed-and-marked' : 'listed-unmarked'; })()")
[ "$ghost" = "listed-and-marked" ] && ok "unreachable module stays in the rail, marked down" \
                                   || bad "unreachable module is '${ghost}'"


# ...and explains itself rather than showing a blank panel.
agent-browser open "$BASE/#/ghost" >/dev/null 2>&1
agent-browser wait 900 >/dev/null 2>&1
why=$(ev "document.querySelector('#view').innerText.replace(/\s+/g,' ').trim().slice(0,90)")
[[ "$why" == *"ECONNREFUSED"* ]] && ok "degraded module explains why (${why})" \
                                 || bad "degraded module says: ${why}"

# Deep links must work cold, not only via in-app navigation.
agent-browser open "$BASE/#/demo/log" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
deep=$(ev "(() => { const h = document.querySelector('#view .h2'); return h ? h.textContent.trim() : 'none'; })()")
[[ "$deep" =~ [Ll]og ]] && ok "deep link #/demo/log restores that view" || bad "deep link landed on '${deep}'"

echo ""
echo "=== live data ======================================================"

agent-browser open "$BASE/#/demo/status" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
first=$(ev "document.querySelector('#demo-live')?.textContent")
agent-browser wait 3000 >/dev/null 2>&1
second=$(ev "document.querySelector('#demo-live')?.textContent")
if [ -n "$first" ] && [ "$first" != "$second" ]; then
  ok "SSE stream is live and updating (${first} -> ${second})"
else
  bad "SSE did not update: '${first}' then '${second}'"
fi

# Switching views inside a module must NOT remount it — a remount drops the
# stream on every tab click.
agent-browser eval "window.__demoEl = document.querySelector('#view').firstElementChild" >/dev/null 2>&1
agent-browser open "$BASE/#/demo/log" >/dev/null 2>&1
agent-browser wait 900 >/dev/null 2>&1
agent-browser open "$BASE/#/demo/status" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
still=$(ev "document.querySelector('#demo-live')?.textContent?.startsWith('live') ? 'live' : (document.querySelector('#demo-live')?.textContent || 'gone')")
[ "$still" = "live" ] && ok "stream survives switching views within the module" \
                      || bad "after a view switch the stream is '${still}'"

echo ""
echo "=== identity ========================================================"

# The module must see the console's asserted user, and must NOT see a
# forged one. This is the single most important property of the proxy.
who=$(curl -sS "$BASE/demo/api/health" -H "Cookie: $(ev "document.cookie")" 2>/dev/null | grep -o '"user":"[^"]*"' || echo none)
forged=$(ev "(async () => {
  const r = await fetch('/demo/api/health', { headers: { 'X-Console-User': 'attacker@evil.com' } });
  const j = await r.json();
  return j.user;
})()")
[ "$forged" != "attacker@evil.com" ] && ok "a client-supplied X-Console-User is stripped (module saw '${forged}')" \
                                     || bad "FORGED IDENTITY REACHED THE MODULE"

echo ""
echo "=== layout & a11y ==================================================="

for W in 375 768 1280; do
  agent-browser set viewport "$W" 820 >/dev/null 2>&1
  agent-browser wait 350 >/dev/null 2>&1
  over=$(ev "document.documentElement.scrollWidth - window.innerWidth")
  if [ -n "$over" ] && [ "$over" -le 1 ] 2>/dev/null; then
    ok "no horizontal overflow at ${W}px"
  else
    bad "horizontal overflow at ${W}px by ${over}px"
  fi
done

# Settings must stay reachable on a phone: the tab bar is module-only, so the
# settings button lives outside .nav-links and must survive the breakpoint.
agent-browser set viewport 375 820 >/dev/null 2>&1
agent-browser wait 350 >/dev/null 2>&1
settings=$(ev "(() => { const a = document.querySelector('.nav-settings');
  if (!a) return 'absent';
  const r = a.getBoundingClientRect();
  return (r.width > 0 && r.height > 0) ? 'visible' : 'hidden'; })()")
[ "$settings" = "visible" ] && ok "settings stays reachable at phone width" \
                            || bad "settings is ${settings} on mobile"

agent-browser set viewport 1280 900 >/dev/null 2>&1
agent-browser open "$BASE/#/demo/status" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser a11y --tags wcag2a,wcag2aa,wcag21a,wcag21aa --json >"$TMP/axe.json" 2>/dev/null
axe=$(node -e '
  const fs = require("fs");
  let j; try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { console.log("unparsed"); process.exit(0); }
  const d = j.data || j;
  const v = d.violations || [];
  console.log(v.length ? "VIOLATION " + v.map(x => `${x.id}[${x.impact}]:${x.nodeCount}`).join(" ") : "clean");
' "$TMP/axe.json" 2>/dev/null)
# As in ojee-ui: axe cannot resolve contrast over a gradient root, so it
# reports color-contrast as INCOMPLETE. Only violations fail here; the token
# maths is asserted numerically in ojee-ui's own suite.
case "$axe" in
  clean)    ok "axe-core: 0 WCAG 2.1 A/AA violations" ;;
  unparsed) bad "axe-core produced no parseable output" ;;
  *)        bad "axe-core ${axe}" ;;
esac

echo ""
echo "=== standalone ======================================================"

# The same module, same code, served directly with no console in front of it.
#
# This is the check that keeps the public repos honest. The deployment this
# was built for runs every module MOUNTED, so nothing in day-to-day use would
# ever notice standalone mode rotting — and standalone is the thing that makes
# each repo useful to someone who only wants one piece.
agent-browser open "http://127.0.0.1:${DEMO_PORT}/" >/dev/null 2>&1
agent-browser wait 2000 >/dev/null 2>&1

sa_title=$(agent-browser get title 2>/dev/null | tail -n 1)
[ -n "$sa_title" ] && [ "$sa_title" != "module" ] && ok "standalone: shell boots and titles itself (${sa_title})" \
                                                  || bad "standalone: title is '${sa_title}'"

sa_styled=$(ev "getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
[ -n "$sa_styled" ] && ok "standalone: design system loaded (--bg ${sa_styled})" \
                    || bad "standalone: unstyled — ojee-ui.css did not load"

sa_nav=$(ev "[...document.querySelectorAll('.nav-link')].map(a => a.textContent.trim()).join('|')")
[[ "$sa_nav" == *"Status"* && "$sa_nav" == *"Log"* ]] && ok "standalone: nav built from its own module.json (${sa_nav})" \
                                                      || bad "standalone: nav is '${sa_nav}'"

sa_mount=$(ev "!!document.querySelector('#demo-reading')")
[ "$sa_mount" = "true" ] && ok "standalone: same UI entry point mounts unchanged" \
                         || bad "standalone: module UI did not mount"

# The scoped api/sse pair must resolve against an empty base here and against
# /{id} when mounted — that indirection is the entire portability mechanism,
# so prove the stream actually runs, not just that the DOM rendered.
sa_first=$(ev "document.querySelector('#demo-live')?.textContent")
agent-browser wait 3000 >/dev/null 2>&1
sa_second=$(ev "document.querySelector('#demo-live')?.textContent")
if [ -n "$sa_first" ] && [ "$sa_first" != "$sa_second" ]; then
  ok "standalone: SSE live against an empty base path"
else
  bad "standalone: SSE not updating ('${sa_first}' then '${sa_second}')"
fi

sa_deep=$(agent-browser open "http://127.0.0.1:${DEMO_PORT}/#/log" >/dev/null 2>&1; \
          agent-browser wait 1500 >/dev/null 2>&1; \
          ev "document.querySelector('#view .h2')?.textContent.trim()")
[[ "$sa_deep" =~ [Ll]og ]] && ok "standalone: deep links work without the console router" \
                           || bad "standalone: deep link landed on '${sa_deep}'"

echo ""
echo "=== settings ========================================================"

agent-browser open "$BASE/#/settings" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
dev=$(ev "document.querySelector('#settings-devices')?.innerText.replace(/\s+/g,' ').trim().slice(0,80)")
[ -n "$dev" ] && ok "devices screen renders (${dev})" || bad "devices screen is empty"

mods=$(ev "document.querySelectorAll('#settings-modules tr').length")
[ "$mods" = "2" ] && ok "module table lists both modules including the dead one" \
                  || bad "module table has ${mods} rows, expected 2"

printf '\n================================================================\n'
printf '  %d passed, %d failed\n' "$pass" "$fail"
printf '================================================================\n'
[ "$fail" -eq 0 ] || { echo; echo "--- console log ---"; tail -20 "$TMP/console.log"; exit 1; }
