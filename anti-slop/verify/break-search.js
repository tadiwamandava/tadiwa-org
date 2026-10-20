/* CDP_INIT: runs before any page script, so the patch is in place before the
   palette's lazy chunk ever asks for its index. A fetch patch installed from
   an evaluated expression would land after the request had already gone. */
(() => {
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/embed|vector|index|search/i.test(url)) {
      return Promise.reject(new TypeError("Failed to fetch (forced by verify harness)"));
    }
    return real.call(this, input, init);
  };
})();
