# Chiron — Phase 2A Real-User Test

`prompts.txt` Prompt 36. This document is preparation only — a
structured feedback instrument, a set of behavioural indicators, and
instructions for running a small usability/learning test with 5-20
testers on the three canonical practice cases. **Do not analyze results
here.** Prompt 37 ("only after user testing") is where tester feedback
and attempt data actually get read and evaluated — running that
analysis before real data exists is explicitly out of scope for this
document.

Signup requires no org (`practice`'s own route guard only checks
`locals.user`), and `/practice` is reachable by any signed-in account
with no other setup — the existing signup → `/practice` flow already
lets 5-20 testers complete all three cases end to end. Prompt 36 needed
one small addition on top of that, `computeConfidenceShift` in
`practiceEvaluation.ts` (a pure function, same shape as its existing
siblings), to answer one behavioural-indicator question honestly rather
than by hand-waving.

`chiron_calibration_feedback_and_automation_prompts.txt` then closed
the two real gaps that pass left as manual work: there was no way to
tag a specific batch of sessions as one test round (every
`practice_sessions` row in the project was implicitly "the" cohort),
and pulling data for review meant hand-querying Supabase. Now: a
cohort-tagged entry link (`/practice?test=<id>`, an env-configured
allowlist — see "How to run it"), an in-app feedback form shown after
a cohort tester finishes all three cases (`user_test_feedback`, no
separate survey tool needed), and one CLI command
(`npm run test:user-report`) that produces a self-contained,
pseudonymised report. The structured-feedback-instrument text below is
now literally what that in-app form asks, not a spec for a form you
build yourself.

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

1. **Create/enable the cohort.** Pick a cohort id (e.g. `alpha-2026-08`
   — a short, dated slug is easiest to keep straight across rounds) and
   add it to `USER_TEST_COHORTS` in the deployment's environment (a
   comma-separated list — see `.env.example`). A cohort id not on this
   list is inert: `?test=` is silently ignored and the tester gets the
   normal, untracked experience. Redeploy/restart after changing it.
2. **Recruit 5-20 testers.** Anyone unfamiliar with Chiron's internals
   is more useful here than a colleague who already knows the mechanic
   — the questions below are specifically about first-encounter
   understandability.
3. **Share one cohort link.** Send
   `/signup?redirect=%2Fpractice%3Ftest%3D<cohort>` (URL-encoded so the
   `?test=` survives the signup redirect) — a tester who signs up
   through it lands on `/practice?test=<cohort>` right after
   confirming their email, and every session they start from then on
   (cookie-carried, 30 days) is tagged with that cohort automatically.
   No org needed, no invite code needed. A tester who's already signed
   in just needs the bare `/practice?test=<cohort>` link.
4. **What to ask them to do**: complete all three canonical cases, in
   one sitting if practical (consistency across testers matters more
   than realism here). Each case is roughly 10-11 discrete
   steps/screens (initial judgment and reasoning, initial confidence,
   an update-criterion prompt on one case, four evidence/challenge
   rounds, revised judgment and reasoning, revised confidence,
   reflection, a disposition check-in) — budget **5-10 minutes per
   case, 20-30 minutes total**.
5. **The feedback form appears automatically.** Once a cohort tester's
   third distinct completed case reaches its end screen, a "Continue to
   feedback" link replaces the usual "Back to practice cases" one,
   leading to the in-app form below — no separate survey tool, no
   reminder needed. It's shown at most once per (tester, cohort); a
   second visit reports it as already submitted.
6. **Run one report command** once the round is done:
   `npm run test:user-report -- --cohort <id>` (needs
   `SUPABASE_SERVICE_ROLE_KEY` locally — never exposed to testers).
   See "Generating the report" below.

## Structured feedback instrument

This is now the actual in-app form (`/practice/feedback`,
`src/routes/practice/feedback/+page.svelte`) a cohort tester sees after
finishing all three cases — not a spec to build your own survey from.
Listed here so the question set is reviewable without navigating the
app. Some wording differs slightly on-screen from the numbered list
below (written for the tester, not for this document), but the
question and response type are the same.

