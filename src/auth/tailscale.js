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

/*
 * A FAILED whois is not an answer.
 *
 * The CLI times out or cannot reach tailscaled now and then (the box under
 * load, a link change mid-rebind). That used to be cached for a full minute
 * as "no answer", every request from the peer fell to the CIDR path, and the
 * peer's identity changed from `user@github` / node id to `tailnet:<ip>` /
 * `<ip>`. Every session and device cookie the desktop had was bound to the
 * first identity, so all of them failed the peer check at once and the
 * console asked for TOTP — then again when whois came back and the new
 * device, bound to `tailnet:<ip>`, no longer matched. Several times a day.
 *
 * So: one retry, a short negative cache, and when the daemon is merely
 * unreachable the last answer it gave for this address stands in. Tailnet
 * addresses are assigned per node and WireGuard authenticates them, so the
 * last authoritative answer for an address is still the right one until the
 * daemon says otherwise. An authoritative "no such peer" clears it.
 */
const lastGood = new Map();
const LAST_GOOD_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5_000;
const inflight = new Map();
const failLogged = new Map();

/** tailscaled answered, and the answer was "not a peer". */
const isNoMatch = (err) => /peer not found|no match for/i.test(String(err?.stderr || err?.message || ''));

function logFailure(addr, err) {
  const now = Date.now();
  if ((failLogged.get(addr) || 0) > now) return;
  failLogged.set(addr, now + 60_000);
  const why = err?.killed ? 'timed out' : String(err?.stderr || err?.message || err).trim().split('\n').pop().slice(0, 160);
  console.warn(`[auth] tailscale whois ${addr} failed: ${why}`);
}

async function whoisOnce(addr, { cliPath, timeoutMs }) {
  const { stdout } = await exec(cliPath, ['whois', '--json', addr], { timeout: timeoutMs });
  const j = JSON.parse(stdout);
  // Tagged nodes (CI runners, exit nodes) have no user — fall back to the
  // node name so they are still attributable rather than anonymous.
  return {
    login: j?.UserProfile?.LoginName || j?.Node?.Name || 'tagged-device',
    display: j?.UserProfile?.DisplayName || j?.Node?.Name || '',
    node: (j?.Node?.Name || '').replace(/\.$/, ''),
    nodeId: j?.Node?.ID != null ? String(j.Node.ID) : (j?.Node?.StableID || ''),
    tags: j?.Node?.Tags || [],
    addr,
    source: 'whois',
  };
}

async function whois(addr, { cliPath = 'tailscale', timeoutMs = 2500, retries = 1 } = {}) {
  const hit = whoisCache.get(addr);
  if (hit && hit.expires > Date.now()) return hit.value;
  // A page waking up fires a burst of requests; they share one lookup.
  if (inflight.has(addr)) return inflight.get(addr);

  const run = (async () => {
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const value = await whoisOnce(addr, { cliPath, timeoutMs });
        whoisCache.set(addr, { value, expires: Date.now() + WHOIS_TTL_MS });
        lastGood.set(addr, { value, until: Date.now() + LAST_GOOD_MS });
        failLogged.delete(addr);
        return value;
      } catch (err) {
        lastErr = err;
        if (err?.code === 'ENOENT' || isNoMatch(err)) break;   // retrying will not change it
      }
    }

    if (isNoMatch(lastErr)) {
      lastGood.delete(addr);
    } else {
      const lg = lastGood.get(addr);
      if (lg && lg.until > Date.now()) {
        logFailure(addr, lastErr);
        // Not cached as fresh: the next request asks the daemon again.
        return lg.value;
      }
      // No CLI at all is the normal containerised setup; nothing to report.
      if (lastErr?.code !== 'ENOENT') logFailure(addr, lastErr);
    }
    whoisCache.set(addr, { value: null, expires: Date.now() + NEGATIVE_TTL_MS });
    return null;
  })();

  inflight.set(addr, run);
  try { return await run; } finally { inflight.delete(addr); }
}

