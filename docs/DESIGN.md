# Chiron — Design plan (`prompt.txt` Prompt D4, Part A)

**Status:** Parts A–D complete (2026-09-22). This document is meant to be
revised as the app evolves, not a one-time artifact — update it, don't
replace it, the next time the visual system changes.

## Why this exists

Chiron is a coaching instrument, not a dashboard — a teacher pastes real
work and gets specific, evidence-grounded feedback. The current UI is bare
Tailwind slate-on-white with no accent color, no defined type scale, and
every result screen renders as three separately-bordered stacked cards
(ScoreDisplay / SkillChecklist / SuggestionList) rather than one coherent
report. This plan gives the whole app one deliberate visual system instead
of continuing to accrete ad hoc choices (e.g. `text-indigo-700` on
attribution links in `examples`/`lessons/[id]`, present nowhere else).

**Anti-patterns explicitly ruled out**, checked against each choice below:
warm cream + terracotta; near-black + one acid accent; the
identical-rounded-card-with-soft-shadow kit. None of the three appear in
what follows — the stacked-card pattern in particular is the thing Part C
is replacing, not preserving.

## Color

Sourced from the existing brand mark (`chiron0.png`, already in production
as the favicon and page icon since a recent commit) rather than picked in
isolation — its illustrated centaur-mentor emblem is deep teal/green with
gold linework, a classical-illuminated-manuscript palette that already
fits an evidence-and-reasoning coaching tool. Both accent hues validated
with the dataviz skill's `validate_palette.js` six-checks tool (categorical
CVD/contrast checks — see rationale below for why that tool applies here
even though this isn't primarily a charting app: `DashboardTrendChart` is
a real two-series chart, and `ScoreDisplay`'s 0–3 bars are a real ordinal
encoding, so the same rigor applies to both).

| Role                                                                                           | Hex                      | Contrast on white | Notes                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brand teal** (buttons, focus rings, ordinal score-bar top step, chart series 1)              | `#0E8C6F`                | 4.20:1            | Passes 3:1 (large text/UI); validated against gold via `validate_palette.js` (CVD ΔE 10.0 protan, 18.9 normal-vision — both clear the ≥8/≥15 targets) |
| **Brand teal, text step** (links, small UI text needing 4.5:1)                                 | `#0B7A61`                | 5.29:1            | Same hue, darker step — used wherever text is small enough to need AA body-text contrast                                                              |
| **Brand gold** (accent: suggestion/"next step" panels, badges, chart series 2 — org benchmark) | `#B8860B`                | 3.25:1            | Large text/UI/icon use only — never small body text (sub-4.5:1)                                                                                       |
| Neutrals                                                                                       | existing `slate-*` scale | —                 | Kept as-is; already used everywhere and reads calm/professional. Not reinvented.                                                                      |

Ordinal score scale (`ScoreDisplay`'s existing "neutral intensity, not
red/green — formative feedback, not a pass/fail grade" design decision is
kept unchanged, just re-stepped onto the brand hue instead of generic
indigo): `slate-200` (0) → a light teal tint (1) → mid teal (2) →
`#0E8C6F` (3).

**Explicitly out of scope for this pass:** dark mode. Nothing in the app
has any dark-mode support today (`grep -rn "dark:"` across `src/` returns
nothing); adding it would be a real, separate feature decision, not
something to fold silently into "the D4 visual pass." If wanted later,
`#0E8C6F`/`#B8860B` both have real headroom for dark-surface steps, but
that's a future prompt's call, not assumed here.

## Type

Two real typefaces (Google Fonts), each with a defined role — not the
Tailwind-default system-ui stack everywhere:

