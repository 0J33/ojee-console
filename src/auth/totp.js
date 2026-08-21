/**
 * Gate 2 — TOTP.
 *
 * Wraps otplib with the two things a bare `authenticator.verify()` does not
 * give you:
 *
 *   1. A replay guard. `window: 1` accepts the previous and next 30-second
 *      step so a code that flips while you are typing still works — but it
 *      also means a code stays valid for ~90 seconds. Without a guard, a code
 *      observed once (shoulder-surfed, logged by a proxy, left in a browser
 *      autofill) can be replayed for the rest of that window. We record every
 *      consumed (secret, timestep) pair and refuse it a second time.
 *
 *   2. A rate limiter that counts FAILURES, not attempts. Counting attempts
 *      means a legitimate user who logs in ten times in a minute locks
 *      themselves out; counting failures targets the actual brute-force.
 *
 * Both stores are in-memory and self-pruning. They are deliberately not
 * persisted: a restart invalidating the replay window is harmless (codes
 * expire in 90s anyway) and a restart clearing the rate limiter is a fair
 * trade for not writing attacker-controlled data to disk.
 */

import { createHash } from 'node:crypto';
import { authenticator } from 'otplib';

// Tolerate clock drift between the phone and the server: accept the previous
// and next 30-second step as well as the current one.
authenticator.options = { window: 1 };

const STEP_SECONDS = 30;
const REPLAY_TTL_MS = (STEP_SECONDS * 3 + 5) * 1000;   // widest window + slack

/* ── replay guard ───────────────────────────────────────────────────────── */

const consumed = new Map();   // key -> expiry ms

function pruneConsumed(now) {
  for (const [k, exp] of consumed) if (exp <= now) consumed.delete(k);
}

/**
 * Which 30s step did this token belong to? otplib tells us a code is valid but
 * not WHICH step matched, so we re-derive it by generating the code for each
 * step in the window and comparing. That is what makes the replay key precise
 * — keying on the code alone would also block a genuinely different login that
 * happened to land on the same digits in a later window.
 */
function matchedStep(secret, token, now) {
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  for (const delta of [0, -1, 1]) {
    const step = current + delta;
    try {
      // otplib generates for "now", so shift the epoch to reach other steps.
      const at = new Date(step * STEP_SECONDS * 1000);
      if (authenticator.generate(secret, at) === token) return step;
    } catch {
      /* generate throws on a malformed secret — verify() will report it */
    }
  }
  return null;
}

/* ── failure limiter ────────────────────────────────────────────────────── */

const failures = new Map();   // bucket -> { count, resetAt }

/* ── public API ─────────────────────────────────────────────────────────── */

export class TotpVerifier {
  /**
   * @param {object} opts
   * @param {string} opts.secret         base32 TOTP secret
   * @param {number} opts.maxFailures    failures allowed per window
   * @param {number} opts.windowMs       limiter window
   */
  constructor({ secret, maxFailures = 8, windowMs = 60_000 }) {
    if (!secret) throw new Error('TOTP_SECRET is required — run `npm run setup-totp`.');
    this.secret = secret;
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  /**
   * @param {string} token   the 6 digits the user typed
   * @param {string} bucket  rate-limit key — the peer identity, not the IP.
   *                         Every tailnet peer has a stable identity, which is
   *                         a far better bucket than an address that a single
   *                         user changes by walking between wifi and cellular.
   * @returns {{ok: true} | {ok: false, reason: 'rate_limited'|'malformed'|'invalid'|'replayed', retryAfterMs?: number}}
   */
  verify(token, bucket = 'default') {
    const now = Date.now();
    pruneConsumed(now);

    const rec = failures.get(bucket);
    if (rec && rec.resetAt > now && rec.count >= this.maxFailures) {
      return { ok: false, reason: 'rate_limited', retryAfterMs: rec.resetAt - now };
    }

    const code = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      this.#fail(bucket, now);
      return { ok: false, reason: 'malformed' };
    }

    if (!authenticator.verify({ token: code, secret: this.secret })) {
      this.#fail(bucket, now);
      return { ok: false, reason: 'invalid' };
    }

    const step = matchedStep(this.secret, code, now);
    // A valid code we cannot place on a step is a contradiction — treat it as
    // suspect rather than waving it through.
    if (step === null) {
      this.#fail(bucket, now);
      return { ok: false, reason: 'invalid' };
    }

    const key = createHash('sha256').update(`${this.secret}:${step}`).digest('hex');
    if (consumed.has(key)) {
      // Deliberately NOT counted as a failure: a replay is usually a
      // double-submitted form, and locking someone out for double-clicking
      // would be its own denial of service.
      return { ok: false, reason: 'replayed' };
    }
    consumed.set(key, now + REPLAY_TTL_MS);

    failures.delete(bucket);
    return { ok: true };
  }

  #fail(bucket, now) {
    const rec = failures.get(bucket);
    if (!rec || rec.resetAt <= now) {
      failures.set(bucket, { count: 1, resetAt: now + this.windowMs });
    } else {
      rec.count += 1;
    }
  }
}

/** Test hook — clears both stores. */
export function _resetTotpState() {
  consumed.clear();
  failures.clear();
}

export { authenticator };
