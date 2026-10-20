// Minimal Chrome DevTools Protocol driver, a dev tool, not shipped code.
//
// WHY THIS EXISTS. Chrome's `--screenshot` and `--dump-dom` both fire at the
// `load` event, which is BEFORE a next/dynamic chunk has loaded. Checking this
// site's ⌘K palette with them reports that it does not exist. It does, the
// tools were just looking too early. This driver waits for observable
// readiness, can run arbitrary JS in the page, and captures after hydration.
//
// WHY IT NAVIGATES UNDER PROTOCOL CONTROL. Passing the URL on Chrome's command
// line starts the load before the debugger is attached. Everything that has to
// be in place BEFORE the first byte — the layout viewport, emulated media, an
// instrumentation script, network observation — then applies to a page that is
// already loading. A component reading matchMedia on mount would see the
// launch window's width, not CDP_VIEWPORT. So Chrome opens about:blank, the
// session is configured, and Page.navigate does the real load.
//
// Other hard-won notes about headless Chrome on this machine:
//   - `timeout` is NOT installed on macOS. Do not use it.
//   - `--virtual-time-budget` HANGS on any page with a requestAnimationFrame
//     loop, and this site has one (the pixel field). Never pass it.
//   - Chrome often does not exit; this script SIGKILLs it in `finally`.
//   - macOS clamps the minimum window width to ~500px, so `--window-size=390`
//     silently lays out wider and crops. Use CDP_VIEWPORT, which overrides the
//     layout viewport through the protocol and actually works.
//   - Headless defaults to the DARK colour scheme. Use CDP_SCHEME, not a DOM
//     poke, which races the paint.
//
// Usage: node scripts/cdp.mjs <url> <waitMs> <shotPath|""> [jsExpression]
//
// `waitMs` is a BUDGET, not a sleep. With CDP_READY it is the timeout for that
// condition; without it, it is still a plain settle delay.
//
// Env:
//   CDP_VIEWPORT=WxH   override the layout viewport (applied before navigation)
//   CDP_MOBILE=0       desktop emulation: no touch, no mobile UA hints, dsf 1.
//                      REQUIRED for anything behind `(hover: hover) and
//                      (pointer: fine)`, which is false under mobile emulation.
//   CDP_SCHEME=light   prefers-color-scheme
//   CDP_MEDIA=print    emulated media type
//   CDP_READY=<js>     poll this expression until truthy, bounded by waitMs.
//                      Fails the run on timeout. Prefer it to a fixed wait.
//   CDP_INIT=<file>    JS evaluated on every new document, before page script.
//                      The only place instrumentation can beat a client
//                      component's mount (e.g. counting rAF callbacks).
//   CDP_NET=1          record requests, including from workers, from before
//                      navigation. Printed as __net on the result.
//   CDP_PDF=<file>     print to PDF. NOTE: printToPDF returns PDF bytes, not a
//                      page count. Parse the file if you need one.
//   CDP_FULLPAGE=1     screenshot beyond the viewport (whole scroll height)
//   CDP_STRICT=1       also exit nonzero on console errors, not just on
//                      uncaught exceptions
//   CDP_GRANT=...      Browser.grantPermissions list, e.g. audioCapture
//   CDP_FLAGS=...      extra Chrome flags, space separated
//
// Exit status: 0 only if nothing threw. Nonzero on an uncaught page exception,
// an expression that throws or returns {ok:false}, a CDP_READY timeout, or a
// navigation failure. A check that cannot fail is not a check.
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";

