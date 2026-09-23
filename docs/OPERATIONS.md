# Operations

The first piece of actual production operations tooling in this project.
Before this, a provider outage, a schema-validation regression after a
prompt change, or an RLS policy accidentally tightened too far would
only be discovered by a user reporting it — nobody at Chiron would
notice first. This document is what's monitored, how to check it, and
what still needs a human with Sentry account access to finish setting
up (an AI assistant can't create a Sentry organization or configure a
dashboard alert rule on its own, the same kind of limitation ADR-028
named for GitHub branch protection).

## What's wired up

**Sentry** (`@sentry/sveltekit`), both server (`src/hooks.server.ts`)
and client (`src/hooks.client.ts`):

- Every unhandled server/client error SvelteKit's own `handleError` hook
  would otherwise only turn into a generic 500 — reported to Sentry,
  still returns the same safe generic message to the user.
- Every one of this app's existing "catch, log, degrade gracefully"
  error paths (rate-limit fail-open, a scoring/classifier/tutor provider
  call failing after retries, the onboarding-examples load query
  failing) — now reported to Sentry through the same call that already
  logs to `console.error`, not a separate, independently-trusted path.
- A small, deliberately narrow set of RLS/ownership denials — see
  "RLS-denial reporting scope" below.

**Optional, not required.** Same contract as Supabase/DeepSeek/
Anthropic elsewhere in this app (`src/lib/server/env.ts`): with no
`PUBLIC_SENTRY_DSN` set, `Sentry.init` is never called, and the app
runs identically to before this feature existed — nothing breaks,
nothing is silently degraded, there's just nowhere for reports to go
yet.

## Why this was worth being careful about: the PII risk

A third-party monitoring vendor is a new place student/lesson data
could leak to if this isn't done carefully — the same scrutiny as this
app's existing `console.error` discipline (never log raw lesson/student
text, only a sanitized error name/message), not less. Two concrete,
found-not-assumed risks shaped the actual configuration in
`hooks.server.ts`/`hooks.client.ts`:

1. **Tracing is deliberately never enabled** (no `tracesSampleRate` set
   anywhere). Sentry's Node SDK only loads its "auto performance
   integrations" — which include `openAIIntegration()`, auto-patching
   the `openai` package this app already uses for DeepSeek scoring/
   classification/tutoring — when tracing is on. That integration's
   `dataCollection.genAI` defaults to `{ inputs: true, outputs: true }`,
   meaning enabling tracing would send actual lesson text, student
   practice free-text, and raw model responses to Sentry by default.
   Leaving tracing off means that integration is never loaded at all —
   this project's scope is error monitoring, not APM, so there's no
   real cost to leaving it off.
2. **`dataCollection` is set explicitly and conservatively anyway** —
   defense in depth, in case a future change enables tracing, or a
   newer SDK version changes its defaults: `stackFrameVariables: false`
   (a caught exception's stack frame can have `lessonText`/`freeText`
   as a local variable in scope — Sentry's local-variable capture would
   otherwise send its actual _value_, not just a trace line),
   `genAI: { inputs: false, outputs: false }` (belt-and-suspenders even
   with tracing off), `cookies: false`, `httpHeaders: false`,
   `httpBodies: []`, `databaseQueryData: false`, `urlQueryParams: false`.

Also `errorReporting.ts` (`src/lib/server/errorReporting.ts`) is the one
place every report in this app goes through — `reportError` takes an
**already-computed safe summary string**, never the raw caught error
value, so it structurally cannot forward more to Sentry than
`console.error` already gets at each call site.

**Verification, not just design intent** — a live check against a real
Sentry dashboard isn't possible without an account, so this is the
deterministic equivalent:

- `src/lib/server/errorReporting.spec.ts` — proves `reportError`/
  `reportRlsDenial` can only ever send the exact string the caller
  passed, never an error object or any extra field.
- `src/hooks.server.spec.ts` / `src/hooks.client.spec.ts` — proves
  `Sentry.init`'s actual call arguments have tracing off and the risky
  `dataCollection` categories (`genAI`, `stackFrameVariables`, etc.)
  explicitly disabled, not just documented as intended.

## The three tagged report categories, and what each is for

Every report carries a `chiron_category` tag (`errorReporting.ts`):

