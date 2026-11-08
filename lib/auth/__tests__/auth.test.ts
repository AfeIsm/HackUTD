import { describe, expect, it } from 'vitest';
import { cleanUsername, emailError, passwordError, safeNext, usernameError } from '../validate';
import { hashPassword, verifyPassword } from '../password';

describe('username rules', () => {
  it('accepts 3–20 letters, numbers, _ and .', () => {
    for (const u of ['alex', 'Sam_01', 'maya.r', 'abc', 'a'.repeat(20)]) expect(usernameError(u)).toBeNull();
  });
  it('rejects too short, too long and bad characters', () => {
    for (const u of ['ab', 'a'.repeat(21), 'al ex', 'alex!', 'josé', '']) expect(usernameError(u)).not.toBeNull();
  });
  it('strips a typed @ and spaces', () => {
    expect(cleanUsername('  @Alex ')).toBe('Alex');
  });
});

describe('other fields', () => {
  it('checks email and password length', () => {
    expect(emailError('a@b.co')).toBeNull();
    expect(emailError('nope')).not.toBeNull();
    expect(passwordError('1234567')).not.toBeNull();
    expect(passwordError('12345678')).toBeNull();
  });
  it('only redirects inside our site', () => {
    expect(safeNext('/huddles?x=1')).toBe('/huddles?x=1');
    expect(safeNext('//evil.com')).toBe('/dashboard');
    expect(safeNext('https://evil.com')).toBe('/dashboard');
    expect(safeNext(null)).toBe('/dashboard');
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const { salt, passwordHash } = await hashPassword('correct horse');
    expect(passwordHash).not.toContain('correct');
    expect(await verifyPassword('correct horse', salt, passwordHash)).toBe(true);
    expect(await verifyPassword('wrong horse', salt, passwordHash)).toBe(false);
  });
  it('uses a different salt every time', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});
