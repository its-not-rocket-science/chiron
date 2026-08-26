# Chiron — Phase 2A Evaluation Plan

`prompts.txt` Prompt 34. Implementation: `src/lib/domain/practiceEvaluation.ts`
(pure computation, mirroring `practiceCalibration.ts`'s shape). Design
rationale: `docs/DECISIONS.md` ADR-026 — this document is the practical,
product-facing reference; ADR-026 is the "why built this way" record.

## What this document is for

Chiron's practice mode (Phase 2A) generates real interaction data —
judgments, confidence, tutor challenges, reasoning signals. This
document says what questions that data can and cannot answer, at three
different levels of confidence, and is explicit that most of what
Chiron can measure right now sits at the bottom two levels, not the
top:

1. **Product engagement** — do people use it? (answerable now, from
   existing data)
2. **Immediate learning process** — does the interaction do the things
   it's designed to do, moment to moment? (answerable now, from
   existing + Prompt 34's new data)
3. **Actual educational efficacy** — does using Chiron make students
   better critical thinkers? (**not** answerable from this
   instrumentation alone — see that section)

Collapsing these three into one number, or treating a Tier 1/2 result
as evidence for Tier 3, is exactly the overclaim `prompts.txt` Prompt 34
explicitly warns against ("do not claim these metrics prove
critical-thinking improvement"). This document is written to make that
mistake hard to make by accident.

## Tier 1 — Product engagement

_Do users finish cases? Do they voluntarily do another?_

| Question                                   | Metric                                                                                                                                                                                   | Data source                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Do students who start a case finish it?    | Case completion rate                                                                                                                                                                     | `computeCompletionRate` — `practice_sessions.fsm_state = 'COMPLETE'` vs. total started          |
| Where do students who don't finish stop?   | Stage abandonment                                                                                                                                                                        | `computeStageAbandonment` — a non-completed session's current `fsm_state` IS where it stalled   |
| Do students engage with optional depth?    | Update-criterion supply rate                                                                                                                                                             | `computeUpdateCriterionRate` — `update_criterion_text` supplied, on cases offering the mechanic |
| Do students follow through to the end?     | Reflection completion rate                                                                                                                                                               | `computeReflectionCompletionRate` — `SUBMIT_REFLECTION` recorded                                |
| Do students come back and do another case? | **Not instrumented.** Needs a per-student query across sessions (repeat-session rate) — straightforward once real usage exists to query, deliberately not built against zero real users. |

## Tier 2 — Immediate learning process

_Do users generate more alternatives after prompting? Do confidence
judgements become more proportionate within cases? Do users identify
missing evidence?_

| Question                                                                 | Metric                                                      | Data source                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| What reasoning moves show up at all?                                     | Reasoning signals detected                                  | `practice_attempts.scoring_events` — every event with a non-null `signal`                                                                    |
| **Does challenge prompt new reasoning moves that weren't there before?** | Reasoning signals added after challenge                     | `computeSignalsAddedAfterChallenge` — diff of `initial_reasoning_signals` (new, migration 0012) against `scoring_events`' present-signal set |
| What pedagogical moves does the tutor actually use?                      | Tutor action categories                                     | `computeTutorActionDistribution` — `practice_sessions.transcript[].action.action`                                                            |
| Do judgments shift in a defensible direction after evidence?             | Initial vs. revised judgment distribution                   | `computeJudgmentDistribution` — `initial_judgment`/`revised_judgment`, both already stored                                                   |
| Do stated confidence levels track actual defensibility?                  | Confidence calibration (Prompt 27, separate document)       | `docs/CALIBRATION.md`/`practiceCalibration.ts` — not re-described here, this plan just points at it                                          |
| Do students identify missing evidence when prompted?                     | `identifies_missing_evidence` signal rate, before vs. after | Same mechanism as "signals added after challenge," filtered to this one signal                                                               |

**"Reasoning signals added after challenge" is the one metric this
prompt required that genuinely didn't exist before.** Before this
prompt, only the REVISED reasoning (written after the tutor's
challenge) was ever classified — there was no baseline to diff against,
so "did challenge prompt something new" could not be answered honestly.
`practice_attempts.initial_reasoning_signals` (migration 0012) adds one
more classifier call, on the student's initial reasoning, specifically
to make this a real diff instead of a documented gap. `ADR-024`'s
Prompt 34 update has the full cost-tradeoff reasoning; this was
confirmed with the user before building, since it directly raised the
per-attempt model-call ceiling ADR-024 had just finished hardening.

This tier answers "does the interaction do what it's designed to do,"
which is real signal — but it is still short-horizon, within-case
behavior, not a claim about durable skill change. See Tier 3.

## Tier 3 — Actual educational efficacy

_Does using Chiron make students better critical thinkers?_

**Not answerable from Phase 2A's instrumentation, and this document
does not pretend otherwise.** A real answer needs:

- A **pre-post design**: measuring the same students' reasoning ability
  before and after a period of Chiron use, not just observing
  within-Chiron behavior.
- **Validated external critical-thinking measures** — an established
  instrument (e.g. something in the tradition of the tests Abrami et
  al.'s 2015 meta-analysis itself draws on), not Chiron's own
  in-app signals, since a tool cannot validly grade its own
  effectiveness using only the data it itself produced.
- A **controlled comparison** — a group that didn't use Chiron (or used
  a different intervention), so an observed change can be attributed to
  Chiron rather than to maturation, classroom instruction happening
  anyway, or practice-effect on whatever measure is used.
- Ideally, a **longitudinal** window — durable skill transfer, not a
  same-session improvement that fades.

None of this exists yet, none of it is Phase 2A's job to build, and
Tier 1/2 metrics — however positive — are not evidence for it. A high
completion rate says the product is usable. A high rate of "signals
added after challenge" says the challenge mechanic prompts visible
reasoning moves in the moment. Neither says a student is a better
critical thinker a month later. `prompts.txt` Prompts 36-37 (real
user-testing gate) are the point where this tier's actual research
design gets planned — Phase 2A's job was to make Tier 1/2 honestly
measurable in the meantime, not to skip ahead and claim Tier 3.

## Connection to Abrami et al.'s instructional principles

`docs/ARCHITECTURE.md`'s three pillars (dialogue, authentic/situated
problems, mentoring — Abrami et al., 2015) describe what Phase 1's
_lesson-plan scoring_ rewards teachers for designing. Phase 2A's
practice mode is a different artifact — an actual instance of a
Socratic dialogue with a situated problem, not a rubric for one — and
this evaluation plan is what would show whether that instance embodies
the same principles, not just whether the mechanic runs:

- **Dialogue**: the tutor's fixed action vocabulary (`ACTION_GUIDANCE`,
  `tutorPrompt.ts`) is entirely made of Socratic moves — asking for
  reasoning, alternatives, missing evidence, causal distinctions — never
  a lecture or a verdict. Tier 2's tutor-action-category distribution is
  the direct evidence of whether that vocabulary is actually being used
  in a mix of genuinely probing ways, not defaulting to one repetitive
  move.
