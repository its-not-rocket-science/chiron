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
  live database (`tests/rls/orgIsolation.spec.ts`, 18 cases).
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

Verification standard for all of the above: `npm run check && npm run
lint && npm test && npm run build` green, plus the live adversarial RLS
suite and live prompt-injection suite run against the real Supabase
project / real DeepSeek API, not mocks — see `docs/SECURITY.md`.

## Current architecture (one-paragraph version)

Three layers: domain (`src/lib/domain/`, pure TypeScript, Zod is the
single source of truth for types), providers (`src/lib/providers/`,
`ScoringProvider`/`FileParserProvider` interfaces with swappable
implementations), app (`src/routes/`, SvelteKit). Scoring is the one
call path that goes through a domain function
(`scoreLesson()` → `ScoringProvider`); everything else that touches
Supabase is called directly from route code against `locals.supabase`,
with Postgres RLS as the actual isolation boundary rather than an
app-layer abstraction (ADR-014). Full detail: `docs/ARCHITECTURE.md`.

## Known technical debt

- `DataStore`/`SupabaseDataStore` exist but are unused by any route — a
  vestigial service-role connectivity check with its own spec test,
  nothing more (ADR-014). Candidate for deletion, or for becoming real
  if a second concrete implementation is ever actually needed; neither
  has happened yet, so it's been left alone rather than guessed at.
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

## Explicitly deferred (not Phase 2A, no committed timeline)

- Everything in `prompts.txt` Part 5 (P1-P6): few-shot scoring
  calibration, prompt/model versioning on stored scores, a structured
  4-field lesson input mode, script-swap suggestions, resubmission
  caching, and a teacher progress dashboard with an org benchmark.
  These are Phase 1 polish — independent of Phase 2, no dependency
  either direction, run whenever convenient.
- Phase 2B feature candidates (AI case generation, teacher-assigned
  missions, adaptive sequencing, a public case marketplace, etc.) —
  explicitly not ranked or scoped until Prompt 37's real-user-testing
  analysis recommends continuing past Phase 2A.
