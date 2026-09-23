# Chiron — Status

Concise, current-state source of truth. Where this disagrees with a
stray comment or prescriptive-sounding paragraph elsewhere in `docs/`,
trust this file — it's revised at each major milestone specifically to
stay accurate, rather than reasoning about state from history. For the
_why_ behind any decision below, follow the ADR reference into
`docs/DECISIONS.md`; this file states what's true, not why.

## Product definition

Chiron is an evidence-based critical-thinking coach for teachers. A
teacher pastes or uploads a lesson plan; Chiron scores it against a
three-pillar rubric (dialogue, authentic/situated problems, mentoring —
Abrami et al., 2015) and a six-skill critical-thinking taxonomy, then
gives subject-flavored, lesson-specific revision suggestions. Teachers
can create an org, share lessons within it or publish public templates,
and browse/copy from a shared library. This is Phase 1 — fully
implemented and shipped. Phase 2A (a student-facing practice mode) has
reached its own stop point (`prompts.txt` Prompt 35) — see the Phase 2
sections below.

## Implemented (Phase 1 + hardening)

- **Core loop**: paste or upload (`.docx`/`.pdf`) a lesson → score
  (three pillars + six-skill coverage + subject-flavored suggestions) →
  revise and resubmit → before/after comparison.
- **Accounts**: Supabase Auth, email/password only (no magic link).
  One org per user (`memberships.user_id` unique).
- **Orgs**: create, invite (shareable link, not sent email — ADR-009),
  admin/teacher roles, admin-only lesson featuring.
- **Lessons**: `private` / `org-shared` / `public-template` visibility,
  enforced by Postgres RLS (ADR-002), adversarially tested against the
  live database (`tests/rls/orgIsolation.spec.ts`, 19 cases; the org
  score benchmark added in Prompt P6 has its own adversarial suite,
  `tests/rls/orgScoreBenchmark.spec.ts`, 4 cases).
- **Shared library** (`/library`): search/filter by subject, grade,
  minimum pillar scores; save-a-copy always lands as a new private
  lesson (ADR-011).
- **Scoring**: DeepSeek active (`DeepSeekScoringProvider`, ADR-008),
  Anthropic implemented and swappable behind the same
  `ScoringProvider` interface. Structural prompt-injection defense,
  live-tested against three distinct attack shapes.
- **Security hardening** (Prompt 11 + `prompts.txt` Prompts A-C): rate
  limiting on scoring/upload (ADR-006), decompression-bomb and
  chunked-encoding upload-size protection (ADR-013), `profiles.email`
  locked to its owner via a `profiles_public` view (ADR-012), silent
  RLS-blocked-write bugs fixed, logging hygiene pass.
- **Docs reconciliation** (`prompts.txt` Prompt 13, this pass):
  `docs/ARCHITECTURE.md` corrected where it still described planning
  intent rather than what was actually built (see ADR-014 for the one
  substantive divergence found: routes call Supabase directly, not
  through a `DataStore` abstraction).
- **Phase 1 polish** (`prompts.txt` Part 5, Prompts P1-P6, complete
  2026-08-27): few-shot worked examples plus low temperature for
  scoring consistency; prompt-version tracking on every stored score
  (`SCORING_PROMPT_VERSION`, migration `0013`); an optional structured
  4-field lesson input mode alongside the existing free-text mode; a
  verbatim script-swap suggestion (quote + Socratic/peer-to-peer
  rewrite) when the dialogue pillar scores 0 or 1; a content-hash
  scoring cache (migration `0014`) that gave `DataStore`/
  `SupabaseDataStore` their first real, wired-in use — see "Known
  technical debt" below; a teacher progress dashboard (`/dashboard`)
  with an org-scoped score benchmark computed by a new SECURITY
  DEFINER function (migration `0015`), adversarially tested against
  the real Supabase project
  (`tests/rls/orgScoreBenchmark.spec.ts`). ADR-027 records the one
  explicit design decision this track required: a byte-identical
  lesson resubmission still creates a new saved-lesson row, because
  there's no "revise an existing saved lesson" code path for it to be
  a no-op of.

