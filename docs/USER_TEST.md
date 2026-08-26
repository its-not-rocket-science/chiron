# Chiron — Phase 2A Real-User Test

`prompts.txt` Prompt 36. This document is preparation only — a
structured feedback instrument, a set of behavioural indicators, and
instructions for running a small usability/learning test with 5-20
testers on the three canonical practice cases. **Do not analyze results
here.** Prompt 37 ("only after user testing") is where tester feedback
and attempt data actually get read and evaluated — running that
analysis before real data exists is explicitly out of scope for this
document.

No new runtime feature was needed to administer this test. Checked,
not assumed: signup requires no org (`practice`'s own route guard only
checks `locals.user`), and `/practice` is reachable by any signed-in
account with no other setup. The existing signup → `/practice` flow
already lets 5-20 testers complete all three cases end to end — see
"How to run it" below for the concrete steps. The one small addition
this pass made is `computeConfidenceShift` in `practiceEvaluation.ts`
(a pure function, same shape as its existing siblings) — needed to
answer one of the behavioural-indicator questions below honestly rather
than by hand-waving; not a platform feature.

## Scope: what this test is and isn't

This is a **usability/learning-process** test —
`docs/EVALUATION_PLAN.md`'s Tier 1/2, not Tier 3. It answers "does the
interaction feel understandable, fair, and worth continuing," and
surfaces real behavioural signal (confidence shifts, reasoning-signal
changes) — it does **not** answer "does Chiron make people better
critical thinkers." Don't let a good result here read as evidence for
that; `docs/EVALUATION_PLAN.md`'s Tier 3 section explains what that
would actually require.

## Before recruiting: a privacy note

No data-retention policy or applicable-regulation decision exists yet
for Chiron (`docs/STATUS.md`'s "Known privacy/security debt", from the
Prompt 30 review) — that gap is specifically about deploying to real
students in a school/district context. **Recruit adult testers for
this round, not minors** — this test doesn't need to wait on that
policy decision if the testers aren't the population that decision is
about. Tell testers plainly, before they start: their case attempts
(judgments, confidence, free-text reasoning, tutor transcript) will be
reviewed by the product team to evaluate the tool, retained for that
purpose (no deletion timeline exists yet), and not shared outside that
review. That's a real, honest description of what `docs/SECURITY.md`
Section 9 already established the data model does — not a new promise
being made here.

## How to run it

1. **Recruit 5-20 testers.** Anyone unfamiliar with Chiron's internals
   is more useful here than a colleague who already knows the mechanic
   — the questions below are specifically about first-encounter
   understandability.
2. **Account setup**: have each tester sign up normally at `/signup`
   (email/password) — no org needed, no invite code needed. Send them
   directly to `/practice` afterward (e.g. `/signup?redirect=/practice`
   as the link you share, so they land on the case picker immediately
   after confirming their email, not the teacher-facing lesson-scoring
   homepage).
3. **What to ask them to do**: complete all three canonical cases, in
   one sitting if practical (consistency across testers matters more
   than realism here). Each case is roughly 10-11 discrete
   steps/screens (initial judgment and reasoning, initial confidence,
   an update-criterion prompt on one case, four evidence/challenge
   rounds, revised judgment and reasoning, revised confidence,
   reflection, a disposition check-in) — budget **5-10 minutes per
   case, 20-30 minutes total**.
4. **Immediately after finishing all three**, have them fill out the
   feedback instrument below while the experience is fresh — a next-day
   follow-up loses the specific, in-the-moment reactions the questions
   are trying to capture.