| Tag                    | Fires when                                                                                                                                                      | What it signals                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider_error`       | A scoring/classifier/tutor LLM call fails after retries and the app falls back to a safe default (`DeepSeekScoringProvider`/`classifierCore.ts`/`tutorCore.ts`) | Repeated events in a short window = a vendor outage, not routine per-call flakiness                                                           |
| `rate_limit_fail_open` | `checkRateLimit()`'s own documented fail-open path actually fires (`src/lib/server/rateLimit.ts`) — the exact bug found and fixed while wiring CI (ADR-028)     | Should be rare. Even one occurrence in production means the rate limiter's Postgres RPC is failing, not just theoretically capable of failing |
| `rls_denial`           | A request reached an authenticated route but was blocked from touching a specific resource it doesn't own or isn't admin of — see the exact call sites below    | A spike could mean either an attack or a policy regression — these look similar from the outside and both deserve attention                   |

### RLS-denial reporting scope — a deliberate boundary, not an oversight

`reportRlsDenial` is wired at exactly four call sites, each one already
distinguishing "genuinely blocked" from "not found" via the existing
`.select()`-after-write / explicit-ownership-check pattern (not a guess
— each site's own code comment already documents this distinction):

- `src/routes/lessons/[id]/+page.server.ts` — non-owner lesson delete
- `src/routes/account/org/+page.server.ts` — non-admin invite revoke,
  non-admin lesson-feature toggle
- `src/routes/api/lessons/[id]/revise/+server.ts` — non-owner revise
  attempt

**Deliberately not wired**: the org-member-management RPC failures
(`removeMember`/`changeRole`/`leaveOrg` in the same `account/org`
file) — those return a generic 400 for _both_ genuine authorization
denials ("Only an org admin can remove a member") _and_ ordinary
validation failures ("Invalid role"), and this pass doesn't parse RPC
error message text to tell them apart. Doing that reliably would need
either structured error codes from the RPC layer or fragile string
matching — real future work, not something to bolt on here just to
raise the count. Most of this app's RLS design also fails via "zero
rows returned," not a thrown error (by design — ADR-010's whole
`SECURITY DEFINER` approach), so a literal Postgres permission-denied
error is already the exceptional case, not the common one.

## What still needs a human with Sentry account access

Nothing above requires an account to exist — the DSN is read the same
way `PUBLIC_SUPABASE_URL` is, optional at every layer. To actually turn
this on:

1. **Create a Sentry organization and project** (sentry.io, or a
   self-hosted instance) for Chiron, if one doesn't already exist.
2. **Set `PUBLIC_SENTRY_DSN`** as a Vercel environment variable (and
   locally in `.env` for anyone who wants error reports while
   developing) — found in Sentry's project settings.
3. **Optional — readable stack traces.** Set `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT` as CI secrets (`gh secret set`,
   matching how `.github/workflows/ci.yml`'s live-job secrets were set)
   so `vite.config.ts`'s `sentrySvelteKit()` plugin uploads
   source maps on build. Without these, Sentry still receives every
   report — stack traces just point at minified code instead of
   original source.
4. **Configure three alert rules**, one per tag in the table above —
   exact conditions given here, since these can't be created without
   Sentry dashboard access:
   - **`provider_error` spike**: alert when events tagged
     `chiron_category:provider_error` exceed roughly 5 in a 10-minute
     window (tune once real traffic volume is known — this is a
     starting point, not a measured threshold).
   - **`rate_limit_fail_open` — any occurrence**: alert on **1 or more**
     events tagged `chiron_category:rate_limit_fail_open` in any
     window. This path should essentially never fire in a healthy
     deployment; treat every occurrence as worth looking at.
   - **`rls_denial` spike**: alert when events tagged
     `chiron_category:rls_denial` exceed roughly 10 in a 10-minute
     window from — ideally — a small number of distinct users/IPs
     (Sentry's issue grouping/user context can help here once real
     data exists to tune against).
5. **Revisit the alert thresholds after real production traffic
   exists** — the numbers above are reasoned starting points, not
   measurements; there's no live deployment yet to calibrate against.

## How to check it, day to day

Open the Sentry project → filter by `chiron_category` tag to see one
of the three categories in isolation, or leave unfiltered for every
unhandled exception `handleError` caught. Every event's message is
already the same safe summary `console.error` would have logged —
checking Sentry vs. checking server logs should never show materially
different information, by the design above.

---

# Content moderation

Any user can mark their own lesson `public-template`, making it visible
to any signed-in Chiron user regardless of org — and until this
feature, there was no way for anyone to remove one once it went live.
This adds
a **Chiron-level** moderator capability (`supabase/migrations/
0021_content_moderation.sql`), deliberately kept separate from
`is_org_admin()` — an org admin has no special standing here, and this
capability has no relationship to any one org. Live adversarial tests:
`tests/rls/contentModeration.spec.ts`.

## Who has moderator access today

Nobody, by default. Granting it is a **manual, service-role-only
action** — there is no self-service UI and deliberately no client-facing
way to grant it at all (see "Why this can't be self-granted" below).
To check or change who currently holds it, run against the Supabase SQL
editor:

```sql
-- Who currently has moderator access:
select cm.user_id, p.display_name, p.email, cm.granted_at
from public.chiron_moderators cm
join public.profiles p on p.id = cm.user_id;