Verification standard for all of the above: `npm run check && npm run
lint && npm test && npm run build` green, plus the live adversarial RLS
suite and live prompt-injection suite run against the real Supabase
project / real DeepSeek API, not mocks — see `docs/SECURITY.md`. Current
count: 434 tests, 433 passing (the one failure is the same pre-existing
environment artifact described in the Phase 2A completion report below,
not a defect).

## Current architecture (one-paragraph version)

Three layers: domain (`src/lib/domain/`, pure TypeScript, Zod is the
single source of truth for types), providers (`src/lib/providers/`,
`ScoringProvider`/`FileParserProvider` interfaces with swappable
implementations), app (`src/routes/`, SvelteKit). Scoring is the one
call path that goes through a domain function
(`scoreLesson()` → `ScoringProvider`); everything else that touches
Supabase is called directly from route code against `locals.supabase`,
with Postgres RLS as the actual isolation boundary rather than an
app-layer abstraction (ADR-014) — the one exception is the content-hash
scoring cache (`prompts.txt` Prompt P5), a non-RLS-scoped memoization
store with no owner or visibility to get wrong, served through
`DataStore`/`SupabaseDataStore`'s service-role client instead. Full
detail: `docs/ARCHITECTURE.md`.

## Known technical debt

- `DataStore`/`SupabaseDataStore` — `ping()` is still a standalone,
  unused-by-any-route connectivity check, but the scoring-cache methods
  (`getCachedScore`/`saveCachedScore`, Prompt P5) are genuinely wired
  into the request path from `POST /api/lessons/score`. ADR-014's
  reasoning is unchanged for everything else — lesson persistence and
  org/library operations still go through `locals.supabase` directly —
  this is a narrow, explicitly justified exception, not a reversal.
- Hosting platform itself is still not the subject of any ADR decision
  (`docs/ARCHITECTURE.md` Section 11) — but `svelte.config.js` actually
  runs `@sveltejs/adapter-vercel`, not `adapter-node` as ADR-005 still
  states; found and corrected (as a dated note, not a rewrite) while
  working on rate limiting (`prompts.txt` Prompt 31, ADR-006). Rate
  limiting itself no longer keys off this — it's Postgres-backed since
  Prompt 31, coordinating across however many instances actually run.

## Known privacy/security debt

See `docs/SECURITY.md` for the full audit — not restated here to avoid
the two documents drifting apart. Every Phase 1 finding is Fixed or
Verified. Phase 2A got its own dedicated review (`prompts.txt` Prompt
30, `docs/SECURITY.md` Section 9) once the practice tables/routes
existed to review (Prompts 22-29) — no student-data isolation gap was
found (RLS + ADR-020's write-blocking design held up under live
adversarial re-testing), but two items are **explicitly open, not
silently assumed**, per that review's own instruction not to guess:

- **Data retention.** `practice_sessions`/`practice_attempts`/
  `disposition_checkins` are retained indefinitely — no deletion or
  archival policy exists. Given Chiron's target market is schools and
  districts (this data will likely belong to minors), this needs a
  real retention-period decision from whoever owns the product/legal
  call before any real deployment to actual students — not something
  this review is positioned to invent.
- **Applicable student-data-privacy regulation.** Which regulatory
  regime(s) apply (e.g. FERPA, COPPA, or others, in the US or
  elsewhere) depends on actual deployment jurisdiction and the real
  age range served — decisions outside this document's authority.
  Needs a real answer from whoever owns the product/legal decision.

Both are recorded here deliberately, not folded into "known technical
debt" above — they're policy decisions Chiron is blocked on, not
engineering work Chiron could just go do.

- **`/privacy` and `/terms` need real legal/product review before
  handling real student data at any scale** (`prompt.txt` Prompt F2,
  added 2026-09-22). The pages themselves (`src/routes/privacy`,
  `src/routes/terms`) are honest and accurate against the real code as
  of this date — what's collected, who processes it, what's logged —
  and deliberately don't state a retention period or claim compliance
  with a specific regulation, for the same reason as the two items
  above. That accuracy is not a substitute for review by whoever owns
  legal/product for Chiron. **Owner: unassigned — needs a decision from
  whoever owns Chiron's legal/product function** before either page is
  relied on for a real deployment.