5. **No admin dashboard exists** (a deliberate scoping decision,
   ADR-026 — same as calibration's own reporting, Prompt 27) — pulling
   attempt data for review is a short manual step, covered below.

## Structured feedback instrument

Copy these into whatever survey tool is convenient (a form, a shared
doc, a live interview script) — the exact medium doesn't matter, the
question set does. Suggested response type noted per question; open
text is always welcome alongside a scale.

1. Was the case understandable? _(1-5 scale + open text)_
2. Did the challenge make you reconsider anything? _(yes/no + what,
   open text)_
3. Did new evidence feel meaningful, or did it feel like filler?
   _(1-5 scale)_
4. Did the tutor give away the answer, at any point? _(yes/no — if yes,
   ask them to describe when)_
5. Did the tutor feel repetitive? _(1-5 scale)_
6. Did "what would change your mind?" make sense as a question?
   _(yes/no + open text — only testers who see `causal-inference-1`
   will hit this one)_
7. Did confidence percentages feel understandable as a way to answer?
   _(1-5 scale)_
8. Did the final explanation teach you anything? _(yes/no + open text)_
9. Did you want to try another case? _(yes/no)_
10. What felt like schoolwork? _(open text)_
11. What felt genuinely interesting? _(open text)_
12. At any point did the app seem to reward a particular opinion rather
    than reasoning — like it was steering you toward a "right answer"
    instead of just checking your reasoning? _(yes/no + open text —
    this is the single most important question on this list: it's the
    tester-facing check on exactly what `prompts.txt` Prompt 33's
    neutrality suite tests from the code side. A "yes" here, even from
    one tester, is worth investigating specifically, regardless of how
    the rest of the instrument scores.)_

## Behavioural indicators to review from attempt data

Every indicator below is already computable from existing storage — no
new instrumentation beyond `computeConfidenceShift`, added this pass.
See `docs/EVALUATION_PLAN.md` for the fuller Tier 1/2/3 framing; this
table is scoped specifically to what Prompt 36 asked for.

| Indicator                                                    | Function                                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changes in reasoning signals after Socratic challenge        | `computeSignalsAddedAfterChallenge`                                                                                                                                                                                             | Already built, Prompt 34. Cross-reference against feedback question 2 — a tester who says "yes, I reconsidered" but shows zero added signals is worth a closer look at the transcript, not just the aggregate number.                       |
| Changes in confidence after material evidence                | `computeConfidenceShift` _(new this pass)_                                                                                                                                                                                      | Reports both a mean shift and a `movedMoreThanOneBand` count deliberately — a near-zero mean can hide real movement in both directions (some testers up, some down), which the mean alone would misread as "nobody changed their mind."     |
| Mismatch between declared update criterion and actual update | `updateCriterionConsistency.ts` (`practice_attempts.update_criterion.consistency`)                                                                                                                                              | Already built, Prompt 26 (ADR-022) — a five-status result per attempt on `causal-inference-1` specifically (the only case using the mechanic). Read the status distribution across testers, not just individual cases.                      |
| Frequency of unsupported certainty                           | `practiceCalibration.ts`'s bands, filtered to high-confidence bands with low `observedAccuracy`                                                                                                                                 | Already built, Prompt 27. With only 5-20 testers, `MIN_SAMPLE_SIZE` (5) may not be met in every band — expect some `null`s, don't force a reading out of too little data.                                                                   |
| Use of uncertainty                                           | `computeJudgmentDistribution` (count of `'uncertain'` judgments) + signal frequency for `acknowledges_uncertainty` (from `computeSignalsAddedAfterChallenge`'s underlying counts, or a direct tally of `revisedSignalsPresent`) | Two angles on the same question: how often testers land on "uncertain" as a judgment, and how often they explicitly name uncertainty in their reasoning — these can diverge (a student can pick "uncertain" without ever articulating why). |

## Pulling the data for review

There's no cohort-tracking column, and none was added for this pass —
for this specific internal test round, every `practice_sessions` row
in the project **is** the test cohort (Phase 2A has no real deployed
users yet). A future real deployment, with real students alongside
internal testers, would need actual cohort tagging — out of scope
here, flagged rather than guessed at.

To build the `EvaluationDataPoint[]` the functions above expect, join
`practice_sessions` to `practice_attempts` on `session_id`
(service-role client, same as any other cross-session read — RLS scopes
these tables to their owning student, so a review script needs the
service-role key, run locally by whoever's doing the review, never
exposed to testers or committed anywhere). `disposition_checkins` joins
in on `attempt_id` if reviewing that too. Read `transcript` for
`tutorActions`, `initial_reasoning_signals` for `initialSignalsPresent`,
and derive `revisedSignalsPresent` from `scoring_events` (filter to
entries with a non-null `signal`) — exactly the shapes
`practiceEvaluation.ts`'s own doc comments describe field by field.

## After the test

Once real tester feedback and attempt data exist: `prompts.txt` Prompt
37 is the next step, not this document. Do not run that analysis
against synthetic or anticipated data — it explicitly requires real
results to exist first.
