# Chiron — Scorer Calibration

Manual calibration testing of Phase 1's lesson scorer, analysed per
`chiron_calibration_feedback_and_automation_prompts.txt` Prompt M1,
then verified live and fixed per Prompts M2-M5. **Status: M3's targeted
fix is implemented and accepted (`SCORING_PROMPT_VERSION = '2026-08-26-v2'`)** —
see "Results after the M3 fix" near the end of this document for the
live before/after data that decision is based on. Everything above that
section is the original M1 diagnosis, kept as the historical record of
_why_ the fix looks the way it does, not rewritten to match the
after-the-fact result.

**Caveat inherited from the feedback itself, not re-derived:** the
manual test script that produced these results didn't consistently
specify which of Chiron's two Phase 1 subject profiles
(`science-lab`, `history-essay`) each fixture ran under. Where that
matters for a specific finding, it's noted below; conclusions aren't
drawn from a fixture run under an unspecified or wrong profile.

## Observed manual results (as reported, transcribed not reinterpreted)

**A1 — repeatability, 3 runs per lesson (dialogue, authenticity, mentoring):**

| Lesson         | Run 1     | Run 2     | Run 3     |
| -------------- | --------- | --------- | --------- |
| Fertiliser     | (2, 1, 1) | (1, 1, 1) | (1, 1, 0) |
| Roman Republic | (2, 2, 2) | (3, 3, 2) | (3, 3, 2) |
| WWI            | (1, 2, 1) | (2, 2, 2) | (1, 2, 1) |
| Appeasement    | (3, 2, 2) | (3, 2, 2) | (3, 2, 3) |
| Propaganda     | (2, 2, 2) | (2, 2, 2) | (2, 2, 2) |

One-point variance across runs is present on most lessons — expected
for an LLM-graded rubric, not itself a defect (see "Variance" below).
History Authenticity compresses around 2 across both a strong lesson
(Roman Republic) and a weaker one (Appeasement lands 2 twice, 3 once) —
strong and mid-strength history lessons aren't cleanly separated on
that pillar.

**B1 — genuine historical material, trivial task:** Dialogue 0,
Authenticity 2, Mentoring 1. If run under `history-essay` (not
confirmed), this is a real failure: primary sources handed to students
alongside a predetermined interpretation to copy should score
Authenticity around 1, not 2. Genuine source material is being treated
as sufficient for authenticity on its own, independent of what
students actually have to decide.

**B2 — invented material, authentic reasoning:** 2, 2, 1. Not treated
as a firm failure — the fixture (a "pedestrianisation" scenario) fits
neither Phase 1 subject profile cleanly, so this result doesn't
isolate anything about science or history calibration specifically.
Superseded by a profile-valid science fixture in M2 (`S-B2`).

**B3 — cosmetic WHO epidemiologist role play:** the manual summary
table recorded Mentoring 3, but the detailed raw result recorded
Mentoring 0. **Raw detailed output is authoritative here, not the
summary transcription** — 0, 1, 0 is the real result, and it's a
_good_ one: the scorer correctly ignored the professional-framing
cosmetics (badges, case files, decision tree) and scored the actual
absence of dialogue/authenticity/mentoring. The summary/raw mismatch
itself is the finding that matters most from B3 — manual transcription
introduced an error a machine-generated report wouldn't have. This is
the concrete case for M4's raw-capture requirement, not a scorer bug.

**C1 — predetermined ad claim, Evaluation not clearly covered:** good,
matches expectation (a claim handed to students with no
credibility-judgment task shouldn't credit Evaluation).

**C2 — genuine evaluation, Evaluation covered high:** good — C1/C2
discrimination on Evaluation works as intended. Suggestions on this
pair, however, over-recommend literal realism (collecting real data,
finding real current ads, running surveys) rather than reasoning-
structure changes — a suggestion-quality issue distinct from the
scoring discrimination, which is otherwise working.

**C3 — inference vs. supplied conclusion, Inference covered medium:**
**failure.** Students were handed the conclusion and asked only to
generate supporting reasons for it — determining what follows from
evidence never happened, only rationalizing a given answer. This
should have scored Inference not clearly covered, not medium.

**C4 — genuine inference, Inference covered high:** good — preserves
the intended contrast with C3 once C3 itself is fixed.

**C5/C6 — classification vs. genuine analysis:** C5 (classification
only) scored Analysis not clearly covered; C6 (genuine analysis)
scored Analysis covered high. Very good — this discrimination already
works correctly.

**C7/C8 — surface checklist vs. genuine self-regulation:** C7 scored
Self-Regulation not clearly covered; C8 scored covered high. Very
good. Same summary/raw mismatch as B3 on C8's Mentoring figure (summary
said 3, raw detail said 1) — another instance of the same manual-
transcription-error pattern, not a new scorer issue.

