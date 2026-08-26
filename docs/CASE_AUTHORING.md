# Case Authoring Guide (Phase 2A)

How to write a `PracticeCase` for Chiron's student practice mode.
Written for whoever authors the three canonical cases (`prompts.txt`
Prompt 21) and any case authored after them, while Phase 2A still means
"three hand-authored, system-seeded cases" (ADR-019) — nothing here
requires a UI or a database row; a case is a plain object validated
against `PracticeCaseSchema` (`src/lib/domain/practiceSchemas.ts`).

For the full design reasoning behind every field below, see
`docs/PHASE2.md`. This document is the practical "how do I actually
write one" companion — it doesn't re-argue the design, it tells you
what to type in.

## The shape, at a glance

```ts
{
  id: 'causal-inference-1',        // stable slug — see "Choosing an id" below
  title: '...',
  subjectProfileId: 'science-lab', // an existing subjectProfiles.ts slug
  skillTags: ['inference', 'evaluation'],       // CTSkillId[], taxonomy.ts
  dispositionTags: ['approach_to_inquiry'],     // taxonomy.ts's two clusters
  difficulty: 'core',              // 'intro' | 'core' | 'stretch'
  responseMode: 'evidence_support_scale', // the only mode Phase 2A implements
  scenario: '...',                 // the situated framing
  claim: '...',                    // "how strongly does the evidence support this?"
  evidencePool: [ /* EvidenceItem[] */ ],
  answerSpec: { /* targetRange, reasoningRubric, rationale */ },
  usesUpdateCriterion: false,      // or true + updateCriteria
  updateCriteria: undefined,
  provenance: { isSynthetic: true, note: '...' },
  educatorNotes: '...',            // hidden from learners entirely
  teachingExplanation: '...',      // shown only after an attempt completes
  visibility: 'public-template',
  createdBy: 'system'
}
```

## 1. Scenario and claim

The claim is always framed as evidence-support, not truth: **"how
strongly does the available evidence support this claim?"** — not "is
this true?" A student who believes the claim is probably true in the
real world, but correctly judges the evidence shown so far doesn't
establish it, should be able to land on a low-to-mid judgment and be
rewarded for that, not penalized for disagreeing with their own prior
belief. Write the scenario so a careful reader genuinely can't settle
the claim from the scenario text alone — that's what `evidencePool`
is for.

**Avoid a trick-question structure.** The case shouldn't hinge on a
single "gotcha" fact — include a real, plausible alternative reading of
the situation that a thoughtful student might land on and defend, even
if it isn't the one `targetRange` favors.

## 2. Evidence pool

Each `EvidenceItem` is `{ id, text, revealOrder, stance }`.

- `revealOrder` **must be unique per case** — the schema rejects
  duplicates. Evidence is revealed one item per tutor round
  (`PRESENT_NEW_EVIDENCE`); order them so the case builds toward its
  `targetRange` gradually, not all-at-once.
- `stance` is `'supports_claim' | 'supports_counter_claim' | 'ambiguous'`
  — author's own classification, used nowhere in scoring logic
  directly, but useful for reviewing whether a case's evidence pool
  actually has a mix (a case that's all `supports_claim` items can't
  meaningfully exercise "changed their mind" or "held firm").
- Write evidence as something a tutor can _point at_ later
  (`REFER_TO_REVEALED_EVIDENCE`) — a specific, quotable fact, not a
  vague gesture at a topic.

## 3. The answer spec — this is the part that determines credit

`answerSpec` has four fields:

```ts
{
  targetRange: { min: 'uncertain', max: 'somewhat_supported' },
  calibrationEligible: true,
  reasoningRubric: {
    finalJudgmentRules: [ /* ReasoningRule[] */ ],
    partialCreditSignals: [ /* string[] */ ]
  },
  rationale: '...'
}
```

**`targetRange`** is your own honest assessment, as the case author, of
what the fully-revealed evidence actually supports — a range (`min`
must not rank above `max` on the five-level scale), because real
evidence rarely pins to one exact reading. This is authoring
documentation, not what drives scoring directly — `reasoningRubric`
does that — but keep them consistent; a reviewer should be able to look
at `targetRange` and see why your rules are shaped the way they are.

