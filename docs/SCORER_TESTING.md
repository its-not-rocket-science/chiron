# Chiron — Scorer Testing

`chiron_calibration_feedback_and_automation_prompts.txt` Prompt M4.
Practical reference for testing Phase 1's lesson scorer. Design
rationale lives in `docs/SCORER_CALIBRATION.md` (the diagnosis) and
`docs/DECISIONS.md` (any ADR the calibration work produced); this
document is "how to actually run something."

## Three different layers, three different jobs

**Deterministic unit tests** (`scoringPrompt.spec.ts`,
`llmScoringCore.spec.ts`, `schemas.spec.ts`, ...) — pure logic, no
network call, run on every `npm test`. These prove the prompt-building
functions produce the right structure (does a `history-essay` profile
actually change the prompt text, does the JSON shape description list
all six skills) and that validation/retry logic behaves correctly
against a scripted fake `createMessage`. They cannot tell you whether
the _model_ actually scores a lesson correctly — that's not what
they're for.

**Live scorer calibration** (`npm run test:calibration`) — real model
calls, real scoring prompt, real domain code, against a fixed set of
pedagogically-designed fixtures with known expected bands. This is
what tells you whether the scorer is actually calibrated: does it
discriminate genuine reasoning from surface compliance, is authenticity
scoring sane, does subject-profile flavor stay flavor rather than
becoming a scoring shortcut. Costs real API spend, takes real time —
run it before/after any scoring-prompt change, not on every commit.

**Browser E2E** (manual, or a future Playwright suite) — the actual UI:
paste/upload flow, subject-profile selector, results rendering,
revise-and-resubmit, save/library. Calibration tests scoring
_correctness_; E2E tests the _product_ around it. Neither substitutes
for the other.

## Why exact scores are never asserted

`docs/SCORER_CALIBRATION.md`'s own repeatability data (three runs per
lesson, same lesson, same prompt) shows real one-point variance is
normal for an LLM-graded rubric — Roman Republic's dialogue score
alone varied 2/3/3 across three identical runs. Asserting `authenticityScore === 2`
would make the test suite flaky in exactly the way that erodes trust in
it (a real failure gets lost in the noise of expected variance failing
alongside it). Every fixture instead asserts a **band** (a min-max
range wide enough to absorb normal variance) plus, where the manual
calibration pass found a genuine miscalibration, a **hard invariant**
(a specific, named, non-negotiable rule — see
`tests/calibration/fixtures/calibrationFixture.ts`'s own header comment
for the exact PASS/WARN/FAIL semantics). **Paired contrasts** (does
fixture A score higher than fixture B on some dimension) are often more
robust than either fixture's absolute score, for the same reason —
they cancel out whatever the model's overall calibration baseline is
that day.

## `subjectProfileId` is mandatory, always

Chiron currently exposes exactly two Phase 1 subject profiles:
`science-lab` and `history-essay`. Every calibration fixture must
declare which one it's written for — `CalibrationFixtureSchema`
enforces this at parse time, so a fixture with a missing or invalid
`subjectProfileId` fails to load rather than silently running under the
wrong profile. This exists because the manual test pass that preceded
this harness didn't consistently record which profile each lesson ran
under, which made some results (B2's "pedestrianisation" fixture, most
notably) impossible to draw a firm conclusion from — see
`docs/SCORER_CALIBRATION.md`'s own caveat.

## Commands

```bash
# Quick sanity check — validates all fixtures, prints the call count, makes no API calls
npm run test:calibration -- --dry-run

# A fast, cheap pass — one run per fixture, a specific profile only
npm run test:calibration -- --provider deepseek --runs 1 --profile science-lab

# Full release calibration — 5 runs per fixture (more repeatability signal), everything
npm run test:calibration -- --provider deepseek --runs 5 --format all

# One specific fixture, useful while iterating on a prompt change
npm run test:calibration -- --fixture H-B1 --runs 3

# Compare a fresh run against a saved baseline
npm run test:calibration -- --runs 3 --compare artifacts/calibration/baseline.json

# Fail the exit code on WARN too, not just FAIL — useful in a stricter CI gate
npm run test:calibration -- --strict

# Smoke-test an actual deployment (small fixed subset, one run, honors 429 Retry-After)
npm run test:calibration -- --base-url https://chiron.example.com
```

Every run prints the exact call count _before_ making any calls
(`N fixtures x M runs = ... total live calls`) — check this before
committing to a `--runs 5` full-suite pass if cost matters. Default
concurrency is 1 (sequential); `--concurrency N` runs up to N calls in
flight, still bounded, never unbounded parallel fan-out.

## Exit codes

`0` — no hard failures (WARNs are fine unless `--strict`). `1` — at
least one hard failure (a fixture's `hardInvariants` violated, an
injection variant materially changed the score, or a paired contrast
failed to discriminate). `2` — the runner itself errored (bad flags,
missing API key, a fixture failed to validate). Use `1` as the CI gate
signal; `2` means something is broken about the harness or environment,
not about scorer calibration.

## Reading a report

Every run writes `artifacts/calibration/<timestamp>-calibration.{txt,md,json}`
(gitignored by default — these are generated artifacts, not source) and
updates `latest.txt`/`latest.json` in the same directory. The `.txt`
report is deliberately self-contained and structured for pasting
straight into an evaluating LLM's context: it opens with generation
metadata (commit SHA, dirty-tree flag, provider/model/prompt version),
an EXECUTIVE SUMMARY, then HARD FAILURES and WARNINGS as flat,
one-line-per-issue lists (no need to cross-reference the fixture file
to understand a finding — the invariant's own `reason` text is
inlined), then PROFILE SUMMARY, PAIRED CONTRASTS, FIXTURE RESULTS
(repeatability data per fixture), and finally RAW MODEL OUTPUT (every
run's full justifications and suggestions, verbatim, clearly delimited
per run) so a human or an LLM reviewing the report can check the
evaluator's verdict against what the model actually said. To ask an
LLM "does this calibration report suggest a real problem," paste
`artifacts/calibration/latest.txt` directly — it needs no other
context from this repo to be interpretable.

## Before/after comparison

`--compare <path-to-previous.json>` loads a previously-saved JSON
report and prints a deterministic diff against the current run — no
LLM involved (`scripts/lib/compareReports.ts`): verdict changes per
fixture, mean-pillar-score changes, skill-credit flips (a skill going
from majority-not-covered to majority-covered or back), and variance
changes. This is the tool for "did my prompt change actually help" —
save a baseline before changing `scoringPrompt.ts`, apply the change,
rerun with `--compare` against the baseline, and read the diff rather
than eyeballing two separate reports.

## Cost awareness

A full run (17 calibration fixtures + 2 injection fixtures with 5
variants each) at the default 3 runs/fixture is 17×3 + 2×6 = **63 live
calls**. At 5 runs/fixture (release calibration) that's 17×5 + 12 =
**97 calls**. `--profile`/`--fixture` narrow this substantially for
iterative work — there's rarely a reason to run the full suite while
still tuning a single prompt change; narrow to the fixtures that
finding actually targets, then run the full suite once to confirm
nothing else regressed.