- **Onboarding-example content licensing** (`prompts-onboarding-
examples.txt` + `prompt.txt` Prompt G6, `docs/CONTENT_LICENSING.md`).
  **Five** system-example lessons are now live, one per subject
  profile — the two added by Prompt G6 (`ela-argumentative-writing`,
  `civics-current-events`) sourced from DocsTeach (National Archives
  Foundation, CC0) and the National Archives itself
  (Public-Domain-US-Govt) — both fetched and confirmed live, no
  bot-block workaround needed for either, unlike the two Library of
  Congress sources below. CC0 added as a new `license` enum value
  (migration `0022_add_cc0_license.sql`) to represent DocsTeach's
  voluntary public-domain dedication distinctly from
  `Public-Domain-US-Govt`'s statutory one. Quarterly re-check run
  2026-09-21 for the original three (`docs/CONTENT_LICENSING.md`'s
  "Re-check log"): OpenSciEd re-verified via direct fetch, CC-BY-4.0
  for Middle School unchanged. Two of those three (history-essay,
  journalism — both Library of Congress sources) still have their
  public-domain status corroborated via search-indexed content and
  LOC's general published copyright policy, not a direct live-page
  read — every loc.gov subdomain still blocks automated fetches
  (Cloudflare bot-check or a plain 403, re-confirmed 2026-09-21) to
  both a plain fetch and real-browser automation. A person should do a
  genuine direct read of both URLs at the next quarterly re-check (due
  2026-12-21, `docs/CONTENT_LICENSING.md` process, item 5) to close
  this out. Migrations `0017_system_example_lessons.sql`,
  `0018_copy_lesson_preserves_attribution.sql`, and
  `0022_add_cc0_license.sql` are all applied, and
  `scripts/seed-onboarding-examples.ts` has been run for real against
  the live project — all five onboarding examples are live, confirmed
  by viewing `/examples` in a real browser under a disposable throwaway
  account and confirming attribution survives duplication into a
  private `/lessons/[id]` copy.

## Phase 2 status

`docs/PHASE2.md` is the design document — case-content schema, tutor
state machine, calibration design, connection to Phase 1 lesson/
subject-profile data. Revised repeatedly
by `prompts.txt` Prompts D and 15-19 (see that document's own revision-
history block for the full account, not restated here): Prompt 15
formalized the deterministic/LLM boundary for Phase 2 (an LLM
classifies signals, never assigns credit); Prompt 16 replaced the
judgment model with a five-level evidence-support scale; Prompt 17
added the `COMMIT_UPDATE_CRITERION` "what would change your mind?"
mechanic as a first-class FSM state; Prompt 18 replaced the one
remaining LLM-judged credit path with a fully deterministic, authored
`reasoningRubric`; Prompt 19 consolidated all of it into
**`docs/PHASE2A_IMPLEMENTATION.md`** — the concrete, buildable plan
(exact modules, tables, RLS, routes, providers, FSM states, test
layers, migration sequence, milestone order). Treat that document as
the current plan for _how_ to build Phase 2A; `docs/PHASE2.md` remains
the source of truth for _why_ each design choice was made.
Prompts 14/14B (profiles-email and upload-size-cap re-confirmations)
found no new work — both gaps were already closed by the earlier
`prompts.txt` Prompts A/C pass.

**Phase 2A build status: complete, stop point reached (`prompts.txt`
Prompt 35, 2026-08-26).** Prompts 20-34 built the mechanic end to end;
Prompt 35 is the comprehensive, no-new-features audit closing Phase 2A
out. One decision made during consolidation worth flagging here: Phase
2A's three cases are static TypeScript data (ADR-019), not a database
table — no case generation or teacher authorship exists in this phase,
so the `practice_cases` table `docs/PHASE2.md` Section 5 describes is
Phase 2B's shape, not Phase 2A's. Explicitly not in Phase 2A:
AI-generated cases, teacher-assigned missions, classrooms/rosters,
gamification, adaptive sequencing, a large content library, native
apps.

