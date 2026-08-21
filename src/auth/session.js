/**
 * Signed session cookies.
 *
 * Hand-rolled rather than pulled from a library, for two reasons that matter
 * here: the payload has to carry the tailnet peer identity so a session cannot
 * outlive the peer it was issued to, and the console needs to verify the same
 * cookie on a WebSocket upgrade, where there is no Express response object to
 * hand a middleware.
 *
 * Format:  base64url(json) + '.' + base64url(hmac-sha256)
 *
 * The session is deliberately SHORT (12h default). It is not what keeps you
 * logged in for a month — the device-trust cookie is (see devices.js). Keeping
 * the session short is what makes revocation fast: revoke a device and the
 * longest anyone stays in is the remainder of one session.
 *
 * Secret rotation is supported by passing several keys. The first signs; all
 * of them verify. That lets you rotate JWT_SECRET without logging everyone out
 * — put the new key first, keep the old one until existing sessions age out.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url');

export class SessionCodec {
  /**
   * @param {object} opts
   * @param {string|string[]} opts.keys  signing keys, newest first
   * @param {number} opts.ttlMs
   */
  constructor({ keys, ttlMs }) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    if (!list.length) throw new Error('SESSION_SECRET is required (32+ chars).');
    if (list[0].length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters — generate with `openssl rand -hex 32`.');
    }
    this.keys = list;
    this.ttlMs = ttlMs;
  }

  #sign(payloadB64, key) {
    return createHmac('sha256', key).update(payloadB64).digest();
  }

  /** @returns {string} the cookie value */
  issue(data) {
    const now = Date.now();
    const payload = { ...data, iat: now, exp: now + this.ttlMs, jti: randomBytes(9).toString('base64url') };
    const body = b64u(JSON.stringify(payload));
    return `${body}.${b64u(this.#sign(body, this.keys[0]))}`;
  }

  /**
   * @returns {{ok: true, session: object} | {ok: false, reason: 'absent'|'malformed'|'bad_signature'|'expired'}}
   */
  verify(cookieValue) {
    if (!cookieValue) return { ok: false, reason: 'absent' };
    const dot = cookieValue.lastIndexOf('.');
    if (dot < 1) return { ok: false, reason: 'malformed' };

    const body = cookieValue.slice(0, dot);
    let given;
    try {
      given = unb64u(cookieValue.slice(dot + 1));
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    // Try every key so a rotation does not invalidate live sessions. Compare
    // in constant time; length is fixed at 32 bytes for sha256, but a
    // truncated cookie would otherwise throw rather than fail cleanly.
    const matched = this.keys.some((k) => {
      const want = this.#sign(body, k);
      return want.length === given.length && timingSafeEqual(want, given);
    });
    if (!matched) return { ok: false, reason: 'bad_signature' };

    let session;
    try {
      session = JSON.parse(unb64u(body).toString('utf8'));
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (!session?.exp || session.exp <= Date.now()) return { ok: false, reason: 'expired' };
    return { ok: true, session };
  }
}

/**
 * Minimal cookie-header parser. Express's `req.cookies` needs cookie-parser
 * middleware, which does not run on a WebSocket upgrade — the upgrade handler
 * gets a raw IncomingMessage. One parser used by both paths keeps the two
 * from drifting apart, which is exactly the kind of divergence that leaves an
 * upgrade endpoint accidentally unauthenticated.
 */
export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

/** Serialize a Set-Cookie value with the flags this app always wants. */
export function cookieHeader(name, value, { maxAgeMs, secure, path = '/', sameSite = 'Lax' }) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  // maxAgeMs === 0 expires the cookie (used on logout / revoke).
  if (maxAgeMs != null) bits.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (secure) bits.push('Secure');
  return bits.join('; ');
}
