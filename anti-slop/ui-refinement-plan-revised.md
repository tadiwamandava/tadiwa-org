# UI refinement plan: verify, then polish

Status: proposed; implementation has not started.

## Objective

Make the website more coherent, polished, and reliable while preserving its character: black and orange, the detailed silicon stack, restrained typography, and living pixels.

The existing source inspection identifies candidates for improvement. Visual defects remain hypotheses until observed in a browser. This plan does not authorize unrelated content changes, publishing, or destructive admin operations.

## Design constraints

- Preserve the single continuous pixel field across the header and the fade beneath navigation.
- Keep subtle ambient motion and pointer response, with static rendering under reduced motion and suspension when the document is hidden.
- Preserve the silicon stack's material variation, depth, and interaction.
- Keep the header name removed and playback controls absent.
- Do not add instructional captions, decorative status labels, or new sections.
- Evaluate spacing, alignment, and selection in context. Fewer tokens or CSS values are maintenance benefits, not proof of better design.

## 1. Establish a reliable baseline

Inspect the current diff before making changes. Identify and preserve the existing header work in an explicit checkpoint. Do not automatically stash unrelated work.

Run a fresh production build and the existing checks. Record pre-existing failures separately from regressions introduced during this pass.

Establish a browser session through the available supported tooling. Demonstrate that navigation, input, and screenshots work before committing to a large walkthrough. If browser access remains unavailable, continue source-level investigation and leave visual conclusions unverified.

Capture the homepage, projects index, a representative project detail page, lab pages, writing page, and résumé at representative mobile, tablet, and desktop widths. Include 320px for narrow-screen stress testing.

Use reduced motion, consistent device scale, loaded fonts, and stable content for repeatable layout captures. Test normal animation separately.

**Acceptance:** a baseline tied to the current revision and working-tree changes, with screenshots where available and explicit verification gaps.

## 2. Make interaction verification dependable

Prefer existing browser tooling. Extend a local harness only where necessary and supported by the execution environment.

Automated checks must:

- Fail with a nonzero exit status on failed assertions, page exceptions, or timeouts.
- Wait for observable readiness with bounded timeouts instead of assuming a fixed delay means readiness.
- Exercise actual keyboard and pointer input for user interaction checks.
- Confirm viewport, hover, pointer, and reduced-motion settings inside the page.
- Begin network observation before navigation when checking download behavior, including relevant worker requests.
- Record enough evidence to distinguish application failures from harness failures.

Cover the following behavior:

| Area | Checks |
| --- | --- |
| Navigation | Header links, homepage anchors, browser back/forward, direct route loads |
| Silicon stack | Selectors, active state, detail links, pointer tilt/reset, keyboard focus |
| Experience | Expand/collapse behavior and keyboard operation |
| Command palette | Open, search, keyboard selection, dismiss, focus return, error state |
| Lab demos | Intended interaction, finite results, loading/error behavior, opt-in downloads |
| Résumé | Variants, screen layout, generated PDF |
| Recovery | 404 return link and accessible error feedback |
| Admin | Invalid-password path only; no publishing or persistent mutations |

Check console errors, horizontal overflow, focus visibility, and relevant accessible states. Reduced-motion acceptance concerns actual movement and usability, not one exact transition-duration value.

Generate the résumé PDF and inspect its page count using a PDF parser. Review clipping, legibility, links, and section breaks. `Page.printToPDF` returns PDF data or a stream, not a page count. A one-page result alone is insufficient.

**Acceptance:** each core interaction has an observed result or a specific reason it remains unverified.

## 3. Resolve the header transition and demonstrated defects

Inspect the pixel field:

- At initial load and after hydration.
- During pointer movement and after the pointer leaves.
- At the top of the page and while scrolling.
- After client navigation and direct route loads.
- On narrow layouts where navigation wraps.
- With reduced motion enabled and after returning from a hidden tab.

The transition should have no visible horizontal seam. The sticky backing must keep navigation readable without unnecessarily obscuring headings or content beneath it. Check anchor destinations and keyboard-focused elements under the sticky header.

Adjust the fade's extent or behavior only if observation reveals a problem. Preserve the continuous canvas and ambient motion.

Observe the CSS fallback-to-canvas handoff before adding a crossfade. Source inspection alone does not establish that a blank flash occurs.

Measure animation work while idle and while the document is hidden. Preserve the existing frame cap and optimize unnecessary work without silently changing the field to static. Unchanged canvas samples do not prove that animation-frame callbacks have stopped.

Fix other demonstrated interaction, overflow, focus, and print defects before visual standardization.

**Acceptance:** the header blends into the page, content remains readable while scrolling, and pixel behavior matches the requested design.

## 4. Align layouts and refine spacing

Introduce a shared outer gutter, initially 20px on small screens and 32px from the desktop spacing breakpoint. Apply it to the header, homepage, shared containers, and appropriate résumé screen elements.

