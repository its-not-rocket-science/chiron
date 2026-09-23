# Chiron — Content Licensing (onboarding examples)

**Status:** Active process doc. Covers all five seeded examples: the
three from `prompts-onboarding-examples.txt` Prompts E1-E5, plus the two
sourced by `prompt.txt` Prompt G6 (`ela-argumentative-writing`,
`civics-current-events`).

## Why this exists

Chiron seeds a small number of real, third-party lesson plans as
onboarding examples (`origin = 'system_example'` lessons — see the schema
in migration `0017_system_example_lessons.sql`) so a new user has
something real to look at before submitting their own lesson. Using
someone else's published content, even briefly and for a good reason,
means the licensing has to be genuinely right — not "probably fine" — and
visibly, permanently attributed, not attributed once at seed time and then
left to rot.

## The process (required for every future example)

1. **Prefer CC BY, CC BY-SA, CC0, or public-domain sources** (by
   government authorship, e.g. a US federal agency's own staff-authored
   material; by a voluntary CC0 public-domain dedication from the rights
   holder; or by age, e.g. pre-1929 US publications). These require
   attribution (CC0 technically doesn't legally require it, but Chiron
   attributes anyway, per rule 4) but no case-by-case commercial-use
   judgment call.
2. **Explicitly reject CC BY-NC / CC BY-SA-NC sources** unless Chiron's
   own deployment is confirmed non-commercial at the time of ingestion.
   **Current answer: unknown / product decision not yet made.** Chiron has
   no stated pricing or business model as of this writing (nothing in
   `README.md`, `docs/STATUS.md`, or `docs/DECISIONS.md` addresses it).
   Until that's decided, treat Chiron as a potentially-commercial
   deployment and do not seed NC-licensed content — this is why two
   otherwise-strong journalism candidates (Stanford History Education
   Group, CC BY-NC; SchoolJournalism.org, CC BY-NC-SA) were rejected
   during the E1-E5 sourcing pass despite being good pedagogical fits.
3. **Verify the license on the live source page at ingestion time** —
   never from a search-engine snippet, a cached page, or a prior
   conversation's notes. A license can change; a page can be replaced; a
   search snippet can be stale or simply wrong. The one exception this
   repo has hit so far, and how it was actually handled, is documented
   below — it's a deliberate, logged departure from this rule, not a
   precedent that quietly weakens it.
4. **Store attribution as structured data**, not a text blurb glued onto
   the lesson body: `origin`, `attributionName`, `attributionUrl`,
   `license` (a closed enum — extend it, never switch to free text so the
   UI can keep rendering a correct badge without string-matching), and
   `licenseNote` for anything that needs qualifying. Schema:
   `src/lib/domain/schemas.ts` (`LessonSchema`/`LessonLicenseSchema`).
5. **Re-verify periodically.** Cadence: **quarterly** — few enough examples
   exist that a quarterly manual re-check (re-fetch each `attributionUrl`,
   re-confirm the license statement, update `licenseNote`/`license` if
   anything changed) is cheap, and quarterly is frequent enough that
   licensing drift wouldn't sit live for long unnoticed. Track it as a
   recurring item wherever this repo tracks recurring operational work
   (`docs/STATUS.md`); there's no automation for this today; the live
   `attributionUrl`-resolves check
   (`tests/rls/onboardingExampleAttribution.spec.ts`) only proves the link
   isn't dead, not that the license text at the other end is unchanged.