**`calibrationEligible`** decides whether this case's confidence data
counts toward a student's calibration report (`docs/CALIBRATION.md`,
ADR-023). Set it `true` only when `targetRange` spans at most **two**
adjacent judgment bands — the schema enforces this and will reject
`true` on a wider range. A case whose defensible answer is
deliberately several bands wide (like Case 2's relative-vs-absolute-risk
design) should be `false`: "landed in range" would be too easy to hit
for it to say anything meaningful about whether the student's stated
confidence was justified.

**`reasoningRubric.finalJudgmentRules`** is the actual, deterministic
credit logic. Each rule:

```ts
{
  id: '...',
  acceptedJudgments: ['somewhat_supported'],   // one or more scale values
  requiredSignals: [],                         // signal ids, or [] for none
  minimumRequired: 0,                          // how many of requiredSignals must fire
  explanation: '...'                           // shown to the student when this rule matches
}
```

**Multiple rules = multiple creditable reasoning paths, not multiple
hoops.** Any one rule matching is independently sufficient for full
credit. Write a separate rule for each defensible final position your
case supports — most cases need at least two: one for the
straightforwardly-supported judgment (often `requiredSignals: []` —
see below), and one for `'uncertain'` if the evidence genuinely doesn't
settle the question even fully revealed.

**`requiredSignals: []` is not a degenerate case.** An empty array with
`minimumRequired: 0` means "landing on one of `acceptedJudgments` earns
credit regardless of stated reasoning depth" — this is what most cases'
obviously-supported judgment should look like. Reserve a real signal
requirement for judgments that need one to be genuinely earned —
typically `'uncertain'`: a student should only get credit for
"uncertain" if they can point to _why_ the evidence doesn't settle it
(a specific signal like `identifies_confounder` or
`identifies_missing_evidence`), not merely for declining to commit.

**Signal ids** in `requiredSignals` and `partialCreditSignals` must
resolve to one of two places, checked by the schema:

1. The closed, cross-case vocabulary (`reasoningSignalIds` in
   `practiceSchemas.ts` — `identifies_confounder`,
   `distinguishes_correlation_from_causation`,
   `identifies_missing_evidence`, and the rest — see
   `docs/PHASE2.md` Section 1a for the full table and what each means).
2. A signal id you declared in _this case's own_ `updateCriteria`
   (only relevant if `usesUpdateCriterion: true` — Section 5 below).

A typo'd or invented signal id is rejected at validation time, not
silently ignored — `PracticeCaseSchema.parse()` will tell you exactly
which string didn't resolve.

**`minimumRequired` can never exceed `requiredSignals.length`.** The
schema rejects a rule that could never be satisfied (e.g. "need 2 of
these 1 signals") — this is the "impossible reasoning rule" case the
validation catches.

**No hidden ideological answer matching.** Every `requiredSignals`
entry must be a genuine, checkable reasoning move against _this case's
own evidence_ — never a proxy for "did the student reach conclusion X"
on a contested real-world question. If you find yourself writing a rule
that can only be satisfied by a student agreeing with a particular
real-world position rather than demonstrating a specific reasoning
move against the evidence in front of them, that's a case-authoring
bug. The schema can't catch this for you (it only checks that a
referenced signal id exists) — it's a review-time judgment call.

**`partialCreditSignals`** are signals worth logging even when no rule
fires — evidence of reasoning progress that doesn't flip the final
outcome. List signals here that are plausible for this case but aren't
required by any rule.

## 4. Genuine uncertainty

`'uncertain'` is a real point on the five-level scale, not a "the case
is broken" fallback. A well-authored case where the evidence, even
fully revealed, doesn't settle the claim should set `targetRange` to
span `uncertain` and give it a real `finalJudgmentRules` entry with a
`requiredSignals` requirement — don't avoid this because it feels like
the case "doesn't have an answer." Some cases shouldn't.

## 5. Update criterion ("what would change your mind?")