## Diagnosis, cross-checked against the actual current prompt (`scoringPrompt.ts`)

Read `src/lib/domain/rubric.ts`, `taxonomy.ts`, `subjectProfiles.ts`,
`src/lib/providers/scoringPrompt.ts`, `llmScoringCore.ts`,
`scoreLesson.ts`, and the existing scorer test files
(`scoringPrompt.spec.ts`, `llmScoringCore.spec.ts`,
`DeepSeekScoringProvider.spec.ts`/`.integration.spec.ts`,
`AnthropicScoringProvider.spec.ts`/`.integration.spec.ts`) before
writing this section — the findings below are grounded in what the
current system prompt actually says (or doesn't), not assumed from the
symptom alone. No `docs/SCORER_CALIBRATION.md`, prompt-version field,
or scorer-calibration fixture existed anywhere in the repo before this
document — the "existing fertiliser/Roman Republic/WWI/Appeasement/
propaganda/WHO/Cuban Missile Crisis" fixtures the feedback refers to
were run by hand through the live UI, never captured as code. That's
the concrete gap M2/M4 close.

**1. Authenticity, especially History Essay — confirmed root cause.**
`buildSystemPrompt()` in `scoringPrompt.ts` includes this line for
every call: `"Typical authentic-problem framings for this subject:
${subjectProfile.authenticProblemExamples.join('; ')}"`. For
`history-essay`, one of those three examples is literally "Students
work directly with primary sources rather than a textbook summary of
events." Nothing in the prompt tells the model this is an _example_,
not a _sufficient condition_ — so a lesson that hands students genuine
primary sources (B1) has a real, visible reason to read as satisfying
that framing, regardless of whether students do anything with the
sources beyond copying a supplied interpretation. The rubric's own
level-3 authenticity description ("genuine, messy, real-world problem
as the central task") already asks the right question — the subject
profile text sits right next to it with no instruction distinguishing
"flavor" from "shortcut." This is exactly the mechanism M3 item 1 and
item 2 target.

**2. Inference when the conclusion is supplied — confirmed root
cause.** The current prompt's Inference grounding
(`taxonomyGroundingText()`) describes the skill only as "Drawing
warranted conclusions," with sub-skills "interrogating the evidence,"
"generating alternative explanations," "reaching a conclusion that
follows from the evidence." Nothing in the prompt distinguishes
_reaching_ a conclusion from _rationalizing one already given_ — a
lesson that hands students the conclusion and asks them to write
supporting reasons can plausibly read as satisfying "reaching a
conclusion that follows from the evidence" under a permissive
reading, since the text never says the conclusion must be the
_student's own_, arrived at rather than confirmed. C3's medium-
confidence "covered" result is consistent with the model applying
exactly that permissive reading. M3 item 3 targets this directly.

**3. Subject-profile grounding acting as a score shortcut — confirmed
mechanism, same root cause as (1) generalized.** There is currently no
line anywhere in `buildSystemPrompt()` instructing the model to score
against the general rubric first and use the subject profile only to
flavor suggestions. The subject-context block sits directly adjacent
to the rubric text with equal rhetorical weight, and nothing
distinguishes "typical framing, an example" from "requirement." M3
item 1 is a direct, minimal fix: add explicit language separating
rubric-first scoring from profile-flavored suggestions, without
touching the rubric or taxonomy themselves (per the feedback's own
"do NOT rewrite all six CT skills again" instruction).

**4. Suggestion quality overvaluing literal realism.** Confirmed
adjacent to finding 1: `authenticProblemExamples` for `science-lab`
includes "Students collect their own real data rather than following a
scripted 'expected result' procedure" — a real, legitimate way to
raise authenticity, but currently the _only_ kind of authenticity-
raising idea the prompt hands the model as a concrete example. With no
competing suggestion pattern in the prompt (controls/comparisons,
conflicting evidence, an open decision, competing hypotheses), the
model has little else to reach for when generating a suggestion. This
is a real, minimal gap, not a case for rewriting the whole suggestion
system — M3 item 4.

**5. Variance — not a code defect, a harness gap.** The one-point
run-to-run variance in the A1 table (and the summary/raw mismatches in
B3/C8) aren't scorer bugs to fix with a prompt change — they're
exactly what M4's harness (bands + paired contrasts + raw capture
instead of hand-transcribed summaries) exists to handle correctly
rather than either over-reacting to normal LLM variance or missing a
transcription error a machine wouldn't make.

## What this diagnosis does NOT ask for

Per the feedback's own instruction: no rewrite of the six-skill
taxonomy or three-pillar rubric definitions themselves — both are
Abrami-grounded and not implicated by any finding above. No broad
change to Evaluation, Analysis, or Self-Regulation scoring — C1/C2,
C5/C6, C7/C8 already discriminate correctly. Findings 1-4 above are
targeted, minimal `buildSystemPrompt()` additions (M3), not a rewrite.

## Next steps (historical — all of M2-M5 below are now complete)

M2: replace the informal manual fixtures referenced above with 19
fully-specified, profile-valid fixtures (8 science, 9 history, 2
prompt-injection) — including explicit expected bands/skill states so
the automated harness (M4) can evaluate them deterministically. M3:
implement the four targeted `buildSystemPrompt()` changes this
diagnosis identifies, and only those. M4: build the live calibration
harness. M5: baseline, apply M3's fixes, rerun, compare.

## M2/M4: fixtures and harness built

19 fixtures (`tests/calibration/fixtures/science/scienceFixtures.ts`,
`history/historyFixtures.ts`, `injection/injectionFixtures.ts`), the
deterministic evaluator (`tests/calibration/evaluateCalibration.ts`,
20 unit tests), and the CLI (`scripts/run-scorer-calibration.ts`,
`npm run test:calibration`) — full usage in `docs/SCORER_TESTING.md`.

One real architectural bug found and fixed while building M4, not
scoped to calibration specifically: `llmScoringCore.ts` (and Phase 2A's
`classifierCore.ts`/`tutorCore.ts`) imported `MissingEnvError` from
`env.ts`, which imports SvelteKit's `$env/dynamic/private` — a virtual
module that only resolves inside SvelteKit's own Vite pipeline. That
silently made those "vendor-agnostic core" modules impossible to import
from a plain Node script, which M4 needs to do (call `scoreLesson()`
directly, not through the HTTP API, per Prompt M4(c)). Fixed by
extracting `MissingEnvError` into its own dependency-free file
(`src/lib/server/envErrors.ts`); `env.ts` re-exports it so no other call
site changed. `scripts/lib/providerFactory.ts` builds a real
`ScoringProvider` for the CLI without touching `DeepSeekScoringProvider`/
`AnthropicScoringProvider` themselves (both still read their API key via
`requireEnv()`/`env.ts`, which is fine for the real app but not for a
standalone script) — it mirrors their `defaultCreateMessage` logic
exactly, reading `process.env` directly instead.

A second bug surfaced running the very first live calibration pass, not
found by code review: `tsx` (installed as the CLI's TypeScript runner)
does not load `.env` on its own, and the CLI's own error handling threw
a plain `Error` for a missing API key instead of `MissingEnvError` —
`llmScoringCore.ts`'s retry loop only fast-fails on `MissingEnvError`
specifically, so a plain `Error` got silently retried twice and
surfaced only as a generic "the model did not return a valid result,"
which is exactly what a full 63-call baseline run hit on its first
attempt (every single fixture errored). Fixed both: `test:calibration`
now runs via `node --env-file=.env --import tsx ...`, and
`providerFactory.ts`'s env check throws `MissingEnvError`. Recorded
here because it's a genuine "found live, not found by review" case for
the same discipline this whole calibration effort is about.

## Results after the M3 fix

Full before/after reports: `artifacts/calibration/baseline.txt`
(pre-fix, `SCORING_PROMPT_VERSION` `2026-08-22-v1`) and
`artifacts/calibration/after-m3-fix.txt` (post-fix, `2026-08-26-v2`) —
both real, live DeepSeek runs, 3 runs/fixture, 63 calls each.

| Metric                       | Baseline (pre-fix) | After M3 fix |
| ---------------------------- | :----------------: | :----------: |
| Fixtures PASS/WARN/FAIL      |     9 / 3 / 5      |  11 / 6 / 0  |
| Paired contrasts PASS/FAIL   |       3 / 3        |    6 / 0     |
| Injection variants PASS/FAIL |       10 / 0       |    10 / 0    |

All 5 hard failures from the baseline are gone in the after-fix run,
each matching exactly what the fix targeted:

- **S-C1** (supplied conclusion): Inference wrongly covered 2/3 runs at
  baseline → 0/3 after. The paired contrast against S-C2 (genuine
  inference) went from FAIL to PASS.
- **S-C3**/**H-C3** (surface checklists): Self-Regulation wrongly
  covered 3/3 runs at baseline on _both_ fixtures → 0/3 on both after.
  This wasn't one of the four findings M1 originally targeted — it
  surfaced live, during the baseline run itself, as a real and
  consistent failure (3/3, not a one-off), and M3 item 5's "unless new
  fixtures show a failure" condition was met, so a targeted
  Self-Regulation rule was added alongside the four M1 findings, not
  instead of a broader rewrite.
- **H-B2** (curated sources, genuine inquiry): mean Authenticity 2.33 →
  3.00, now meeting the pillar-min-3 floor on every run. The paired
  contrast against H-B1 (predetermined interpretation) was already
  passing at baseline (H-B2 already outscored H-B1) but is now a
  cleaner, fully-at-ceiling win rather than a partial one.
- **H-C1** (classification only): Analysis wrongly covered 1/3 runs at
  baseline → 0/3 after, and its paired contrast against H-C2 improved
  from a 3-vs-1 margin to a clean 3-vs-0 one.

**Accepted per the M5 acceptance criteria** (targeted hard failures
improve; good contrast fixtures do not regress; injection remains
robust; strong lessons remain strong; variance does not materially
worsen):

1. Targeted hard failures: 5 → 0. ✓
2. Paired contrasts: 3/6 → 6/6, strictly improved, none regressed. ✓
3. Injection: 10/10 → 10/10, unchanged. ✓
4. Strong lessons (H-A1, H-A2 — deliberately built with no hard
   invariants, as soft calibration-stability checks): pillar scores
   remained excellent on both (dialogue/authenticity/mentoring all in
   the 2-3 range throughout, several dimensions actually more STABLE
   than at baseline). One very minor softening — H-A2's Self-Regulation
   went from 3/3 to 2/3 covered — stayed within the WARN tolerance
   these two fixtures were deliberately designed to have (no hard
   invariant asserts Self-Regulation for either), plausibly the model
   applying the new, appropriately stricter Self-Regulation language
   even to a genuinely borderline moment in an otherwise strong lesson.
5. Variance: one exception, disclosed rather than hidden — H-B2's
   _Dialogue_ score (a dimension this fixture has no band or invariant
   on at all; it only targets Authenticity) moved from MINOR to HIGH
   variance ([1,1,0] → [1,0,2]) in this particular 3-run sample. Given
   every other signal improved cleanly and this is un-targeted-dimension
   noise on one fixture, this was judged not material enough to reject
   the change — but it's recorded here honestly rather than left out of
   a summary that would otherwise read as unambiguously clean.

**Suggestion quality (finding 4) — no automated check, but manually
spot-checked against the real output.** The harness doesn't score
suggestion _content_ (only that suggestions are schema-valid and
pillar-tagged) — verifying this fix took effect meant reading the RAW
MODEL OUTPUT section of `after-m3-fix.txt` by eye. All three S-A1 runs'
Authenticity suggestions now lead with reasoning-structure changes
("add a genuine decision-making task," "include conflicting evidence,"
"reconcile the discrepancy") rather than defaulting to literal realism
— a real, visible improvement over the pre-fix pattern
(`docs/SCORER_CALIBRATION.md`'s original C2 finding: "collecting real
data, finding real current ads, running surveys"). One run still
mentions "actual data from a simple class experiment," but framed
around making the task open-ended/inferential rather than as a bare
realism recommendation — consistent with the fix's actual instruction
("only recommend real data collection... when it would concretely
improve the reasoning task"), not a miss. Worth a future automated
fixture-level check if this regresses; not built now to avoid scope
creep beyond M3's four named findings plus the one live-discovered
Self-Regulation issue.
