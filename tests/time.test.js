import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSample, buildRequest, parseReply, readNtpTime, writeNtpTime, TimeReference,
} from '../src/time.js';

test('NTP timestamps round-trip through the wire format to well under a millisecond', () => {
  const buf = Buffer.alloc(8);
  for (const ms of [0, 1_789_949_706_375.25, Date.UTC(2036, 1, 7)]) {
    writeNtpTime(buf, 0, ms);
    assert.ok(Math.abs(readNtpTime(buf, 0) - ms) < 0.001, `${ms}`);
  }
});

test('offset and delay follow the four-timestamp formula', () => {
  // Local clock 100 ms slow, 20 ms each way, 2 ms of server processing.
  const t1 = 1000, t2 = 1120, t3 = 1122, t4 = 1042;
  assert.deepEqual(computeSample(t1, t2, t3, t4), { offset: 100, delay: 40 });
});

function reply({ t1, t2, t3, stratum = 2, mode = 4, li = 0 }) {
  const b = buildRequest(t1);
  b[0] = (li << 6) | (4 << 3) | mode; b[1] = stratum;
  writeNtpTime(b, 24, t1); writeNtpTime(b, 32, t2); writeNtpTime(b, 40, t3);
  return b;
}

test('a valid reply decodes; a mismatched, kiss-of-death or unsynced one is refused', () => {
  const t1 = 1_789_949_706_000;
  const ok = parseReply(reply({ t1, t2: t1 + 25, t3: t1 + 26 }), t1, t1 + 40);
  assert.equal(ok.stratum, 2);
  assert.ok(Math.abs(ok.offset - 5.5) < 0.01 && Math.abs(ok.delay - 39) < 0.01);
  assert.throws(() => parseReply(reply({ t1: t1 + 500, t2: t1, t3: t1 }), t1, t1 + 40), /does not match/);
  assert.throws(() => parseReply(reply({ t1, t2: t1, t3: t1, stratum: 0 }), t1, t1 + 40), /kiss-of-death/);
  assert.throws(() => parseReply(reply({ t1, t2: t1, t3: t1, li: 3 }), t1, t1 + 40), /unsynchronised/);
});

test('an offset inside the measurement noise is reported but not applied', async () => {
  const ref = new TimeReference({ burst: 3, query: async () => ({ stratum: 3, offset: -12, delay: 60 }) });
  await ref.measure();
  assert.equal(ref.correction, 0);
  const s = ref.status();
  assert.equal(s.corrected, false);
  assert.equal(s.errMs, 42);          // 60/2 + |−12|
});

test('an offset outside the noise — a host whose sync broke — is corrected', async () => {
  let n = 0;
  const ref = new TimeReference({ burst: 3,
    query: async () => ({ stratum: 2, offset: 2400, delay: [90, 40, 70][n++] }) });
  await ref.measure();
  assert.equal(ref.correction, 2400);
  assert.equal(ref.status().delayMs, 40);   // the shortest round trip wins
  assert.equal(ref.status().errMs, 20);
});

test('no answering server leaves the time unverified rather than invented', async () => {
  const ref = new TimeReference({ burst: 2, query: async () => { throw new Error('timeout'); } });
  await ref.measure();
  assert.deepEqual(ref.status(), { verified: false, error: 'no NTP server answered' });
});
