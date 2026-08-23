# Phase 2 Planning: Student Practice Mode

**Status: planning only. Nothing in this document is implemented.** No
tables, providers, routes, or tests exist for any of this yet. This is
Prompt 12 of `scope-and prompts.txt` — scoped now, while the Phase 1
architecture is fresh, so Phase 2 builds on Chiron's existing patterns
instead of reinventing them.

Phase 1 is teacher-facing: a teacher submits a lesson, Chiron scores it
against the three-pillar rubric and six-skill taxonomy, and suggests
revisions. Phase 2 turns Chiron toward the student: short, skill-tagged
practice exercises ("missions") built on authentic scenarios, run through
a Socratic tutor that makes students commit to a judgment, state their
confidence, defend it against challenge, and revise it in light of new
evidence — with their confidence calibration tracked over time.

This document merges two source ideas the original scope drafts kept
separate: a lighter "missions" framing (short, gamified, disposition-
aware exercises) and a more rigorous Socratic-tutor engine (a
constrained state machine, not a chatbot, with deterministic scoring and
calibration tracking). The resolution proposed here is that these are
not two phases — they're two layers. A **mission** is the content/UX
envelope a student sees (title, scenario, skill tags, disposition
self-check). The **tutor state machine** is the engine that runs inside
a mission whenever it involves judgment-under-uncertainty. Simpler
mission types (a straight comprehension check, say) wouldn't need the
full loop; the flagship mission type — the one this document designs in
depth — does.

## 1. Design invariants carried over from Phase 1

These aren't new decisions; they're Phase 1 principles (see
`docs/ARCHITECTURE.md` Section 3 and `docs/DECISIONS.md` ADR-010) that
Phase 2 must inherit rather than re-litigate:

- **Deterministic/LLM split.** Anything that determines a score or
  grade must be deterministic and inspectable. The LLM's job is
  constrained interpretation of free text and natural-language
  phrasing — never the source of truth for correctness. This is exactly
  the split `scoringPrompt.ts` / `llmScoringCore.ts` already enforce for
  lesson scoring; Phase 2 needs the same split for judgment
  classification and tutor question selection.
- **Provider independence.** New LLM-backed behavior goes behind a new
  interface (`TutorProvider`, `CaseGenerationProvider` — see Section 6),
  mirroring `ScoringProvider`. No route or domain code calls DeepSeek or
  Anthropic SDKs directly.
- **RLS as the isolation mechanism, not an afterthought.** Any new table
  needs its access policy designed alongside the schema, using the same
  `SECURITY DEFINER` helper-function pattern ADR-010 established for
  cross-table checks — not bolted on after a recursion or
  `RETURNING`-vs-self-reference bug is found the hard way again.
  `is_lesson_owner()`, `owns_score()`, and friends are proof this class
  of bug is real and repeats; new tables should get their own named
  helpers up front (e.g. `owns_practice_attempt()`).
- **Zod as the single source of truth for domain shape.** New Phase 2
  types belong in `src/lib/domain/schemas.ts` following the same
  `Schema` → inferred `type` re-export pattern already used for
  `ConfidenceSchema`, `PillarIdSchema`, etc.
- **Reuse the taxonomy, don't fork it.** `src/lib/domain/taxonomy.ts`
  already defines `CTSkillId` (six skills) and `DispositionClusterId`
  (`approach_to_problem` / `approach_to_inquiry`, with `.items[]`) —
  Phase 1 built the disposition data but has no consumer for it yet.
  Phase 2 is that consumer. No new skill or disposition vocabulary
  should be invented; case tags and disposition self-checks reference
  these ids directly.
- **No invented facts.** Phase 1's prompt-injection defense (ADR-010's
  sibling security work, `docs/SECURITY.md` Section 4) established that
  the model must never be trusted to introduce claims the system didn't
  provide. Phase 2's tutor has an even sharper version of this
  requirement: it must never introduce evidence that isn't in the
  case's authored evidence pool. This is a hard architectural
  constraint, not a prompt-wording nicety — see Section 3.

