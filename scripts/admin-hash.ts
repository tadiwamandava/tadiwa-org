/**
 * Prints an ADMIN_PASSWORD_HASH and an ADMIN_SESSION_SECRET.
 *
 * The password is read from the terminal with echo off and is never written
 * anywhere: not to a file, not to argv (where `ps` would show it), not to
 * shell history, and not to this program's output. Only the scrypt hash is
 * printed, and a hash is useless to anyone who cannot already run scrypt
 * against a guess for as long as it takes.
 *
 * Usage: npm run admin:hash
 */
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/admin/password.ts";

function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    // Mute the echo so the password does not sit on screen or scroll back.
    const out = process.stdout as NodeJS.WriteStream & { muted?: boolean };
    const write = out.write.bind(out);
    out.write = ((chunk: string, ...rest: unknown[]) =>
      out.muted ? true : write(chunk, ...(rest as []))) as typeof out.write;

    rl.question(prompt, (answer) => {
      out.muted = false;
      out.write = write;
      write("\n");
      rl.close();
      resolve(answer);
    });
    out.muted = true;
  });
}

const password = await ask("  Admin password (input hidden): ");

if (password.length < 12) {
  console.error(
    "\n  Refused: use at least 12 characters.\n" +
      "  This hash is the only thing between the internet and a route that writes\n" +
      "  files, and scrypt only buys time against a password worth attacking.\n",
  );
  process.exit(1);
}

console.log(`
  Add both to the deployment's environment. Neither has a default, and the
  admin stays off until both are present.

  ADMIN_PASSWORD_HASH=${hashPassword(password)}
  ADMIN_SESSION_SECRET=${randomBytes(32).toString("base64url")}

  The session secret signs the login cookie. Changing it signs everyone out,
  which is how you revoke a session you cannot otherwise reach.
`);
