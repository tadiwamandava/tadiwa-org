/* Run B: the homepage's interactive surface, on a real desktop pointer.
   Requires CDP_MOBILE=0 - under mobile emulation `(hover: hover) and
   (pointer: fine)` is false, tilt() returns early on pointerType, and every
   assertion below would pass as "no response" for a harness reason. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const out = { conditions: {}, anchor: {}, selectors: [], tilt: {}, keyboard: {}, details: [], problems: [] };

  out.conditions.pointerFine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!out.conditions.pointerFine) out.problems.push("pointer is not fine; pointer assertions are not meaningful");

  // --- the #work anchor ----------------------------------------------------
  const before = scrollY;
  const anchor = $('a[href="#work"]');
  if (anchor) {
    anchor.click();
    await sleep(700);
    out.anchor = { found: true, scrolledFrom: before, scrolledTo: Math.round(scrollY), moved: scrollY > before + 50 };
    if (!out.anchor.moved) out.problems.push("#work anchor did not scroll");
  } else out.anchor = { found: false };
  scrollTo(0, 0);
  await sleep(300);

  const stage = $('[aria-label="Engineering project stack"]');
  const buttons = $$('[aria-label="Choose an engineering layer"] button');
  if (!stage) out.problems.push("stage not found");
  if (buttons.length === 0) out.problems.push("no selector buttons");

  // --- every selector ------------------------------------------------------
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].click();
    await sleep(450);
    const layers = $$("[data-active]");
    const activeIdx = layers.findIndex((l) => l.dataset.active === "true");
    const detail = $(`#${CSS.escape(buttons[i].getAttribute("aria-controls"))}`);
    const link = detail && detail.querySelector("a");
    const row = {
      label: buttons[i].textContent.trim(),
      pressed: buttons[i].getAttribute("aria-pressed"),
      pressedCount: buttons.filter ? null : buttons.filter,
      activeCount: layers.filter((l) => l.dataset.active === "true").length,
      activeIndex: activeIdx,
      detailText: link && link.textContent.trim().slice(0, 40),
      detailHref: link && link.getAttribute("href"),
      liveRegion: detail && detail.getAttribute("aria-live"),
    };
    row.pressedCount = buttons.filter((b) => b.getAttribute("aria-pressed") === "true").length;
    if (row.pressed !== "true") out.problems.push(`${row.label}: aria-pressed not true after click`);
    if (row.pressedCount !== 1) out.problems.push(`${row.label}: ${row.pressedCount} buttons pressed, expected 1`);
    if (row.activeCount !== 1) out.problems.push(`${row.label}: ${row.activeCount} layers active, expected 1`);
    if (row.activeIndex !== i) out.problems.push(`${row.label}: layer ${row.activeIndex} active, expected ${i}`);
    if (!row.detailHref) out.problems.push(`${row.label}: detail link missing`);
    out.selectors.push(row);
  }

  // --- pointer tilt --------------------------------------------------------
  if (stage) {
    const r = stage.getBoundingClientRect();
    const read = () => ["--pitch", "--turn", "--reflection"].map((n) => stage.style.getPropertyValue(n) || null);
    out.tilt.before = read();
    const send = (type, cx, cy) => stage.dispatchEvent(new PointerEvent(type, {
      pointerType: "mouse", clientX: cx, clientY: cy, bubbles: true, cancelable: true,
    }));
    send("pointermove", r.left + r.width * 0.2, r.top + r.height * 0.3);
    await sleep(200);
    out.tilt.afterLeft = read();
    send("pointermove", r.left + r.width * 0.8, r.top + r.height * 0.7);
    await sleep(200);
    out.tilt.afterRight = read();
    // pointerout, not pointerleave: React derives enter/leave from the
    // out/over pair, so a synthetic pointerleave never reaches onPointerLeave
    // and the reset reads as broken when it is not.
    stage.dispatchEvent(new PointerEvent("pointerout", {
      pointerType: "mouse", clientX: r.left + r.width * 0.8, clientY: r.top + r.height * 0.7,
      bubbles: true, cancelable: true, relatedTarget: document.body,
    }));
    await sleep(200);
    out.tilt.afterLeave = read();

    const moved = JSON.stringify(out.tilt.afterLeft) !== JSON.stringify(out.tilt.before);
    const tracked = JSON.stringify(out.tilt.afterRight) !== JSON.stringify(out.tilt.afterLeft);
    const reset = out.tilt.afterLeave.every((v) => !v);
    out.tilt.moved = moved; out.tilt.tracked = tracked; out.tilt.reset = reset;
    if (!moved) out.problems.push("tilt did not respond to pointermove");
    if (!tracked) out.problems.push("tilt did not track pointer position");
    if (!reset) out.problems.push("tilt did not reset on pointerleave");
  }

  // --- keyboard -----------------------------------------------------------
  // Deliberately NOT tested here. Element.focus() is unreliable in headless
  // Chrome and never produces :focus-visible, so both the selection-follows-
  // focus behaviour and the focus ring have to be driven with real key events:
  //   CDP_KEYS="Tab Tab Tab Tab Tab Tab Tab Tab Tab"  -> first board
  // Measured that way: 9 tabs focuses the RISC-V board and active becomes 0,
  // 10 tabs focuses the STM32 board and active becomes 1, and every element in
  // the tab order reports focusVisible with a solid 2px outline.
  out.keyboard = { testedWith: "CDP_KEYS, separately; see verify/README" };

  // --- experience list ------------------------------------------------------
  for (const d of $$("details").slice(0, 2)) {
    const s = d.querySelector("summary");
    const was = d.open;
    s.click(); await sleep(250);
    const opened = d.open;
    s.click(); await sleep(250);
    const closed = d.open;
    out.details.push({ was, afterFirst: opened, afterSecond: closed, toggles: opened !== was && closed === was });
    if (!(opened !== was && closed === was)) out.problems.push("a <details> did not toggle both ways");
  }

  out.ok = out.problems.length === 0;
  return out;
})()
