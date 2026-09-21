/**
 * The console's reference clock.
 *
 * The home page carries a clock precise enough to set a mechanical watch by,
 * and "precise" has to mean something checkable. A browser's own clock is
 * whatever the device believes — phones and laptops are routinely a second or
 * more out — so the page syncs to this server instead, and this server does
 * not simply assert that its clock is right: it asks an NTP server, measures
 * its own offset, and reports the measurement alongside the time.
 *
 * The host is already disciplined by systemd-timesyncd, so the usual outcome
 * is an offset inside the measurement's own noise, and then the host clock is
 * served untouched. Only an offset larger than the noise — the host's sync has
 * broken and it has drifted — is corrected for. Applying a single noisy sample
 * to a clock that is already right would make it worse, not better.
 *
 * SNTP (RFC 4330): one 48-byte UDP datagram each way. No dependency.
 */

import dgram from 'node:dgram';

const NTP_EPOCH_OFFSET_S = 2_208_988_800;   // 1900-01-01 → 1970-01-01
const TWO_32 = 2 ** 32;

/** Wall time in ms with sub-millisecond resolution. */
export const wallNow = () => performance.timeOrigin + performance.now();

/** Read a 64-bit NTP timestamp at `at` as Unix milliseconds. */
export function readNtpTime(buf, at) {
  const s = buf.readUInt32BE(at);
  const f = buf.readUInt32BE(at + 4);
  return (s - NTP_EPOCH_OFFSET_S) * 1000 + (f / TWO_32) * 1000;
}

/** Write Unix milliseconds as a 64-bit NTP timestamp at `at`. */
export function writeNtpTime(buf, at, ms) {
  const secs = Math.floor(ms / 1000);
  const frac = Math.round(((ms / 1000) - secs) * TWO_32) >>> 0;
  buf.writeUInt32BE((secs + NTP_EPOCH_OFFSET_S) >>> 0, at);
  buf.writeUInt32BE(frac, at + 4);
}

/**
 * The four-timestamp exchange.
 *   t1 client send · t2 server receive · t3 server send · t4 client receive
 * offset is how far the local clock is BEHIND the server (add it to local);
 * delay is the round trip minus the server's own processing time.
 */
export function computeSample(t1, t2, t3, t4) {
  return {
    offset: ((t2 - t1) + (t3 - t4)) / 2,
    delay: (t4 - t1) - (t3 - t2),
  };
}

/** A client request: LI 0, version 4, mode 3; our send time in Transmit. */
export function buildRequest(t1) {
  const buf = Buffer.alloc(48);
  buf[0] = 0x23;
  writeNtpTime(buf, 40, t1);
  return buf;
}

/**
 * Validate and decode a reply to a request sent at t1. Throws on anything a
 * careful client should refuse: wrong mode, a kiss-of-death (stratum 0), an
 * unsynchronised server (LI 3), or a reply that does not echo our request.
 */
export function parseReply(buf, t1, t4) {
  if (buf.length < 48) throw new Error('short reply');
  const li = buf[0] >> 6, mode = buf[0] & 7, stratum = buf[1];
  if (mode !== 4) throw new Error(`not a server reply (mode ${mode})`);
  if (stratum === 0) throw new Error(`kiss-of-death ${buf.toString('ascii', 12, 16)}`);
  if (li === 3) throw new Error('server clock unsynchronised');
  const originate = readNtpTime(buf, 24);
  if (Math.abs(originate - t1) > 1) throw new Error('reply does not match request');
  const t2 = readNtpTime(buf, 32), t3 = readNtpTime(buf, 40);
  return { stratum, ...computeSample(t1, t2, t3, t4) };
}

function queryOnce(host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const timer = setTimeout(() => { sock.close(); reject(new Error('timeout')); }, timeoutMs);
    let t1 = 0;
    sock.once('error', (e) => { clearTimeout(timer); sock.close(); reject(e); });
    sock.once('message', (msg) => {
      const t4 = wallNow();
      clearTimeout(timer); sock.close();
      try { resolve(parseReply(msg, t1, t4)); } catch (e) { reject(e); }
    });
    t1 = wallNow();
    sock.send(buildRequest(t1), 123, host, (e) => {
      if (e) { clearTimeout(timer); sock.close(); reject(e); }
    });
  });
}

export class TimeReference {
  /**
   * @param {string[]} opts.servers   tried in order until one answers
   * @param {number}   opts.everyMs   re-measure interval
   * @param {number}   opts.burst     samples per measurement; the lowest-delay one wins
   */
  constructor({ servers = ['time.cloudflare.com', 'pool.ntp.org'], everyMs = 15 * 60_000,
                burst = 4, timeoutMs = 1500, query = queryOnce } = {}) {
    Object.assign(this, { servers, everyMs, burst, timeoutMs, query });
    this.last = null;      // { server, stratum, offset, delay, at }
    this.error = null;
    this.correction = 0;   // ms added to the host clock; 0 unless the host is measurably off
  }

  start() {
    this.measure();
    this.timer = setInterval(() => this.measure(), this.everyMs);
    this.timer.unref?.();
    return this;
  }

  stop() { clearInterval(this.timer); }

  async measure() {
    for (const server of this.servers) {
      const samples = [];
      for (let i = 0; i < this.burst; i++) {
        try { samples.push(await this.query(server, this.timeoutMs)); } catch { /* next sample */ }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!samples.length) continue;
      // The sample with the shortest round trip has the least room for an
      // asymmetric path to distort it, so it is the one to believe.
      const best = samples.reduce((a, b) => (b.delay < a.delay ? b : a));
      this.last = { server, ...best, at: Date.now() };
      this.error = null;
      // Correct only when the offset is outside what the measurement can
      // resolve. Inside it, the host's own NTP discipline is the better clock.
      const noise = best.delay / 2 + 5;
      this.correction = Math.abs(best.offset) > noise ? best.offset : 0;
      return this.last;
    }
    this.error = 'no NTP server answered';
    return null;
  }

  /** Reference time, ms since the Unix epoch. */
  now() { return wallNow() + this.correction; }

  /** What the page shows next to the time, so the precision claim is checkable. */
  status() {
    if (!this.last) return { verified: false, error: this.error || 'measuring' };
    const { server, stratum, offset, delay, at } = this.last;
    const corrected = this.correction !== 0;
    return {
      verified: true,
      server, stratum,
      offsetMs: Math.round(offset * 10) / 10,
      delayMs: Math.round(delay * 10) / 10,
      corrected,
      // Worst-case error of the time this server hands out: half the probe's
      // round trip, plus the untouched offset when it was inside the noise.
      errMs: Math.round((delay / 2 + (corrected ? 0 : Math.abs(offset))) * 10) / 10,
      checkedAt: at,
      stale: Date.now() - at > this.everyMs * 3,
    };
  }
}