export function clearWhoisCache() {
  whoisCache.clear();
  lastGood.clear();
  inflight.clear();
  failLogged.clear();
}

/* ── peer identity matching ─────────────────────────────────────────────── */

const CIDR_PREFIX = 'tailnet:';
const isCidrLogin = (l) => typeof l === 'string' && l.startsWith(CIDR_PREFIX);

/**
 * Is `peer` (this request) the same tailnet peer as `bound` (whoever a
 * session or device was issued to)? Both are `{login, nodeId, addr}`.
 *
 * One rule used by sessions, device trust and the WebSocket upgrade, so they
 * cannot disagree about who someone is.
 *
 *   - Both identified by whois: same login, and same node when both name one.
 *   - Either side identified only by CIDR fallback (`tailnet:<addr>`): the
 *     tailnet ADDRESS is the identity, and it must match exactly. A tailnet
 *     address is one node's, authenticated by WireGuard, so this is the same
 *     machine seen through a weaker lens — not a looser rule. Without this a
 *     whois blip turned the owner's own laptop into a stranger.
 *   - A binding with no recorded address cannot be matched to a CIDR peer:
 *     fail closed.
 *
 * Only recorded fields are enforced, as before, so a binding made with no
 * identity at all is not permanently unusable.
 */
export function samePeer(bound = {}, peer = {}) {
  const bLogin = bound?.login || '';
  const pLogin = peer?.login || '';
  if (!bLogin && !bound?.nodeId && !bound?.addr) return true;

  if (isCidrLogin(bLogin) || isCidrLogin(pLogin)) {
    const bAddr = bound?.addr || (isCidrLogin(bLogin) ? bLogin.slice(CIDR_PREFIX.length) : '');
    const pAddr = peer?.addr || (isCidrLogin(pLogin) ? pLogin.slice(CIDR_PREFIX.length) : '');
    return !!bAddr && bAddr === pAddr;
  }

  if (bLogin && pLogin && bLogin !== pLogin) return false;
  if (bound?.nodeId && peer?.nodeId && bound.nodeId !== peer.nodeId) return false;
  return true;
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
/**
 * The client address, honouring a fixed number of trusted proxy hops.
 *
 * Express computes this for normal requests, but a WebSocket upgrade arrives
 * on the server's `upgrade` event with a RAW request that has no req.ip — so
 * the upgrade path silently fell back to the socket, saw the reverse proxy's
 * own container address, and refused every real client with a 404. The
 * remote-desktop module depends on that endpoint, so "the remote desktop will
 * not connect" was the whole visible symptom.
 *
 * Exported and used by BOTH paths deliberately: two hand-rolled copies of
 * this logic is exactly how they drifted apart in the first place.
 *
 * With hops > 0 the LAST X-Forwarded-For entry wins, because the immediate
 * proxy APPENDS the true peer — anything a client puts there is to the left
 * of it and ignored. With hops = 0 the header is not consulted at all, or a
 * direct client could simply name itself.
 *
 * @param {object} req
 * @param {number} hops  trusted proxy hops; mirrors app.set('trust proxy', n)
 */
export function peerAddress(req, hops = 0) {
  if (hops > 0) {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
      const list = String(xff).split(',').map((v) => v.trim()).filter(Boolean);
      if (list.length) return list[list.length - 1];
    }
  }
  return req.socket?.remoteAddress;
}

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
          addr,
          source: 'proxy-header',
        };
        return next();
      }
    }

    if (allowLoopback && (addr === '127.0.0.1' || addr === '::1')) {
      req.peer = { login: 'local-dev', display: 'Local development', node: 'loopback', nodeId: 'loopback', tags: [], addr, source: 'loopback' };
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
      req.peer = { login: `${CIDR_PREFIX}${addr}`, display: '', node: addr, nodeId: addr, tags: [], addr, source: 'cidr' };
      return next();
    }

    // Fail closed, and say nothing.
    res.status(404).type('text/plain').send('Not Found');
  };
}

export const _internals = { inCidr, addrToBigInt, whois, whoisCache };