1. Were the cases understandable? _(1-5 scale)_
2. Did the tutor make you think more carefully? _(1-5 scale)_
3. Did new evidence feel meaningful, or did it feel like filler?
   _(1-5 scale)_
4. Did the tutor feel repetitive? _(1-5 scale)_
5. Were confidence percentages understandable as a way to answer?
   _(1-5 scale)_
6. Did "what would change your mind?" make sense as a question?
   _(yes / mostly / no / not applicable — only testers who saw
   `causal-inference-1` should answer anything but "not applicable")_
7. At any point did Chiron seem to steer toward a particular answer
   rather than better reasoning? _(yes/no + optional open text — this
   is the single most important question on this list: it's the
   tester-facing check on exactly what `prompts.txt` Prompt 33's
   neutrality suite tests from the code side. A "yes" here, even from
   one tester, is worth investigating specifically regardless of how
   the rest of the instrument scores — and surfaces as a CRITICAL flag
   in the generated report unconditionally.)_
8. Would you voluntarily do another case? _(yes/no)_
9. What worked best? _(open text, optional)_
10. What most needs changing? _(open text, optional)_

Narrower than Prompt 36's original 12-item instrument (dropped "did the
tutor give away the answer" — folded into question 7's steering check
— and "did the final explanation teach you anything," and merged
"schoolwork/interesting" into the two general open-text questions) —
deliberately streamlined to what `user_test_feedback`
(migration `0016`) actually stores, per this automation prompt's own
Section 2 field list. If a richer instrument is ever wanted again, add
the columns first; don't let the doc and the form drift apart a second
time.

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

## Generating the report

```sh
node --env-file=.env --import tsx scripts/export-user-test.ts --cohort alpha-2026-08
# equivalently:
npm run test:user-report -- --cohort alpha-2026-08
```

Needs `PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `.env` —
run locally by whoever's doing the review, never exposed to testers or
committed anywhere. Fetches every `practice_sessions` row tagged with
that cohort (and their joined `practice_attempts`/
`disposition_checkins`/`user_test_feedback`), reduces them into the
same `EvaluationDataPoint[]`/`CalibrationDataPoint[]` shapes
`practiceEvaluation.ts`/`practiceCalibration.ts` already expect (see
`tests/userTest/userTestReport.ts` — mirrors the calibration harness's
own `tests/calibration/evaluateCalibration.ts` split: pure
reduction/aggregation logic lives under `tests/` so it's covered by
`npm test`, the CLI script only fetches rows and writes files), and
writes `artifacts/user-tests/<cohort>/report.{txt,json,md}`
(gitignored by default — real tester data, no committed reference pair
the way calibration has one).

Useful flags:

- `--tester <n>` — scope to one pseudonymised tester (labels are
  assigned from the full, unfiltered cohort first, so "Tester 003"
  means the same thing whether or not you filter).
- `--case <id>` — scope to one canonical case.
- `--dry-run` — print the text report to stdout, write nothing.

The report is pseudonymised (`Tester 001`, `Tester 002`, ... — the
mapping is not persisted) and contains no email address, Supabase user
id, or auth token anywhere, including inside the raw per-tester
transcript section — verified by
`tests/userTest/userTestReportFormat.spec.ts`, not just asserted here.
It also carries automated **triage flags** (CRITICAL/HIGH/MEDIUM,
Section 8 of the automation prompt) — explicitly descriptive heuristics
for what to look at next, not efficacy claims or a pass/fail standard;
the report itself repeats this disclaimer next to the flags.

## After the test

**Inspect `report.txt` first** — it's the self-contained, deliberately
LLM-readable form (executive summary, triage flags, aggregate metrics,
survey summaries, per-case metrics, per-tester anonymised paths, then
full raw transcripts). Once real tester feedback and attempt data
exist and a report has been generated from them: `prompts.txt` Prompt
37 is the next step, not this document — feed it `report.txt`. Do not
run that analysis against synthetic or anticipated data — it explicitly
requires real results to exist first.
