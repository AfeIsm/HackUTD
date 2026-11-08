// Sign-up rules (PLAN.md F6). Pure functions: used by the API (the real check) and the
// forms (instant feedback while typing).

const USERNAME_RE = /^[A-Za-z0-9_.]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "@Alex " → "Alex". People often type the @ we show in the UI. */
export function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@/, '');
}

export function usernameError(username: string): string | null {
  if (username.length < 3 || username.length > 20) return 'Usernames are 3–20 characters.';
  if (!USERNAME_RE.test(username)) return 'Use only letters, numbers, _ and .';
  return null;
}

export function emailError(email: string): string | null {
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Enter a valid email.';
  return null;
}

export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Passwords need at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

export function nameError(name: string): string | null {
  if (name.length < 1) return 'Enter your name.';
  if (name.length > 60) return 'That name is too long.';
  return null;
}

/** Only allow redirects back into our own site ("/huddles"), never "//evil.com". */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}