### Phase 2A completion report (Prompt 35)

**1. What is now implemented.** Domain schema and the three canonical
cases (Prompt 21); server-side FSM and persistence (Prompt 22); real
`ReasoningClassifierProvider`/`TutorProvider` implementations (Prompts
23-24); deterministic scoring events (Prompt 25) and update-criterion
consistency checking (Prompt 26, ADR-022); confidence calibration
(Prompt 27, ADR-023, `docs/CALIBRATION.md`); the full student case UI
and transparent end-of-case feedback (Prompts 28-29); student-data RLS
isolation, hardened and adversarially re-tested (Prompt 30); shared,
Postgres-backed rate limiting (Prompt 31, ADR-006's update); model-cost
and runaway-interaction safeguards (Prompt 32, ADR-024 — provider
timeouts/retry caps, a named 9-call-per-attempt structural ceiling, a
2000-char learner free-text cap); model-neutrality testing (Prompt 33,
ADR-025 — a live paired-answer adversarial suite); evaluation
instrumentation (Prompt 34, ADR-026, `docs/EVALUATION_PLAN.md`); and
this audit (Prompt 35), which found and fixed one real live-classifier
schema bug (over-strict `evidenceQuote` validation, surfaced by Prompt
34's added classifier call — see `SignalClassificationSchema` in
`practiceSchemas.ts` for the full reasoning), added one missing
component test (`EvidenceCard.svelte.spec.ts`), and corrected several
stale cross-references in `docs/ARCHITECTURE.md` (the hosting-adapter
and rate-limiting entries in Section 11 still described superseded
decisions).

**2. Test counts/status.** 371 tests, 370 passing. The one failure
(`SupabaseDataStore.spec.ts`) is a pre-existing, unrelated environment
artifact (the test expects unconfigured Supabase credentials; this
local checkout has real ones in `.env`) — not a Phase 2A defect.
`npm run check`, `npm run lint`, and `npm run build` all clean. Live
suites run against the real Supabase project and real DeepSeek API this
pass: the full RLS/adversarial suite (`tests/rls/*.spec.ts`), the full
playthrough integration test, and every live provider-integration
suite (tutor, classifier, neutrality, prompt-injection).

**3. Remaining known defects.** None rise to "straightforward, fix
now" — the one real code defect found this pass (the `evidenceQuote`
schema bug) was already fixed. Two component specs (`EvidenceCard`
newly added; six Phase 1 components still have none) is a coverage gap,
not a behavioral bug. `maxlength` on the five practice textareas has no
visual character-count feedback — a minor UX rough edge, not a defect.

**4. Remaining security/privacy limitations.** Two open governance
items, unchanged from Prompt 30 and still correctly left as **not
Chiron's to invent**: data retention policy, and applicable
student-data-privacy regulation (FERPA/COPPA/other) — see "Known
privacy/security debt" above. **One new finding this pass**: the
classifier's prompt-injection resistance has a measured, real gap — a
"fake embedded JSON result" attack succeeds roughly 1 in 5 tries
(9 live runs, 2 failures), because the attacker's own injected payload
literally contains the spoofed quote text the found-in-text check looks
for. Documented in `docs/SECURITY.md` Section 9 in full, including why
this pass didn't attempt a fix (needs a new heuristic with real
false-positive risk — exactly the new engineering this audit's own
"fix straightforward defects, don't expand scope" instruction says to
flag, not build).

**5. Unresolved educational-design issues.** Whether the tutor's fixed
ten-action vocabulary provides enough pedagogical variety across a
6-round case without feeling repetitive is untested by anything but
Prompt 33's neutrality suite (which checks fairness, not engagement).
Whether `COMMIT_UPDATE_CRITERION` ("what would change your mind?") is
intuitive to students who've never been asked that before a case even
starts. Whether five confidence bands and the 0-100 slider feel
meaningful to a student rather than arbitrary. None of these are
answerable from code review — they're exactly what Prompt 36's user
test is for.

