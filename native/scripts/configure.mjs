#!/usr/bin/env node
/**
 * Write capacitor.config.json from the environment.
 *
 * The wrapper points at YOUR console, and your tailnet hostname is
 * deployment configuration rather than source — so the generated config is
 * gitignored and this script rebuilds it. Anyone cloning sets one variable
 * and gets a working app; nobody inherits my machine names.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// A .env next to this script, or the parent console's .env, or the shell.
for (const envPath of [join(root, '.env'), join(root, '..', '.env')]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const origin = process.env.NATIVE_ORIGIN || process.env.PUBLIC_ORIGIN;
if (!origin) {
  console.error(`
  No origin configured.

  Set NATIVE_ORIGIN to the address the PHONE will use to reach the console —
  a tailnet hostname or 100.x address, not localhost:

      NATIVE_ORIGIN=http://ojee-hp-zorin:8080  npm run configure

  or put it in native/.env. PUBLIC_ORIGIN from the console's own .env is
  used as a fallback, but only if it is reachable from the phone.
`);
  process.exit(1);
}

let host;
try {
  host = new URL(origin);
} catch {
  console.error(`  NATIVE_ORIGIN is not a valid URL: ${origin}`);
  process.exit(1);
}

if (['localhost', '127.0.0.1', '::1'].includes(host.hostname)) {
  console.error(`
  ${origin} points at the phone itself.

  The wrapper loads the console over the network, so the origin has to be an
  address the PHONE can reach — your tailnet hostname or 100.x address.
`);
  process.exit(1);
}

const config = {
  appId: process.env.NATIVE_APP_ID || 'net.ojee.console',
  appName: process.env.NATIVE_APP_NAME || 'console',
  webDir: 'www',
  server: {
    url: origin.replace(/\/+$/, ''),
    // Tailnet HTTP is fine — the transport is already encrypted by WireGuard,
    // and a tailnet name has no public CA to issue a certificate for it.
    // Android blocks cleartext without this, silently.
    cleartext: host.protocol === 'http:',
    // Shown when the origin cannot be loaded — which, for a tailnet-only
    // console, overwhelmingly means Tailscale is off rather than a real
    // network error.
    errorPath: 'offline.html',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#08080e',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#00ffff',
    },
  },
};

writeFileSync(join(root, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(`  wrote capacitor.config.json -> ${config.server.url}`);
if (config.server.cleartext) {
  console.log('  cleartext enabled (tailnet http)');
}
