// Minimal Chrome DevTools Protocol driver — a dev tool, not shipped code.
//
// WHY THIS EXISTS. Chrome's `--screenshot` and `--dump-dom` both fire at the
// `load` event, which is BEFORE a next/dynamic chunk has loaded. Checking this
// site's ⌘K palette with them reports that it does not exist. It does — the
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

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1200,900", url,
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
