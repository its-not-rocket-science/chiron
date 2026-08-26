# Phase 2 Planning: Student Practice Mode

**Status: planning only. Nothing in this document is implemented.** No
tables, providers, routes, or tests exist for any of this yet. This is
Prompt 12 of `scope-and prompts.txt` — scoped now, while the Phase 1
architecture is fresh, so Phase 2 builds on Chiron's existing patterns
instead of reinventing them.

**Revision history** (each pass below is `prompts.txt`, design-only —
still nothing built):

- **Prompt D** (2026-08-24): closed four review gaps — structural
  validation of tutor-returned evidence ids (Section 3), an audit
  trail for uncertainty-credit classifications (Section 4), a
  resumable-session requirement (Section 3), student-data
  sensitivity/minors (Section 7).
- **Prompt 15** (2026-08-24): formalized the deterministic/LLM
  boundary for Phase 2 (new Section 1a) — an LLM may classify named
  reasoning signals, never assign credit directly. Flagged Section 4's
  uncertainty-credit mechanism **pending revision**: it currently lets
  an LLM reasoning-quality judgment help decide credit, which Section
  1a's rule no longer permits. Left as-is on purpose — Prompt 18
  (later in the sequence) replaces it with an authored, fully
  deterministic rule structure; this pass doesn't do that job early.
- **Prompt 16** (2026-08-24): replaced the `true | false | unknown`
  judgment model with a five-level evidence-support scale (Section 2)
  — the old model conflated "is this factually true" with "does the
  shown evidence support it," genuinely different questions. Every
  reference across Sections 2-4 and 6 updated to match; Section 4's
  `outcome`-computation _mechanism_ is still pending Prompt 18 as
  above — Prompt 16 only changed what judgment values exist and what
  "creditable" means structurally.
- **Prompt 17** (2026-08-24): added `COMMIT_UPDATE_CRITERION` as a
  first-class, per-case-optional FSM state (Section 3) — "what would
  change your mind?", asked before decisive evidence lands. Added two
  new signals (Section 1a) and case-authored `updateCriteria` (Section
  2). The deterministic consistency-check logic (did the promised
  evidence appear; was the update proportionate) is named as a
  requirement here but its algorithm is `prompts.txt` Prompt 26's job,
  not designed in full yet — same incremental-design discipline as
  Prompt 18's deferral above.
- **Prompt 18** (2026-08-24): **resolves** Prompt 15's Section 4
  deferral. Replaced `creditableFinalJudgments` +
  `uncertainIsCreditableIfReasoned` (an LLM reasoning-quality judgment
  deciding credit) with `answerSpec.reasoningRubric` — authored,
  independently-sufficient rules, each pairing accepted judgments with
  a required-signal count. `outcome` is now genuinely two-valued
  (`'correct' | 'incorrect'`); the old `'appropriately_uncertain'`
  category is gone because earning credit for landing on `'uncertain'`
  is now just one more rule, not a special case. `PracticeAttempt`
  gained `scoringExplanation` (which signals were detected, which rule
  matched, why) replacing a single free-text LLM justification. Added
  explicit guardrails: no hidden ideological answer matching, and
  `answerSpec` never reaches the client before an attempt completes.