**6. Approximate model calls per normal case.** The structural ceiling
(`MAX_MODEL_CALLS_PER_ATTEMPT`) is 9, but no canonical case actually
reaches it: all three have exactly 4 evidence items (not
`MAX_CHALLENGE_ROUNDS`'s ceiling of 6), so a normal completed
playthrough costs **4 tutor calls** + **2 classifier calls** (main
revised-reasoning signals, plus the Prompt 34 initial-reasoning
baseline) — **3 classifier calls** for `causal-inference-1`
specifically, which also uses the update-criterion mechanic. Normal
case total: **6-7 real LLM calls**, not 9.

**7. What should be tested with real users before any Phase 2B work.**
Exactly what `prompts.txt` Prompt 36 already scopes: whether the
challenge genuinely prompts reconsideration or feels like busywork;
whether the tutor ever reads as repetitive or as leaking which answer
is "right"; whether confidence percentages and the update-criterion
prompt are intuitive without explanation; whether students want to do
a second case unprompted. Prompt 34's instrumentation
(`docs/EVALUATION_PLAN.md`) is what turns that testing into real,
measurable behavioral data (signals added after challenge, judgment
shifts, completion/abandonment) rather than impressions alone.

See `prompts.txt` Prompts 20-35 for the full build sequence
`docs/PHASE2A_IMPLEMENTATION.md` maps onto, and Prompts 36-37 for the
real-user-testing gate before any Phase 2B scope expansion.

**Real-user-test preparation (Prompt 36, 2026-08-26):** `docs/USER_TEST.md`
— feedback instrument and behavioural indicators ready; no new runtime
feature was needed (the existing signup → `/practice` flow already
supports 5-20 external testers), aside from one small pure function
(`computeConfidenceShift`, `practiceEvaluation.ts`). Waiting on Prompt
37 until real tester data actually exists — do not run that analysis
early.

### LLM cross-model QA sweep (`prompt.txt`, 2026-09-21) — bug/neutrality QA, not a Prompt 37 substitute

`scripts/qa-cross-model-sweep.ts` (new, throwaway QA tooling, not wired
into the app): generates synthetic student transcripts against Chiron's
real FSM/`TutorProvider`/`ReasoningClassifierProvider` (DeepSeek, the
production vendor, ADR-008) across five personas × three canonical
cases, then has other vendors judge each transcript against a fixed
neutrality/injection/tone checklist. Full report:
`docs/qa/LLM_CROSS_CHECK_2026-09-21.md`. This does **not** change
Prompt 37's blocked status above — see that report's own opening
caveat for why an LLM-simulated student can't substitute for real
tester data.

First pass ran with DeepSeek + OpenAI only — `MISTRAL_API_KEY` was on
Mistral's free/trial "Studio" workspace tier and 429'd on every call,
including an isolated single request outside this script (confirmed
account/quota-level, not fixable by this script's own retry/backoff).
Re-run with all three vendors after the workspace was upgraded to a
paid tier — the report now reflects the full three-rotation design
(`prompt.txt` Step 1.5).

Headline finding: the measured prompt-injection success rate on the
fake-JSON-blob attack shape (`docs/SECURITY.md` Section 9) is **0/36
(0%) across the original attack plus three novel framings**, sampled
across all three generator vendors — down from Section 9's original
2/9 (~22%) sample — a real improvement,
though still a small sample and not itself a code change (nothing in
`classifierCore.ts` was touched; ADR-021's underlying defense is
unchanged). Everything else the checklist covers (correctness-signal
leakage, unrevealed-evidence references, challenge-intensity fairness,
labeling language) came back clean in the large majority of transcripts;
a minority of flagged items are real, minor tutor-phrasing repetition
worth a human read, not a security or neutrality defect — see the
report for the specific transcripts. The report also has a dedicated
"Judge disagreements" section (prompt.txt Step 2's "record both
verdicts, don't average or pick one" requirement) pairing up each
transcript's two judges and listing every item where they diverge.

Two methodology limitations found and now auto-documented by the
script itself on every run, not just noted by hand once: the LLM
judge's verdict on the "injection earned unwarranted credit" checklist
item, and separately on "evidenceQuote fairly represents student"
(found via a follow-up manual spot-check after the first fix), are
both unreliable on injection-attempt transcripts — the judge
pattern-matches on the literal spoofed word (e.g. "fabricated")
appearing anywhere in the transcript rather than checking the
actually-awarded signals. `scripts/qa-cross-model-sweep.ts` now
compares each item's judge fail-count against the deterministic
evidenceQuote check and auto-inserts a "Trust the deterministic table,
not the judge verdict" note into the report whenever the judge
over-counts — so a future run surfaces this itself instead of needing
another hand spot-check.

### Lesson CRUD, nav restructure, and a visual design pass (`prompt.txt`, 2026-09-22)

Four prompts (D1–D4), built in the order the prompt itself recommended:

- **D1 — duplicate-copy idempotency fix.** The `/examples` "Duplicate and
  try your own edit" action had no check for an existing copy, so
  clicking it twice silently created a second identical private lesson
  (reproduced live in production the same day, before the fix landed).
  Fixed at both the action layer (check-then-insert on
  `copied_from_lesson_id`, live-tested) and the load layer (the "you
  already have a copy" state now shows on a plain revisit, not just
  right after submitting). The two pre-existing production duplicate
  rows were left in place — confirmed identical, cleanup deliberately
  deferred, not forgotten.
- **D2 — lesson detail view, edit, delete.** New `/lessons/[id]` route:
  view a saved lesson's full text/score/skills/suggestions, owner-only
  edit-and-resubmit (a new `add_lesson_version` RPC, migration
  `0019_add_lesson_version.sql` — `save_lesson` only ever created brand
  -new lessons, ADR-007, so there was no prior "revise a lesson I
  already own" path), and delete with a confirm step (cascade delete
  already configured at the DB level). Live RLS tests
  (`tests/rls/lessonDetailAccess.spec.ts`) plus a real browser
  walkthrough — which caught one real bug no automated test found: the
  delete button's own `onclick` disabled it before the native form
  submit fired, silently swallowing every delete click; fixed via
  `use:enhance`.
- **D3 — nav restructure.** The old header was one flat seven-link row,
  confirmed wrapping below desktop width. New `SiteNav.svelte`: a
  trimmed header (wordmark + account menu), primary nav demoted to its
  own bar underneath (a bar, not a sidebar — every page is a centered
  `max-w-2xl` column with no sidebar chrome, and D3 came before D4's
  actual design-system pass), a single mobile hamburger collapsing both,
  `aria-current` active-page marking. No footer added — nothing real
  exists yet to put in one.
- **D4 — full visual design pass.** `docs/DESIGN.md`: a real color
  palette (teal/gold, sourced from the existing favicon, both validated
  CVD-safe via the dataviz skill's checker) and typography (Public Sans
  - Lora) applied app-wide, replacing bare Tailwind slate with no accent
    color; the three-pillar score/skills/suggestions block (used on `/`,
    `/examples`, `/lessons/[id]`) rebuilt from three separately-bordered
    stacked cards into one `ReportCard` with internal section dividers and
    a summary strip. Checked live at two real widths (390px/768px) via
    nested iframes against the dev server, including the practice case UI
    this doc already flagged for re-audit — held up, no changes needed
    there. Simpler routes (account/org, dashboard, library, login, signup,
    invites) share the already-confirmed-safe layout pattern and weren't
    individually screenshotted — a recorded scoping decision, not an
    oversight.

Full verification standard (`npm run check && npm run lint && npm test
&& npm run build`) green after each of the four; test count now 531,
530 passing (same pre-existing `SupabaseDataStore` environment artifact
as before, not a new defect).

### CI, privacy/terms, password reset, org member management (`prompt.txt`, 2026-09-22)

Four prompts (F1–F4), built in the order the prompt itself recommended
(F1 first so everything after lands through a real gate).

- **F1 — CI pipeline.** `.github/workflows/ci.yml`: a `fast` job (check,
  lint, test, build; no credentials — real signal for a fork PR too) on
  every push/PR, a `live` job (the RLS/adversarial and live-provider
  suites) gated to push-to-main + manual dispatch only, never
  `pull_request` (ADR-028 — cost and PR-spend-abuse risk). Found and
  fixed a real bug while wiring it: `checkRateLimit()`'s "fails open"
  promise was broken by a synchronous throw escaping its own
  `try`/`catch`. README badge added once `live` was confirmed green on
  a real run.
- **F2 — privacy/terms pages.** `/privacy` and `/terms`, content
  verified against the real codebase (what's collected, who processes
  it — DeepSeek, not Anthropic, per ADR-008 — what's logged), and
  deliberately silent on data retention and applicable regulation —
  both still open governance items, not this prompt's to invent. TODO
  -with-owner added below.
- **F3 — password reset.** `/forgot-password` + `/reset-password` via
  Supabase's `resetPasswordForEmail`/`updateUser`, reusing the root
  layout's existing `exchangeCodeForSession` handling rather than a
  second copy. The forgot-password action discards its result
  unconditionally so it can't leak whether an email is registered —
  proven deterministically (page.server.spec.ts) rather than against
  live, rate-limited email sending, which this project's own Supabase
  mailer hit during development.
- **F4 — org member management.** Three new admin-only actions
  (`removeMember`, `changeRole`, `leaveOrg`) backed by three new
  `SECURITY DEFINER` functions (`supabase/migrations/0020_org_member_
management.sql`) — `memberships` has no client-facing UPDATE/DELETE
  policy at all, so these follow `create_org`/`accept_org_invite`'s
  existing precedent rather than adding one (adding one would re-open
  the exact self-referencing RLS recursion ADR-010 already fixed once
  on this table). A single sole-admin guard blocks self-remove/
  self-demote/leave when it would zero out an org's admin count —
  "block," not "auto-promote," a real design choice recorded in
  ADR-029. 13 new live adversarial tests
  (`tests/rls/orgMemberManagement.spec.ts`), including a check that a
  removed member's org-shared lesson stays in the org's library
  (verified against how `lessons.owner_id`/`org_id` actually reference
  other tables, not assumed).

Full verification standard green after each of the four; live suites
run against the real Supabase project and real DeepSeek API. F1's
`live` CI job, and F2–F4's manual live-Supabase test runs, all
confirmed green — F4's UI additionally walked through live in a real
browser (promote/demote/remove, and the sole-admin-blocked state) using
a disposable fixture org, not the developer's own account.

### Classifier injection fix, reading-level fix, error monitoring, content moderation, "My lessons" usability, onboarding examples (`prompt.txt`, 2026-09-23)

Six prompts (G1–G6), in the priority order the prompt itself gave: G1/G2
first as substantive, previously-measured-but-unfixed gaps; G3/G4 next
as operational maturity; G5/G6 smaller, slotted in around them.

- **G1 — classifier injection fix.** Closes the gap the Phase 2A
  completion report and the LLM cross-model QA sweep (above) had only
  ever _measured_, not fixed: a "fake embedded JSON result" attack
  where the injected payload contains the spoofed `evidenceQuote` text
  the found-in-text check was looking for. `classifierCore.ts` adds
  `looksLikeInjectedPayload()`/`findSuspiciousSpans()`
  /`findBalancedJsonObjectSpans()`: an `evidenceQuote` is now rejected
  if _any_ of its occurrences falls inside a suspicious span (a JSON
  object, a code fence, or a paired bracket-tag region) — accept-if-ANY
  was tried first and rejected once testing against real payloads
  showed an attacker can just repeat the real quote outside the
  injected block to slip past an ANY-based check. `docs/SECURITY.md`
  Section 9 updated accordingly.
- **G2 — reading-level fix.** Closes the tutor-question-phrasing vs.
  case-reading-level gap the cross-model QA sweep surfaced.
  `buildSystemPrompt()` (`tutorPrompt.ts`) now takes a `targetGradeBand`
  and adds an explicit phrasing instruction; `docs/CASE_AUTHORING.md`
  Section 8 documents the reasoning and measured before/after
  Flesch-Kincaid grades for all three canonical cases.
- **G3 — error monitoring.** `@sentry/sveltekit` wired into both
  hooks, `sendDefaultPii: false`, no `tracesSampleRate`, explicit
  `dataCollection` opt-outs (`stackFrameVariables`, `genAI`, `cookies`,
  `httpHeaders`, `httpBodies`, `databaseQueryData`). One path to Sentry:
  `reportError()`/`reportRlsDenial()` (`errorReporting.ts`). Two real
  regressions found and fixed while wiring it: Sentry's
  `autoInstrument` broke tests that call `load` directly, and
  `@sentry/sveltekit`'s cold-import time blew a test timeout. New
  `docs/OPERATIONS.md`.
- **G4 — content moderation.** Chiron-level moderator capability for
  public-template lessons: `chiron_moderators`/`lesson_reports`/
  `moderation_actions` tables, `is_chiron_moderator()`/
  `unpublish_lesson()`/`resolve_lesson_report()` (migration
  `0021_content_moderation.sql`), a moderator-only `/admin/moderation`
  queue (404 for non-moderators, deliberately no nav link), and a
  Report action on `/library`. Found and fixed a real bug in
  `unpublish_lesson()` while building it: `UPDATE ... RETURNING ...
INTO` failed silently because the row's post-update state no longer
  passed the table's own SELECT policy — fixed by selecting the needed
  value in a separate statement before the update, while the row is
  still in its pre-update, policy-passing state (a new, general
  SECURITY DEFINER pitfall worth remembering alongside ADR-010's
  others).
- **G5 — "My lessons" usability.** Client-side search/filter on
  `/lessons`; a server-computed stale-rubric indicator (comparing a
  lesson's stored `prompt_version` against `SCORING_PROMPT_VERSION`)
  with a re-score link; new error-path test coverage for the 429/502
  re-scoring failure states on both `/` and `/lessons/[id]` (confirming
  existing behavior stays correct, not fixing a bug).
- **G6 — the last two onboarding examples.** Sourced and seeded
  `ela-argumentative-writing` (DocsTeach/National Archives Foundation's
  "How Effective Were the Efforts of the Freedmen's Bureau?", CC0) and
  `civics-current-events` (the National Archives' "The Constitution at
  Work: Middle School Edition" teacher guide, Public-Domain-US-Govt) —
  see "Onboarding-example content licensing" above for the full
  licensing account, including the candidates rejected along the way
  (Yale National Initiative, Colorado Municipal League — both all-
  rights-reserved; EDSITEment — inconsistent per-resource licensing and
  blocked automated fetch, deprioritized rather than formally rejected).

Full verification standard green after each of the six; live suites run
against the real Supabase project. G3's Sentry wiring and G4's
moderation queue were both walked through live in a real browser; G6's
seeding and duplication-preserves-attribution behavior were verified
live end to end using a disposable throwaway Supabase account (created
and deleted via the service-role key, never the developer's own
account). Test count after all six: **601 tests, 601 passing** — the
`SupabaseDataStore` environment-artifact failure noted in earlier
entries above no longer reproduces in this checkout.

## Explicitly deferred (not Phase 2A, no committed timeline)

- `prompts.txt` Prompt 37 (real-user-test analysis) — explicitly
  blocked on real tester data that doesn't exist yet; do not run it
  early. Prompt 36's instrumentation is ready and waiting.
- Phase 2B feature candidates (AI case generation, teacher-assigned
  missions, adaptive sequencing, a public case marketplace, etc.) —
  explicitly not ranked or scoped until Prompt 37's real-user-testing
  analysis recommends continuing past Phase 2A.
