// CDP_INIT: installed before any page script, so it sees every focus move.
window.__focusLog = [];
document.addEventListener("focusin", (e) => {
  const el = e.target;
  window.__focusLog.push({
    tag: el.tagName,
    label: (el.getAttribute && (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24))) || "",
    focusVisible: el.matches && el.matches(":focus-visible"),
    outline: getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth,
  });
}, true);
