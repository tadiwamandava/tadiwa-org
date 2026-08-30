// Minimal Chrome DevTools Protocol driver, a dev tool, not shipped code.
//
// WHY THIS EXISTS. Chrome's `--screenshot` and `--dump-dom` both fire at the
// `load` event, which is BEFORE a next/dynamic chunk has loaded. Checking this
// site's ⌘K palette with them reports that it does not exist. It does, the
// tools were just looking too early. This driver waits a real interval, can run
// arbitrary JS in the page, and captures after hydration.
//
// Other hard-won notes about headless Chrome on this machine:
//   - `timeout` is NOT installed on macOS. Do not use it.
//   - `--virtual-time-budget` HANGS on any page with a requestAnimationFrame
//     loop, and this site has one (the canvas board). Never pass it.
//   - Chrome often does not exit. Launch with `&`, poll for the output file,
//     then `pkill -9 -f "Google Chrome"`.
//   - macOS clamps the minimum window width to ~500px, so `--window-size=390`
//     silently lays out wider and crops. Test mobile in a fixed-width <iframe>.
//   - Headless defaults to the DARK colour scheme. Force light by setting
//     `data-theme="light"` on <html> from an evaluated expression.
//
// Usage: node scripts/cdp.mjs <url> <waitMs> <shotPath|""> [jsExpression]
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";

const [url, waitMs = "5000", shot = "", expr = ""] = process.argv.slice(2);
const PROFILE = `/tmp/cdp-profile-${Date.now()}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

// Extra flags, space-separated, from CDP_FLAGS. Used for microphone testing:
//   CDP_FLAGS="--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
//              --use-file-for-fake-audio-capture=/path/q.wav"
// grants permission without a prompt and feeds a WAV in as the microphone, so
// the voice path can be driven end to end in headless Chrome.
const extra = (process.env.CDP_FLAGS ?? "").split(/\s+/).filter(Boolean);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1200,900", ...extra, url,
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome devtools endpoint never came up");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return {
    ready: new Promise((res) => ws.addEventListener("open", res)),
    send: (method, params = {}) =>
      new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); }),
    close: () => ws.close(),
  };
}

try {
  const cdp = connect((await target()).webSocketDebuggerUrl);
  await cdp.ready;

  // Microphone permission. `--use-fake-ui-for-media-stream` is documented as
  // auto-accepting the prompt and does NOT work under --headless=new:
  // getUserMedia rejects with NotAllowedError regardless. Granting through the
  // protocol does work. Set CDP_GRANT to a comma-separated permission list,
  // e.g. CDP_GRANT=audioCapture.
  if (process.env.CDP_GRANT) {
    const r = await cdp.send("Browser.grantPermissions", {
      origin: new URL(url).origin,
      permissions: process.env.CDP_GRANT.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (r.error) console.error("  grantPermissions:", JSON.stringify(r.error));
  }

  // Colour scheme. Headless Chrome defaults to DARK, so a light-theme
  // screenshot needs this rather than a DOM poke: setting data-theme by hand
  // races the paint and produces screenshots with a light header over dark
  // cards, which looks like a CSS bug and is not one.
  if (process.env.CDP_SCHEME) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: process.env.CDP_SCHEME }],
    });
  }

  await sleep(Number(waitMs));

  if (expr) {
    const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));
  }
  if (shot) {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(shot, Buffer.from(r.result.data, "base64"));
    console.error(`  wrote ${shot}`);
  }
  cdp.close();
} finally {
  chrome.kill("SIGKILL");
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