- **Public Sans** — headings, nav, buttons, form labels, all UI chrome.
  Chosen over a more decorative option (avoiding the "distinctive serif
  headings" AI-tell) for a specific reason beyond legibility: it's the
  U.S. federal government's own design-system typeface, which fits
  Chiron's actual content — two of three seeded onboarding examples are
  Library of Congress public-domain sources, and a `civics-current-events`
  subject profile already exists. A civic, purposeful register suits an
  evidence-based coaching tool without reaching for generic SaaS-sans.
- **Lora** — lesson body text (the pasted/uploaded `raw_text` blocks) and
  longer-form paragraph copy. A warm, comfortable-reading serif, distinct
  from UI chrome, so a page reads as "here is a document I'm giving you
  feedback on" rather than everything looking like the same UI element.

Scale (role-based, not an exhaustive type ramp):

| Role                                     | Size / line-height | Face / weight               |
| ---------------------------------------- | ------------------ | --------------------------- |
| Page title (h1)                          | 2rem / 1.2         | Public Sans, semibold       |
| Section heading (h2)                     | 1.25rem / 1.3      | Public Sans, semibold       |
| Subsection label (h3)                    | 0.875rem / 1.4     | Public Sans, medium         |
| Body / lesson text                       | 1rem / 1.6         | Lora, regular               |
| UI text (buttons, nav, labels, metadata) | 0.875rem / 1.5     | Public Sans, regular/medium |
| Small / meta (timestamps, badges)        | 0.75rem / 1.4      | Public Sans, regular        |

Numbers that must align in a column (score fractions, dates) keep
`tabular-nums`, already used in a few places — extend it consistently
rather than introducing a new convention.

## Layout — the report view

The three-pillar score / skill-coverage / suggestions block (used
identically on `/`, `/examples`, and `/lessons/[id]`) currently renders as
three separately-bordered stacked `<div>`s with `h3` labels between them —
functionally fine, visually reads as generic stacked cards. Target: one
bordered report container with internal section dividers instead of
repeated card chrome, plus a compact summary strip so a reader gets the
headline before the detail:

```
┌───────────────────────────────────────────────┐
│  Results · Version 2                            │  ← report header
├───────────────────────────────────────────────┤
│  Dialogue ●●●○   Authentic ●●○○   Mentoring ●○○○ │  ← summary strip (new)
├───────────────────────────────────────────────┤
│  Dialogue                                2 / 3  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░                            │
│  "Some structured discussion occurs."            │
│  (…Authentic, Mentoring the same shape…)         │
├───────────────────────────────────────────────┤
│  Critical-thinking skills                        │
│  ✓ Analysis · covered · high confidence          │
│  (…)                                             │
├───────────────────────────────────────────────┤
│  ▌ Suggestions                    (gold-tinted)  │
│  (…)                                             │
└───────────────────────────────────────────────┘
```

The gold tint on Suggestions is deliberate, not decorative: it's the one
section that's actionable ("do this next"), and giving it a distinct
surface (a subtle `#B8860B`-tinted background, not a loud one) separates
"what happened" from "what to do about it" at a glance — reusing the
brand's second hue for a real semantic reason rather than just for
variety.

This container becomes a new shared component
(`ReportCard.svelte` or similar — exact name TBD during Part C) that
`ScoreDisplay`/`SkillChecklist`/`SuggestionList` render inside, rather than
each managing its own border/spacing independently. The summary-strip
component is new; everything else keeps its existing props/behavior.

## What's not changing

Per Prompt D4's own scope: information architecture and functionality stay
as they are. This is a visual and responsive pass, not a redesign of what
the app does — no new pages, no changed data flow, no changed component
props beyond what's needed to apply the plan above.

## Part B — responsive audit findings

Checked live at two real widths (390px mobile, 768px tablet — real
narrow-viewport rendering via nested `<iframe>`s pointed at the running
dev server, not just DevTools device emulation, since this session's
browser-automation tooling couldn't resize its own window) rather than
assumed from the CSS alone:

- **Nav** (`SiteNav`): header collapses to wordmark + hamburger below
  `md`; the combined mobile panel (primary nav + account items) opens and
  closes correctly; active-page underline/`aria-current` confirmed on a
  real route. No changes needed beyond what D3 already built.
- **Report card** (`/lessons/[id]`, confirmed representative of `/` and
  `/examples` — same component, same props): summary strip, bordered
  container, section dividers, and the gold-tinted Suggestions panel all
  render correctly at both widths with no horizontal overflow; the serif
  lesson-text block wraps and reads cleanly.
- **Practice case UI** (`/practice`, case intro through
  `JudgmentPicker`) — the one route `docs/STATUS.md` specifically flagged
  for re-audit ("built mobile-first, verify it's held up"): still holds
  up. `JudgmentPicker`'s five options stack full-width on mobile and lay
  out as a row at tablet width, both with the new teal selected-state
  styling, no overflow.
- **Not individually screenshotted**: `/account/org`, `/dashboard` itself
  (the chart component's own responsiveness was verified via
  `DashboardTrendChart.svelte.spec.ts` plus its existing viewBox-based SVG
  scaling, not a fresh screenshot), `/library`, `/login`, `/signup`,
  `/invites/[token]`. These are single-column forms/lists using the same
  `max-w-2xl` + stacked-flex pattern already confirmed safe on the pages
  above, with no tables, fixed-width elements, or custom layout — lower
  risk, and flagged here explicitly rather than silently claimed as
  checked.

## Part D — self-critique

- **Gold-tinted suggestions panel**: reads as intended in the live
  check — the `▌` marker plus tint clearly separates it from the
  preceding sections without needing to be loud about it. Kept as
  designed, no drift.
- **Anti-patterns re-checked against the built result, not just the
  plan**: no cream/terracotta, no near-black+single-acid-accent, and the
  stacked-card-shadow kit is gone — `ReportCard`'s one bordered container
  with internal dividers replaced it everywhere it was used. Nothing
  drifted back toward a generic default during implementation.
- **Open, not yet resolved**: whether Lora stays comfortable at real
  lesson-plan lengths (the live check used a few sentences, not a full
  multi-paragraph plan) — worth a real look with actual long-form content
  before calling this fully settled.
- **Known pre-existing gap, not introduced by this pass**: the desktop
  account `<details>` menu (built in D3) still doesn't close on an
  outside click. Unchanged by D4 since D4 didn't touch `SiteNav`'s
  interaction logic, only D3-era colors already covered in that prompt's
  own commit.
