# Before this goes live

Facts that were not verifiable when written, kept as visible `CONFIRM:` /
`TODO(tadiwa):` markers rather than plausible guesses. A wrong number on a
résumé costs more than an obviously missing one, and an interviewer will ask
about the number.

`npm run check:content` lists the content-side markers on every run.

Most of this file was resolved on 2026-09-01 from the printed résumé
(`mandava-resume-hardware.pdf`), which is the authority wherever the two
disagree. What follows is only what is still open.

---

## 1. Invented date precision, `content/projects/*.mdx`

The résumé dates five projects as `2026` with no month. The content schema
requires an ISO `finished` date for anything `status: shipped`, so all five
carry `started: 2026-01-01` / `finished: 2026-08-31`.

That span is a statement at year precision wearing month precision. It is not
a lie, but it is not knowledge either.

- [ ] Replace with the real months for `riscv-cpu-verification`, `rtos-stm32`,
      `cuda-matmul`, `llm-inference-engine`, `lsm-storage-engine`.

## 2. `nowBuilding`, `src/lib/site.ts`

Was "an LSM storage engine in Rust, and a bare-metal RTOS on STM32" until the
résumé showed both finished, which made the homepage advertise completed work
as in progress. It now reads "the retrieval and inference stack behind this
site's lab", which is true but is a guess at what you consider current.

- [ ] Set it to whatever you are actually building. It is the most-read
      sentence on the site after the headline.

## 3. Which name

The site says **Tadiwa Mandava**; the résumé header says **Tadiwanashe
Mandava**. Both are presumably right, and the domain settles the short form,
but a screener holding both documents notices.

- [ ] Decide whether the site should match the résumé.

## 4. K20 metrics, `content/projects/k20-curation.mdx`

Two metric cards read `TODO` for active users and records curated. Both are
deleted rather than shipped as placeholders, so the project now shows one
figure ("8 mo in production") derived from its dates.

- [ ] If you have real usage numbers, add them back. If not, a measurable
      substitute (codebase size, release cadence) beats an absent section.

## 5. Deliberately empty, not missing

Not tasks. Recorded so nobody "fixes" them later:

- **GPA, honors, coursework** are empty in `src/lib/resume-data.ts` and their
  sections do not render. The printed résumé carries none of them, and a site
  volunteering what the document omits is two claims about one person.
- **Phone** is not published. The PDF carries one; a public page gets scraped.
- **Education start term** is an empty string on purpose. The résumé prints
  "Expected May 2028" alone, and the renderer collapses the range rather than
  leaving a dangling arrow.

## 6. Deployment secrets, not content

Neither is set, and the site is correct without both:

- [ ] `OPENROUTER_API_KEY` turns on the Kimi K3 option in `/lab/inference`.
      Unset, the card renders disabled reading "no API key on this
      deployment". Set a spend cap at the provider first; the in-process rate
      limit resets on every redeploy. See `DEPLOY.md` §4b.
- [ ] `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` turn on `/admin`.
      Unset, it 404s in production, which is the intended default.

## 7. Content markers: none

`content/projects/dsp-audio-denoising.mdx` was deleted on 2026-09-01, so the
marker it carried is gone with it. `check:content` should now report zero
placeholders. If it reports any, that is new and worth reading.