- **Authentic/situated problems**: the three canonical cases are
  designed around real reasoning traps (confounders, relative-vs-
  absolute risk, source provenance) rather than abstract logic puzzles.
  Tier 2's judgment-shift and signal-detection data is the evidence of
  whether students are actually engaging with the situated specifics of
  a case (naming the bypass, the denominator, the press release) rather
  than reasoning about it as if it were generic.
- **Mentoring**: the tutor never grades, never reveals the answer key
  (structurally — ADR-025's Tier 1 proof), and challenges gaps in
  reasoning rather than disagreement with a target (Prompt 33's
  neutrality suite). Tier 1's completion/abandonment data is the
  evidence of whether that mentoring stance actually keeps students in
  the loop rather than driving them off — a punitive-feeling
  "gotcha" tutor would show up here as elevated abandonment at
  `AWAIT_CHALLENGE_RESPONSE`.

None of this is a claim that Phase 2A _achieves_ Abrami's outcomes —
that claim belongs to Tier 3, which this plan explicitly says Chiron
cannot make yet. It is a claim that the _design_ was built with these
principles as the target, and that Tier 1/2 data is what would show
whether the built mechanic is actually behaving the way that design
intends, before any claim about learning outcomes is even attempted.

## What is deliberately not instrumented

- **Time per stage.** Prompt 34 itself gates this behind "if privacy
  policy permits." No privacy policy exists yet — `docs/STATUS.md`'s
  "Known privacy/security debt" section already records data retention
  and applicable regulation (FERPA/COPPA/other) as open, unanswered
  governance questions (Prompt 30's review). Collecting new per-stage
  timestamps now would mean guessing that a policy which doesn't exist
  would permit it. Total session duration
  (`practice_sessions.created_at` to `practice_attempts.created_at`) is
  already available with zero new instrumentation, as a coarser
  substitute, if that alone is useful before the policy question is
  resolved.
- **Cross-session engagement (repeat usage, streaks, etc.).** Real
  signal, but querying it meaningfully needs actual multi-session usage
  to exist first — building it against zero real students would be
  exactly the "instrument without explicit need" Prompt 34 warns
  against.
- **Any third-party analytics or tracking.** Not used, not planned. All
  data described in this document already lives in
  `practice_sessions`/`practice_attempts`/`disposition_checkins`,
  first-party, under the same RLS isolation `docs/SECURITY.md` Section 9
  audited.

## What this instrumentation is not

No metric in this document, alone or combined, is a "critical thinking
score." Nothing here is served to a teacher, an administrator, or a
district as a per-student outcome measure — Chiron does not currently
expose any of this data to anyone but the student themselves
(`docs/SECURITY.md` Section 9's "who sees a student's attempt history"
finding still holds; this plan doesn't add a new reader). This is
evaluation instrumentation for Chiron's own product/research use in
deciding whether Phase 2A's mechanic is working as designed — not a
grading, ranking, or reporting feature.