Set `usesUpdateCriterion: true` only when your case has a genuinely
clean, checkable decisive-evidence moment — something a student could
reasonably name in advance ("a control group comparison," "the actual
denominator," "whether the sources are independent") before it's
revealed. If it does, add one or more `updateCriteria` entries:

```ts
updateCriteria: [
	{
		id: '...',
		signal: 'requests_control_comparison', // your own label, not from the closed vocabulary
		description:
			'Recognises that a comparable control group would materially change the inference.',
		relevantEvidenceItemIds: [controlGroupEvidenceId] // which evidencePool item(s) actually deliver this
	}
];
```

`signal` here is deliberately case-specific — it becomes a valid
`requiredSignals`/`partialCreditSignals` target for this case's own
rules (see the schema's cross-check); listing it in
`partialCreditSignals` is what lets a genuinely relevant stated
criterion earn a `ScoringEvent` through the normal per-case path, on
top of the mechanic-level credit described below. `description` is
never shown to the student; it's what a reviewer reads to sanity-check
classifier output later. `relevantEvidenceItemIds` must reference real
ids from this case's own `evidencePool` (validated at parse time) — it's
how `updateCriterionConsistency.ts` (`prompts.txt` Prompt 26, ADR-022)
deterministically answers "did the promised evidence appear," without
asking an LLM to re-judge that at scoring time. If your criterion is
genuinely satisfied by more than one evidence item together, list all
of them — every id in the array must have been revealed for the
criterion to count as met.

You do **not** need to separately list `states_update_criterion`,
`relevant_update_criterion`, or `follows_declared_update_criterion` in
`partialCreditSignals` — those three are mechanic-level credit, granted
automatically by `updateCriterionConsistency.ts` whenever
`usesUpdateCriterion` is on, not something a case author opts into.

If `usesUpdateCriterion` is `false` (the common case), omit
`updateCriteria` entirely — don't set it to an empty array.

## 6. Provenance, educator notes, and the teaching explanation

Three fields, each with a different visibility rule — get these right,
since the schema won't catch a mistake here (it can validate _shape_,
not _when_ a route is allowed to show something):

- **`provenance: { isSynthetic, note }`** — your own authorial
  grounding. For every Phase 2A case, `isSynthetic: true` — write
  fiction, don't adapt a real reported event, study, or product. This
  matters even more for a case that's itself about media/source
  verification: the case content must never be mistakable for a real
  claim if it's ever quoted out of context. `note` is a short
  explanation of what (if anything) inspired the scenario, phrased so
  it's clear nothing here describes a real event.
- **`educatorNotes`** — hidden from the student at every point, forever
  (not just until completion). Write what you'd want a reviewer or
  future case-author to know: the intended failure mode, what a strong
  vs. weak attempt looks like, anything non-obvious about why the
  `reasoningRubric` is shaped the way it is.
- **`teachingExplanation`** — shown to the student, but _only_ after
  their attempt completes (`SCORE_AND_RECORD` / the end-of-case
  feedback screen — `docs/PHASE2A_IMPLEMENTATION.md` Section 11). Write
  it as the case's own "here's what the evidence actually established"
  — the register to use is stated plainly, not "you got X% right": what
  the evidence shows and doesn't show, phrased so it teaches regardless
  of which judgment the student landed on.

`toPublicPracticeCase()` strips all three, the same as `answerSpec` and
`evidencePool` — a case-listing or case-intro screen never sees any of
them. `teachingExplanation` specifically also needs a _route-level_
guarantee, not just a schema one: `getTeachingExplanation()` returns it
unconditionally (it has no way to check attempt state), so whatever
code calls it is responsible for only doing so once an attempt has
actually completed.

## 7. `visibility` and `createdBy`

For every Phase 2A canonical case: `visibility: 'public-template'`,
`createdBy: 'system'`. There's no per-org case sharing or teacher
authorship in Phase 2A (ADR-019) — these fields exist for schema
compatibility with the eventual Phase 2B shape, not because Phase 2A
uses the other values.

## Choosing an id

A short, stable, kebab-case slug (e.g. `causal-inference-1`) — not a
UUID. There's no `practice_cases` table (ADR-019); this id is what
`practice_sessions.case_id` / `practice_attempts.case_id` store
directly, the same way `lessons.subject_profile_id` stores a
`subjectProfiles.ts` slug. Once a case ships, treat its id as
permanent — changing it breaks the reference from any attempt already
recorded against it.

## Validating a case while you write it

```ts
import { PracticeCaseSchema } from '$lib/domain/practiceSchemas';

PracticeCaseSchema.parse(myDraftCase); // throws with a specific message on any of the above
```

`src/lib/domain/practiceSchemas.spec.ts` has worked examples of every
validation rule in this document, including the exact error each
mistake produces — useful as a reference while drafting.
