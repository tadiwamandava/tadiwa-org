import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing, deliberately free of any framework import.
 *
 * Split out of auth.ts so `scripts/admin-hash.ts` can generate a hash from a
 * plain Node process. auth.ts imports `next/headers`, which does not resolve
 * outside the Next runtime, and a CLI that cannot run is a CLI that gets
 * replaced by pasting a password somewhere it should not go.
 *
 * No `server-only` here for the same reason. Nothing client-side imports it:
 * the only consumers are auth.ts, which is server-only, and the CLI.
 */

/** N=16384 is Node's default and costs ~50ms on this hardware, which is the
 *  point. The parameters are encoded into the hash so they can be raised later
 *  without invalidating hashes already issued. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

/** Returns `scrypt$N$r$p$saltB64$keyB64`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Constant-time verification.
 *
 * Returns false on any malformed input rather than throwing, so a corrupted
 * env var is a failed login rather than a 500 with a stack trace in it.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [tag, N, r, p, saltB64, keyB64] = stored.split("$");
    if (tag !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(keyB64, "base64url");
    const actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