const [url, waitMs = "5000", shot = "", expr = ""] = process.argv.slice(2);
const PROFILE = `/tmp/cdp-profile-${Date.now()}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const BUDGET = Number(waitMs);

const extra = (process.env.CDP_FLAGS ?? "").split(/\s+/).filter(Boolean);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1200,900", ...extra, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];

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
  const handlers = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    // Events carry no id. The old driver dropped them, which is why page
    // exceptions and console errors were invisible to it.
    if (msg.method) for (const fn of handlers.get(msg.method) ?? []) fn(msg.params ?? {}, msg.sessionId);
  });
  return {
    ready: new Promise((res) => ws.addEventListener("open", res)),
    send: (method, params = {}, sessionId) =>
      new Promise((res) => {
        const mid = ++id;
        pending.set(mid, res);
        ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
      }),
    on: (method, fn) => {
      if (!handlers.has(method)) handlers.set(method, []);
      handlers.get(method).push(fn);
    },
    close: () => ws.close(),
  };
}

try {
  const cdp = connect((await target()).webSocketDebuggerUrl);
  await cdp.ready;

  const problems = [];
  const consoleErrors = [];
  const requests = [];

  cdp.on("Runtime.exceptionThrown", (p) => {
    const d = p.exceptionDetails ?? {};
    problems.push(d.exception?.description ?? d.text ?? "uncaught exception");
  });
  cdp.on("Log.entryAdded", (p) => {
    if (p.entry?.level === "error") consoleErrors.push(`${p.entry.source}: ${p.entry.text}`);
  });
  cdp.on("Network.requestWillBeSent", (p, sessionId) => {
    requests.push({ url: p.request?.url, type: p.type, worker: Boolean(sessionId) });
  });

  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");

  // Workers get their own target and their own Network domain. A window.fetch
  // patch in the page cannot see them at all, which matters because the lab
  // demos download their payloads from a worker.
  if (process.env.CDP_NET) {
    await cdp.send("Network.enable");
    cdp.on("Target.attachedToTarget", async ({ sessionId }) => {
      await cdp.send("Network.enable", {}, sessionId);
      await cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    });
    await cdp.send("Target.setAutoAttach", {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    });
  }

  if (process.env.CDP_GRANT) {
    const r = await cdp.send("Browser.grantPermissions", {
      origin: new URL(url).origin,
      permissions: process.env.CDP_GRANT.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (r.error) console.error("  grantPermissions:", JSON.stringify(r.error));
  }

  // Viewport, before navigation. `mobile: true` makes
  // `(hover: hover) and (pointer: fine)` FALSE, so the pixel field's pointer
  // trail and the stack's tilt silently do nothing and a walkthrough would
  // record "no pointer response" for a harness setting. CDP_MOBILE=0 is the
  // desktop case and should be the default for pointer checks.
  if (process.env.CDP_VIEWPORT) {
    const [w, h] = process.env.CDP_VIEWPORT.split("x").map(Number);
    const desktop = process.env.CDP_MOBILE === "0";
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h,
      deviceScaleFactor: desktop ? 1 : 2,
      mobile: !desktop,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: !desktop });
  }

  const features = [];
  if (process.env.CDP_SCHEME) features.push({ name: "prefers-color-scheme", value: process.env.CDP_SCHEME });
  if (features.length || process.env.CDP_MEDIA) {
    await cdp.send("Emulation.setEmulatedMedia", {
      ...(process.env.CDP_MEDIA ? { media: process.env.CDP_MEDIA } : {}),
      features,
    });
  }

  if (process.env.CDP_INIT) {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: readFileSync(process.env.CDP_INIT, "utf8"),
    });
  }

  // The real load, now that everything above is in place.
  const loaded = new Promise((res) => cdp.on("Page.loadEventFired", res));
  const nav = await cdp.send("Page.navigate", { url });
  if (nav.result?.errorText) fail.push(`navigation failed: ${nav.result.errorText}`);
  await Promise.race([loaded, sleep(Math.max(BUDGET, 15000))]);

  // Observable readiness beats a fixed delay: a wait that is long enough today
  // is a flake tomorrow, and one that is too short reports a feature missing.
  if (process.env.CDP_READY) {
    const deadline = Date.now() + BUDGET;
    let ok = false;
    while (Date.now() < deadline) {
      const r = await cdp.send("Runtime.evaluate", {
        expression: process.env.CDP_READY, returnByValue: true, awaitPromise: true,
      });
      if (r.result?.result?.value) { ok = true; break; }
      await sleep(150);
    }
    if (!ok) fail.push(`CDP_READY never became truthy within ${BUDGET}ms: ${process.env.CDP_READY}`);
  } else {
    await sleep(BUDGET);
  }

  // Record the conditions the page actually sees. A harness misconfiguration
  // should be visible in the transcript, not silently recorded as a result.
  const conditions = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      pointerFine: matchMedia('(hover: hover) and (pointer: fine)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      print: matchMedia('print').matches,
      overflowX: document.scrollingElement.scrollWidth > innerWidth,
      url: location.pathname,
    })`,
  });

  let value;
  if (expr) {
    const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      fail.push(`expression threw: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
    }
    value = r.result?.result?.value ?? r.result;
    if (value && typeof value === "object" && value.ok === false) fail.push("expression returned ok:false");
  }

  if (shot) {
    const r = await cdp.send("Page.captureScreenshot", {
      format: "png",
      ...(process.env.CDP_FULLPAGE ? { captureBeyondViewport: true } : {}),
    });
    if (r.result?.data) {
      writeFileSync(shot, Buffer.from(r.result.data, "base64"));
      console.error(`  wrote ${shot}`);
    } else fail.push("screenshot returned no data");
  }

  if (process.env.CDP_PDF) {
    const r = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
    if (r.result?.data) {
      writeFileSync(process.env.CDP_PDF, Buffer.from(r.result.data, "base64"));
      console.error(`  wrote ${process.env.CDP_PDF} (parse it for a page count; printToPDF does not report one)`);
    } else fail.push("printToPDF returned no data");
  }

  if (problems.length) fail.push(...problems.map((p) => `page exception: ${p}`));
  if (consoleErrors.length) {
    for (const c of consoleErrors) console.error(`  console error: ${c}`);
    if (process.env.CDP_STRICT) fail.push(`${consoleErrors.length} console error(s)`);
  }

  console.log(JSON.stringify({
    __conditions: conditions.result?.result?.value,
    ...(process.env.CDP_NET ? { __net: requests } : {}),
    __consoleErrors: consoleErrors,
    __failures: fail,
    result: value,
  }, null, 2));

  cdp.close();
} finally {
  chrome.kill("SIGKILL");
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

if (fail.length) {
  for (const f of fail) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