## 2. Case-content schema

The authored content unit is a **PracticeCase**. A case is scenario +
claim + a fixed, ordered pool of evidence + an answer key that treats
"not enough evidence to know" as a legitimate first-class answer, not a
fallback.

```ts
// src/lib/domain/schemas.ts (proposed additions)

const JudgmentSchema = z.enum(['true', 'false', 'unknown']);
type Judgment = z.infer<typeof JudgmentSchema>;

const EvidenceItemSchema = z.object({
	id: IdSchema, // reuse existing id helper
	text: z.string().min(1),
	// Evidence is revealed in stages, driven by the tutor FSM (Section 3),
	// never chosen or invented by the LLM at runtime.
	revealOrder: z.number().int().min(0),
	stance: z.enum(['supports_claim', 'supports_counter_claim', 'ambiguous'])
});

const CreditableAnswerSpecSchema = z.object({
	correctJudgment: JudgmentSchema,
	rationale: z.string().min(1), // used to generate reflection-stage feedback
	// When true, a student who lands on "unknown" with reasoning that
	// correctly identifies *why* the evidence is insufficient is fully
	// creditable even though a definitive correctJudgment exists — e.g. a
	// case whose "correct" answer is knowable in principle but not from
	// the evidence actually revealed at this student's evidence-reveal
	// depth. See Section 4 for how this interacts with calibration.
	unknownIsCreditableIfReasoned: z.boolean()
});

const PracticeCaseSchema = z.object({
	id: IdSchema,
	title: z.string().min(1),
	subjectProfileId: SubjectProfileIdSchema, // reuses Phase 1 type directly
	skillTags: z.array(CTSkillIdSchema).min(1), // reuses taxonomy.ts CTSkillId
	dispositionTags: z.array(DispositionClusterIdSchema).min(1),
	difficulty: z.enum(['intro', 'core', 'stretch']),
	scenario: z.string().min(1), // authentic, situated framing — not an abstract logic puzzle
	claim: z.string().min(1), // the central claim/question a student judges
	evidencePool: z.array(EvidenceItemSchema).min(1),
	answerSpec: CreditableAnswerSpecSchema,
	// Present only for cases generated from a Phase 1 lesson (Section 5).
	// Absent for hand-authored or system-seeded cases.
	sourceLessonVersionId: IdSchema.optional(),
	visibility: z.enum(['private', 'org-shared', 'public-template']), // mirrors lessons.visibility
	createdBy: z.enum(['system', 'teacher-generated'])
});
```

Two deliberate choices worth flagging:

- `evidencePool` is authored once, up front, and is closed — the tutor
  can only ever _reveal_ items from this list in `revealOrder`; it can
  never write new ones. This is what makes "never invents new evidence"
  enforceable in code rather than just in a system prompt.
- `answerSpec.correctJudgment` supports `'unknown'` as a value, not just
  `'true' | 'false'`. Some cases should be authored so that the honestly
  correct answer, even with all evidence revealed, is "we don't know" —
  the taxonomy's inference sub-skill "generating alternative
  explanations before settling on one" and self-regulation's "checking
  your own reasoning for errors" are specifically about resisting
  premature closure, and a case bank that always has a knowable answer
  can't exercise that.

