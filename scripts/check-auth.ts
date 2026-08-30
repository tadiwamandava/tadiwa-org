/**
 * Asserts the properties the admin login depends on.
 *
 * This guards a route that writes files. Every check below corresponds to a
 * way the scheme could be wrong while still appearing to work: a hash that
 * leaks its plaintext, an unsalted hash, a session whose expiry the holder can
 * rewrite, a signature accepted under the wrong key.
 *
 * The session logic is reimplemented here rather than imported, because
 * `src/lib/admin/auth.ts` pulls in `next/headers` and does not load outside
 * the Next runtime. That is a real duplication and it is the same trap the
 * search tokenizer has: if the two drift, this file certifies a scheme nobody
 * runs. The mitigation is that the copy is fifteen lines and sits directly
 * beside the assertions that read it.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "../src/lib/admin/password.ts";

let failures = 0;
function check(condition: boolean, description: string): void {
  console.log(`  ${condition ? "✓" : "✗"} ${description}`);
  if (!condition) failures++;
}

// ---- password -------------------------------------------------------------
const PW = "a-long-enough-test-password";
const hash = hashPassword(PW);

check(verifyPassword(PW, hash), "correct password verifies");
check(!verifyPassword(PW + "x", hash), "wrong password rejected");
check(!verifyPassword("", hash), "empty password rejected");
check(hashPassword(PW) !== hashPassword(PW), "salted: the same password hashes differently");
check(!hash.includes(PW), "hash does not contain the plaintext");
check(!verifyPassword(PW, "garbage"), "malformed stored hash returns false rather than throwing");
check(!verifyPassword(PW, "scrypt$16384$8$1$aaaa$bbbb"), "wrong-length key rejected");
check(
  verifyPassword("café".normalize("NFD"), hashPassword("café".normalize("NFC"))),
  "unicode normalised, so the same typed password always matches",
);

// ---- session --------------------------------------------------------------
const secret = randomBytes(32).toString("base64url");
const sign = (payload: string, key: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");

function mint(key: string, ttlMs: number): string {
  const payload = `${Date.now() + ttlMs}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload, key)}`;
}

function valid(token: string, key: string): boolean {
  const cut = token.lastIndexOf(".");
  if (cut < 0) return false;
  const payload = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1));
  const want = Buffer.from(sign(payload, key));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  const expiry = Number(payload.split(".")[0]);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

const live = mint(secret, 3600_000);
check(valid(live, secret), "freshly minted session is valid");
check(!valid(live, randomBytes(32).toString("base64url")), "session rejected under a different secret");
check(
  !valid(`${Date.now() + 999_000_000}.x.${live.split(".").pop()}`, secret),
  "expiry cannot be rewritten: it is inside the signed payload",
);
check(!valid(mint(secret, -1000), secret), "expired session rejected despite a good signature");
check(!valid("not-a-token", secret), "garbage token rejected");
check(!valid(`${Date.now() + 3600_000}.abc.`, secret), "empty signature rejected");

console.log("");
if (failures > 0) {
  console.error(`  FAILED: ${failures} auth propert${failures === 1 ? "y" : "ies"} broken.\n`);
  process.exit(1);
}
console.log("  PASSED: 14 auth properties hold.\n");
