# Before this goes live

Every item below is a fact I could not verify and deliberately did **not** invent.
They render as visible `CONFIRM:` / `TODO(tadiwa):` markers on the page rather
than as plausible-looking guesses, because a wrong number on a résumé costs more
than an obviously missing one — and an interviewer *will* ask about the number.

`npm run check:content` lists the content-side markers on every run.

---

## 1. Identity — `src/lib/site.ts`

- [ ] `github` — currently `CONFIRM-github-handle`
- [ ] `linkedin` — currently `CONFIRM-linkedin-slug`
- [ ] `email` — left **blank on purpose**. Decide before filling: publishing an
      address invites scrapers. An alias (`hi@tadiwa.org`) is better than your
      personal Gmail. If you'd rather have no public email, delete the field and
      the footer entry instead of leaving it empty.
- [ ] `nowBuilding` — the "Now" strip on every page. Keep it current; it is the
      recency signal, and a stale one is worse than none. It currently reads
      "an LSM storage engine in Rust, and a bare-metal RTOS on STM32" —
      `lsm-storage-engine.mdx` is still `status: planned`, and
      `rtos-stm32.mdx` has a `started` date in the future. Either the strip is
      ahead of the content, or the content's dates need updating; re-check
      both against reality together.

## 2. Education — `src/lib/resume-data.ts`

- [ ] Start term and expected graduation term
- [ ] GPA — **only list it if it's ≥ 3.5.** Below that, omit the field entirely
      rather than volunteering it; some chip-company screens gate on 3.0–3.5 and
      will ask if they need it.
- [ ] Honors / scholarships / Dean's List — or delete the list
- [ ] City, state

## 3. The OU IT job — `src/lib/resume-data.ts`

- [ ] Employer name, job title, start and end dates
- [ ] **Three bullets, each with a real number.** The formula is
      *strong verb + what + how + measured outcome*:
  - the support bullet — how many machines / tickets / users, over what period
  - the automation bullet — what you scripted or standardised, and the time it
    removed from the queue
  - the ownership bullet — a system or process you were *the* person for

## 4. Coursework — `src/lib/resume-data.ts`

- [ ] Software-forward list: real OU course titles that matter to a software
      screener (data structures, algorithms, OS, architecture…)
- [ ] Hardware-forward list: digital design, circuits, DSP, embedded…

Include in-progress courses. Junior-year candidates are expected to have them.

## 5. Skills — `src/lib/resume-data.ts`

- [ ] Instruments and boards you have actually driven
- [ ] EDA and simulation tools you have actually run
- [ ] Working practices, five words

**Rule:** never list anything you can't defend for five minutes. Chip-company
screens parse the skills line for keywords, and interviewers probe it
specifically.

## 6. The K20 project — `content/projects/k20-curation.mdx`

- [ ] `metrics` — active users, records curated (2 placeholders)
- [ ] `resumeBullets` — 2 bullets, quantified

`dsp-audio-denoising` shipped alongside this one and already has real,
non-placeholder `resumeBullets` — its only remaining marker is a `TODO(tadiwa)`
inside a YAML comment (a note to self about a possible future number), which
`check:content` still lists but which never reaches the rendered page. K20 is
the one still showing placeholder text where a reader can actually see it —
the metric cards and the résumé bullets. It's also the bigger of the two (a
real client, a live migration), so these numbers carry the most weight. If
you genuinely don't have user counts, replace the metric with something you
*can* measure — codebase size, uptime, release cadence — rather than deleting
the section.

## 7. Project statuses — `content/projects/*.mdx`

Still accurate: everything except `k20-curation` and `dsp-audio-denoising` is
marked `status: planned` with target dates drawn from your 12-month calendar.
Both shipped projects already carry a `finished` date, so the content gate's
"`shipped` needs `finished`" rule is satisfied for both — nothing to fix
there. That is the safe default for the rest — `planned` can never be an
overclaim.

- [ ] Promote anything actually underway to `building`, or finished to `shipped`
      (a `shipped` project also needs a `finished` date — the content gate
      enforces this)
- [ ] Correct the `started` dates to reality

## 8. Deployment

- [x] `SITE.url` is `https://tadiwa.org` in `src/lib/site.ts` — already
      correct, drives OG tags, the sitemap, and `robots.txt`. Re-check this
      only if the domain ever changes.
- [ ] Point `tadiwa.org` at an actual Vercel deployment. The code has been
      ready for this since the URL above was set; what's missing is the
      hosting + DNS action, not a code change. `DEPLOY.md` is the runbook.
