# Phase 2A Implementation Plan

**Status: planning only. Nothing in this document is implemented.**
`prompts.txt` Prompt 19 — consolidates the design work in `docs/PHASE2.md`
(Prompts D, 15-18) into a concrete, buildable plan. This document is the
technical companion to `prompts.txt` Prompts 20-35, which realize it —
each section below names which prompt builds it. Where this document and
`docs/PHASE2.md` disagree on a detail, this document wins for _how to
build it_; `docs/PHASE2.md` remains the source of truth for _why_ each
design choice was made and the full type definitions.

## 0. What Phase 2A is (and isn't)

**One purpose:** prove the student interaction itself — case → judgment
→ Socratic challenge → evidence → revision → transparent feedback — is
educationally compelling, before any further scope expansion.

**In scope:** `PracticeCase` schema; three hand-authored canonical
cases; the server-side case FSM; student judgment + confidence; optional
update-criterion commitment; constrained Socratic challenge;
deterministic evidence reveal; revised judgment/confidence;
reasoning-signal classification; deterministic scoring-event
calculation; transparent end-of-case feedback; basic calibration data
storage; a polished mobile-first student case UI.

**Explicitly out of scope:** AI case generation (`CaseGenerationProvider`
— `docs/PHASE2.md` Section 5 — is Phase 2B, not built here); teacher-
generated missions; assignments; classrooms/student rosters; streaks,
badges, leaderboards, multiplayer, social features; adaptive
sequencing; a large content library; native mobile apps; a public case
marketplace.

**A consequence worth stating up front, not discovering mid-build:**
with case generation and teacher-authored missions both out of scope,
_every_ Phase 2A case is one of exactly three hand-authored, system-
seeded ones. No case-authoring UI, no per-org case visibility, no
user-generated case content exists in this phase. Section 1 below
leans on that directly.

## 1. Design decision: `practice_cases` is static data, not a table (new — ADR-019)

**This wasn't decided in `docs/PHASE2.md`; it's decided here, because
it only becomes the obviously-right call once Phase 2A's actual scope
(three fixed, hand-authored cases, no generation, no per-org sharing)
is pinned down.**

Store the three canonical cases as static, Zod-validated TypeScript
data (`src/lib/domain/practiceCases.ts`), the same way Phase 1 stores
`SubjectProfile`s (ADR-003) — not a `practice_cases` database table.

**Why:** `docs/PHASE2.md` Section 2's `answerSpec` (targetRange,
`reasoningRubric`, every rule's `requiredSignals`/`minimumRequired`)
and the full `evidencePool` (including not-yet-revealed items) must
never reach the client before they're supposed to — Section 2's own
"authored scoring metadata never reaches the client before completion"
guardrail. If `practice_cases` were a database table, satisfying that
requires the same kind of secrecy-view split ADR-012 built for
`profiles`/`profiles_public` (`answer_spec`/full `evidence_pool` never
selectable by `authenticated`, only via server-only access), which is
real, fiddly RLS surface to get right and test. Static server-side
module data sidesteps the problem structurally: it isn't queryable via
PostgREST at all, so there's no RLS policy to get wrong — the only
discipline required is the same one Phase 1 already follows everywhere
(never `return` a secret from a `load` function or API response), not
a new database-secrecy mechanism.

**Precedent this follows exactly:** `lessons.subject_profile_id`
already stores a plain slug validated against `subjectProfiles.ts`,
not a foreign key into a `subject_profiles` table (ADR-003). Phase 2A's
`practice_sessions.case_id` / `practice_attempts.case_id` do the same:
a slug string, validated in application code against the known static
case-id set, not FK'd to a nonexistent table.

**What this simplifies, concretely:** no `practice_cases` migration, no
`practice_cases_public` view, no case-level RLS policy at all — the
trickiest secrecy problem in this whole design disappears rather than
needing to be solved. `practice_sessions` and `practice_attempts` still
need real tables (per-student, growing, cross-request state) — this
decision applies only to the authored case _content_.

**Revisit when:** Phase 2B actually needs `CaseGenerationProvider` or
teacher-authored/org-shared cases — at that point this becomes a real
table with the `profiles_public`-style split, same as ADR-003 says for
`SubjectProfile`.

