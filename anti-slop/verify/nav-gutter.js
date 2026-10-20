/* Run A: navigation + the gutter matrix.
   Soft-navigates by clicking header links so the JS context survives, and at
   every stop records the INTENDED CONTENT EDGES - the content-box left of the
   header bar, of the page's own container, and of the <h1> itself. Comparing
   wrapper boxes would compare padding boxes that were never meant to line up;
   the h1 is what a reader actually sees as the left edge. */
(async () => {
  const px = (n) => (n === null || n === undefined ? null : +n.toFixed(2));
  const contentLeft = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return px(r.left + parseFloat(getComputedStyle(el).paddingLeft));
  };
  const wait = async (test, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (test()) return true;
      await new Promise((r) => setTimeout(r, 60));
    }
    return false;
  };

  const sample = () => {
    const h1 = document.querySelector("h1");
    const headerInner = document.querySelector('header [class*="__inner"]');
    const pageContainer =
      document.querySelector('main [class*="__container"]') ||
      document.querySelector("main .mx-auto");
    const sheet = document.querySelector('[class*="sheetWrap"]');
    const nav = [...document.querySelectorAll("header nav a")];
    return {
      path: location.pathname,
      headerInner: contentLeft(headerInner),
      pageContainer: contentLeft(pageContainer),
      h1: h1 ? px(h1.getBoundingClientRect().left) : null,
      h1Text: h1 ? h1.textContent.trim().slice(0, 38) : null,
      sheetWrap: contentLeft(sheet),
      sheetBox: sheet ? px(sheet.getBoundingClientRect().width) : null,
      sheetInner: sheet && sheet.firstElementChild
        ? px(sheet.firstElementChild.getBoundingClientRect().width) : null,
      innerWidth,
      scrollWidth: document.scrollingElement.scrollWidth,
      overflowX: document.scrollingElement.scrollWidth > innerWidth,
      ariaCurrent: nav.filter((a) => a.getAttribute("aria-current")).map((a) => a.textContent.trim()),
      navCount: nav.length,
    };
  };

  const stops = [sample()];
  const targets = ["/projects", "/lab", "/resume"];
  const problems = [];

  for (const href of targets) {
    const link = [...document.querySelectorAll("header nav a")].find(
      (a) => a.getAttribute("href") === href
    );
    if (!link) { problems.push(`no header link for ${href}`); continue; }
    link.click();
    const arrived = await wait(() => location.pathname === href && document.querySelector("h1"));
    if (!arrived) { problems.push(`soft nav to ${href} did not arrive`); continue; }
    await new Promise((r) => setTimeout(r, 400));
    stops.push(sample());
  }

  // Back/forward must restore the route, not just the URL.
  history.back();
  const wentBack = await wait(() => location.pathname === "/lab");
  history.forward();
  const wentFwd = await wait(() => location.pathname === "/resume");

  // The headline assertion: on every route the header bar, the page container
  // and the heading should start at one left edge.
  const misaligned = stops.filter((s) => {
    const edges = [s.headerInner, s.pageContainer, s.h1].filter((v) => v !== null);
    return Math.max(...edges) - Math.min(...edges) > 0.5;
  }).map((s) => ({ path: s.path, headerInner: s.headerInner, pageContainer: s.pageContainer, h1: s.h1 }));

  const overflowing = stops.filter((s) => s.overflowX).map((s) => s.path);

  return {
    ok: problems.length === 0 && wentBack && wentFwd,
    width: innerWidth,
    stops,
    misaligned,
    overflowing,
    history: { back: wentBack, forward: wentFwd },
    problems,
  };
})()