Measure intended content edges rather than comparing unrelated wrapper boxes. Check representative widths and values immediately below and above relevant breakpoints, including 639/640/641px if the breakpoint remains 640px.

Review résumé alignment as a separate visual decision. Compare its current centred document presentation with an aligned alternative while preserving a deliberate reading width and print behavior. Moving a maximum width from a padded wrapper onto its child changes available width and must be measured.

Introduce a small set of spacing roles for page openings, section separation, rules, and repeated rows. Give mobile layouts appropriate responsive values.

Migrate spacing by purpose:

- Inspect neighboring sections together to avoid doubled gaps.
- Preserve intentional differences in section density.
- Check the homepage with and without writing content.
- Preserve prose spacing tied to font size.
- Preserve print-specific résumé measurements.

Do not apply a uniform 88px gap to every section or mechanically replace classes based only on their current numeric value.

**Acceptance:** related edges align, mobile spacing remains economical, and section transitions establish hierarchy without becoming mechanically uniform.

## 5. Polish the silicon stack, typography, and motion

Compare selected and unselected stack states at 320px, 375px, and desktop widths. Keep the lift as the primary selection cue if it reads clearly. Retain a restrained supporting highlight where it improves recognition; there is no requirement to use exactly one visual signal.

Verify keyboard selection and focus independently from hover. Under reduced motion, selection must remain obvious without animated movement. Evaluate meaningful state indicators for contrast; positional change does not create a blanket accessibility exemption.

Introduce local material tokens for genuinely repeated colours. Preserve distinct highlights, gradients, and surface tones that give the illustration depth. Do not force all material variation into an arbitrary number of tokens.

Normalize motion where interactions serve the same purpose. Retain separate timing where physical movement, direct pointer response, or colour feedback benefits from it.

Review small labels, secondary headings, focus outlines, and line heights against the rendered page. Correct inconsistencies only where they reduce legibility or coherence.

Shorten overly verbose project-link accessible names using the least disruptive markup change. Consider referencing the existing title with `aria-labelledby` before restructuring the entire row. Preserve useful full-row interaction.

**Acceptance:** the stack retains its depth and detail, selection is understandable, and typography and motion feel coherent without erasing useful differences.

## 6. Consolidate code after visual decisions settle

Confirm unused code through imports, dynamic imports, content references, and scripts before deleting it. Treat the original plan's deletion list as candidates requiring confirmation.

Keep confirmed dead-code deletion separate from visual changes. Update checks and comments that refer to deleted components.

Consolidate headings or metric components only where semantics, accepted values, and behavior match. In particular:

- Preserve heading levels and print selectors.
- Preserve definition-list relationships where metrics use `dl`, `dt`, and `dd`.
- Check the difference between `Readout` accepting `ReactNode` and `MetricStat` accepting strings.
- Preserve pending-value handling where required.
- Do not revive unused components solely because they exist.

Keep homepage project rows and project-index cards separate if their different reading patterns remain useful.

Compare controlled screenshots after cleanup. Use decoded image comparison with a small tolerance and inspect meaningful differences; byte-identical PNG files are not required.

**Acceptance:** cleanup produces no unexplained layout or behavior changes and introduces no unnecessary abstraction.

## 7. Verify and record the final result

During implementation, run checks relevant to each change. Repeat affected browser tests after meaningful changes.

At completion:

1. Run a fresh production build.
2. Run the full existing check suite. `npm run check` already includes the bundle check.
3. Repeat the full interaction walkthrough.
4. Compare controlled screenshots and review meaningful differences.
5. Recheck the résumé PDF after any relevant component, spacing, or typography changes.
6. Append a dated verification record that supersedes earlier findings without rewriting their history.

Use these verification statuses accurately:

| Status | Meaning |
| --- | --- |
| Passed | The stated check ran and met its acceptance criteria |
| Failed | The stated check ran and exposed a defect |
| Blocked | A specific dependency or environment limitation prevented execution |
| Not tested | The check was outside this pass or was not exercised |

Do not rename blocked checks merely to produce a clean report. Record the revision, test conditions, evidence, and remaining limitations.

## Completion criteria

- Core interactions work through the tested input methods.
- Layouts remain readable and free of unintended horizontal overflow at tested widths.
- The header transition has no visible seam in the verified states.
- Sticky navigation does not unnecessarily obscure content or focus.
- Living pixels and silicon details retain the intended character.
- Reduced-motion behavior remains usable and visually clear.
- The résumé prints legibly within its intended one-page format.
- There are no unexplained visual regressions.
- Any remaining verification limitation is stated plainly.

## Scope boundaries

This pass does not include a CSS-module-to-Tailwind rewrite, a second numeric spacing system, new decorative copy, new sections, or blanket component consolidation. It does not include deployment or pushing changes unless separately requested.
