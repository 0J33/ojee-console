/**
 * Configuration.
 *
 * Split deliberately in two:
 *
 *   config/console.json   WHAT this deployment is — branding, which modules
 *                         exist and where. Safe to read, safe to screenshot,
 *                         safe to commit in a private deployment repo.
 *
 *   .env                  SECRETS — TOTP secret, signing keys. Never in JSON,
 *                         never logged, never sent to the browser.
 *
 * That split is what makes "public repo, private deployment" real: someone
 * clones ojee-console, writes their own console.json and .env, and shares no
 * part of mine.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = (name, fallback = '') => (process.env[name] ?? fallback).toString().trim();
const envInt = (name, fallback) => {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const envBool = (name, fallback = false) => {
  const v = env(name).toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

const DEFAULT_BRANDING = {
  name: 'console',
  wordmark: 'ojee',
  wordmarkAccent: '.',
  wordmarkTail: 'console',
  tagline: 'local control · no cloud',
  theme: null,          // null = ojee-ui's built-in default
  favicon: '/favicon.svg',
};

export function loadConfig() {
  const file = env('CONSOLE_CONFIG', join(ROOT, 'config', 'console.json'));

  let raw = {};
  if (existsSync(file)) {
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      // Fail loudly. A typo'd config that silently falls back to defaults
      // would present an empty console and look like a code bug.
      throw new Error(`${file} is not valid JSON: ${e.message}`);
    }
  } else if (env('CONSOLE_CONFIG')) {
    throw new Error(`CONSOLE_CONFIG points at ${file}, which does not exist.`);
  }

  const secrets = {
    // Newest key first; the rest still verify, so rotating does not log
    // everyone out. Comma-separated.
    sessionKeys: env('SESSION_SECRET').split(',').map((s) => s.trim()).filter(Boolean),
    totpSecret: env('TOTP_SECRET'),
    // Signs X-Console-Auth. Defaults to the session key so a minimal .env
    // still works, but a separate value is better: it means a leaked module
    // secret cannot forge sessions.
    identitySecret: env('MODULE_IDENTITY_SECRET') || env('SESSION_SECRET').split(',')[0] || '',
  };

  const missing = [];
  if (!secrets.sessionKeys.length) missing.push('SESSION_SECRET');
  if (!secrets.totpSecret) missing.push('TOTP_SECRET');
  if (missing.length) {
    throw new Error(
      `Missing required secrets: ${missing.join(', ')}.\n` +
      `  SESSION_SECRET  openssl rand -hex 32\n` +
      `  TOTP_SECRET     npm run setup-totp`,
    );
  }

  return {
    port: envInt('PORT', 8100),
    host: env('HOST', '0.0.0.0'),
    publicOrigin: env('PUBLIC_ORIGIN', '').replace(/\/+$/, ''),

    branding: { ...DEFAULT_BRANDING, ...(raw.branding || {}) },

    auth: {
      sessionHours: envInt('SESSION_HOURS', 12),
      trustDays: envInt('DEVICE_TRUST_DAYS', 30),
      // Only meaningful when the CLI is unavailable — see auth/tailscale.js.
      trustedCidrs: env('TRUSTED_CIDRS')
        ? env('TRUSTED_CIDRS').split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      // Off by default: a forgeable header is not an authenticator unless
      // something in front of us guarantees it.
      trustProxyIdentity: envBool('TRUST_PROXY_IDENTITY', false),
      // Dev escape hatch. Never enable on the box that faces the tailnet.
      allowLoopback: envBool('ALLOW_LOOPBACK', false),
      maxFailures: envInt('TOTP_MAX_FAILURES', 8),
      tailscaleCli: env('TAILSCALE_CLI', 'tailscale'),
    },

    dataDir: env('DATA_DIR', join(ROOT, 'data')),

    modules: (raw.modules || []).map((m) => ({
      id: m.id,
      name: m.name,
      // Env override per module, so compose can point at container names
      // without editing the JSON: MODULE_HOME_ORIGIN=http://home:8110
      origin: env(`MODULE_${String(m.id || '').toUpperCase().replace(/-/g, '_')}_ORIGIN`) || m.origin,
      // Optional bearer token for modules that guard their own API — a host
      // agent on another machine cannot trust X-Console-Auth alone, because
      // anything able to reach its port could send those headers. The console
      // holds the credential and attaches it upstream; the browser never sees
      // it. MODULE_LOQ_TOKEN=... overrides, so it can come from the
      // environment rather than the config file.
      token: env(`MODULE_${String(m.id || '').toUpperCase().replace(/-/g, '_')}_TOKEN`) || m.token || '',
      enabled: m.enabled !== false,
    })),

    secrets,
    isHttps: env('PUBLIC_ORIGIN').startsWith('https://') || envBool('FORCE_SECURE_COOKIES', false),
  };
}

export const _internals = { env, envInt, envBool, DEFAULT_BRANDING };
