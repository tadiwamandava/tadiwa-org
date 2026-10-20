/* Run C: does the field actually stop, and does it wake?
   Counts animation-frame callbacks, not canvas pixels. Identical frames look
   "settled" to a toDataURL sample while still costing a callback each frame,
   which is the entire cost being removed. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const host = document.querySelector('[data-ready="true"]') || document.querySelector("[data-ready]");
  const count = () => window.__raf.total;
  const rateOver = async (ms) => { const a = count(); await sleep(ms); return Math.round(((count() - a) / ms) * 1000); };

  const out = {};
  out.duringSettleWindow = await rateOver(2000);   // still lively
  await sleep(4500);                                // let it pass SETTLE_MS
  out.afterSettle = await rateOver(2500);           // should be 0
  out.stillRendered = host.dataset.ready === "true";

  // Wake it with a pointer over the field. The listener is a plain
  // addEventListener on document, so a synthetic PointerEvent reaches it.
  const r = host.getBoundingClientRect();
  document.dispatchEvent(new PointerEvent("pointermove", {
    pointerType: "mouse", clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    bubbles: true,
  }));
  out.afterWake = await rateOver(1500);             // should be > 0
  await sleep(5500);
  out.afterResettle = await rateOver(2500);         // back to 0

  out.ok = out.duringSettleWindow > 10 && out.afterSettle === 0
        && out.afterWake > 10 && out.afterResettle === 0 && out.stillRendered;
  return out;
})()
