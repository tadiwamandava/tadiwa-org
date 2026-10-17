# Website revision review

Mode: during, selected by the user for this session. Applied the core antislop and antislop-copywriting skills from `/Users/tadiwamandava/.codex/skills/`.

Implementation and automated checks are complete. **The delivery gate remains BLOCKED on browser verification.** The browser provider returned an empty browser list. No screenshots, browser-console inspection, keyboard walkthrough, mobile measurements, or clicks are claimed below. This is a review of local changes, not a release approval.

## Direction and design reasons

The design read announced before editing was an engineering portfolio for recruiters and technical peers, using the user's black-and-orange direction, Audiowide display type, Onest body type, and an interactive silicon-to-software stack. ENERGY 2 / RHYTHM 3 / MOTION 2.

- Orange identifies interaction and the selected chip layer; neutral surfaces keep long technical explanations readable.
- Audiowide supplies the hardware-inspired identity in major headings. Onest carries project titles, controls, and prose. Monospace is reserved for code, language names, and measurements.
- The hero introduces the author and provides two routes into the work. Project rows let visitors compare titles and summaries without decorative feature cards.
- The lab uses a split introduction and two substantial demo descriptions. The contact band provides a clear change in tone and a direct email link.
- The chip stack connects three areas of the actual portfolio. Its grid, extrusion shadows, traces, and signal illustrate layers and flow; its footnote identifies the illustration. It is not live telemetry or a shared runtime claim.
- Scroll expansion and layer controls reveal the illustration. Pause and reduced-motion support limit animation. Standard content does not animate into view.
- Header blur separates persistent navigation from scrolling content. Small radii distinguish controls from flat content rows; the contact pill is reserved for the header action.
- Status labels identify real project/demo states. External-link arrows identify outbound links, and the stack's arrows indicate traversal or project destinations. No general feature-icon collection, fake terminal, testimonials, or invented logo was added.
- Project-index cards share a structure because visitors filter and compare the same fields. The homepage uses rows to vary the reading rhythm.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run build` | PASS; compiled, typechecked, generated 26 pages |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS on final source |
| `npm run check:content` | PASS; 6 projects, 0 posts |
| `npm run check:links` | PASS; 17 resolvable routes, 12 distinct referenced internal hrefs |
| `npm run check:contrast` | PASS; 31 token pairs and 8 distinguishability checks, including 13.90:1 contact text/focus contrast |
| `npm run check:search` | PASS; 10 expectations against rebuilt content |
| `npm run check:prompt` | PASS; grounded prompt matches fixture |
| `npm run check:bundle` | PASS; homepage critical JavaScript 139.4 KiB gzip, below 150 KiB budget; deferred search remains separate |
| `git diff --check` | PASS |
| Search download recovery | PASS; injected HTTP 503 rejected, retry succeeded, concurrent loads shared one download, search returned the expected project, loaded index reused |
| Production HTTP checks | PASS; home, projects, no-match filter, lab, both demos, resume, writing, and six project pages returned 200 with expected content; missing page returned 404 |
| Served search corpus | PASS; served JSON matches regenerated local corpus, 62 passages |
| Browser provider | BLOCKED; `agent.browsers.list()` returned `[]` |

The first writing-page assertion searched for “No posts”; the actual copy is “No standalone posts yet.” Rechecking the actual expected phrase and project link passed without a source change.

Existing build warnings remain: dynamic filesystem tracing in `src/lib/nano.ts` and a package lock outside the repository. The temporary `next start` preview also warned that standalone deployments should use the standalone server entry point. HTTP checks produced no additional server errors. This does not establish an error-free browser console.

## Core gate, rule by rule

PASS entries below cite source inspection or automated evidence within their stated scope. BLOCKED entries prevent an overall delivery PASS.

| Rule | Status and evidence |
| --- | --- |
| R-01 Color | PASS: one orange accent and neutral surfaces; gradient limited to the illustrative board and its backdrop |
| R-02 Copy | PASS: reviewed authored copy; source scan found no em-dash characters or `&mdash;` in app, component, or MDX copy |
| R-03 Mobile | BLOCKED: added wrapping controls, minimum 44px buttons, contained illustration, responsive rows, and scrollable tables; actual viewport measurements unavailable |
| R-04 Icons | PASS: removed generic project glyphs and invented header mark; remaining search and playback symbols identify their actions |
| R-05 Structure | PASS: hero, comparison rows, split lab section, conditional writing list, and direct contact have distinct content purposes |
| R-06 Typography | PASS: display face confined mainly to major headings; ordinary copy uses Onest; technical readouts use mono |
| R-07 Background | PASS: grid is confined to the engineering illustration to establish its ground plane |
| R-08 Arrows | PASS: primary homepage actions are text-only; arrows identify outbound links or stack navigation |
| R-09 Badges | PASS: labels describe actual status, model selection, and filter state; language badges replaced with text |
| R-10 Glass | PASS: header is the single blurred navigation surface |
| R-11 Radius | PASS: flat rows, small-radius controls, and one header contact pill serve different roles |
| R-12 Shadows | PASS: board shadows describe the stack's depth; project rows do not float |
| R-13 Glow | PASS: restrained signal/backdrop emphasis belongs to the stack illustration, not every control |
| R-14 Cards | PASS: comparison cards share project fields; homepage project rows and lab composition avoid a repeated feature-card template |
| R-15 CTAs | PASS: actions name their destinations, including View projects, Read my résumé, Open inference demo, and Retry search download |
| R-16 Buzzwords | PASS: reviewed copy uses implementation details and direct actions; scanned generic marketing CTAs removed |
| R-17 Numbers | PASS: removed stale timing, size, and model-capacity claims; displayed lab measurements derive from shipped files or live results; existing source project facts retained |
| R-18 Testimonials | PASS: no testimonial section or invented people |
| R-19 Motion | PASS by source: stack motion illustrates expansion and signal flow, with pause and reduced-motion rules; playback still needs browser verification |
| R-20 Identity | PASS by composition review: chip architecture, chosen typography, engineering writeups, and orange selection motif persist beyond the author name |
| R-21 Theme | PASS: fixed dark theme follows the user's chosen reference and palette |
| R-22 Illustration | PASS: existing approved stack refers to actual CPU, RTOS, storage, and inference projects |
| R-23 Assets | PASS: no new asset generation; uses existing approved stack/fonts and text identity |
| R-24 Navigation | PASS: internal-link checker and production HTTP checks resolve the actual destinations |
| R-25 Contrast | BLOCKED for full rendered audit: all 31 tested token pairs pass; transformed/overlaid content needs browser inspection |
| R-26 Controls | BLOCKED for click-through: inspected real hrefs/handlers, added dialog close/retry and error recovery; clicks unverified |
| R-27 States | PASS by source: project and writing empty states, route loading/error boundaries, model loading/errors, query pending state, and search retry controls exist |
| R-28 FAQ | PASS: no invented FAQ |
| R-29 Palette | PASS: neutral tones and one orange accent; chart/status distinctions use the existing token system |
| R-30 Originality | PASS by composition review: reference-informed palette and geometry, with author-specific project rows and chip stack; no copied product narrative |
| R-31 Reasons | PASS: major decisions recorded above |
| R-32 Keyboard | BLOCKED: focus ring restored globally; native controls/dialog and combobox semantics reviewed; Tab/Enter/Escape walkthrough unavailable |
| R-33 Source edits | PASS: UI edits written directly with patches/full-file writes; no external string-replacement patch scripts |
| R-34 Themes | PASS by scope: one theme, no theme toggle; print stylesheet retains explicit black-on-white treatment |
| R-35 Runtime verification | BLOCKED: build and HTTP checks passed; no connected browser for required element-by-element click-through or console checks |
| R-36 Claims | PASS: removed performance guarantees, unsupported hosted-model capacity, and blanket local-only claims; hosted request disclosure matches its code path |
| R-37 Direction | PASS: explicit existing user direction and announced design read; dials recorded above |
| R-38 Content | PASS: real project content and generated search corpus; writing is explicitly empty and future RISC-V demo explicitly planned |

## Liveliness and craftsmanship

- Dials: PASS, ENERGY 2 / RHYTHM 3 / MOTION 2 declared.
- Dial consistency: PASS by source composition, with varied sections and stack-only sustained motion; rendered review pending.
- Focal point on every screen: BLOCKED on viewport inspection; intended hierarchy uses major headings, project titles, and selected layer readout.
- Structural whitespace: PASS by source, distinct hero/project/lab/contact spacing and bounded prose measure.
- Deliberate accent: PASS, orange for active layers, links, focus, and chart subject.
- Identity motif: PASS, chip layers and the display type connect the hero to the hardware/software subject matter.
- Prior design read: PASS, announced before editing and recorded here.
- C-1 Intentionality: PASS, major visual and copy decisions have reasons above.
- C-2 Functional completeness: BLOCKED on browser interaction testing; code and HTTP checks support the implemented behaviors.
- C-3 Content-driven composition: PASS, sections correspond to actual projects, demos, posts, and contact details.
- C-4 Resilience: BLOCKED on browser state, viewport, and keyboard tests; source includes empty/loading/error and reduced-motion handling.
- C-5 Evidence: PASS for rewrite provenance; no new engineering achievements or testimonials invented. Existing author-supplied project claims were not independently revalidated.

## Copywriting checklist

- PASS: no new fabricated numbers, people, quotes, dates, or achievements; measured values retain their source.
- PASS: generic marketing vocabulary replaced with concrete implementation descriptions.
- PASS: authored UI and MDX scan contains no em dashes.
- PASS: quotation marks identify real labels or terms rather than providing routine emphasis.
- PASS: no all-caps emphasis clauses in prose; diagram labels and technical acronyms retain their meaning.
- PASS: rewritten explanations identify the author, engine, model, or test as the actor; passive forms retained only where the operation is the subject.
- PASS: CTAs identify the action or destination.
- PASS: removed repeated fake-candid openings, negative-parallelism claims, aphorisms, and forced three-part sections.
- PASS: first-person engineering voice retained, including the existing headline and specific implementation tradeoffs.

## Browser walkthrough still required

Every item here is **unverified in a browser**, not a recorded successful click:

| Control or state | Expected behavior to verify |
| --- | --- |
| Header brand and navigation | Open home, projects, lab, resume, and writing |
| Header/contact email | Open the configured mail link |
| Homepage actions and rows | Scroll to work; open resume and each project |
| Stack layer selectors/next | Change readout and expanded layer state |
| Stack assemble/pause | Assemble boards; pause/resume signal animation |
| Stack keyboard focus | Reveal/focus project links with visible outline |
| Lab links | Open search and inference; planned demo points to its writeup |
| Project filters and clear action | Update URL/results; recover from an empty filter |
| Resume variants and print | Change project selection; open print UI and inspect PDF layout |
| Search palette | Cmd/Ctrl+K opens; arrows/Enter navigate; Escape and Close dismiss; focus returns |
| Palette failure/retry | Failed downloads show a message; retry restores results |
| Vector demo | Graph layers, ef slider, rerun, document selection, and result links work |
| Free-text search | Opt-in download, pending state, query results, and retry work; switching document invalidates pending query |
| Inference demo | Model/mode/precision changes, download, prompt, generation, and errors work |
| Voice controls | Supported-browser recording/playback permissions and stop states work |
| Admin forms | Validation, pending, success/error states, and narrow-screen controls work without publishing test content |
| Missing page and error fallback | Return-home and retry actions work |
| Responsive and motion | Check 320, 375, 768, 1024, and 1440px; keyboard-only, reduced motion, zoom, and table scrolling |

The core skill's R-35 requires: “Click through every interactive element, one at a time, and watch what it does”. That requirement cannot be claimed complete with the current browser connection unavailable.
