/**
 * Gate 1 — the tailnet check.
 *
 * The console is only ever reachable over Tailscale. This is the outermost
 * gate and the one that must FAIL CLOSED: if we cannot positively establish
 * that a request came from the tailnet, it is rejected.
 *
 * A rejected request gets a 404, not a 403. A 403 confirms something is here;
 * a 404 does not. No login form is ever rendered to a caller we cannot place
 * on the tailnet, which means the TOTP prompt has no public attack surface at
 * all — there is nothing to rate-limit, enumerate or phish.
 *
 * Two ways to establish identity, in order:
 *
 *   1. `tailscale whois` on the peer address. Authoritative — it is the
 *      daemon's own view of the tailnet — and gives us a real user login and
 *      node name to attribute sessions to.
 *
 *   2. CIDR membership (default 100.64.0.0/10, the CGNAT range Tailscale
 *      allocates from). Used when the CLI is unavailable — most obviously
 *      when the console runs in a container that does not share the host's
 *      network namespace. Weaker: it proves the source address is in the
 *      range, not that the daemon knows the peer.
 *
 * `tailscale serve` / `tailscale funnel` deployments put the identity in
 * request headers instead. Those are trusted ONLY when TRUST_PROXY_IDENTITY
 * is explicitly on, because a header is forgeable by anything that can reach
 * the port directly.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isIP } from 'node:net';

const exec = promisify(execFile);

/** Default Tailscale CGNAT range, plus IPv6 ULA. */
const DEFAULT_CIDRS = ['100.64.0.0/10', 'fd7a:115c:a1e0::/48'];

/* ── CIDR matching ──────────────────────────────────────────────────────── */

/** Expand an address to a big-endian BigInt so v4 and v6 share one path. */
function addrToBigInt(addr) {
  const v = isIP(addr);
  if (v === 4) {
    return addr.split('.').reduce((acc, o) => (acc << 8n) | BigInt(Number(o)), 0n);
  }
  if (v === 6) {
    // Expand :: and any embedded IPv4 tail before parsing.
    let a = addr;
    const v4tail = /(.*:)((\d+\.){3}\d+)$/.exec(a);
    if (v4tail) {
      const n = v4tail[2].split('.').map(Number);
      a = v4tail[1] + ((n[0] << 8) | n[1]).toString(16) + ':' + ((n[2] << 8) | n[3]).toString(16);
    }
    const [head, tail = ''] = a.split('::');
    const h = head ? head.split(':').filter(Boolean) : [];
    const t = tail ? tail.split(':').filter(Boolean) : [];
    const fill = Array(8 - h.length - t.length).fill('0');
    const parts = a.includes('::') ? [...h, ...fill, ...t] : a.split(':');
    if (parts.length !== 8) return null;
    return parts.reduce((acc, p) => (acc << 16n) | BigInt(parseInt(p || '0', 16)), 0n);
  }
  return null;
}