- **Prompt 19** (2026-08-24): consolidated Prompts D/15-18 into
  `docs/PHASE2A_IMPLEMENTATION.md` — a concrete, buildable plan (exact
  modules, tables, RLS, routes, provider interfaces, FSM states, test
  layers, migration sequence, milestone order), mapped onto
  `prompts.txt` Prompts 20-35. Made one new decision along the way
  (ADR-019, noted in Section 5's connection-to-Phase-1 discussion):
  Phase 2A's three cases are static TypeScript data, not a
  `practice_cases` table — no case content is generated or teacher-
  authored in Phase 2A, so the table/RLS-secrecy split Section 5
  describes doesn't apply until Phase 2B actually builds
  `CaseGenerationProvider`.
- **Prompt 26** (2026-08-25): **resolves** Prompt 17's deferred
  consistency-check algorithm — implemented in
  `src/lib/domain/updateCriterionConsistency.ts` as a pure, five-status
  deterministic function (ADR-022). Added `UpdateCriterion.relevantEvidenceItemIds`
  (Section 2) — the structural link letting "did the promised evidence
  appear" be answered by a set-membership check against
  `revealedEvidenceIds`, never an LLM re-judging the question at scoring
  time. Confirmed the conservative treatment Section 3 already called
  for: there is no "moved goalposts" status at all, only a
  `criterion_not_met_updated` outcome whose explanation states the
  facts and stops.

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

## 1a. The Phase 1 / Phase 2 assessment boundary (sharpened, `prompts.txt` Prompt 15)

Section 1's "Deterministic/LLM split" bullet stated the general
principle Phase 1 already follows. Phase 2 needs a _stricter_ version
of it, for a reason worth stating plainly rather than assuming it
carries over unchanged: **Phase 1 coaches a teacher; Phase 2 assesses a
student.** Those are different acts with different stakes.

- **Phase 1 — LLM-assisted heuristic lesson evaluation.** A teacher
  gets advisory feedback on a lesson plan from a professional-judgment
  tool. The LLM directly producing pillar scores and skill-coverage
  flags (schema-validated, but LLM-generated) is an acceptable design
  for this: the teacher is the professional in the loop, the scores
  are coaching input to their own judgment, not a formal record made
  _about_ them.
- **Phase 2 — deterministic educational assessment, built on
  structured reasoning-signal classification.** A student is being
  assessed — and per Section 7, very likely a minor. Phase 1's "LLM
  generates the score, schema validation just checks the shape" model
  is not an acceptable design here. Phase 2 needs a stricter rule:

  > The LLM may classify observable reasoning signals from free text.
  > Application code and authored case metadata determine scores,
  > credit, and learning outcomes.

  Concretely: the LLM must never directly assign a student
  critical-thinking score, points, a grade, a skill percentage, or
  "correctness" — with exactly one exception, classifying a student's
  own language into a structured category that deterministic code
  _subsequently_ evaluates. Classification is an LLM task. Evaluation
  of what a classification is worth is not.

**Signal vocabulary.** Phase 2's LLM-facing surface is a fixed,
named-signal classification system, not a free-form quality judgment.
At minimum (this list grows in later design passes — Prompt 17 added
`relevant_update_criterion` and `moves_goalposts_after_evidence`;
Prompt 18 may add more as it designs the authored-rule scoring engine;
nothing here is final):

| Signal                                     | What it means                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `identifies_missing_evidence`              | Names a specific gap in what's been revealed, not just "I need more info."                                        |
| `distinguishes_correlation_from_causation` | Explicitly separates "these move together" from "one causes the other."                                           |
| `identifies_confounder`                    | Names a plausible alternative cause the evidence doesn't rule out.                                                |
| `generates_alternative_hypothesis`         | Proposes a distinct explanation before settling on one.                                                           |
| `identifies_source_problem`                | Flags an issue with where a claim/evidence item comes from (independence, reliability, bias).                     |
| `identifies_denominator_problem`           | Notices a relative/absolute-rate claim is missing its base rate or denominator.                                   |
| `identifies_base_rate_issue`               | Reasons about how common something is before updating on new evidence about a specific case.                      |
| `acknowledges_uncertainty`                 | States, in terms tied to the actual evidence, that the evidence doesn't (yet) settle the question.                |
| `updates_for_relevant_evidence`            | Changes judgment/confidence in response to evidence that's actually relevant to it.                               |
| `resists_irrelevant_evidence`              | Holds a judgment steady when new evidence doesn't actually bear on it.                                            |
| `states_update_criterion`                  | Names in advance what would change their mind (see Section 3's `COMMIT_UPDATE_CRITERION`).                        |
| `relevant_update_criterion`                | The stated criterion actually bears on the claim — not just any promise, one that would matter.                   |
| `follows_declared_update_criterion`        | Their later update is consistent with a criterion they stated earlier.                                            |
| `moves_goalposts_after_evidence`           | Shifts what would count as "enough" only after seeing evidence, instead of sticking to what they said in advance. |
| `recognises_limit_of_available_evidence`   | Identifies what the currently-revealed evidence can't tell them, specifically.                                    |

**Classifier output shape** (conceptual — the concrete Zod schema is
implementation work, not this pass):

```ts
interface SignalClassification {
	signal: SignalId; // one of the table above (closed set — schema-validated, same discipline as Phase 1's CTSkillId validation)
	present: boolean;
	confidence: 'low' | 'medium' | 'high';
	// A literal span copied from the learner's own submitted text for
	// this stage — not a paraphrase, not the classifier's own summary.
	evidenceQuote: string;
}
```

**Why `evidenceQuote` is load-bearing, not decorative.** This is the
mechanism that keeps the rule enforceable rather than aspirational: a
classification is only accepted if `evidenceQuote` is actually found
(verbatim, modulo whitespace normalization) in the learner's text for
that stage — same reject/retry discipline `llmScoringCore.ts` already
applies to malformed Phase 1 output, and the same reject/retry
discipline Section 3's tutor no-invented-facts check applies to
`questionText`. A classifier that can't point to
real text can't manufacture a signal. This is what makes "a signal
should not be awarded merely because an LLM thinks the answer was
good" a structural fact about the pipeline, not a prompt-wording
request.

**What this does and doesn't change here.** The classifier that
produces `SignalClassification`s is a distinct provider interface from
`TutorProvider` (Section 6) — scoping it fully (its exact method
signature, prompt-injection defenses, retry behavior) is `prompts.txt`
Prompt 23's job, not this one. This section established the boundary
rule and the vocabulary; Section 4 is where `prompts.txt` Prompt 18
actually redesigned the scoring logic to consume it, via
`answerSpec.reasoningRubric`.

## 2. Case-content schema

The authored content unit is a **PracticeCase**. A case is scenario +
claim + a fixed, ordered pool of evidence + an answer key that treats
"the evidence doesn't clearly settle this" as a legitimate first-class
answer, not a fallback.

**Judgment model (`prompts.txt` Prompt 16 — replaces the original
`true | false | unknown` design).** Binary-plus-escape-hatch was too
restrictive, and it conflated two genuinely different questions: _is
this claim true_ and _does the evidence currently shown support it_. A
student can correctly believe a claim is probably true in the world
while correctly judging that the evidence revealed so far doesn't
strongly support it — that's good reasoning, not a wrong answer, and
the old model had no way to represent it. Chiron's default question is
now **"how strongly does the available evidence support this claim?"**,
answered on a five-level ordinal scale, with confidence kept as a
genuinely separate 0-100 value (a student can be highly confident the
evidence is inconclusive):

```ts
// src/lib/domain/schemas.ts (proposed additions)

const EvidenceSupportJudgmentSchema = z.enum([
	'strongly_unsupported',
	'somewhat_unsupported',
	'uncertain',
	'somewhat_supported',
	'strongly_supported'
]);
type Judgment = z.infer<typeof EvidenceSupportJudgmentSchema>; // Phase 2A's only implemented judgment type — see responseMode below

// Phase 2A implements only 'evidence_support_scale'. 'categorical' and
// 'decision' are named now, not designed — see the responseMode note
// below — so a future case type that genuinely needs a different
// response shape is a new branch elsewhere in the engine, not a
// rewrite of this schema.
const ResponseModeSchema = z.enum(['evidence_support_scale', 'categorical', 'decision']);
type ResponseMode = z.infer<typeof ResponseModeSchema>;

const EvidenceItemSchema = z.object({
	id: IdSchema, // reuse existing id helper
	text: z.string().min(1),
	// Evidence is revealed in stages, driven by the tutor FSM (Section 3),
	// never chosen or invented by the LLM at runtime.
	revealOrder: z.number().int().min(0),
	stance: z.enum(['supports_claim', 'supports_counter_claim', 'ambiguous'])
});

// One creditable reasoning path (`prompts.txt` Prompt 18 — replaces
// the old flat creditableFinalJudgments list + the LLM-judged
// uncertainIsCreditableIfReasoned escape hatch). A case can author
// several of these; each is independently sufficient for full credit.
const ReasoningRuleSchema = z.object({
	id: IdSchema,
	// Which final judgment(s) this rule covers. Usually one value, but
	// a rule can cover several if the same reasoning bar applies to
	// more than one (e.g. either under-supported value).
	acceptedJudgments: z.array(EvidenceSupportJudgmentSchema).min(1),
	// Signals (Section 1a's cross-case vocabulary, or this case's own
	// updateCriteria signals — Section 3) that count toward satisfying
	// this rule. Empty = no reasoning requirement at all: landing on
	// one of acceptedJudgments earns credit regardless of stated
	// reasoning depth. That's not a degenerate case — it's what most
	// cases' straightforwardly-supported judgment looks like; the
	// reasoning bar is reserved for judgments that need one (typically
	// 'uncertain', but not necessarily only that value).
	requiredSignals: z.array(z.string()).default([]),
	// How many of requiredSignals must classify present:true to satisfy
	// this rule. 0 when requiredSignals is empty.
	minimumRequired: z.number().int().min(0),
	// Shown to the student (paraphrased or verbatim, author's choice)
	// in end-of-case feedback when this is the rule that fired — what
	// makes a credited outcome explainable, not just "correct."
	explanation: z.string().min(1)
});

const ReasoningRubricSchema = z.object({
	// Each rule independently, if satisfied, earns full credit. Several
	// rules = several creditable reasoning paths, not several hoops a
	// student has to clear at once.
	finalJudgmentRules: z.array(ReasoningRuleSchema).min(1),
	// Signals worth recording as reasoning-progress evidence even when
	// no finalJudgmentRule fires — e.g. a student who correctly
	// identifies_confounder but still lands on an uncreditable final
	// judgment still has that signal logged (feeds Section 4's
	// per-skill calibration data), it just doesn't flip outcome on its
	// own. A full per-signal audit-event system is `prompts.txt`
	// Prompt 25's job, not designed in full here — this field only
	// establishes that such signals shouldn't be silently discarded
	// just because they didn't satisfy a finalJudgmentRule.
	partialCreditSignals: z.array(z.string()).default([])
});

const CreditableAnswerSpecSchema = z.object({
	// The authored, ordinal span of positions this case's evidence pool
	// (once fully revealed) actually supports — a range, not a point,
	// because real evidence rarely pins to one exact reading. This is
	// the case author's own reasoning about what the evidence shows,
	// kept explicit and inspectable rather than only implied. Not what
	// drives scoring directly (reasoningRubric below does) — it's the
	// authoring-time documentation reasoningRubric should be
	// traceable back to.
	targetRange: z.object({ min: EvidenceSupportJudgmentSchema, max: EvidenceSupportJudgmentSchema }),
	// The actual, deterministic credit logic for this case. See
	// Section 4 for how this replaces the old LLM-judged
	// "appropriately uncertain" mechanism entirely.
	reasoningRubric: ReasoningRubricSchema,
	rationale: z.string().min(1) // case-author's own reasoning; authoring-review + reflection-stage feedback fallback
});

// One authored, case-specific target for the COMMIT_UPDATE_CRITERION
// mechanic (Section 3, `prompts.txt` Prompt 17). `signal` here is
// deliberately NOT drawn from the cross-case vocabulary above — it's
// this case's own classification target (e.g. "did the student ask
// for a control-group comparison"), scoped to what THIS case's
// decisive evidence is actually about. Same pattern as
// `signalClassificationSchemaFor`'s per-call scoping elsewhere in this
// schema: the classifier's allowed-output set for this call is the
// case's own authored list, not the global static enum — the closed-set
// discipline still applies, just scoped per case instead of globally.
const UpdateCriterionSchema = z.object({
	id: IdSchema,
	signal: z.string().min(1), // this case's own label, e.g. 'requests_control_comparison'
	// Case-author's own words for what this criterion means. Never
	// shown to the student — used to judge classifier output for
	// sanity during authoring/review, not rendered anywhere.
	description: z.string().min(1)
});

const PracticeCaseSchema = z.object({
	id: IdSchema,
	title: z.string().min(1),
	subjectProfileId: SubjectProfileIdSchema, // reuses Phase 1 type directly
	skillTags: z.array(CTSkillIdSchema).min(1), // reuses taxonomy.ts CTSkillId
	dispositionTags: z.array(DispositionClusterIdSchema).min(1),
	difficulty: z.enum(['intro', 'core', 'stretch']),
	responseMode: ResponseModeSchema, // Phase 2A: always 'evidence_support_scale'
	scenario: z.string().min(1), // authentic, situated framing — not an abstract logic puzzle
	// Framed as "how strongly does the evidence support this claim?" for
	// evidence_support_scale cases — not "is this claim true?"
	claim: z.string().min(1),
	evidencePool: z.array(EvidenceItemSchema).min(1),
	answerSpec: CreditableAnswerSpecSchema,
	// Whether this case uses the COMMIT_UPDATE_CRITERION FSM state
	// (Section 3) — not every case needs the "what would change your
	// mind?" mechanic; a case that doesn't have a clean, checkable
	// decisive-evidence moment shouldn't be forced to fake one.
	usesUpdateCriterion: z.boolean(),
	// Required (non-empty) when usesUpdateCriterion is true, absent
	// otherwise — an authoring-time contract this schema alone doesn't
	// structurally enforce (a `.refine()` cross-field check is
	// implementation work, not this pass).
	updateCriteria: z.array(UpdateCriterionSchema).optional(),
	// Present only for cases generated from a Phase 1 lesson (Section 5).
	// Absent for hand-authored or system-seeded cases.
	sourceLessonVersionId: IdSchema.optional(),
	visibility: z.enum(['private', 'org-shared', 'public-template']), // mirrors lessons.visibility
	createdBy: z.enum(['system', 'teacher-generated'])
});
```

**Why evaluate against the case's own evidence, not outside knowledge.**
The tutor and the scoring engine both evaluate a student's reasoning
against what's actually in `evidencePool` — never against whether the
claim happens to be true in the real world, which the student may
separately know or believe from outside the case. This isn't new
(Section 1's "no invented facts" already constrains the tutor this
way) — Prompt 16 makes it explicit for judgment itself, not just for
what the tutor is allowed to say: a student who reasons "I think this
is probably true, but what's shown here doesn't establish it" should
land on a low-to-mid `strongly_unsupported`/`somewhat_unsupported`/
`uncertain` judgment and be evaluated as reasoning _well_, not
penalized for disagreeing with their own prior belief.

**How genuine uncertainty is represented.** `uncertain` is the literal
midpoint of the ordinal scale, not a separate escape-hatch value
bolted on beside a binary choice (the old model's `'unknown'`). This
matters structurally: a student who thinks the evidence is genuinely
balanced or insufficient has an actual point on the scale that means
that, not a third option that reads as "opting out" of the real
question.

**How multiple acceptable final positions are represented.**
`answerSpec.reasoningRubric.finalJudgmentRules` is an array of
independently-sufficient rules, not a single hidden answer — see the
schema above. A case whose evidence defensibly supports more than one
reasonable final position authors more than one rule (different
judgments, potentially different reasoning bars for each); `targetRange`
documents the author's own reasoning about what the evidence supports,
and `reasoningRubric` is the explicit, scoring-facing structure derived
from it — see Section 4 for the full mechanism (`prompts.txt` Prompt 18).

**No hidden ideological answer matching.** `requiredSignals` must be
genuine, checkable reasoning moves drawn from Section 1a's
evidence-based vocabulary (or a case's own `updateCriteria` signals,
Section 3) — never a proxy for "did the student happen to agree with
conclusion X," dressed up as a signal requirement. A rule that can only
be satisfied by a student reaching a particular stance on a contested
real-world question, rather than by demonstrating a specific reasoning
move against _this case's own evidence_, is a case-authoring bug, not a
legitimate rule — the classifier's `evidenceQuote` requirement (Section
1a) makes a signal traceable to what the student actually wrote, but it
can't by itself catch a rule that was authored to reward a conclusion
rather than a reasoning move; that's a review-time responsibility for
whoever authors or approves a case.

**Authored scoring metadata never reaches the client before
completion.** `answerSpec` in full — `targetRange`, every
`reasoningRubric` rule, `partialCreditSignals` — is exactly the kind of
answer-key data Section 3's tutor invariant already keeps away from
`selectAndPhraseChallenge`. That protection now explicitly extends to
the whole student-facing surface, not just the tutor: no route,
`load` function, or API response may include `answerSpec` (or any
signal-classification result it would let a student reverse-engineer
it from) until `SCORE_AND_RECORD` has actually completed for that
attempt.

Two deliberate choices still worth flagging (carried over, still
accurate under the new model):

- `evidencePool` is authored once, up front, and is closed — the tutor
  can only ever _reveal_ items from this list in `revealOrder`; it can
  never write new ones. This is what makes "never invents new evidence"
  enforceable in code rather than just in a system prompt.
- A case bank shouldn't always have a knowable answer. The taxonomy's
  inference sub-skill "generating alternative explanations before
  settling on one" and self-regulation's "checking your own reasoning
  for errors" are specifically about resisting premature closure — a
  case whose `targetRange` genuinely spans `uncertain` (evidence that,
  even fully revealed, doesn't settle the question) is what exercises
  that, not a design flaw to eliminate.

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
  (student submits: judgment on the five-level evidence-support scale
   (Section 2) + free-text reasoning)
  → ASK_CONFIDENCE

ASK_CONFIDENCE
  (student submits: confidence 0-100%)
  → if case.usesUpdateCriterion: COMMIT_UPDATE_CRITERION
    else: PRESENT_CHALLENGE

COMMIT_UPDATE_CRITERION
  (only reached when the case is authored to use this mechanic — see
   Section 2's usesUpdateCriterion. Asked before any decisive evidence
   is revealed: "What additional evidence would make you substantially
   more or less confident?" Stored verbatim, then classified against
   THIS case's own updateCriteria[].signal set — same per-case-scoped
   validation discipline `signalClassificationSchemaFor` uses elsewhere,
   not the cross-case Section 1a vocabulary)
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
   judgment into one of the five evidence-support values and to assess
   reasoning-quality signals, both via schema-validated structured
   output, same pattern as scoreWithLLM())
  → DISPOSITION_SELF_CHECK → END
```

**Fixed pedagogical action vocabulary** — the _only_ moves
`PRESENT_CHALLENGE` may select. Each maps to a deterministic template;
an LLM call fills the template's slot with natural phrasing referencing
only the student's actual prior response and evidence actually already
revealed (same untrusted-input discipline as `scoringPrompt.ts`'s
handling of lesson text):

| Action                             | Purpose                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASK_FOR_REASONING`                | "Why do you believe that?" — used when the student stated a judgment with thin justification.                                                                           |
| `ASK_FOR_ALTERNATIVE`              | "What's another explanation for this evidence?" — targets premature closure (inference sub-skill).                                                                      |
| `ASK_FOR_MISSING_EVIDENCE`         | "What additional information would change your mind?" — surfaces whether the student can identify their own evidentiary gaps.                                           |
| `ASK_ABOUT_CAUSALITY`              | Probes correlation-vs-causation reasoning — used when the student treats an association as if it were established causation.                                            |
| `ASK_ABOUT_SOURCE`                 | Probes source independence/provenance — used when the student treats repetition across outlets as if it were corroboration.                                             |
| `ASK_ABOUT_NUMBERS`                | Probes relative-vs-absolute framing, denominators, base rates — used when a percentage/headline figure is taken at face value.                                          |
| `REQUEST_CONFIDENCE_JUSTIFICATION` | "Why are you N% confident, not higher or lower?" — used when stated confidence looks disconnected from stated reasoning quality.                                        |
| `REFER_TO_REVEALED_EVIDENCE`       | Points the student back at a piece of evidence already revealed to them that bears on their stated judgment — phrased naturally, no `evidenceId` parameter (see below). |
| `ACKNOWLEDGE_AND_ADVANCE`          | Neutral transition with no evaluative language, used when a challenge round produces nothing more to probe.                                                             |
| `PROMPT_REFLECTION`                | "What changed, if anything, and why?" — the reflection-stage move.                                                                                                      |

`REVEAL_EVIDENCE(evidenceId)` is _not_ in this table because it isn't a
tutor choice — it's a deterministic FSM transition (`PRESENT_NEW_EVIDENCE`
above), driven purely by `revealOrder`.

**`REFER_TO_REVEALED_EVIDENCE` carries no `evidenceId` parameter — a
deliberate design choice (`prompts.txt` Prompt 24, ADR-021), superseding
an earlier draft of this table that had `HIGHLIGHT_CONTRADICTION(evidenceId)`.**
An id-parameterized action would need its own per-call, per-session
structural validation (the same shape `signalClassificationSchemaFor`
uses for dynamic candidate-signal scoping) — more surface area than
letting the model phrase things naturally from context already scoped
to revealed evidence only. What replaces id validation: `tutorCore.ts`
applies a lightweight post-hoc heuristic after generating `questionText`
— reject (and retry) any question introducing a number or percentage
not already present in the scenario, claim, or evidence actually
revealed for that call, the same reject/retry-once path
`llmScoringCore.ts` uses for other validation failures. This is
deliberately not exhaustive NLP; it's paired with Prompt 33's
paired-answer adversarial neutrality suite as defense-in-depth, not
relied on as the only mechanism. If retries are exhausted, `tutorCore.ts`
returns a fixed, hardcoded fallback question rather than trusting an
unvalidated model response or throwing — see ADR-021.

**The non-negotiable invariant**: action selection must be driven by
gaps in reasoning quality (did the student address the counter-evidence?
Is their stated confidence justified by what they said?), and _must not_
correlate with whether the student's stated judgment is covered by any
rule in `answerSpec.reasoningRubric.finalJudgmentRules`. A tutor that challenges "wrong" answers
harder than "right" ones is teaching students to guess the teacher's
answer, not to reason — which is precisely what the Abrami dispositions
this taxonomy is built on (openness, fairness to views you disagree
with, honesty about blind spots) are supposed to counter. Concretely:
the classifier step that picks a challenge action must not receive
`answerSpec` as input at all — only the case's evidence pool and the
transcript so far. `answerSpec` is used exclusively in `SCORE_AND_RECORD`,
after the loop is over.

**Why `COMMIT_UPDATE_CRITERION` happens before decisive evidence, not
after.** The mechanic only trains anything if the criterion is a
genuine prospective commitment — stated before the student knows what
the decisive evidence actually says — rather than a post-hoc
rationalization dressed up as one. That's why it's placed right after
the _initial_ judgment/confidence, before any evidence-reveal round
(`PRESENT_NEW_EVIDENCE`) has run.

**The invariant this mechanic exists to test — and must not
undermine**: "changing your mind" is not itself the thing being
trained, and must never be scored as though it were. The quality is
_proportionate updating in response to evidence, according to a
standard the student committed to in advance_. Concretely, all four of
these are legitimate outcomes, not just the one that looks like
"growth": the promised evidence appears and the student updates
(`follows_declared_update_criterion` + `updates_for_relevant_evidence`)
— genuinely good; the promised evidence doesn't appear and the student
holds their judgment (`resists_irrelevant_evidence`) — also genuinely
good, not a failure to "grow"; the student updates anyway, without the
evidence they said would matter having appeared
(`moves_goalposts_after_evidence`) — this is what should _not_ be
rewarded, however self-aware or articulate the student sounds while
doing it. Whether a stated criterion was even worth committing to in
the first place is its own signal (`relevant_update_criterion`) —
distinct from whether the student then followed it.

**The deterministic consistency procedure (`prompts.txt` Prompt 26,
implemented).** `src/lib/domain/updateCriterionConsistency.ts`'s
`computeUpdateCriterionConsistency()` compares "criterion stated →
evidence that appeared → final update" and lands on one of five
statuses: `criterion_met_and_followed`, `criterion_met_no_update`,
`criterion_not_met_no_update`, `criterion_not_met_updated`, or
`criterion_not_relevant` (a stated criterion too vague to connect to
any of this case's `updateCriteria`). Notably absent: any
"moved goalposts" status. The conservative resolution actually taken —
per this section's own instruction above — is that `criterion_not_met_updated`
states only the two observable facts (the promised evidence didn't
appear; the judgment changed anyway) and stops there; it never
attempts to infer _why_, and never emits `moves_goalposts_after_evidence`
credit or flags (that signal remains permanently unrewardable — see
`scoringEvents.ts`'s `NEVER_REWARDED_SIGNALS`). "Did the promised
evidence appear" is answered structurally, via each `UpdateCriterion`'s
`relevantEvidenceItemIds` against the session's `revealedEvidenceIds` —
not by asking an LLM to re-judge that at scoring time. See ADR-022.

**Resumable sessions.** A student's tab can close mid-`AWAIT_STUDENT_RESPONSE`,
or the network can drop between `PRESENT_CHALLENGE` and their reply — the
FSM above cannot assume it runs start-to-finish in one request/response
cycle the way Phase 1's single-shot `POST /api/lessons/score` does. This
requires in-progress state to live somewhere durable, updated at each
state transition, not just written once at the end:

- A `practice_sessions` row (one per in-progress attempt) holds at
  minimum: the current FSM state, `revealedEvidenceIds` so far (the
  evidence actually shown to this student — what `tutorCore.ts`'s
  no-invented-facts check and the "allowed source text" it's built from
  are scoped to), the transcript of challenge/response pairs, the initial
  judgment/confidence once given, and — for cases with
  `usesUpdateCriterion` — the committed criterion text once given,
  since it's stated before evidence reveal and must survive an
  interruption the same way the initial judgment does — updated on
  every transition, not only on completion. `PracticeAttempt` (Section 4) is the row written once
  the loop actually reaches `SCORE_AND_RECORD`; `practice_sessions` is
  what exists before that, and a resumed session picks up from whatever
  state its row last recorded.
- This is exactly the shape ADR-010 warns about: a table written
  incrementally, multiple times, across a session, by the row's own
  owner — the same shape that surfaced the recursion bug (`0002`), the
  unreliable cross-table `WITH CHECK` bug (`0003`), and the
  `RETURNING`-vs-self-reference bug (`0005`) in Phase 1's schema. Its
  RLS policies (a student can read/write only their own in-progress
  session; a teacher's visibility into an in-progress session, if any,
  is a separate open question — see the data-sensitivity section below)
  need the same live-adversarial-test treatment `tests/rls/orgIsolation.spec.ts`
  gives Phase 1's tables before this ships, not just a policy written
  and reasoned about from the SQL.
- Not designed further here — no column list, no migration. The
  requirement being established is narrower and non-negotiable: session
  state must be durable and incrementally updated somewhere, so
  resumability isn't discovered as a missing requirement after
  `practice_attempts` is already built assuming a single-shot flow.

## 4. Calibration-tracking design

**Implemented (`prompts.txt` Prompt 27, ADR-023) — see `docs/CALIBRATION.md`
for the actual, corrected design.** The sketch below (written at Prompt
18's time) proposed pairing `revisedConfidence` directly against
`outcome` for the Brier score, and decile confidence bands. Both were
revised during implementation: `outcome` also depends on whether the
student _articulated_ the required reasoning signals, not just whether
their judgment was defensible, so pairing confidence against it would
score an articulation gap as a calibration gap — `docs/CALIBRATION.md`
uses `judgmentWithinTargetRange` instead, and deciles were replaced
with five coarser 20-point bands given Phase 2A's realistic (small)
attempt volume. The `PracticeAttempt`/`ScoringExplanation` shapes below
are otherwise accurate to what was built (Prompts 20-25).

**Resolved (`prompts.txt` Prompt 18).** This section previously let an
LLM reasoning-quality judgment help decide `outcome` for the
`'uncertain'` case — flagged pending revision by Prompt 15 as exactly
the kind of soft, LLM-judged credit Section 1a's boundary rule
prohibits. It's replaced below by `answerSpec.reasoningRubric`
(Section 2): a fully deterministic, authored rule structure. The LLM's
only remaining role anywhere in this pipeline is producing
`SignalClassification`s (Section 1a) — never deciding what a
classification is worth.

The explicit ask: "are a student's 90%-confidence answers actually right
90% of the time?" This requires storing raw (confidence, outcome) pairs
per attempt and aggregating over time, not just a running score.

```ts
// Proposed shape, not a migration — table design deferred to build time.
interface ScoringExplanation {
	// Every signal the classifier evaluated for this attempt, present
	// or not — the full evidence base a rule match (or non-match) was
	// decided from, not just the ones that happened to fire.
	detectedSignals: SignalClassification[];
	// The reasoningRubric.finalJudgmentRules[].id that fired, or null
	// if none did. Deterministic lookup, not a stored judgment call —
	// see the algorithm below.
	matchedRuleId: string | null;
	outcome: 'correct' | 'incorrect';
}

interface PracticeAttempt {
	id: string;
	studentId: string;
	caseId: string;
	initialJudgment: Judgment;
	initialConfidence: number; // 0-100
	// Present only for cases with usesUpdateCriterion (Section 2), and
	// always given between initialConfidence and any evidence reveal —
	// see Section 3's COMMIT_UPDATE_CRITERION. `classification` uses
	// Section 1a's SignalClassification shape, scoped to this case's
	// own updateCriteria[].signal set rather than the cross-case
	// vocabulary (Section 2's UpdateCriterionSchema note). Still not
	// wired into outcome below — see the note under the algorithm.
	updateCriterion: { text: string; classification: SignalClassification } | null;
	revisedJudgment: Judgment;
	revisedConfidence: number;
	// The full deterministic record of how outcome was reached — see
	// "why this replaces a free-text justification" below.
	scoringExplanation: ScoringExplanation;
	createdAt: string;
}
```

**Outcome algorithm** (deterministic, runs at `SCORE_AND_RECORD`,
consumes `answerSpec.reasoningRubric` and the classifier's
`detectedSignals` for this attempt — never an LLM judgment call):

```
detectedSignals = classifier(studentFreeText, candidateSignals: union of
  every requiredSignal named across reasoningRubric.finalJudgmentRules)

for rule in reasoningRubric.finalJudgmentRules (authored order):
  if revisedJudgment ∈ rule.acceptedJudgments:
    presentCount = count(s in detectedSignals where s.signal ∈ rule.requiredSignals and s.present)
    if presentCount >= rule.minimumRequired:
      → outcome = 'correct', matchedRuleId = rule.id
      → stop (first satisfying rule wins — ties don't matter, the
         outcome is the same either way)

if no rule matched:
  → outcome = 'incorrect', matchedRuleId = null
  → detectedSignals still recorded in full, including any that overlap
    reasoningRubric.partialCreditSignals — these feed Section 5's
    per-skill data even though they didn't flip outcome
```

This is two-valued (`'correct' | 'incorrect'`), not three — the old
`'appropriately_uncertain'` category doesn't need to exist separately
anymore, because landing on `'uncertain'` and earning credit for it is
now just _one more rule_, structurally identical to any other creditable
judgment. A case whose evidence genuinely doesn't settle the question
authors a rule like `{ acceptedJudgments: ['uncertain'], requiredSignals:
['identifies_missing_evidence'], minimumRequired: 1 }` — no special
case in the algorithm, no separate outcome value, no LLM judgment call.
A transcript-facing UI that still wants to flag "this was credited via
an uncertainty-shaped rule" can derive that by checking whether the
matched rule's `acceptedJudgments` includes `'uncertain'` — it doesn't
need its own stored field to do that.

**Why this replaces a free-text justification, not just relocates it.**
The earlier design stored one LLM-written sentence explaining a
reasoning-quality call. `scoringExplanation` replaces that with the
actual inputs to a deterministic decision: which signals were detected
(each with its own `evidenceQuote`, from Section 1a — already
independently verifiable against the student's text), which rule they
did or didn't satisfy, and what outcome that produced. A teacher or
later audit can reconstruct _exactly_ why an outcome was reached by
re-running the same deterministic check against the stored data — not
by trusting a sentence an LLM wrote about its own reasoning.

**`updateCriterion` still doesn't feed into `outcome`.** True by design,
not just historically: Prompt 26's `computeUpdateCriterionConsistency()`
result (Section 3) is deliberately kept out of `computeOutcome`'s
correct/incorrect decision — its credit lands only in `scoringEvents`
(via the three mechanic-level signals `states_update_criterion` /
`relevant_update_criterion` / `follows_declared_update_criterion`), a
separate channel from whether the final judgment itself satisfies
`answerSpec.reasoningRubric`. `scoringExplanation` as designed here has
no dependency on the update-criterion mechanic at all.

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

Nothing here requires new tables in Phase 1's schema — it's additive.
**Note (`prompts.txt` Prompt 19, ADR-019):** this section describes the
eventual Phase 2B shape, once `CaseGenerationProvider` and teacher-
authored cases are actually built — at that point `practice_cases`
becomes a real table (with `source_lesson_version_id` FK'd to
`lesson_versions`, and the same visibility/RLS split `profiles_public`
uses, since generated content needs per-org secrecy this static data
doesn't). For **Phase 2A specifically** (three hand-authored, system-
seeded cases only — no generation, no per-org visibility),
`practice_cases` is static TypeScript data, not a table at all — see
`docs/PHASE2A_IMPLEMENTATION.md` Section 1. Only `practice_attempts`
and (optionally) `disposition_checkins` are real Phase 2A tables, each
with an ordinary owner-only RLS policy — simpler than the ADR-010
helper-function pattern this paragraph originally anticipated, because
Phase 2A's ownership checks never need a cross-table join.

## 6. New provider interfaces (named, not built)

Following `ScoringProvider`'s shape (`src/lib/providers/ScoringProvider.ts`):

- **`CaseGenerationProvider`** — `generateCase(lessonVersionId, lessonText, subjectProfile) → DraftPracticeCase`. Section 5.
- **`TutorProvider`** — two narrow methods, not a general chat method:
  - `classifyJudgment(freeText) → { judgment: Judgment, confidence?: number }` — used at `ASK_INITIAL_JUDGMENT` / `ASK_REVISED_JUDGMENT`.
  - `selectAndPhraseChallenge(transcript, revealedEvidence) → { action: PedagogicalAction, questionText: string }` — used at `PRESENT_CHALLENGE`, deliberately never given `answerSpec` (Section 3's invariant).
- **`ReasoningClassifierProvider`** — named here for completeness (Section 1a already refers forward to it), fully scoped by `prompts.txt` Prompt 23, not this document. Produces `SignalClassification`s (Section 1a) against either the cross-case signal vocabulary or a case's own `updateCriteria` set (Section 2/3) — narrower than `TutorProvider`: classification only, never a challenge or a credit decision.
- All three should have DeepSeek as the default implementation (ADR-008) with the same lazy-client-construction pattern from `AnthropicScoringProvider`/`DeepSeekScoringProvider`, and all three need their own prompt-injection adversarial test suite before shipping — the existing `DeepSeekScoringProvider.integration.spec.ts` pattern (live-model tests, `describe.skipIf(!hasApiKey)`) is the template, but the attack surface is different: a student's free-text response (during `PRESENT_CHALLENGE`, or a committed update criterion) is untrusted input the same way lesson text is untrusted input to lesson scoring, and needs the equivalent "student text tries to inject a fake evidence item / fake instruction / fake signal" test coverage before this goes live.

## 7. Student data sensitivity and minors

Not resolved here — flagged so it stops being silently absent, per the
gap this section closes. `PracticeAttempt` rows (a student's reasoning,
stated confidence, judgment history, and — per Section 4 — an LLM's
assessment of their reasoning quality) are materially more sensitive
than Phase 1's teacher-authored lesson-plan text, for two compounding
reasons: they're about a specific individual's thinking and mistakes
rather than a lesson artifact, and Chiron's actual target market
(schools/districts) means the individual is very likely a minor.

Before any real student account exists, this needs an explicit,
deliberate answer — not an assumption inherited from how Phase 1's
`profiles`/`lessons` visibility model happens to work — to at least:

- **Who can see one student's attempt history?** Candidates: the
  student themselves, their teacher (which teacher, if a student has
  several?), an org admin, some combination. This is a genuinely
  different visibility shape from anything Phase 1 built — `lessons`
  visibility is about a teacher choosing to share their own work
  (`private` / `org-shared` / `public-template`); a student's practice
  history is about _other people's_ visibility into a minor's
  performance data, which is a different kind of decision with
  different stakes, not a relabeling of the same enum.
- **Retention.** How long does attempt data persist, and is there a
  deletion path (a student leaving a school, an account being closed)?
  ADR-004's "discard unless there's a clear reason to keep it" default
  established for uploaded lesson binaries doesn't automatically
  transfer to a minor's longitudinal performance record — retention
  here is a policy decision with its own reasoning, not an inherited
  default.
- **Regulatory requirements.** Student-data-privacy law applicable to
  wherever Chiron is actually deployed (jurisdiction-dependent — not
  guessed at here; FERPA/COPPA-shaped concerns are the obvious category
  in a US K-12 context, but the actual applicable regime depends on the
  deployment and shouldn't be assumed from that example alone) may
  impose specific requirements on consent, access, deletion, or
  disclosure that go beyond what ordinary RLS-based access control
  (ADR-002) was designed to satisfy for teacher-facing Phase 1 data.

None of this blocks the design work above — the case schema, tutor FSM,
and calibration design are all reusable regardless of how these
questions resolve. It blocks _shipping student accounts_: this section
exists so that gate is visible and deliberate, with an owner (whoever
scopes the Phase 2 build) and a concrete trigger (before any real
student signs in), rather than something the team discovers mid-build.

## 8. Explicitly out of scope for this document

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
