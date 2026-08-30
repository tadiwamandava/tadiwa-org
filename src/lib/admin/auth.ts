import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export { hashPassword, verifyPassword } from "./password.ts";

/**
 * Password login for the admin, with no dependencies.
 *
 * Everything here is in Node's stdlib: scrypt for the password, HMAC-SHA256
 * for the session. An auth library would bring a session store, a provider
 * abstraction and an adapter layer to protect one route for one person, and
 * every one of those is more code to audit than the ~120 lines below.
 *
 * TWO SECRETS, BOTH REQUIRED, NEITHER WITH A DEFAULT:
 *
 *   ADMIN_PASSWORD_HASH    scrypt output from `npm run admin:hash`
 *   ADMIN_SESSION_SECRET   32+ random bytes, signs the session cookie
 *
 * If either is missing the admin is OFF rather than open. A default secret is
 * how "protected" admin panels get walked into, so there is not one, and a
 * short one is rejected at startup rather than silently accepted.
 *
 * THE PASSWORD IS NEVER STORED, ANYWHERE. `admin:hash` prints a hash and the
 * plaintext never reaches this repo, the env file, or a log line.
 */

const COOKIE = "admin_session";
/** Eight hours. Long enough for one editing session, short enough that a
 *  forgotten laptop is not a standing invitation. */
const TTL_SECONDS = 8 * 60 * 60;

// ---------------------------------------------------------------------------
//  Configuration
// ---------------------------------------------------------------------------

function envHash(): string | null {
  const v = process.env.ADMIN_PASSWORD_HASH;
  return v && v.startsWith("scrypt$") ? v : null;
}

function envSecret(): string | null {
  const v = process.env.ADMIN_SESSION_SECRET;
  // 32 characters is the floor, not a suggestion. A short signing key makes
  // the HMAC forgeable, and the cookie is the whole boundary.
  return v && v.length >= 32 ? v : null;
}

/** True when both secrets are present and usable. */
export function authConfigured(): boolean {
  return envHash() !== null && envSecret() !== null;
}

/**
 * Why auth is not configured, for the login page to show in development.
 * Never rendered in production, where the route 404s instead.
 */
export function authConfigProblem(): string | null {
  if (!process.env.ADMIN_PASSWORD_HASH) return "ADMIN_PASSWORD_HASH is not set.";
  if (!envHash()) return "ADMIN_PASSWORD_HASH is not a scrypt hash. Run `npm run admin:hash`.";
  if (!process.env.ADMIN_SESSION_SECRET) return "ADMIN_SESSION_SECRET is not set.";
  if (!envSecret()) return "ADMIN_SESSION_SECRET is shorter than 32 characters.";
  return null;
}

// ---------------------------------------------------------------------------
//  Session
// ---------------------------------------------------------------------------

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `expiryMs.nonce.signature`. The nonce means two sessions minted in the same
 *  millisecond are still different strings. */
function mint(secret: string): string {
  const payload = `${Date.now() + TTL_SECONDS * 1000}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

function valid(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const cut = token.lastIndexOf(".");
  if (cut < 0) return false;
  const payload = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1));
  const want = Buffer.from(sign(payload, secret));
  // Compare the signature BEFORE trusting the expiry: the expiry is part of
  // the signed payload, so reading it from an unverified token would let a
  // caller pick their own.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  const expiry = Number(payload.split(".")[0]);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

/** Whether the current request carries a valid session. */
export async function hasSession(): Promise<boolean> {
  const secret = envSecret();
  if (!secret) return false;
  return valid((await cookies()).get(COOKIE)?.value, secret);
}

export async function startSession(): Promise<void> {
  const secret = envSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  (await cookies()).set(COOKIE, mint(secret), {
    httpOnly: true,
    // Not readable by script, not sent cross-site, not sent over plain HTTP in
    // production, and not attached to any request outside /admin.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------------
//  Login throttle
// ---------------------------------------------------------------------------

/**
 * Per-process, and that is stated rather than hidden.
 *
 * On a serverless host each instance keeps its own counter, so a spread-out
 * attack gets more attempts than the number below suggests. It is here to make
 * online guessing slow, not to be the security boundary; the boundary is a
 * scrypt hash of a password long enough that online guessing is hopeless
 * either way.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, number[]>();

export function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
  attempts.set(key, recent);
  if (attempts.size > 2000) attempts.clear();
  return recent.length >= MAX_ATTEMPTS;
}

export function recordAttempt(key: string): void {
  const now = Date.now();
  attempts.set(key, [...(attempts.get(key) ?? []), now]);
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