function inCidr(addr, cidr) {
  const [net, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const width = isIP(net) === 4 ? 32 : 128;
  if (isIP(addr) !== isIP(net)) return false;
  const a = addrToBigInt(addr);
  const n = addrToBigInt(net);
  if (a === null || n === null || !Number.isFinite(bits)) return false;
  const mask = bits === 0 ? 0n : (~0n << BigInt(width - bits)) & ((1n << BigInt(width)) - 1n);
  return (a & mask) === (n & mask);
}

/* ── address normalisation ──────────────────────────────────────────────── */

/**
 * Node reports tailnet IPv4 peers as IPv4-mapped IPv6 (`::ffff:100.x.y.z`)
 * whenever the server listens on a dual-stack socket. Stripping the prefix
 * matters: without it every v4 peer fails the v4 CIDR test and falls through
 * to the v6 one, and the gate rejects the entire tailnet.
 */
export function normalizeAddr(addr) {
  if (!addr) return '';
  let a = String(addr);
  if (a.startsWith('::ffff:')) a = a.slice(7);
  const pct = a.indexOf('%');            // strip zone id (fe80::1%eth0)
  if (pct !== -1) a = a.slice(0, pct);
  return a;
}

/* ── whois ──────────────────────────────────────────────────────────────── */

// whois shells out, so cache it. Short TTL: a node can be removed from the
// tailnet and we should notice within a minute, not an hour.
const whoisCache = new Map();
const WHOIS_TTL_MS = 60_000;

async function whois(addr, { cliPath = 'tailscale', timeoutMs = 2500 } = {}) {
  const hit = whoisCache.get(addr);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value = null;
  try {
    const { stdout } = await exec(cliPath, ['whois', '--json', addr], { timeout: timeoutMs });
    const j = JSON.parse(stdout);
    // Tagged nodes (CI runners, exit nodes) have no user — fall back to the
    // node name so they are still attributable rather than anonymous.
    value = {
      login: j?.UserProfile?.LoginName || j?.Node?.Name || 'tagged-device',
      display: j?.UserProfile?.DisplayName || j?.Node?.Name || '',
      node: (j?.Node?.Name || '').replace(/\.$/, ''),
      nodeId: j?.Node?.ID != null ? String(j.Node.ID) : (j?.Node?.StableID || ''),
      tags: j?.Node?.Tags || [],
      source: 'whois',
    };
  } catch {
    value = null;   // CLI missing, peer unknown, or timed out — all "no answer"
  }

  whoisCache.set(addr, { value, expires: Date.now() + WHOIS_TTL_MS });
  return value;
}

export function clearWhoisCache() {
  whoisCache.clear();
}

/* ── the gate ───────────────────────────────────────────────────────────── */

/**
 * Build the middleware.
 *
 * @param {object}   opts
 * @param {string[]} opts.trustedCidrs        fallback ranges when whois is unavailable
 * @param {boolean}  opts.trustProxyIdentity  honour Tailscale-User-Login headers
 * @param {boolean}  opts.allowLoopback       let 127.0.0.1 through (dev only)
 * @param {string}   opts.cliPath             path to the tailscale binary
 */
export function tailnetGate({
  trustedCidrs = DEFAULT_CIDRS,
  trustProxyIdentity = false,
  allowLoopback = false,
  cliPath = 'tailscale',
} = {}) {
  return async function gate(req, res, next) {
    // req.ip, NOT req.socket.remoteAddress.
    //
    // Behind a reverse proxy the TCP peer is the PROXY, so reading the socket
    // directly meant the gate saw 172.x and 404'd every real tailnet user —
    // the console was unreachable behind the very Caddy it is meant to sit
    // behind. Express derives req.ip from X-Forwarded-For according to the
    // `trust proxy` setting, which server.js pins to exactly one hop; a client
    // cannot forge it, because the proxy APPENDS the true peer and only that
    // last entry is honoured. With no proxy configured req.ip is the socket
    // address anyway, so standalone behaviour is unchanged.
    const addr = normalizeAddr(req.ip || req.socket?.remoteAddress);

    // `tailscale serve` terminates TLS and forwards with identity headers.
    // Only trusted when explicitly enabled — otherwise anything that can
    // reach the port could simply set the header and walk in.
    if (trustProxyIdentity) {
      const login = req.get('Tailscale-User-Login');
      if (login) {
        req.peer = {
          login,
          display: req.get('Tailscale-User-Name') || '',
          node: req.get('Tailscale-Node-Name') || '',
          nodeId: '',
          tags: [],
          source: 'proxy-header',
        };
        return next();
      }
    }

    if (allowLoopback && (addr === '127.0.0.1' || addr === '::1')) {
      req.peer = { login: 'local-dev', display: 'Local development', node: 'loopback', nodeId: 'loopback', tags: [], source: 'loopback' };
      return next();
    }

    const who = await whois(addr, { cliPath });
    if (who) {
      req.peer = who;
      return next();
    }

    // No authoritative answer. Fall back to range membership — weaker, but it
    // is what a containerised console without the CLI has to work with.
    if (trustedCidrs.some((c) => inCidr(addr, c))) {
      req.peer = { login: `tailnet:${addr}`, display: '', node: addr, nodeId: addr, tags: [], source: 'cidr' };
      return next();
    }

    // Fail closed, and say nothing.
    res.status(404).type('text/plain').send('Not Found');
  };
}

export const _internals = { inCidr, addrToBigInt };