A **disposition self-check** is separate from the graded case — a short
Likert-style self-report shown after a mission, tied to specific
`dispositionClusters[].items[]` strings (e.g. "How willing were you to
revise your view when the new evidence came in?" mapped to "Willingness
to revise a view when reflection warrants it"). This is self-report, not
graded — it feeds the calibration/reflection picture (Section 4) but
never affects a correctness score.

## 3. Tutor state machine

The tutor is a constrained pedagogical FSM, not an open-ended chat
agent. At every state, the LLM's role is narrow: classify the student's
last free-text response, and phrase the _next_ templated action
naturally. It never chooses to skip states, never decides case
correctness, and never introduces evidence outside `evidencePool`.

```
PRESENT_SCENARIO
  → ASK_INITIAL_JUDGMENT

ASK_INITIAL_JUDGMENT
  (student submits: judgment ∈ {true,false,unknown} + free-text reasoning)
  → ASK_CONFIDENCE

ASK_CONFIDENCE
  (student submits: confidence 0-100%)
  → PRESENT_CHALLENGE

PRESENT_CHALLENGE
  (tutor picks ONE action from the fixed vocabulary below, targeting a
   specific gap in the student's stated reasoning)
  → AWAIT_STUDENT_RESPONSE

AWAIT_STUDENT_RESPONSE
  (student responds in free text)
  → if evidencePool has unrevealed items AND challengeRound < maxRounds:
      → PRESENT_NEW_EVIDENCE
    else:
      → ASK_REVISED_JUDGMENT

PRESENT_NEW_EVIDENCE
  (deterministic: reveals the next EvidenceItem by revealOrder — FSM-
   driven, not an LLM decision)
  → PRESENT_CHALLENGE   (loop, bounded by maxRounds)

ASK_REVISED_JUDGMENT
  (student restates judgment + confidence, all evidence now visible)
  → ASK_REFLECTION

ASK_REFLECTION
  (student explains what changed their mind, or why they held firm)
  → SCORE_AND_RECORD

SCORE_AND_RECORD
  (deterministic: judgment classification vs answerSpec, calibration
   delta computed — Section 4. LLM used only to classify the free-text
   judgment into {true,false,unknown} and to assess reasoning-quality
   signals, both via schema-validated structured output, same pattern
   as scoreWithLLM())
  → DISPOSITION_SELF_CHECK → END
```

**Fixed pedagogical action vocabulary** — the _only_ moves
`PRESENT_CHALLENGE` may select. Each maps to a deterministic template;
an LLM call fills the template's slot with natural phrasing referencing
only the student's actual prior response and evidence actually already
revealed (same untrusted-input discipline as `scoringPrompt.ts`'s
handling of lesson text):

| Action                                | Purpose                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ASK_FOR_REASONING`                   | "Why do you believe that?" — used when the student stated a judgment with thin justification.                                    |
| `ASK_FOR_ALTERNATIVE`                 | "What's another explanation for this evidence?" — targets premature closure (inference sub-skill).                               |
| `HIGHLIGHT_CONTRADICTION(evidenceId)` | Points at a specific **already-revealed** evidence item that appears to conflict with the student's stated judgment.             |
| `ASK_FOR_MISSING_EVIDENCE`            | "What additional information would change your mind?" — surfaces whether the student can identify their own evidentiary gaps.    |
| `REQUEST_CONFIDENCE_JUSTIFICATION`    | "Why are you N% confident, not higher or lower?" — used when stated confidence looks disconnected from stated reasoning quality. |
| `ACKNOWLEDGE_AND_ADVANCE`             | Neutral transition with no evaluative language, used when a challenge round produces nothing more to probe.                      |
| `PROMPT_REFLECTION`                   | "What changed, if anything, and why?" — the reflection-stage move.                                                               |

`REVEAL_EVIDENCE(evidenceId)` is _not_ in this table because it isn't a
tutor choice — it's a deterministic FSM transition (`PRESENT_NEW_EVIDENCE`
above), driven purely by `revealOrder`.

**The non-negotiable invariant**: action selection must be driven by
gaps in reasoning quality (did the student address the counter-evidence?
Is their stated confidence justified by what they said?), and _must not_
correlate with whether the student's stated judgment agrees with
`answerSpec.correctJudgment`. A tutor that challenges "wrong" answers
harder than "right" ones is teaching students to guess the teacher's
answer, not to reason — which is precisely what the Abrami dispositions
this taxonomy is built on (openness, fairness to views you disagree
with, honesty about blind spots) are supposed to counter. Concretely:
the classifier step that picks a challenge action must not receive
`answerSpec` as input at all — only the case's evidence pool and the
transcript so far. `answerSpec` is used exclusively in `SCORE_AND_RECORD`,
after the loop is over.

## 4. Calibration-tracking design

The explicit ask: "are a student's 90%-confidence answers actually right
90% of the time?" This requires storing raw (confidence, outcome) pairs
per attempt and aggregating over time, not just a running score.

```ts
// Proposed shape, not a migration — table design deferred to build time.
interface PracticeAttempt {
	id: string;
	studentId: string;
	caseId: string;
	initialJudgment: Judgment;
	initialConfidence: number; // 0-100
	revisedJudgment: Judgment;
	revisedConfidence: number;
	// Outcome is three-valued, not binary, because "unknown" can be the
	// objectively correct answer (Section 2). A naive right/wrong scheme
	// can't represent "the student was appropriately uncertain."
	outcome: 'correct' | 'incorrect' | 'appropriately_uncertain';
	createdAt: string;
}
```

`outcome` is computed deterministically from `answerSpec` at
`SCORE_AND_RECORD` time:

- `correctJudgment !== 'unknown'` and `revisedJudgment === correctJudgment`
  → `'correct'`.
- `correctJudgment !== 'unknown'` and `revisedJudgment` disagrees →
  `'incorrect'`.
- `revisedJudgment === 'unknown'` and
  `answerSpec.unknownIsCreditableIfReasoned` and the LLM's reasoning-
  quality classification confirms the stated uncertainty is grounded in
  a real evidentiary gap (not just guessing) → `'appropriately_uncertain'`,
  which counts as a _correct_ outcome for calibration purposes.
- `revisedJudgment === 'unknown'` without grounded reasoning, on a case
  that does have a knowable answer → `'incorrect'` (declining to commit
  isn't automatically credit — the reasoning has to show why the
  evidence doesn't settle it).

For calibration reporting, `'appropriately_uncertain'` is treated as
correct (1) and `'incorrect'` as wrong (0) — the same binary a Brier
score needs — but the case is flagged as ambiguous-by-design in any UI
surfacing individual attempts, so a teacher reviewing a transcript isn't
confused about why "I don't know" scored full credit.

Two aggregate views, computed from `PracticeAttempt` rows, not stored
redundantly:

1. **Brier score** — mean of `(confidence/100 − outcomeAsProbability)²`
   over a student's attempts, using `revisedConfidence` (the FSM
   deliberately asks for confidence _after_ the evidence is in, since
   that's the confidence that should track reality). Lower is better;
   trend over time is more useful than any single value.
2. **Reliability diagram / calibration curve** — bucket attempts by
   `revisedConfidence` into deciles (0-10%, ..., 90-100%), and for each
   bucket compute actual `correct` rate. A well-calibrated student's
   90%-bucket should show ~90% actual accuracy; systematic drift above
   the diagonal is underconfidence, below is overconfidence. This is
   the direct answer to the calibration question the prompt asks, and
   it's naturally chartable (bucket vs. actual-accuracy scatter against
   the y=x line) without needing anything beyond the `PracticeAttempt`
   rows above.

Both aggregates should be computable per-skill (`caseId → skillTags`)
as well as overall, so a teacher or student can see "calibration is fine
in evaluation, poor in inference" rather than one undifferentiated
number.

## 5. Connection to Phase 1 lesson/subject-profile data

This is the integration the prompt specifically asks about: _can a
teacher assign practice missions generated from the subject profile of
a lesson they scored well?_

Yes, and the mechanism reuses Phase 1 structure rather than adding a
parallel one:

- `PracticeCase.subjectProfileId` is the same `SubjectProfile` id space
  Phase 1 lessons already use (`src/lib/domain/subjectProfiles.ts`) —
  no separate subject vocabulary for practice content.
- `PracticeCase.sourceLessonVersionId` links a generated case back to
  the specific `lesson_versions` row it came from. A natural gate: only
  offer "generate practice missions from this lesson" on lessons whose
  latest score cleared some pillar-score threshold (the existing
  `dialogueScore` / `authenticityScore` / `mentoringScore` on `scores`,
  already computed and stored) — a poorly-scored lesson's authentic
  scenario is a worse seed for a case than a well-scored one, and reusing
  the existing score avoids a second quality gate.
- Generation itself is a new `CaseGenerationProvider` interface,
  parallel to `ScoringProvider`: takes a `lessonVersionId` + its stored
  lesson text + `subjectProfile`, returns a draft `PracticeCase`
  (scenario, claim, evidence pool, answer spec) for teacher review
  before publishing — never auto-published without a teacher looking at
  it, same as Phase 1 never auto-applies a suggestion without the
  teacher choosing to. This reuses `scoringPrompt.ts`'s pattern of a
  vendor-agnostic prompt-builder module plus a provider-specific client,
  rather than inventing a new prompting architecture.
- `PracticeCase.visibility` mirrors `lessons.visibility`
  (`private` / `org-shared` / `public-template`) exactly, so the
  existing library/RLS mental model (ADR-002, ADR-011) extends without a
  new concept: a teacher can keep a generated mission private, share it
  org-wide, or (later) contribute it to a public template pool the same
  way `copy_lesson` lets a teacher take a copy of a shared lesson today.
- `skillTags` / `dispositionTags` on a generated case should default to
  whatever `skill_coverage_entries` the source lesson's score already
  identified as covered — the generation prompt is seeded with "this
  lesson's own scoring already said it exercises evaluation and
  inference; build a case that gives students hands-on practice with
  those same skills," keeping practice content aligned with what a
  teacher's lesson was already trying to teach.

Nothing here requires new tables in Phase 1's schema — it's additive:
new `practice_cases` / `practice_attempts` / (optionally)
`disposition_checkins` tables, each with an ordinary owner/org RLS
policy following the ADR-010 helper-function pattern, plus one foreign
key (`source_lesson_version_id`) pointing at the existing
`lesson_versions` table.

## 6. New provider interfaces (named, not built)

Following `ScoringProvider`'s shape (`src/lib/providers/ScoringProvider.ts`):

- **`CaseGenerationProvider`** — `generateCase(lessonVersionId, lessonText, subjectProfile) → DraftPracticeCase`. Section 5.
- **`TutorProvider`** — two narrow methods, not a general chat method:
  - `classifyJudgment(freeText) → { judgment: Judgment, confidence?: number }` — used at `ASK_INITIAL_JUDGMENT` / `ASK_REVISED_JUDGMENT`.
  - `selectAndPhraseChallenge(transcript, revealedEvidence) → { action: PedagogicalAction, questionText: string }` — used at `PRESENT_CHALLENGE`, deliberately never given `answerSpec` (Section 3's invariant).
- Both should have DeepSeek as the default implementation (ADR-008) with the same lazy-client-construction pattern from `AnthropicScoringProvider`/`DeepSeekScoringProvider`, and both need their own prompt-injection adversarial test suite before shipping — the existing `DeepSeekScoringProvider.integration.spec.ts` pattern (live-model tests, `describe.skipIf(!hasApiKey)`) is the template, but the attack surface is different: a student's free-text response during `PRESENT_CHALLENGE` is untrusted input to `selectAndPhraseChallenge` the same way lesson text is untrusted input to lesson scoring, and needs the equivalent "student text tries to inject a fake evidence item / fake instruction" test coverage before this goes live.

## 7. Explicitly out of scope for this document

Per the prompt's own instruction, none of the following are being
decided or built now — flagged so they don't get silently assumed later:

- Whether missions are assigned by a teacher to specific students, opt-in
  by students, or both — this affects `practice_cases`/`practice_attempts`
  RLS shape and isn't decided here.
- Gamification mechanics (streaks, badges) implied by the "missions"
  framing — UX, not architecture; deferred entirely.
- Whether `maxRounds` (challenge-loop bound) is fixed globally or
  per-difficulty — a tuning question for build time, not a design one.
- Multi-case sequencing / mission sets — this document scopes a single
  case's tutor loop only.
