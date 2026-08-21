#!/usr/bin/env node
/**
 * Generate a TOTP secret and print it as a QR code.
 *
 *   npm run setup-totp
 *
 * Prints to the terminal only. The secret is never written to a file — you
 * paste it into .env yourself, so it does not end up in a shell history, a
 * process argument list, or a stray file someone later commits.
 *
 * Re-running this generates a NEW secret. That is how you rotate: scan the new
 * QR, replace TOTP_SECRET, restart. Every old code stops working immediately,
 * which is exactly what you want if a phone was lost — but note that trusted
 * devices are unaffected, because they no longer go through TOTP. Rotate the
 * secret AND revoke devices from Settings if a device itself was lost.
 */

import { authenticator } from 'otplib';
import qrcode from 'qrcode-terminal';
import { hostname } from 'node:os';

const label = process.argv[2] || 'console';
const issuer = process.argv[3] || `ojee-console@${hostname()}`;

const secret = authenticator.generateSecret();
const uri = authenticator.keyuri(label, issuer, secret);

console.log('');
console.log('  Scan this in Google Authenticator, 1Password, Aegis, or similar:');
console.log('');
qrcode.generate(uri, { small: true });
console.log('');
console.log('  If the QR will not scan, enter the key by hand:');
console.log(`    account  ${label}`);
console.log(`    issuer   ${issuer}`);
console.log(`    key      ${secret}`);
console.log('');
console.log('  Then put this line in .env and restart:');
console.log('');
console.log(`    TOTP_SECRET=${secret}`);
console.log('');
console.log(`  Verify before you rely on it — the current code is ${authenticator.generate(secret)}`);
console.log('  (it changes every 30 seconds; the console accepts one step either side).');
console.log('');
