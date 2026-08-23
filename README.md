# Chiron

Evidence-based critical-thinking coach for teachers. Scores lesson plans
against a peer-reviewed three-pillar rubric (dialogue, authentic/situated
problems, mentoring — Abrami et al., 2015) and a six-skill critical-
thinking taxonomy, then gives subject-flavored, lesson-specific revision
suggestions.

See `docs/ARCHITECTURE.md` for the full design and `docs/DECISIONS.md`
for architecture decision records. This repo is being built incrementally
per the prompt sequence in `scope-and prompts.txt` — Phase 1 (MVP) is the
teacher-facing lesson analyzer; see that file's Section 5 for build order.

## Stack

SvelteKit (TypeScript, strict), Tailwind CSS, an LLM behind a
provider-independent `ScoringProvider` interface (DeepSeek is the active
implementation, Anthropic is a working alternate — see ADR-008), Zod for
schema validation, Vitest for tests, Postgres via Supabase (email/password
auth + row-level security for org data isolation — see ADR-010 for the
non-obvious ways RLS bit us while building this).

## Local dev setup

Requires **Node ^20.19.0 or >=22.12.0** (the toolchain — Vite, ESLint —
enforces this; older Node 20.x patch releases will fail `npm install`
with `EBADENGINE`). If you're on an older Node 20, upgrade with
[nvm-windows](https://github.com/coreybutler/nvm-windows) or from
[nodejs.org](https://nodejs.org).

```sh
npm install
cp .env.example .env
npm run dev
```

The lesson analyzer needs a `DEEPSEEK_API_KEY` to actually score anything
— get one at [platform.deepseek.com](https://platform.deepseek.com/api_keys)
and put it in `.env`. Without it, the app still boots and the UI still
renders; scoring requests will fail with a clear "temporarily unavailable"
error instead of crashing.

Accounts need a real Supabase project. Create one free at
[supabase.com](https://supabase.com), put its URL/anon key/service role
key (Project Settings > API) into `.env`, then run every file in
`supabase/migrations/` **in order** (`0001` through `0005`) via the SQL
Editor — see that file's comments for why there are five instead of one;
each one fixes a real, adversarially-discovered issue in the one before
it, and the sequence matters. Without Supabase configured, the app still
boots and scores lessons — signup/login/org/library routes will show a
clear "not configured" state instead of crashing.

## Scripts

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev server                 |
| `npm run build`     | Production build (Node adapter)      |
| `npm run preview`   | Preview the production build locally |
| `npm run check`     | Svelte + TypeScript type checking    |
| `npm run lint`      | Prettier check + ESLint              |
| `npm run format`    | Auto-format with Prettier            |
| `npm test`          | Run the Vitest suite once            |
| `npm run test:unit` | Run Vitest in watch mode             |

## Project structure

```
src/lib/domain/       pure TypeScript domain logic — no framework or provider imports
src/lib/providers/    provider interfaces + implementations (DeepSeek/Anthropic scoring, Supabase, file parsing)
src/lib/components/   Svelte components — render + dispatch only, no domain logic
src/lib/server/       server-only helpers (env validation, etc.)
src/routes/           SvelteKit pages and API routes
src/hooks.server.ts   attaches a request-scoped, cookie-authenticated Supabase client to every request
tests/rls/            adversarial RLS tests — run against the real live Supabase project, not mocked
supabase/migrations/  schema + row-level security policies, applied in order via the Supabase SQL Editor
docs/                 architecture, decisions, and (later) security/phase-2 docs
```

Domain logic never imports Svelte or a provider implementation directly;
providers are swapped behind interfaces (`ScoringProvider`, `DataStore`,
`FileParserProvider`). See `docs/ARCHITECTURE.md` Section 1.

## Status

Prompts 1-11 complete: taxonomy/rubric/subject-profile grounding data,
docx/pdf upload parsing, the core domain model, a real scoring engine
(DeepSeek, provider-swappable), the teacher-facing UI (input → score →
revise-and-resubmit with a before/after view), accounts/multi-tenancy —
email/password signup and login, one org per user with an admin/teacher
invite flow (shareable link, not an emailed one — see ADR-009), and a
`lessons` table with `private` / `org-shared` / `public-template`
visibility enforced by Postgres row-level security — and the shared
library (`/library`): search/filter by subject, grade level, and minimum
pillar scores across org-shared + public-template lessons, with a
save-a-copy action that always lands as a new private lesson (ADR-011).
Org isolation is proven by an adversarial test suite that runs against
the live database (`tests/rls/orgIsolation.spec.ts`), not just reasoned
about from the policy SQL — see ADR-010 for what that testing actually
caught. Prompt 10's honesty-guardrail pass is done too: the scoring
prompt now explicitly requires every suggestion to name something
specific from the submitted lesson (not generic advice that would fit
any lesson) and requires low-confidence skill justifications to actually
read as uncertain, not confident text sitting next to a low-confidence
badge — verified against real model output, not just prompt wording. The
honesty note is on every page that shows a score, including `/library`.

Prompt 11's pre-deployment security review is done — see
`docs/SECURITY.md` for the full writeup. Highlights: the adversarial RLS
suite grew to 13 live tests (added direct-UPDATE, invite-listing,
guessed-token, and copy-lesson cases), the prompt-injection suite gained
two new live-tested attack variants (a fake embedded rubric, a
format-break/system-prompt-extraction attempt) alongside the original,
`/api/lessons/score` and `/api/lessons/upload` are now rate-limited per
IP (previously wide open to cost abuse — the one finding serious enough
to matter), and two silent-failure bugs in the org-admin actions were
fixed (an RLS-blocked write was being reported as success). One gap is
documented rather than fixed: any signed-in user can currently query any
other user's email directly via the `profiles` table (not just through
Chiron's UI) — closing it needs a view/column-security restructuring
that touches several `profiles(...)` embeds across the codebase, judged
out of scope for this pass.

Prompt 12 (Phase 2 planning) is done too — see `docs/PHASE2.md` for the
student practice-mode design: a case-content schema, a constrained
Socratic tutor state machine (fixed pedagogical action vocabulary, no
invented evidence, challenge selection decoupled from whether the
student's answer agrees with the "correct" one), confidence-calibration
tracking (Brier score + reliability curve, with "not enough evidence to
know" as a creditable outcome, not a wrong one), and how it plugs into
Phase 1's existing subject profiles and lesson scores. Planning only —
nothing in it is implemented, per the prompt's own instruction.

That's Phase 1 complete (Prompts 1-11, all shipped) plus the Phase 2
scoping prompt (12). No further prompts remain in the current sequence.