## 2. Modules to add

**Domain layer** (`src/lib/domain/`, pure TypeScript — no framework,
provider, or database-client imports, per `docs/ARCHITECTURE.md`
Section 1):

| Module                          | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Built in  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `practiceSchemas.ts`            | Every Zod schema from `docs/PHASE2.md` Section 2/3/4: `EvidenceSupportJudgmentSchema`, `ResponseModeSchema`, `EvidenceItemSchema`, `ReasoningRuleSchema`, `ReasoningRubricSchema`, `CreditableAnswerSpecSchema`, `UpdateCriterionSchema`, `PracticeCaseSchema`, `SignalClassificationSchema`, `ScoringExplanationSchema`, `PracticeAttemptSchema`, `PracticeSessionSchema` — plus inferred types. Kept separate from Phase 1's `schemas.ts` (which is already substantial) rather than appended to it — a deliberate split, documented here per Section 1's own instruction to document the reason if splitting.                                           | Prompt 20 |
| `practiceCases.ts`              | The three hand-authored `PracticeCase` objects (Section 3 below), plus `getPracticeCase(id)` and `listPracticeCasesPublic()` — the latter strips `evidencePool`/`answerSpec`/`updateCriteria` down to the client-safe fields, mirroring `subjectProfiles.ts`'s `getSubjectProfile()` lookup pattern.                                                                                                                                                                                                                                                                                                                                                       | Prompt 21 |
| `practiceFsm.ts`                | Pure state-transition logic: given current FSM state + case + session data + student input, computes the next state and what (if anything) gets revealed. No I/O, no provider calls — those are injected by the caller (the route handler). Exhaustively unit-testable without a live LLM. Also hosts `computeOutcome(revisedJudgment, detectedSignals, reasoningRubric) → ScoringExplanation` — originally planned as a separate `reasoningRubricScoring.ts` module, absorbed here in Prompt 22 instead because `SCORE_AND_RECORD` needed a real `ScoringExplanation` to be end-to-end testable immediately (see the comment on `computeOutcome` itself). | Prompt 22 |
| `scoringEvents.ts`              | `computeScoringEvents(attemptId, stage, rubric, matchedRuleId, detectedSignals) → ScoringEvent[]` — the itemized, per-signal/per-rule audit trail: one inspectable event per demonstrated reasoning move, each with a skill mapping and a human-readable (statically authored, never LLM-generated) explanation. Pure and deterministic; credit-only (`moves_goalposts_after_evidence` is structurally excluded from ever producing an event).                                                                                                                                                                                                             | Prompt 25 |
| `updateCriterionConsistency.ts` | `computeUpdateCriterionConsistency(...) → { status, explanation, ... }` — the five-status deterministic "what would change your mind?" consistency check (`docs/PHASE2.md` Section 3, ADR-022), plus `deriveUpdateCriterionSignals()` mapping a status to mechanic-level credit. Pure; no "moved goalposts" status by design (conservative per Prompt 26).                                                                                                                                                                                                                                                                                                 | Prompt 26 |
| `practiceCalibration.ts`        | `computeCalibrationReport(points) → { eligibleAttemptCount, brierScore, bands }` — Brier score + five confidence-band reliability buckets (`docs/CALIBRATION.md`, ADR-023), computed against `judgmentWithinTargetRange` (not the rubric-credit `outcome`), sample-size-gated to `null` below `MIN_SAMPLE_SIZE`. No per-skill breakdown (deferred, see `docs/CALIBRATION.md`'s "what this does not yet do").                                                                                                                                                                                                                                               | Prompt 27 |

**Provider layer** (`src/lib/providers/`), following `ScoringProvider`'s
established shape (interface + vendor-agnostic prompt/core modules +
vendor implementation):

| Module                                      | Contents                                                                                                                                                                                                                           | Built in  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `TutorProvider.ts`                          | Interface: `classifyJudgment`, `selectAndPhraseChallenge` (`docs/PHASE2.md` Section 6).                                                                                                                                            | Prompt 24 |
| `tutorPrompt.ts` / `tutorCore.ts`           | Vendor-agnostic prompt construction + retry/validate, mirroring `scoringPrompt.ts`/`llmScoringCore.ts`'s split.                                                                                                                    | Prompt 24 |
| `DeepSeekTutorProvider.ts`                  | Default implementation (ADR-008), lazy client construction (same pattern as `DeepSeekScoringProvider`).                                                                                                                            | Prompt 24 |
| `ReasoningClassifierProvider.ts`            | Interface: `classifySignals(freeText, candidateSignals, revealedContext) → SignalClassification[]`. Candidate signals come from either Section 1a's cross-case vocabulary or a case's own `updateCriteria` set, per the call site. | Prompt 23 |
| `classifierPrompt.ts` / `classifierCore.ts` | Vendor-agnostic prompt + retry/validate, including the `evidenceQuote`-must-be-found-verbatim check (`docs/PHASE2.md` Section 1a).                                                                                                 | Prompt 23 |
| `DeepSeekReasoningClassifierProvider.ts`    | Default implementation.                                                                                                                                                                                                            | Prompt 23 |

Both new provider families need their own live prompt-injection
adversarial test suite before shipping (`describe.skipIf(!hasApiKey)`,
same pattern as `DeepSeekScoringProvider.integration.spec.ts`) — see
Section 6 (test layers) below.

**App layer** (`src/routes/`, `src/lib/components/`) — Section 5.

## 3. The three canonical cases

Authored per `prompts.txt` Prompt 21's brief, validated against
`PracticeCaseSchema`:

1. **Causal inference** — an intervention followed by an apparent
   improvement; evidence gradually reveals a before/after association,
   a plausible confounder, comparison/control data, remaining
   uncertainty. Uses `usesUpdateCriterion: true` (control-group
   comparison is a natural, checkable decisive-evidence moment).
2. **Relative vs. absolute risk** — a claim reports an impressive
   relative change; evidence reveals numerator, denominator, baseline
   risk, absolute effect.
3. **Source provenance** — a widely-reported claim traces back to one
   upstream source; evidence reveals the common origin, secondary
   repetition, the original source's limitations.

Each case: avoids a trick-question structure, includes a genuinely
plausible alternative reasoning path, allows real uncertainty where
the evidence warrants it (a non-trivial `reasoningRubric` rule whose
`acceptedJudgments` includes `'uncertain'`), includes educator notes
that are part of the static object but are stripped by
`listPracticeCasesPublic()`/never returned by any route — same
discipline that keeps `answerSpec` itself out of client reach.

## 4. Tables to add

Only two table groups need real persistence — everything else is
static data (Section 1) or computed from these tables:

**`practice_sessions`** (one row per in-progress attempt —
`docs/PHASE2.md` Section 3's "Resumable sessions"):

- `id`, `student_id → profiles(id)`, `case_id` (plain string, validated
  in application code against `practiceCases.ts`'s known ids — no FK,
  same reasoning as `lessons.subject_profile_id`)
- `fsm_state` (one of Section 5's state names)
- `revealed_evidence_ids` (jsonb array of evidence item ids revealed so
  far — what `tutorCore.ts`'s "allowed source text" for its
  no-invented-facts check is built from)
- `transcript` (jsonb array of challenge/response pairs)
- `initial_judgment`, `initial_confidence`
- `update_criterion_text` (nullable — only for `usesUpdateCriterion`
  cases, captured before evidence reveal per Section 3's ordering)
- `created_at`, `updated_at`

**`practice_attempts`** (one row per completed attempt —
`docs/PHASE2.md` Section 4):

- `id`, `student_id → profiles(id)`, `case_id`,
  `session_id → practice_sessions(id)` (kept, not deleted, once
  scoring completes — the session row is the full inspectable
  transcript; the attempt row is the clean, indexable outcome record)
- `initial_judgment`, `initial_confidence`, `revised_judgment`,
  `revised_confidence`
- `update_criterion` (jsonb: `{ text, classification } | null`)
- `scoring_explanation` (jsonb: `{ detectedSignals, matchedRuleId,
outcome }` — Section 4's full record)
- `scoring_events` (jsonb array of `ScoringEvent` — `scoringEvents.ts`'s
  itemized audit trail, `prompts.txt` Prompt 25; added by migration
  `0010`, not part of the original `0009`)
- `outcome` (plain text column, denormalized from
  `scoring_explanation.outcome` — calibration aggregate queries need to
  filter/group by outcome cheaply, without parsing jsonb per row)
- `created_at`

**`disposition_checkins`** (optional per `docs/PHASE2.md` Section 2/5 —
included since it's low-cost and already named there):

- `id`, `student_id → profiles(id)`, `attempt_id → practice_attempts(id)`,
  `disposition_item` (text — the `dispositionClusters[].items[]` string
  it corresponds to; static data, not FK'd, same reasoning as case ids),
  `response` (small int, Likert scale), `created_at`

No table needs a `SECURITY DEFINER` cross-table helper (ADR-010) —
every RLS check here is a direct `student_id = auth.uid()` ownership
check, no join required. This is a simpler RLS story than Phase 1's
org-shared-lesson visibility, a direct consequence of Section 1's
static-case-data decision (no case-level visibility logic to reconcile
against).

## 5. RLS principles

**Revised (ADR-020) — see that ADR for the full reasoning.** The
original version of this section proposed owner-scoped
`student_id = auth.uid()` INSERT/UPDATE policies for all three tables.
That's correct for _read_ isolation but insufficient for _writes_:
ownership alone doesn't validate that a write is the genuine output of
a real FSM playthrough, only that the right person is making it — found
by thinking through this section's own item 5 ("jump directly to
completion") before writing that test, not after it caught something.

1. **`practice_sessions`**: `authenticated` gets SELECT only
   (`student_id = auth.uid()`). No INSERT/UPDATE/DELETE policy exists
   for `authenticated` at all — every write goes through the
   service-role client (`src/lib/server/serviceRoleClient.ts`), used
   only by the transition route, only after `advance()` has actually
   run. No org-sharing, no teacher access, matching `docs/PHASE2.md`
   Section 7's conservative default.
2. **`practice_attempts`**: same shape — SELECT only for
   `authenticated`; INSERT is service-role-only, after
   `computeOutcome()` has run. Immutable once written either way — no
   UPDATE/DELETE policy for anyone.
3. **`disposition_checkins`**: same pattern again.
4. **The real secrecy boundary — `answerSpec` and unrevealed
   `evidencePool` items — is enforced by Section 1's static-data
   decision, not by RLS.** No database policy needs to hide these
   fields because they're never in the database. What still needs
   discipline: the FSM-transition route handler (Section 5) must never
   `return`/serialize the full case object, `answerSpec`, or unrevealed
   evidence items in any response — reviewed the same way Phase 1's
   secret-handling was (`docs/SECURITY.md` Section 5: grep routes for
   what they return, never rely on the client to not look).
5. **Live adversarial tests required before shipping** — a new
   `tests/rls/practiceIsolation.spec.ts`, same pattern as
   `tests/rls/orgIsolation.spec.ts`, proving at minimum: student A
   cannot read student B's session or attempt row, even via a direct
   REST call with a valid session; student A cannot write to their
   _own_ session or attempt row via a direct REST call at all (not
   just "can't write someone else's" — per ADR-020, nobody but the
   service role can); a direct client attempt to jump a session's
   `fsm_state` straight to `COMPLETE`, or to insert a fabricated
   `practice_attempts` row with a self-selected favorable outcome, is
   rejected outright rather than merely producing a wrong-but-accepted
   row; the transition endpoint never returns an unrevealed evidence
   item or any `answerSpec` field, checked by inspecting the actual
   response payload at every FSM state, not just the happy path.

## 6. APIs/routes

Following `docs/ARCHITECTURE.md` Section 6's established split (plain
reads via `load` functions; JSON `+server.ts` endpoints only for the
genuinely reusable/interactive machinery):

- **`/practice`** (`+page.server.ts` `load`) — lists the three cases via
  `listPracticeCasesPublic()`. No database read at all for this page.
- **`/practice/[caseId]`** (`+page.svelte` + a `load` that resolves the
  case's public view, 404s on an unknown id) — the case-attempt UI
  (Section 8). Drives the FSM by calling the two endpoints below.
- **`POST /api/practice/sessions`** — starts a session for a given
  `caseId` (validated against the static id set); creates the
  `practice_sessions` row in the initial state. Rate-limited (ADR-006
  pattern), even though this specific call doesn't hit an LLM — it's a
  reachable authenticated endpoint that gates the LLM-calling one.
- **`POST /api/practice/sessions/:id/transition`** — the single
  FSM-advance endpoint. Reads the session, resolves the full case from
  static data (server-only import — never reaches the client), calls
  `practiceFsm.ts`'s pure transition logic, invokes `TutorProvider`/
  `ReasoningClassifierProvider` as the state requires, persists the
  updated session (or writes the final `practice_attempts` +
  `disposition_checkins` rows on reaching `SCORE_AND_RECORD`), and
  returns only the client-safe next-state payload. One endpoint driving
  the whole loop, not one route per FSM state — the same "one endpoint
  for the whole interactive loop" shape `POST /api/lessons/score`
  already established for Phase 1 (ADR-007), for the same reason
  (principle 15's small-vertical-slice preference over route
  proliferation). Rate-limited (ADR-006 pattern) — this is where real
  LLM spend happens.

No `GET /api/practice/attempts` or history/dashboard route in Phase 2A
— "transparent end-of-case feedback" (Section 9) is shown at the end of
the same session, not via a separate history view, and a calibration
dashboard isn't in Prompt 19's explicit UI scope. A personal calibration
summary is a reasonable fast-follow, not required for Phase 2A.

## 7. Provider interfaces

Already named and scoped in `docs/PHASE2.md` Section 6 — restated here
as the concrete build list:

- **`TutorProvider`**: `classifyJudgment(freeText) → { judgment,
confidence? }` (not yet implemented — no route calls it, see
  `TutorProvider.ts`); `selectAndPhraseChallenge(transcript,
revealedEvidence, learnerJudgment, learnerConfidence,
learnerReasoning, targetSkillTags) → { action, questionText }` — never
  given `answerSpec`, hidden evidence, or scoring rules (Section 3's
  non-negotiable invariant; real implementation is `prompts.txt`
  Prompt 24, ADR-021).
- **`ReasoningClassifierProvider`**: `classifySignals(freeText,
candidateSignals, revealedContext) → SignalClassification[]` — the
  candidate-signal set is either Section 1a's cross-case vocabulary
  (general reasoning classification) or a case's own `updateCriteria`
  set (the `COMMIT_UPDATE_CRITERION` classification), scoped per call
  site, never the answer key.

Both: DeepSeek as the default implementation (ADR-008), the same lazy-
client-construction pattern as `DeepSeekScoringProvider`, and their own
adversarial test suite before shipping (Section 9).

## 8. FSM states

The exact list from `docs/PHASE2.md` Section 3, to implement in
`practiceFsm.ts`:

`PRESENT_SCENARIO` → `ASK_INITIAL_JUDGMENT` → `ASK_CONFIDENCE` →
(`COMMIT_UPDATE_CRITERION` — only when `case.usesUpdateCriterion`) →
`PRESENT_CHALLENGE` ⇄ `AWAIT_STUDENT_RESPONSE` ⇄ `PRESENT_NEW_EVIDENCE`
(looped, bounded by `maxRounds`) → `ASK_REVISED_JUDGMENT` →
`ASK_REFLECTION` → `SCORE_AND_RECORD` → `DISPOSITION_SELF_CHECK` → `END`.

Every transition validated server-side (`docs/PHASE2.md` Section 3's
invariants): future evidence and `answerSpec` never sent early; the LLM
cannot skip states or choose which evidence becomes revealed; an
invalid/out-of-order transition attempt fails safely (rejected, not
silently corrected).

## 9. Test layers

Mirroring `docs/ARCHITECTURE.md` Section 8's established layering:

1. **Unit (Vitest), no LLM needed**: `practiceFsm.ts`'s pure transition
   function (every state, every branch, including invalid/out-of-order
   transitions); `reasoningRubricScoring.ts`'s outcome algorithm,
   exhaustively — canned `SignalClassification` arrays against
   authored rubrics, including multi-rule cases and the "no rule
   matches" path; `practiceCalibration.ts`'s Brier score/bucket math.
2. **Schema validation tests**: the three canonical cases parse against
   `PracticeCaseSchema` (valid); deliberately malformed variants
   rejected (duplicate `revealOrder`, invalid confidence, impossible
   reasoning rules, a `requiredSignals` entry with no matching
   candidate); a classifier response whose `evidenceQuote` isn't found
   in the source text rejected/retried; a tutor `questionText`
   introducing a number absent from the scenario/claim/revealed evidence
   rejected/retried (`tutorCore.spec.ts`).
3. **Component/browser tests** (`vitest-browser-svelte`, real
   Playwright/chromium — Phase 1's established choice, not jsdom): the
   full attempt flow for at least one canonical case — judgment input,
   confidence, challenge/response exchange, evidence reveal rendering,
   revision, end-of-case feedback — plus the mobile-viewport check
   Section 10 calls for.
4. **Live adversarial RLS tests**
   (`tests/rls/practiceIsolation.spec.ts`) — Section 5, item 5.
5. **Live prompt-injection adversarial tests** for `TutorProvider` and
   `ReasoningClassifierProvider` (new `*.integration.spec.ts` files,
   `describe.skipIf(!hasApiKey)`, mirroring
   `DeepSeekScoringProvider.integration.spec.ts`'s three-attack-shape
   pattern): a student's free-text response trying to inject a fake
   evidence item, a fake signal, an instruction to reveal `answerSpec`,
   or a format-break — the tutor/classifier must stay within its
   schema-validated output shape or fail cleanly, never leak the
   answer key or fabricate evidence.
6. **Full-loop integration test per canonical case**, using a mock
   `TutorProvider`/`ReasoningClassifierProvider` (deterministic, no live
   API calls, CI-safe) — a scripted "ideal" attempt through the real
   FSM + `reasoningRubricScoring.ts` reaches the expected outcome
   end-to-end. This is only possible because scoring is fully
   deterministic (Section 1a/ADR-018) — nothing here needs to be
   probabilistic or live-gated.

## 10. Mobile-first UI

New `src/lib/components/practice/` (a subdirectory — Phase 1's
`components/` is flat, but this is a large enough distinct surface to
warrant separation, same reasoning as splitting `practiceSchemas.ts`
out of `schemas.ts`):

`CaseIntro.svelte`, `JudgmentInput.svelte` (the five-level scale),
`ConfidenceSlider.svelte`, `UpdateCriterionPrompt.svelte` (conditional),
`ChallengeExchange.svelte`, `EvidenceCard.svelte` (visually distinct
from claims; newly revealed evidence clearly marked), `ReflectionInput.svelte`,
`EndOfCaseFeedback.svelte` (Section 11), `DispositionCheckin.svelte`.

UX principles from `docs/PHASE2.md`'s own design intent, made explicit
as build requirements: one cognitive task per screen; previous judgment
visible during revision; confidence change visible; no red/green
test-taking framing during the reasoning process itself; `'uncertain'`
presented as a legitimate choice, not a lesser one; scores/outcome
never shown before the case completes; accessible keyboard navigation
and screen-reader labels; mobile-viewport tested, not just
responsive-by-assumption.

## 11. Transparent end-of-case feedback

Built from `scoringExplanation` (Section 4) — never a bare "you got
this right/wrong":

- The student's own reasoning path (initial → revised judgment/
  confidence, key stated reasons, the update criterion if used).
- Evidence that mattered — only evidence actually revealed this
  attempt.
- Reasoning moves detected — the `explanation` text from whichever
  `reasoningRubric` rule matched (or, if none did, the
  `partialCreditSignals` that were detected anyway) — every displayed
  claim traces to a stored `SignalClassification`, never generic advice.
- What the evidence does and doesn't establish, and why more than one
  final judgment may have been defensible, when `targetRange`/multiple
  rules say so.

No numeric "73% critical thinking," no moralizing, no personality or
bias labels — `docs/PHASE2.md` Section 3's register guidance for
`moves_goalposts_after_evidence` ("your criterion said X would matter;
it didn't happen") is the model for this whole surface, not just that
one signal.

## 12. Migration sequence

Two tables need migrations (Section 4) — practice_cases does not
(Section 1). Dependency order: `practice_sessions` has no FK
dependency on anything new; `practice_attempts` FKs to
`practice_sessions`; `disposition_checkins` FKs to `practice_attempts`.

- **0008** — `practice_sessions` + owner-only RLS.
- **0009** — `practice_attempts` + `disposition_checkins` + owner-only
  RLS for both.
- **0010** — adds `practice_attempts.scoring_events` (`prompts.txt`
  Prompt 25, `scoringEvents.ts`'s output) — not part of the original
  `0009`, since the itemized event system didn't exist yet when that
  migration was written. A new migration rather than an edit to `0009`,
  since `0009` may already be deployed.

**Expect this sequence to grow, the same way Phase 1's did.**
ADR-010's whole point is that RLS correctness surfaces from live
adversarial testing, not from reading the SQL — 0002/0003/0005 exist
because Phase 1's first attempt had real, non-obvious bugs. `0010` is
itself an instance of that pattern, just for a schema gap (a missing
column) rather than an RLS bug. Don't assume the two-table,
ownership-only design is immune to further growth (it's simpler than
Phase 1's case, but "simpler" isn't "exempt from testing").

## 13. Milestone order

Maps directly onto `prompts.txt` Prompts 20-29 (build) and 30-35
(hardening), in order — this plan doesn't invent a different sequence,
it fills in the technical detail each of those prompts needs:

1. **Domain schema** (Prompt 20) — `practiceSchemas.ts`, thorough
   validation tests, no UI, no persistence yet.
2. **Three canonical cases** (Prompt 21) — `practiceCases.ts`, schema-
   validated, no runtime engine yet.
3. **Server-side FSM + persistence** (Prompt 22) — `practiceFsm.ts`,
   the two tables/migrations, the two routes — provable end-to-end with
   a mock `TutorProvider`/`ReasoningClassifierProvider` before any real
   LLM spend, same "prove the vertical slice cheaply first" discipline
   Phase 1 used (Prompts 1-7 before accounts/hardening).
4. **`ReasoningClassifierProvider`** (Prompt 23) — real implementation
   - adversarial tests.
5. **`TutorProvider`** (Prompt 24) — real implementation + adversarial
   tests.
6. **Deterministic scoring wired end-to-end** (Prompt 25) —
   `scoringEvents.ts` connected to the real FSM output.
7. **Update-criterion consistency checking** (Prompt 26) — the FSM
   state and data capture are already in place by milestone 3; this
   is specifically the deferred deterministic consistency algorithm
   `docs/PHASE2.md` Section 3 flagged. If time-constrained, capturing
   the data without the full consistency-driven feedback copy is an
   acceptable partial state for Phase 2A's first real-user test — say
   so explicitly rather than quietly shipping a half-built feature as
   if it were complete.
8. **Calibration storage** (Prompt 27) — `practiceCalibration.ts`
   computes over real `practice_attempts` data (already-stored
   `revisedJudgment` + the case's static `targetRange` — no new column
   needed). No route/UI wired yet — that's Prompt 28/29's job.
9. **Student case UI** (Prompt 28) — Section 10's components, full flow
   for all three cases.
10. **End-of-case feedback** (Prompt 29) — Section 11.
11. **Hardening** (Prompts 30-33) — Phase-2A-specific security/privacy
    review (student data, hidden-evidence extraction attempts — Section
    5 item 5 is the starting point, not the finish line), rate-limit
    extension to the two new endpoints, cost/runaway-interaction caps,
    the neutrality test suite proving the tutor doesn't punish
    disagreement.
12. **Full audit and stop point** (Prompt 35) — before `prompts.txt`
    Prompts 36-37's real-user-testing gate. No further scope expansion
    until that gate is passed.
