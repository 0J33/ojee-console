/**
 * Gate 3 — 30-day device trust.
 *
 * After a successful TOTP the user may mark the device trusted. We mint a
 * random 256-bit token, hand it out in a cookie, and store only its SHA-256.
 * Presenting a valid device cookie skips TOTP and mints a fresh session.
 *
 * Three properties worth stating plainly, because they are the whole point:
 *
 *   - Only the HASH is stored. The store is a plain JSON file on the same box
 *     as everything else; if it leaks, it does not hand anyone a working
 *     credential.
 *
 *   - The token ROTATES on every use. That converts a stolen cookie from a
 *     silent 30-day skeleton key into something self-detecting: the moment
 *     either party uses it, the other party's copy is stale, and a stale
 *     token is both rejected and reported. It cannot say WHICH party was the
 *     thief, so the device is revoked outright — the safe direction.
 *
 *   - Trust is BOUND to the tailnet peer that created it. A cookie exfiltrated
 *     to a machine outside the tailnet is useless twice over: gate 1 rejects
 *     it, and the binding would reject it anyway.
 *
 * Writes go through a temp-file rename so a crash mid-write cannot leave a
 * truncated store — which would silently log every device out.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TOKEN_BYTES = 32;
const ID_BYTES = 9;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Constant-time compare of two hex digests of equal length. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export class DeviceStore {
  /**
   * @param {object} opts
   * @param {string} opts.file      path to the JSON store
   * @param {number} opts.trustDays how long a trusted device lasts
   */
  constructor({ file, trustDays = 30 }) {
    this.file = file;
    this.trustMs = trustDays * 24 * 60 * 60 * 1000;
    this.devices = new Map();
    this.#load();
  }

  #load() {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const d of raw.devices || []) this.devices.set(d.id, d);
    } catch {
      // Missing or unreadable store is the normal first-run state. Anything
      // else (corrupt JSON) also lands here and starts clean — the cost is
      // re-entering TOTP once, which is strictly better than crashing the
      // console and locking everyone out.
      this.devices = new Map();
    }
    this.#prune();
  }

  #save() {
    const dir = dirname(this.file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.devices.${process.pid}.tmp`);
    const body = JSON.stringify({ version: 1, devices: [...this.devices.values()] }, null, 2);
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  #prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, d] of this.devices) {
      if (d.expiresAt <= now) { this.devices.delete(id); changed = true; }
    }
    return changed;
  }

  /**
   * Mint a new trusted device.
   * @returns {{cookie: string, device: object}} cookie is `id.token` — the
   *          only time the raw token exists outside the client.
   */
  issue({ peer, label, userAgent = '' }) {
    const id = randomBytes(ID_BYTES).toString('base64url');
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = Date.now();

    const device = {
      id,
      tokenHash: sha256(token),
      label: label || describeAgent(userAgent),
      // Binding. `login` is the tailnet user; `nodeId` pins it to one machine
      // when whois gave us a stable id.
      peerLogin: peer?.login || '',
      peerNodeId: peer?.nodeId || '',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + this.trustMs,
      userAgent: userAgent.slice(0, 200),
      uses: 0,
    };

    this.devices.set(id, device);
    this.#save();
    return { cookie: `${id}.${token}`, device: redact(device) };
  }

  /**
   * Validate a device cookie and rotate its token.
   *
   * @returns {{ok: true, device: object, cookie: string} |
   *           {ok: false, reason: 'absent'|'malformed'|'unknown'|'expired'|'peer_mismatch'|'stale_token'}}
   */
  redeem(cookieValue, peer) {
    if (!cookieValue) return { ok: false, reason: 'absent' };

    const dot = cookieValue.indexOf('.');
    if (dot < 1) return { ok: false, reason: 'malformed' };
    const id = cookieValue.slice(0, dot);
    const token = cookieValue.slice(dot + 1);
    if (!token) return { ok: false, reason: 'malformed' };

    const device = this.devices.get(id);
    if (!device) return { ok: false, reason: 'unknown' };

    const now = Date.now();
    if (device.expiresAt <= now) {
      this.devices.delete(id);
      this.#save();
      return { ok: false, reason: 'expired' };
    }

    if (!safeEqualHex(sha256(token), device.tokenHash)) {
      // The id is real but the token is not the current one. Either the cookie
      // was copied and one copy has since rotated, or someone is guessing.
      // We cannot tell the honest party from the thief, so revoke: forcing one
      // TOTP re-entry is cheap, leaving a live clone is not.
      this.devices.delete(id);
      this.#save();
      return { ok: false, reason: 'stale_token' };
    }

    // Binding check. Only enforced for fields we actually recorded, so a
    // device issued under CIDR fallback (no nodeId) is not permanently
    // unusable once whois starts answering.
    if (device.peerLogin && peer?.login && device.peerLogin !== peer.login) {
      return { ok: false, reason: 'peer_mismatch' };
    }
    if (device.peerNodeId && peer?.nodeId && device.peerNodeId !== peer.nodeId) {
      return { ok: false, reason: 'peer_mismatch' };
    }

    // Rotate.
    const next = randomBytes(TOKEN_BYTES).toString('base64url');
    device.tokenHash = sha256(next);
    device.lastSeenAt = now;
    device.uses += 1;
    // Sliding expiry: a device you use every week never has to re-enrol; one
    // you abandon ages out on schedule.
    device.expiresAt = now + this.trustMs;
    this.#save();

    return { ok: true, device: redact(device), cookie: `${id}.${next}` };
  }

  /**
   * Does this device still exist and is it still in date?
   *
   * The console calls this on every request that carries a device-minted
   * session, which is what makes revocation immediate rather than "immediate
   * for new logins, up to SESSION_HOURS for the session already issued".
   */
  exists(id) {
    const d = this.devices.get(id);
    if (!d) return false;
    if (d.expiresAt <= Date.now()) {
      this.devices.delete(id);
      this.#save();
      return false;
    }
    return true;
  }

  list() {
    this.#prune();
    return [...this.devices.values()]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map(redact);
  }

  revoke(id) {
    const had = this.devices.delete(id);
    if (had) this.#save();
    return had;
  }

  revokeAll() {
    const n = this.devices.size;
    this.devices.clear();
    this.#save();
    return n;
  }
}

/** Never let the token hash out of the module. */
function redact(d) {
  const { tokenHash, ...rest } = d;
  return rest;
}

/**
 * A human-readable default label, so the Devices screen reads "iPhone · Safari"
 * rather than a 200-character UA string. Deliberately coarse — this is a
 * memory aid for choosing what to revoke, not analytics.
 */
function describeAgent(ua = '') {
  const platform =
    /iPhone/i.test(ua) ? 'iPhone' :
    /iPad/i.test(ua) ? 'iPad' :
    /Android/i.test(ua) ? 'Android' :
    /Macintosh|Mac OS X/i.test(ua) ? 'Mac' :
    /Windows/i.test(ua) ? 'Windows' :
    /Linux/i.test(ua) ? 'Linux' : 'Device';
  const browser =
    /CriOS|Chrome\//i.test(ua) ? 'Chrome' :
    /FxiOS|Firefox\//i.test(ua) ? 'Firefox' :
    /Edg\//i.test(ua) ? 'Edge' :
    /Safari\//i.test(ua) ? 'Safari' : '';
  return browser ? `${platform} · ${browser}` : platform;
}

export const _internals = { sha256, describeAgent, safeEqualHex };
