# Chiron — Content Licensing (onboarding examples)

**Status:** Active process doc. Covers the three examples seeded by
`prompts-onboarding-examples.txt` Prompts E1-E5 and defines the process the
next batch (planned: `ela-argumentative-writing`, `civics-current-events`
examples, once written) must follow.

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

1. **Prefer CC BY, CC BY-SA, or public-domain sources** (by government
   authorship, e.g. a US federal agency's own staff-authored material; or
   by age, e.g. pre-1929 US publications). These require attribution but
   no case-by-case commercial-use judgment call.
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

   As of this writing, the app has no lesson-detail view that renders a
   _saved_ lesson's full text at all — `/lessons` ("My lessons") shows
   only title and metadata, and there's no `/lessons/[id]` page. The only
   places lesson text is actually rendered today are the immediate
   scoring-results view (session-local, not persisted) and `/examples`
   itself (which does render the attribution). So "attribution survives a
   copy" is fully satisfied at the data layer today, with no UI gap to
   close — but the moment a lesson-detail view is added, it must render
   `attributionName`/`attributionUrl`/`license` whenever they're non-null,
   the same way `/examples` already does, not just for the original.

## The three examples seeded (Prompts E1-E5)

| Profile       | Source                                                                                                                                                                                                                      | License               | Verified how                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| science-lab   | [OpenSciEd MS 6.2 "Thermal Energy"](https://openscied.org/instructional-materials/6-2-thermal-energy/)                                                                                                                      | CC-BY-4.0             | **Direct live-page fetch**, twice (seed time + this review) — confirmed on OpenSciEd's own licensing page |
| history-essay | [Library of Congress — Primary Sources and Personal Artifacts](https://www.loc.gov/classroom-materials/primary-sources-and-personal-artifacts/)                                                                             | Public-Domain-US-Govt | **Not a direct fetch** — see limitation below                                                             |
| journalism    | [LOC — Read All About It](https://blogs.loc.gov/teachers/2015/10/read-all-about-it-a-new-teachers-guide-to-analyzing-newspapers/) + [Yellow Journalism guide](https://guides.loc.gov/chronicling-america-yellow-journalism) | Public-Domain-US-Govt | **Not a direct fetch** — see limitation below                                                             |

### Known limitation: the two Library of Congress sources

Rule 3 above ("verify on the live page, never from a snippet") could not
be followed for these two sources. Every loc.gov subdomain
(`www.loc.gov`, `blogs.loc.gov`, `guides.loc.gov`) returns a Cloudflare
bot-check ("Just a moment...") to every fetch method available in this
environment — a direct HTTP fetch, and a real Chrome browser session via
browser automation — and no attempt was made to defeat that check (this
repo's assistant tooling treats bypassing bot-detection as out of bounds
regardless of purpose).

What was actually verified instead, and disclosed to a human before
seeding proceeded on this basis:

- LOC's general, published copyright policy — staff-authored classroom
  material is treated as free of known copyright restrictions, as US
  federal government work product (`ask.loc.gov` FAQ, `loc.gov/legal/`)
  — via web search, not a direct fetch of loc.gov itself.
- Independent, search-indexed descriptions of both pages' actual content
  (topics, structure, the specific tools/prompts referenced), consistent
  across the initial sourcing pass and a second check for this document,
  minutes apart in the same review.

This is a real gap against rule 3, not a technicality — it was a
human-approved judgment call at the time (a person was asked, explicitly,
whether to proceed on this basis or wait), not a default this process
should fall back to quietly next time. **Action item:** a person should
do a genuine live-page read of both LOC URLs (or fetch them from a
network path that isn't bot-blocked) and confirm the license statement
directly at the next quarterly re-check, closing this out for real.

## Rejected candidates (journalism, during the E1-E5 sourcing pass)

- Stanford History Education Group material — CC BY-NC (rejected: rule 2)
- SchoolJournalism.org material — CC BY-NC-SA (rejected: rule 2)
- One OER Commons listing — self-contradictory license metadata on the
  listing itself (rejected: rule 3 — couldn't positively confirm a single,
  consistent license statement)
