# Confidence Calibration

`prompts.txt` Prompt 27. Implementation: `src/lib/domain/practiceCalibration.ts`.
Design rationale recorded in `docs/DECISIONS.md` ADR-023 — this document
is the practical reference; ADR-023 is the "why we didn't do it the
way `docs/PHASE2.md` Section 4 originally sketched" record.

## What "confidence" means

The confidence question shown to a student, verbatim, is:

> How confident are you that this is the best-supported judgement given
> the evidence currently available?

This is asked twice per attempt — after the initial judgment and after
the revised judgment (`docs/PHASE2.md` Section 3's FSM). Calibration
uses only the **revised** confidence, since that's the value asked
after all the case's evidence has actually been shown — the confidence
that should track reality most closely.

Note precisely what the question is _not_ asking: it is not "how
confident are you that Chiron will mark this correct." Those are
different questions, and conflating them is the mistake the rest of
this document exists to avoid.

## The binary event: targetRange, not `outcome`

A confidence value is meaningful only paired with a genuinely binary
event it's a probability estimate of. The candidate that's already
sitting in `PracticeAttempt` is `scoringExplanation.outcome`
(`'correct' | 'incorrect'`) — but using it directly would be wrong.
`outcome` depends on two things: (1) whether the final judgment falls
in the case's defensible range, **and** (2) whether the student
articulated the specific reasoning signals the matched rule requires. A
student can hold the exact right judgment, be genuinely confident in
it, and still score `outcome: 'incorrect'` because they didn't put a
required signal into words clearly enough for the classifier to detect
it. That's an articulation gap, not a calibration gap — scoring it
against `outcome` would make a well-calibrated student look
miscalibrated for the wrong reason.

Instead, calibration is checked against **`judgmentWithinTargetRange`**
(`practiceCalibration.ts`): did the revised judgment land within the
case's authored `answerSpec.targetRange`? This is exactly the question
the confidence prompt asks — "is this the best-supported judgement" —
operationalized as "is my chosen band inside the range the case author
designed as defensible." It needs no new stored field: `targetRange`
lives on the (static) `PracticeCase`, and the revised judgment is
already on the attempt row.

## Which cases count: `calibrationEligible`

Not every case is a fair calibration signal. `answerSpec.calibrationEligible`
(a case-authored boolean, `PracticeCaseSchema`) marks whether a case's
confidence data should be included in calibration aggregation at all —
`prompts.txt` Prompt 27's explicit instruction ("do not automatically
treat every practice case as calibration-scorable").

The schema enforces a structural rule, not just a convention:
`calibrationEligible: true` requires `targetRange` to span **at most
two adjacent judgment bands**. A wider range makes "landed in range"
too easy to hit to mean anything about calibration — Case 2 (relative
vs. absolute risk) is deliberately three bands wide, because its whole
point is that the defensible answer sits in the genuine middle of the
scale, and is marked `calibrationEligible: false` for exactly that
reason. Cases 1 and 3 are both two bands wide and marked eligible.

| Case                           | targetRange band width | calibrationEligible |
| ------------------------------ | :--------------------: | :-----------------: |
| Causal inference (1)           |           2            |       `true`        |
| Relative vs. absolute risk (2) |           3            |       `false`       |
| Source provenance (3)          |           2            |       `true`        |

## Confidence bands: five, not ten

`docs/PHASE2.md` Section 4's original sketch proposed decile buckets
(0-10%, 10-20%, ..., 90-100%). This implementation uses five 20-point
bands instead (`CONFIDENCE_BANDS`): `0-20%`, `20-40%`, `40-60%`,
`60-80%`, `80-100%`. Phase 2A's realistic attempt volume per student —
a handful of completed cases, not hundreds — would leave nearly every
decile bucket permanently below any usable sample-size threshold.
Coarser bands make "insufficient data" the exception for a real student
who's done a few cases, not the default for all ten buckets.

A confidence value lands in the band whose range it falls into,
`[min, max)`, except the top band (`80-100%`), which is inclusive on
both ends so a confidence of exactly 100 has somewhere to go.

## Sample-size threshold: no fake precision

`MIN_SAMPLE_SIZE = 5`. Below this many data points:

- A confidence band's `observedAccuracy` is `null`, not a computed
  percentage — even if that percentage happens to be 100% or 0%. One or
  two attempts landing "in range" is not evidence of calibration in
  either direction, and displaying `100%` from `n=1` is exactly the
  fake precision Prompt 27 warns against.
- The overall Brier score is `null` if there are fewer than 5
  calibration-eligible attempts in total, for the same reason.

5 is a deliberately low, practically-motivated bar — not a
statistically rigorous minimum sample size for a real reliability
estimate. It's chosen so a genuinely engaged Phase 2A tester (a handful
of completed eligible cases) can see _something_ before real
statistical power exists, while a single attempt still shows
"insufficient data" rather than a number dressed up as a fact.

## Brier score

Computed only over calibration-eligible attempts, once there are at
least `MIN_SAMPLE_SIZE` of them:

```
brierScore = mean( (confidence/100 − withinTargetRange) ** 2 )
```

where `withinTargetRange` is `1` if the revised judgment landed in the
case's `targetRange`, `0` otherwise. This is the standard Brier score
for a probabilistic forecast of a binary event — mathematically clean
here specifically _because_ the event being forecast
(`judgmentWithinTargetRange`) is genuinely binary and genuinely what
the confidence question asks about (see the section above). Lower is
better: `0` is perfect calibration, `1` is maximally wrong
(100%-confident and wrong every time). A single value in isolation
isn't very informative; a trend over a student's attempts is the
actually useful signal, once there are enough attempts to trend.

## What this does not (yet) do

- **No per-skill breakdown.** `docs/PHASE2.md` Section 4 originally
  proposed computing both aggregates per-skill (`caseId → skillTags`)
  as well as overall. Not built here: with only three canonical cases
  and a handful of skill tags between them, per-skill sample sizes
  would be even thinner than the overall ones, and would show
  "insufficient data" for essentially every real user in the near
  term — building the breakdown now would be complexity with no
  reachable payoff yet. Worth revisiting once real attempt volume
  exists (Phase 2A user testing, `prompts.txt` Prompts 36-37, or
  Phase 2B).
- **No route or UI.** This document and `practiceCalibration.ts` cover
  the "storage" (already satisfied — no new column needed, everything
  is derivable from existing `PracticeAttempt` rows) and "reporting"
  (the computation) halves of Prompt 27's ask. Surfacing a calibration
  report to a student is `prompts.txt` Prompt 28's (student case UI) or
  Prompt 29's (end-of-case feedback, which explicitly names a
  "confidence/update summary") job, not built here.
