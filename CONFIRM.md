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
      recency signal, and a stale one is worse than none.

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

This is your only currently-shipped software project, so these numbers carry
real weight. If you genuinely don't have user counts, replace the metric with
something you *can* measure — codebase size, uptime, release cadence — rather
than deleting the section.

## 7. Project statuses — `content/projects/*.mdx`

Everything except `k20-curation` and `dsp-audio-denoising` is currently marked
`status: planned` with target dates drawn from your 12-month calendar. That is
the safe default — `planned` can never be an overclaim.

- [ ] Promote anything actually underway to `building`, or finished to `shipped`
      (a `shipped` project also needs a `finished` date — the content gate
      enforces this)
- [ ] Correct the `started` dates to reality

## 8. Deployment

- [ ] Point `tadiwa.org` at the deploy
- [ ] Confirm `SITE.url` matches — it drives OG tags, the sitemap, and robots.txt
