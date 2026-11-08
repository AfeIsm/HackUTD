// Password hashing with Node's built-in scrypt (no extra dependencies).
// We store a random per-user salt + the scrypt hash. Never the password itself.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password.normalize('NFKC'), salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<{ salt: string; passwordHash: string }> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return { salt: salt.toString('hex'), passwordHash: hash.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, passwordHash: string): Promise<boolean> {
  const expected = Buffer.from(passwordHash, 'hex');
  if (expected.length !== KEYLEN) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), KEYLEN);
  return timingSafeEqual(expected, actual); // constant time: no hints from response timing
}
