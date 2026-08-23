# ojee-console — native wrapper

A Capacitor shell that points a native WebView at your console over the
tailnet. **There is no second frontend**: the app loads the same shell the
browser does, so a change to the console reaches the app without rebuilding
it.

What the wrapper adds over a browser tab:

| | Why it needs to be native |
|---|---|
| **Local notifications** | A browser tab that is closed cannot tell you the LOQ is thermal-throttling. |
| **Background location** | Replaces the third-party OwnTracks app with a first-party one. The hub endpoint does not change. |
| **A real offline screen** | A tailnet-only console is unreachable whenever Tailscale is off. "Could not connect to server" sends people hunting a server problem that does not exist. |
| **Persistent session** | The 30-day device-trust cookie lives in the app container, so TOTP is a monthly event rather than a daily one. |

## Setup

```bash
cd native
npm install
NATIVE_ORIGIN=http://your-console-host:8080 npm run configure
```

`NATIVE_ORIGIN` is the address **the phone** uses to reach the console — a
tailnet hostname or `100.x` address. The script refuses `localhost` and
`127.0.0.1`, because those point at the phone itself, and refuses to run at
all without an origin rather than silently producing an app that loads
nothing.

The generated `capacitor.config.json` is gitignored: it holds your hostname,
which is deployment configuration rather than source.

### Android — verified building

```bash
npm run add:android
cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
```

Built and checked: 4.2 MB, appId `net.ojee.console`, `server.url` baked to the
configured origin, `errorPath` wired to the offline page, and all five plugins
compiled in. `npm run run:android` installs it on a connected device.

Gradle downloads itself via the wrapper; the SDK needs platform 34, which the
build installs on first run if the licence is already accepted.

Needs Android Studio and a JDK. Tailscale must be installed and connected on
the device, or the app opens straight to the offline screen — correctly.

### iOS — needs a Mac

```bash
npm run add:ios
npm run open:ios             # then sign and run from Xcode
```

Everything here is authored and committed; `npx cap add ios` and the signing
step are the only parts that need macOS hardware. Nothing else is blocked on
it, which is why the Android target exists — you can verify the wrapper end
to end before the Mac shows up.

## Notifications

The shell must not know what any module's events *mean*. So a module **opts
in** by emitting an SSE event named `notify` on its existing `/api/events`
stream:

```
event: notify
data: {"title":"LOQ is throttling","body":"CPU held at 97°C for 30s","tag":"loq:thermal"}
```

The console forwards it as a local notification. `tag` is deduplicated at one
notification per five minutes — the same condition re-firing every second is
the fastest way to make someone turn notifications off permanently.

A module that never emits `notify` never notifies, and costs nothing. Only
modules declaring the `sse` capability in their manifest are subscribed to.

Module health transitions are notified too, from the poll the nav already
runs — no extra traffic. The first sweep only establishes a baseline, so a
cold start does not fire one notification per module.

## Location

If a module with id `home` is enabled, the app watches position and posts to
`/home/api/location` in OwnTracks format:

```json
{ "_type": "location", "lat": 0, "lon": 0, "acc": 12, "tst": 1755000000, "t": "u", "batt": 84 }
```

That is the shape the hub has accepted since before this app existed — zones,
arrive/leave automation triggers and all — so this is a drop-in replacement
for the OwnTracks app with **no backend change**. Mounted, the console proxies
the request and asserts identity, so no location token is needed in the app.

Fixes closer than 50m to the last one are dropped. A phone on a desk emits a
fix a second, the hub only cares about movement, and every post is a wakeup on
both ends.

## Files

```
capacitor.config.json      generated — gitignored, holds your origin
capacitor.config.example.json
scripts/configure.mjs      writes the config from NATIVE_ORIGIN
www/offline.html           the "Tailscale is not connected" screen
www/index.html             only seen if you skipped `npm run configure`
```

The bridge itself is not here — it is `public/native.js` in the console,
because it ships with the shell. Every export is a no-op in a browser.
