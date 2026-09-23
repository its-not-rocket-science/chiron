# Operations (`prompt.txt` Prompt G3)

The first piece of actual production operations tooling in this project.
Before this, a provider outage, a schema-validation regression after a
prompt change, or an RLS policy accidentally tightened too far would
only be discovered by a user reporting it — nobody at Chiron would
notice first. This document is what's monitored, how to check it, and
what still needs a human with Sentry account access to finish setting
up (this prompt can't create a Sentry organization or configure a
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
runs identically to before this prompt — nothing breaks, nothing is
silently degraded, there's just nowhere for reports to go yet.

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

**Verification, not just design intent** (Prompt G3, point 3's own
instruction — a live check against a real Sentry dashboard isn't
possible without an account, so this is the deterministic equivalent):

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
| `rate_limit_fail_open` | `checkRateLimit()`'s own documented fail-open path actually fires (`src/lib/server/rateLimit.ts`) — the exact bug ADR-028/Prompt F1 found and fixed             | Should be rare. Even one occurrence in production means the rate limiter's Postgres RPC is failing, not just theoretically capable of failing |
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
   matching how `.github/workflows/ci.yml`'s live-job secrets were set
   — Prompt F1) so `vite.config.ts`'s `sentrySvelteKit()` plugin uploads
   source maps on build. Without these, Sentry still receives every
   report — stack traces just point at minified code instead of
   original source.
4. **Configure three alert rules**, one per tag in the table above —
   exact conditions, since this prompt can't create them in a dashboard
   it has no access to:
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