-- Grant it to someone (look up their id from `profiles` by email first):
insert into public.chiron_moderators (user_id) values ('<their-profile-id>');

-- Revoke it:
delete from public.chiron_moderators where user_id = '<their-profile-id>';
```

This is intentionally minimal — a flag one or two known people hold,
not a roles system. Build something heavier only once there's an actual
need for more than a handful of moderators.

## Why this can't be self-granted

`chiron_moderators` has **no INSERT/UPDATE/DELETE policy for
`authenticated` at all** — the same "no direct write access,
service-role-only" pattern ADR-020 already established for the Phase 2A
FSM tables. This isn't a convention someone could accidentally weaken by
adding a policy that seems reasonable in isolation (e.g. "an existing
moderator can grant another moderator") — no such policy exists, and
`tests/rls/contentModeration.spec.ts` adversarially confirms both a
plain self-grant attempt and an org-admin trying to grant it to someone
else are rejected.

## How a report reaches a moderator

1. Any signed-in user can click **Report** on a public-template lesson
   in `/library` and give a short reason — a plain `INSERT` into
   `lesson_reports` (RLS: `reporter_id = auth.uid()`), not an RPC, since
   reporting needs no cross-table check and grants no access to
   anything by existing.
2. Reports are **never auto-actioned** — inserting one doesn't unpublish
   anything or notify anyone in real time. This is deliberate: an
   auto-unpublish-on-report path would itself be an abuse vector (report
   a competitor's/colleague's lesson to take it down).
3. A moderator reviews the open queue at `/admin/moderation` (no nav
   link — see "Discoverability" below) and either **Dismiss**es a report
   (no action, just marks it resolved) or **Unpublish**es the lesson
   (returns it to `private`, with a required reason, logged in
   `moderation_actions`, and any other open reports on that same lesson
   are auto-resolved too).

## What "inappropriate" means for this product

Chiron's public-template library is a **lesson-plan sharing feature**
between teachers — a narrower, different risk surface than general
user-generated content (a comment section, a marketplace, social media).
There's no rich media, no direct messaging, no public profile pages —
just lesson-plan text, openly shared by a teacher for other teachers to
copy. Grounds for unpublishing, given that scope:

- **Not actually a lesson plan** — spam, an advertisement, content
  unrelated to teaching.
- **Plagiarized or misattributed** — presented as original when it
  isn't (distinct from the system-example onboarding lessons, which
  have their own verified-license/attribution process —
  `docs/CONTENT_LICENSING.md` — and aren't reachable through this
  report flow at all, since `/library` only lists `origin = 'user'`
  lessons).
- **Contains material inappropriate for a K-12-facing teaching
  resource** — content no reasonable teacher would consider fit to
  share as a lesson plan.
- **Contains real student information** — a violation of this app's own
  privacy posture (`/privacy`) applied to shared content, not just
  collected-by-the-app data.

Do **not** import a generic trust-and-safety policy wholesale — this
product has no open-ended free text feed, no strangers messaging each
other, no algorithmic amplification; the actual risk surface is "a
teacher shared something as a lesson plan that shouldn't be publicly
shared as one," and the above list reflects that, not a larger set of
concerns this product doesn't actually have.

## Discoverability — a deliberate omission, not an oversight

`/admin/moderation` has no link anywhere in the app's navigation.
Moderators (currently one or two known people) navigate to it directly
by URL. Adding a conditionally-shown nav link would mean computing
"is this user a moderator" on every single page load for every user —
a real per-request cost paid by everyone to serve a feature `docs/
OPERATIONS.md` itself says is for "maybe one or two people" today.
Revisit once there's a real moderator team, not before.
