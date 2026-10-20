/* CDP_INIT: wraps requestAnimationFrame before any page script, so every
   callback the page schedules is counted. Sampling the canvas with toDataURL
   cannot do this: a loop that paints identical frames looks "settled" while
   still burning a callback every frame, which is the cost in question. */
(() => {
  window.__raf = { total: 0, marks: [] };
  const real = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    window.__raf.total++;
    return real.call(window, cb);
  };
  let last = 0;
  setInterval(() => {
    const now = window.__raf.total;
    window.__raf.marks.push(now - last);
    last = now;
  }, 1000);
})();