6. **Attribution must survive a copy.** A "duplicate and try your own
   edit" copy of a system-example lesson is an ordinary, editable,
   privately-owned lesson (`origin = 'user'`) — but CC BY-style licenses
   require attribution to travel with the content into a derivative, so
   `copy_lesson()` (migration `0018_copy_lesson_preserves_attribution.sql`)
   copies `attribution_name`/`attribution_url`/`license`/`license_note`
   onto the new row even though a `user`-origin lesson doesn't otherwise
   populate them. Verified live: see the `copy_lesson` test in
   `tests/rls/systemExampleLessons.spec.ts`.

   `/lessons/[id]` (added after this note was first written) also renders
   `attributionName`/`attributionUrl`/`license` via the same `LicenseBadge`
   component `/examples` uses, whenever they're non-null — confirmed live
   during the Prompt G6 pass, by duplicating a system-example lesson as a
   real throwaway Supabase account and visiting the resulting private
   copy's `/lessons/[id]` page in a real browser, not just asserted from
   the component test suite.

## The five examples seeded (Prompts E1-E5, plus Prompt G6)

| Profile                   | Source                                                                                                                                                                                                                      | License               | Verified how                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| science-lab               | [OpenSciEd MS 6.2 "Thermal Energy"](https://openscied.org/instructional-materials/6-2-thermal-energy/)                                                                                                                      | CC-BY-4.0             | **Direct live-page fetch**, three times (seed time, an earlier review, and the 2026-09-21 quarterly re-check) — confirmed via OpenSciEd's own licensing FAQ, [what-does-it-mean-that-these-units-are-licensed-as-cc-by-4-0](https://openscied.org/knowledge/what-does-it-mean-that-these-units-are-licensed-as-cc-by-4-0/) ("The OpenSciEd Middle School units ... are licensed as CC-BY-4.0", distinct from Elementary/High School's CC-BY-NC) |
| history-essay             | [Library of Congress — Primary Sources and Personal Artifacts](https://www.loc.gov/classroom-materials/primary-sources-and-personal-artifacts/)                                                                             | Public-Domain-US-Govt | **Not a direct fetch** — re-attempted 2026-09-21, still blocked (see limitation below)                                                                                                                                                                                                                                                                                                                                                          |
| journalism                | [LOC — Read All About It](https://blogs.loc.gov/teachers/2015/10/read-all-about-it-a-new-teachers-guide-to-analyzing-newspapers/) + [Yellow Journalism guide](https://guides.loc.gov/chronicling-america-yellow-journalism) | Public-Domain-US-Govt | **Not a direct fetch** — re-attempted 2026-09-21, still blocked (see limitation below)                                                                                                                                                                                                                                                                                                                                                          |
| ela-argumentative-writing | [DocsTeach (National Archives) — How Effective Were the Efforts of the Freedmen's Bureau?](https://docsteach.org/lesson/how-effective-were-the-efforts-of-the-freedmens-bureau/)                                            | CC0                   | **Direct live-page fetch**, 2026-09-23 (seed time) — the CC0 Public Domain Dedication statement was confirmed on this specific lesson page itself, not just the site-wide terms-of-use page (which states a different, CC BY-NC-SA license for the rest of the site's content — teaching activities are carved out separately)                                                                                                                  |
| civics-current-events     | [National Archives — The Constitution at Work: Middle School Edition (Teacher Guide)](https://www.archives.gov/files/education/distance-learning/constitution-at-work-teacher-guide-ms.pdf)                                 | Public-Domain-US-Govt | **Direct live-page fetch**, 2026-09-23 (seed time) — archives.gov, unlike loc.gov, was directly fetchable with no bot-block; general NARA copyright policy (works produced by NARA are public domain / CC0-equivalent) confirmed via [archives.gov](https://www.archives.gov/) itself                                                                                                                                                           |

### Known limitation: the two Library of Congress sources

Rule 3 above ("verify on the live page, never from a snippet") could not
be followed for these two sources. Every loc.gov subdomain
(`www.loc.gov`, `blogs.loc.gov`, `guides.loc.gov`) has consistently
blocked automated fetches — a Cloudflare bot-check ("Just a moment...")
at seed time and the first review, a plain HTTP 403 at the 2026-09-21
quarterly re-check — across every fetch method available in this
environment (direct HTTP fetch and a real Chrome browser session via
browser automation), and no attempt was made to defeat that check (this
repo's assistant tooling treats bypassing bot-detection as out of bounds
regardless of purpose). **Unchanged limitation, re-attempted and
re-confirmed still blocked, not a new finding.**

What was actually verified instead, and disclosed to a human before
seeding proceeded on this basis (re-confirmed, not just carried over
unchanged, at the 2026-09-21 re-check):

- LOC's general, published copyright policy — staff-authored classroom
  material is treated as free of known copyright restrictions, as US
  federal government work product (`ask.loc.gov` FAQ, `loc.gov/legal/`)
  — via web search, not a direct fetch of loc.gov itself.
- Independent, search-indexed descriptions of both pages' actual content
  (topics, structure, the specific tools/prompts referenced), consistent
  across the initial sourcing pass, a second check for this document, and
  the 2026-09-21 quarterly re-check.

This is a real gap against rule 3, not a technicality — it was a
human-approved judgment call at the time (a person was asked, explicitly,
whether to proceed on this basis or wait), not a default this process
should fall back to quietly next time. **Action item, still open as of
2026-09-21:** a person should do a genuine live-page read of both LOC
URLs (or fetch them from a network path that isn't bot-blocked) and
confirm the license statement directly at the next quarterly re-check,
closing this out for real.

## Re-check log

| Date       | Result                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-21 | OpenSciEd re-verified via direct fetch (CC-BY-4.0 for MS confirmed, unchanged). Both LOC sources still blocked (403); general policy re-confirmed via search. No license or content changes found. **Next re-check due: 2026-12-21.**                                                                                                                                                                                            |
| 2026-09-23 | Two new examples seeded (Prompt G6): DocsTeach's Freedmen's Bureau lesson (CC0, ela-argumentative-writing) and the National Archives' Constitution at Work teacher guide (Public-Domain-US-Govt, civics-current-events). Both verified via direct live fetch at seed time — no bot-block exception needed for either. **Next re-check for these two due: 2026-12-23**, folded into the existing quarterly cadence going forward. |

## Rejected candidates (journalism, during the E1-E5 sourcing pass)

- Stanford History Education Group material — CC BY-NC (rejected: rule 2)
- SchoolJournalism.org material — CC BY-NC-SA (rejected: rule 2)
- One OER Commons listing — self-contradictory license metadata on the
  listing itself (rejected: rule 3 — couldn't positively confirm a single,
  consistent license statement)

## Rejected candidates (ela-argumentative-writing / civics-current-events, Prompt G6 sourcing pass)

- Yale National Initiative curriculum units (`teachers.yale.edu`) — a
  strong pedagogical fit ("Defensible: The Art of Writing a Persuasive
  Argumentative Essay") but the site's own terms of use state the units
  are copyrighted by Yale University, all rights reserved (rejected: rule
  1 — not CC-licensed or public domain at all)
- Colorado Municipal League / Special District Association of Colorado's
  "Lessons on Local Government" (`lessonsonlocalgovernment.org`) — a
  strong thematic fit for civics-current-events (real local-government
  lesson plans, e.g. "Should Colorado Communities Raise the Minimum
  Wage?") but explicitly "© 2025 ... All Rights Reserved" (rejected: rule 1)
- EDSITEment (`edsitement.neh.gov`, National Endowment for the
  Humanities) — considered for ela-argumentative-writing. Even though NEH
  is itself a federal agency, EDSITEment's own site states its resources
  carry mixed licensing (some fair-use-only, some third-party-copyrighted,
  some openly licensed, varying per resource) rather than a single
  blanket public-domain or CC statement, and the lesson-plan listing pages
  returned HTTP 403 to a direct fetch at sourcing time — not usable
  without a resource-by-resource live check this pass didn't reach a
  clean candidate through (not formally rejected the way the items above
  were; deprioritized in favor of the DocsTeach candidate once that one
  verified cleanly)
