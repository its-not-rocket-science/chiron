# Chiron — Architecture Decision Records

Newest first isn't required; append chronologically. Each entry: date,
decision, why, alternatives considered, status.

---

## ADR-001: Use SvelteKit as the application framework

**Date:** 2026-08-22
**Status:** Accepted

**Decision:** Chiron uses SvelteKit (TypeScript, strict mode) rather than
going framework-free or using React.

**Why:** The MVP has genuine cross-cutting interactive state: live
three-pillar score rendering, a before/after diff view comparing two
LessonVersions, and shared-library search/filter state. This is enough
real client state management to justify a framework rather than
hand-rolled vanilla JS + server-rendered HTML. Given a framework is
justified, the product spec constrains the choice to Svelte/SvelteKit
over React.

**Alternatives considered:**

- No framework (server-rendered HTML + minimal vanilla JS): rejected —
  the before/after diff and live library filtering would end up
  reimplementing framework-shaped state management ad hoc.
- React/Next.js: excluded by explicit product constraint.

**Consequences:** SvelteKit server routes (`+server.ts`, `+page.server.ts`)
host all Anthropic API calls, file parsing, and Supabase queries —
nothing secret-bearing ships to the client. See `docs/ARCHITECTURE.md`
Section 2.

---

## ADR-002: Postgres via Supabase, with RLS as the org-isolation mechanism

**Date:** 2026-08-22
**Status:** Accepted

**Decision:** Persistence is Postgres via Supabase, and org/visibility
data isolation (Section 3, principle 8 of the spec) is enforced through
Postgres row-level security policies, not application-layer filtering.

**Why:** RLS makes the isolation guarantee structural — a query that
doesn't match a policy returns nothing, regardless of what the client
requests or what a route handler forgets to filter. This is a stronger
guarantee than "every route remembers to add a WHERE org_id = ... clause,"
which is one refactor away from a leak.

**Alternatives considered:**

- App-layer filtering only (every query manually scoped by route code):
  rejected — fragile, easy to regress, explicitly what principle 8 warns
  against ("never rely on the client to hide another org's ... lessons" —
  extended here to also not rely on route code alone).
- A separate authorization service: overkill for this scope.

**Consequences:** Schema design (`docs/ARCHITECTURE.md` Section 3) must
keep visibility-relevant columns (`owner_id`, `org_id`, `visibility`)
directly on or easily joinable from every table an RLS policy needs to
protect. RLS policies must be tested adversarially (Prompt 8, re-verified
Prompt 11), not just unit-tested against a mock.

---

## ADR-003: SubjectProfile is static TypeScript data in Phase 1, not a DB table

**Date:** 2026-08-22
**Status:** Accepted (revisit if profile authoring becomes a requirement)

**Decision:** The two launch subject profiles (science lab, history
essay) and any Phase 1 additions live in `lib/subjectProfiles.ts` as
typed static data, not a database table.

**Why:** The spec requires that adding a subject profile not require
touching the scoring engine's core logic — it does not require that
profiles be user/admin-authorable through UI in Phase 1. Static data
satisfies the actual requirement with far less complexity (no admin CRUD
UI, no migration, no validation-on-write concerns) while keeping the
extension point clean: a new profile is a new object literal matching
`SubjectProfile`, picked up automatically by the subject selector and the
scoring prompt builder.

**Alternatives considered:**

- DB table from day one: rejected as premature — no product requirement
  yet for org-authored custom profiles.

**Consequences:** If a future phase needs org-authored profiles, this
becomes a DB table with the same shape as the current type, and the
scoring engine's interface doesn't need to change (it already takes a
`SubjectProfile` object, not a hardcoded reference).

---

## ADR-004: Original uploaded files are discarded after text extraction

**Date:** 2026-08-22
**Status:** Accepted

**Decision:** Uploaded `.docx`/`.pdf` binaries are held only transiently
(in memory or a short-lived temp location) during parsing, and are not
persisted to storage after extraction succeeds or definitively fails.
Only the extracted, normalized text is stored, as `LessonVersion.raw_text`.

**Why:** Per Section 3 principle 9, default to discarding unless there's a
clear reason to keep the original. No Phase 1 feature (re-parsing,
re-downloading the original file, format-preserving export) needs the
binary once text is extracted, and not retaining it reduces the privacy
surface (uploaded lesson plans may contain student names, school
identifiers, etc., beyond what's needed for scoring) and storage cost.

**Alternatives considered:**

- Retain original in object storage: rejected for Phase 1 — no feature
  needs it; can be revisited if a "download original" feature is
  requested later, at which point it should be an explicit opt-in with
  its own retention/privacy review, not a default.

**Consequences:** Implemented and verified in Prompt 4; the file-parsing
pipeline must not write the original binary to any persistent store as a
side effect (e.g. accidental inclusion in logs, temp-file cleanup must be
guaranteed even on parse failure).

---

## ADR-005: Node adapter, and a Node ^20.19/>=22.12 floor

**Date:** 2026-08-22
**Status:** Accepted

**Decision:** Bootstrap uses `@sveltejs/adapter-node` (self-hosted Node
server output) rather than the Vercel adapter, and the toolchain requires
Node `^20.19.0 || >=22.12.0`.

**Why:** No hosting target was picked yet (Section 11, open question 2),
so `adapter-node` keeps deployment options open — it produces a plain
Node server that can run on any host, including behind a Vercel/other
platform wrapper later if needed, without committing to a platform-
specific adapter this early. The Node floor isn't a Chiron choice: Vite 8,
`@sveltejs/vite-plugin-svelte` 7.x, and several other current-generation
toolchain packages now require it upstream. Older Node 20.17.x, still
common on some machines, fails `npm install` with `EBADENGINE`.

**Consequences:** Documented in the README's "Local dev setup" section.
Anyone on an older Node 20.x patch needs to upgrade before `npm install`
will succeed — there is no supported path to pin the toolchain to older
majors without an escalating chain of transitive-dependency version
pins (tried during bootstrap; not worth the fragility it introduces).

**2026-08-25 correction (`prompts.txt` Prompt 31):** This ADR's decision
text above is stale and was found stale while working on ADR-006, not
independently audited — `svelte.config.js` and `package.json` actually
configure `@sveltejs/adapter-vercel`, not `adapter-node`, with no ADR
recording when or why that changed. Left as a correction note rather
than rewritten, since reconstructing the actual "why" now would be
guessing; flagging the drift is what this pass can honestly do. This
matters beyond bookkeeping: it directly resolves ADR-006's own
long-open "blocked on the hosting decision" status — see that ADR's
2026-08-25 update.

---

## ADR-006: Rate limiting mechanism

**Date:** 2026-08-22, revised 2026-08-23 (Prompt 11), re-confirmed
2026-08-23 (`prompts.txt` Prompt B), **superseded 2026-08-25**
(`prompts.txt` Prompt 31)
**Status:** Superseded — see the 2026-08-25 update at the end of this
entry. The in-memory design below (the original decision text) is no
longer what's running; it's kept for the historical record, same
superseding-note pattern ADR-007 uses for the vendor choice ADR-008
replaced. Everything from "2026-08-25 update" onward describes current
behavior.

**Decision:** `src/lib/server/rateLimit.ts` — a per-process, in-memory
sliding-window limiter keyed by client IP — gates `POST
/api/lessons/score` (15 req/10 min) and `POST /api/lessons/upload` (30
req/10 min), both reachable without signing in. Not a DB-backed counter,
not an edge/middleware solution.

**Why:** Prompt 11's security review found this endpoint completely
unprotected — anyone could spam real DeepSeek API calls at the project
owner's expense with zero throttling, a genuinely exploitable gap, not a
theoretical one. Shipping _some_ real protection immediately was more
valuable than continuing to wait on the hosting decision this ADR was
originally blocked on. An in-memory limiter needs no new infrastructure
and is real protection for the single-instance deployment
`adapter-node` (ADR-005) currently targets.

**Alternatives considered:**

- DB-backed counter (Supabase): would survive restarts and coordinate
  across instances, but adds a write on every scoring/upload request to
  a path that's already latency-sensitive (LLM calls). Worth it once
  actually running multiple instances; not before.
- Edge/middleware rate limiting: depends entirely on the hosting
  platform, still undecided (Section 11, open question 2).

**Consequences:** Documented as a known limitation in
`docs/SECURITY.md` Section 6: this state resets on restart and doesn't
coordinate across horizontally-scaled instances. Revisit with a shared
store (Redis, or a Supabase-backed counter) once either (a) the hosting
target is decided and needs multiple instances, or (b) abuse is
observed that a single-instance limiter can't catch (e.g. distributed
across many IPs — this limiter does nothing against that shape of
abuse, only per-IP spam).

**2026-08-23 re-confirmation (`prompts.txt` Prompt B):** Checked
whether anything has changed since this ADR was written that would make
the DB-backed option no longer optional. It hasn't: `docs/ARCHITECTURE.md`
Section 11, open question 2 ("deployment target adapter") is still
literally open — ADR-005 picked the `adapter-node` _adapter_, but the
actual hosting platform, and specifically whether it runs more than one
instance of the app, remains undecided. No multi-instance deployment
exists to protect. Re-confirming Option 2 ("defer, but harden") from
this pass rather than building the Supabase-backed counter now:
the in-memory limiter is unchanged (`src/lib/server/rateLimit.ts`), and
the trigger conditions above are re-affirmed as still accurate, with
one addition for concreteness: (c) the hosting decision specifically
lands on a platform that runs multiple instances by default for a
Node/`adapter-node` deployment (e.g. a PaaS with autoscaling replicas,
or manually running >1 process behind a load balancer) — at that point
trigger (a) is satisfied automatically and Option 1 (a Supabase-backed
`RateLimiter` behind the same interface, refactoring `checkRateLimit`
into an interface first) becomes the next thing to build, not just a
documented possibility.

**2026-08-25 update (`prompts.txt` Prompt 31) — supersedes the decision
above, extends the interface:** Replaced the in-memory `Map` inside
`src/lib/server/rateLimit.ts` with a Postgres-backed implementation.
`checkRateLimit(key, limit, windowMs)` keeps the exact same exported
name and parameter shape (now returning `Promise<RateLimitResult>`
instead of `RateLimitResult`) — every call site changed to `await` it,
nothing about the calling convention itself changed. This **extends**
the public interface (same function, same call sites, same config
values) while **superseding** the internal design (DB-backed state
instead of a process-local Map) — worth distinguishing because nothing
about how the four protected routes call this function changed at all.

While re-checking this ADR's own "blocked on the hosting decision"
claim before touching it (the discipline the 2026-08-23 re-confirmation
established), found that claim was already stale: `svelte.config.js`
runs `@sveltejs/adapter-vercel`, not `adapter-node` as ADR-005 states —
see ADR-005's own 2026-08-25 correction note. Vercel's serverless
functions are ephemeral per-invocation, not a long-running process, so
trigger (c) above (a hosting platform that runs multiple instances) was
already satisfied, and more severely than that trigger even
anticipated — an in-memory Map on Vercel can lose its state between
individual requests, not just across a redeploy. This means the
in-memory limiter had likely already been providing materially weaker
protection in whatever deployment actually existed than ADR-006 and
`docs/SECURITY.md` Section 6 both assumed, unnoticed until this pass.
Not treated as a separate incident to investigate further — Prompt 31
was already the fix regardless of exactly when the adapter changed —
but recorded here because "why replace this now" deserves the honest
answer, not just "the prompt said to."

**Design, matching Prompt 31's own instructions:**

- **Prefer infrastructure already present:** chose Supabase/Postgres
  over Redis or another dedicated store — Supabase is already
  load-bearing for every other piece of server state in this project,
  and introducing Redis for this one concern isn't justified by
  anything Chiron's actual scale needs yet.
- **Atomic:** `supabase/migrations/0011_rate_limits.sql`'s
  `check_rate_limit()` does the whole check-and-increment in one
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement — Postgres
  serializes concurrent callers for the same key via ordinary row
  locking, so there's no separate read-then-write race window. Verified
  live, not just reasoned about: `tests/rls/rateLimit.integration.spec.ts`
  fires 12 concurrent requests at a fresh key with limit 5 and asserts
  exactly 5 are allowed, not more (a lost update) and not fewer.
- **Cleanup/expiry:** handled inline inside `check_rate_limit()` itself
  (a ~1%-of-calls probabilistic `DELETE` of rows whose window closed
  over an hour ago), not a scheduled job — `pg_cron` isn't guaranteed
  enabled on every Supabase tier, and this way the migration has no
  dependency on one existing.
- **Not itself a DoS vector:** `rate_limits` has one row per distinct
  key, not per request, so growth is bounded by (distinct keys active
  in the last hour) once the cleanup above is accounted for, not by
  request volume. Distinct-key growth itself is bounded upstream: the
  anonymous-endpoint keys are real client IPs (`getClientAddress()`,
  not attacker-spoofable unless the deployment is separately
  misconfigured to trust an untrusted `X-Forwarded-For`), and the
  authenticated-endpoint keys are real Supabase Auth user ids (bounded
  by actual account creation, itself already gated by Supabase Auth's
  own signup throttling). No hard row cap was added on top of that —
  the old in-memory limiter's `MAX_TRACKED_KEYS` eviction doesn't have
  a clean analog here, since evicting rows early would mean forgetting
  a legitimate caller's count mid-window, which is worse than the
  bounded growth already reasoned through above.
- **Fails open, not closed**, on an infra error talking to Supabase
  (logged via `console.error`, not silent): treated as the correct
  default for a secondary protection layer — failing closed would mean
  a Supabase hiccup takes down lesson scoring and upload, previously
  Supabase-independent paths, over what should be defense in depth, not
  the primary safety mechanism.
- **Per-IP vs. per-user keys, reconsidered per Prompt 31's own
  "consider" list:** `score`/`upload` stayed IP-keyed (genuinely
  anonymous-reachable, no user id exists to key on). `practice-session`
  and `practice-transition` changed from IP-keyed to user-id-keyed — a
  real correction, not just following the instruction reflexively:
  Chiron's target market is schools, where many real students
  plausibly share one IP, and the old IP key meant one student's normal
  activity could throttle a whole classroom. Both routes are always
  authenticated, so a user id was already available.
- **A new, tighter limit specifically on classifier/tutor calls**
  (`practice-llm-calls:<userId>`, 40/10min), distinct from the general
  per-route request limits above — added because Prompt 31 names
  "student reasoning classifier calls; tutor calls" as their own
  protected item, not just covered incidentally by the request-level
  limit on the route that happens to trigger them. This directly closes
  the gap `docs/SECURITY.md` Section 9 measured and left open ("a
  single IP could still drive on the order of ~200-270 real LLM calls
  per 10 minutes in the worst case") — 40/10min per user is comfortably
  above several full playthroughs (~9 calls each) and comfortably below
  that worst case.
- **Deliberately NOT a per-attempt call cap.** Prompt 31's own text
  flags "maximum LLM calls per case attempt" and "server-enforced FSM
  preventing arbitrary repeated tutor calls" as overlapping with Prompt
  32, asking the two not to duplicate enforcement logic. The FSM's
  existing `MAX_CHALLENGE_ROUNDS` bound (Prompt 22) already is that
  enforcement for the tutor-repetition case; a fuller per-attempt
  model-cost cap is left to Prompt 32, which owns that axis.

**Tests:** `tests/rls/rateLimit.integration.spec.ts` — live against the
real Supabase project (gated, skipped if unconfigured, same pattern as
the RLS suites): limit enforcement, independent keys, window reset, and
the concurrency/atomicity test above. Replaces the old
`src/lib/server/rateLimit.spec.ts`, which tested Map behavior that no
longer exists.

---

## ADR-007: Scoring model default, and one endpoint for score + revise

**Date:** 2026-08-23
**Status:** Partially superseded by ADR-008 — the vendor/model choice
below is no longer current (Chiron's active provider is now DeepSeek, not
Anthropic). The one-endpoint-for-score-and-revise decision is still
accepted and unaffected by that change.

**Decision:** `AnthropicScoringProvider` defaults to `claude-sonnet-5`
(overridable via constructor option, not an env var — see below). A
single `POST /api/lessons/score` endpoint handles both the first score of
a pasted/uploaded lesson and every subsequent revise-and-resubmit; there
is no separate "create version" persistence step yet.

**Why:** Sonnet is the right cost/quality point for a per-submission
scoring call that needs to reliably follow a structured-JSON instruction
and produce grounded justifications — Opus is unnecessary cost for this
task, Haiku is a worse fit for the judgment involved. Not exposing model
choice as an env var keeps `Score.modelId` meaningful without a
deployment-time footgun (someone quietly pointing prod at a different
model by editing `.env`); changing the default is a code change, which is
also what "revisit as newer models ship" should be.

One endpoint for score + revise reflects principle 15 (small working
vertical slice over broad infrastructure): Prompts 1-7 have no
persistence layer yet, so "revising and resubmitting creates a new
LessonVersion" (Prompt 6) is implemented as "call the same scoring
endpoint again with new text and a caller-supplied `lessonVersionId`,
compare the two results client-side with `compareScores`" rather than a
real persisted version history. `docs/ARCHITECTURE.md`'s
`POST /api/lessons/:id/versions` (a real, persisted version-creation
endpoint) is still the eventual shape — it lands with accounts/library in
Prompt 8, once there's a database to persist versions into.

**Alternatives considered:**

- `ANTHROPIC_MODEL` env var: rejected for the reason above.
- Building persisted LessonVersion rows now: rejected as premature —
  Prompt 7's UI only needs to prove the score → revise → re-score loop
  feels trustworthy, not that it survives a page refresh.

**Consequences:** Prompt 7's revise-and-resubmit UI holds the previous
`ScoringResult` in client/session state, not a database row. Prompt 8
replaces this with real persistence without changing the active
`ScoringProvider` implementation or the domain scoring types.

---

## ADR-008: Switch the active scoring provider from Anthropic to DeepSeek

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `POST /api/lessons/score` now constructs a
`DeepSeekScoringProvider` (model default `deepseek-chat`, via
`DEEPSEEK_API_KEY`) instead of `AnthropicScoringProvider`. This is a
product/vendor choice by the project owner, not a technical limitation of
Claude — made explicitly to use a DeepSeek key for the live vertical-slice
check (Section 5 of `scope-and prompts.txt`) instead of an Anthropic one.
`AnthropicScoringProvider` is unchanged and still fully working behind the
same `ScoringProvider` interface; switching back is a one-line change in
the route (swap the constructor call).

**Why this was cheap to do:** the provider-independence requirement
(`docs/ARCHITECTURE.md` Section 5, principle 4) was taken seriously from
Prompt 6 onward — `ScoringProvider` was already the only thing domain code
and the route depend on. This swap required zero changes to
`domain/scoreLesson.ts`, the route's error handling, or any domain type.
The only genuine work was extracting the previously Anthropic-only prompt
construction (`scoringPrompt.ts`) and retry/validation/id-assignment logic
(`llmScoringCore.ts`) into vendor-agnostic shared modules, since they'd
been written inline in `AnthropicScoringProvider.ts` — that refactor is
what made adding a second vendor a same-day change instead of a rewrite.

**Implementation notes:**

- DeepSeek's API is OpenAI-wire-compatible, so `DeepSeekScoringProvider`
  reuses the `openai` npm SDK pointed at `https://api.deepseek.com` rather
  than a hand-rolled HTTP client.
- Uses DeepSeek's `response_format: { type: 'json_object' }` JSON mode.
  That only guarantees syntactically valid JSON, not our specific shape —
  `RawScoringOutputSchema` still does the real validation, same as for
  Anthropic.
- `DEEPSEEK_API_KEY` added to the env schema (`src/lib/server/env.ts`)
  alongside (not replacing) `ANTHROPIC_API_KEY`.

**Alternatives considered:**

- OpenAI, Mistral: also viable behind the same interface; DeepSeek was
  the one a key was available for. Nothing here is DeepSeek-specific
  enough to make adding `OpenAIScoringProvider` or `MistralScoringProvider`
  later any harder than this was.

**Consequences:** `Score.modelId` will now read `deepseek-chat` (or
whatever model id is passed) for newly scored lessons, not a Claude model
id — relevant if/when scores are persisted and compared over time
(Prompt 8+). The prompt-injection integration test now has a DeepSeek
counterpart (`DeepSeekScoringProvider.integration.spec.ts`) alongside the
existing Anthropic one; both are skipped unless their respective API key
is configured.

---

## ADR-009: Org invites are a shareable link, not a sent email

**Date:** 2026-08-23
**Status:** Accepted (revisit if/when an email provider is wired up)

**Decision:** `POST /account/org?/invite` creates an `org_invites` row and
returns the accept link (`/invites/{token}`) directly in the form
response — the admin copies and sends it themselves (Slack, email
client, whatever). Chiron does not send the invite email itself.

**Why:** No transactional-email provider is configured anywhere in this
project (Supabase Auth's own email sending is for auth flows — signup
confirmation, password reset — not arbitrary app-triggered emails to a
non-user). Standing up an email provider (Resend, Postmark, SES, or
configuring Supabase's SMTP settings plus a custom email template) is a
real integration with its own credentials, deliverability configuration,
and failure modes — out of proportion to what Prompt 8 asked for. The
underlying `org_invites` table/token/expiry model doesn't change at all
if email sending is added later; only the last step (deliver the link)
changes, from "displayed to the admin" to "emailed automatically."

**Alternatives considered:**

- Wire up a transactional email provider now: rejected as premature —
  no provider was specified, and adding one is a distinct piece of work
  (secrets, sender domain verification, deliverability) that shouldn't
  block the actual account/org/visibility functionality Prompt 8 is
  about.

**Consequences:** The admin-facing copy on `/account/org` says "share
this link" rather than "an email was sent" — this must stay accurate if
email sending is added later (update the copy in the same change).

---

## ADR-010: Cross-table RLS checks always go through SECURITY DEFINER helper functions, never a raw subquery

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** Every RLS policy that needs to check something on
_another_ table (or, in one case, the same table via a different row)
does so by calling a `SECURITY DEFINER` SQL function
(`my_org_ids()`, `is_org_admin()`, `is_lesson_owner()`,
`owns_lesson_version()`, `owns_score()`, `can_view_lesson_version()`),
never by inlining a raw subquery directly in the policy's
`USING`/`WITH CHECK` expression.

**Why:** Three real, non-obvious Postgres RLS bugs surfaced while
building and adversarially testing the schema in this migration set
(`0001`-`0005`), all from the same underlying category of mistake —
letting a policy's boolean expression depend on a fresh subquery against
an RLS-protected table instead of a stable, owner-context helper:

1. **Self-referencing recursion** (`0002`): `memberships`' own SELECT
   policy subqueried `memberships` from inside a policy defined _on_
   `memberships` — Postgres detected the cycle and raised `42P17`
   ("infinite recursion detected in policy"). Every other policy that
   read `memberships` (lessons, orgs, org_invites) inherited the same
   failure transitively, since they all trigger `memberships`' own RLS
   check when reading it as the querying user.
2. **Unreliable cross-table `WITH CHECK` subqueries** (`0003`): several
   INSERT/UPDATE policies checked ownership via
   `exists (select 1 from public.lessons where ...)` inlined directly in
   the policy. A logically identical, standalone `SELECT` on the same
   row succeeded, but the same check embedded in another table's
   `WITH CHECK` clause rejected the row (`42501`) — found by the
   adversarial test suite, not by inspection.
3. **`RETURNING` re-checks the row against the table's SELECT policy**
   (`0005`, the subtlest one): this is documented Postgres behavior, not
   a bug — but combined with a SELECT policy whose helper function
   queries the _same table_ the row was just inserted into
   (`lesson_versions`' policy calls `can_view_lesson_version()`, which
   joins back to `lesson_versions`), a self-referencing subquery cannot
   see a row inserted earlier in the _same_ SQL command. A plain
   `INSERT` with no `RETURNING`, or a completely separate `SELECT`
   statement issued afterward, both worked fine on the exact same row —
   only `INSERT ... RETURNING` (and PL/pgSQL's `RETURNING ... INTO`)
   failed. Fixed by having `save_lesson` generate ids up front
   (`gen_random_uuid()`) and insert them explicitly, so no `RETURNING`
   is needed for `lesson_versions`/`scores` at all.

None of these are Postgres _bugs_ — they're documented (if obscure)
consequences of self-referencing RLS. But all three were completely
invisible from reading the SQL; each one only surfaced by actually
running write operations against the live database and checking the
result, which is exactly why `docs/ARCHITECTURE.md` Section 8 requires
RLS correctness to be tested against a real instance rather than
reasoned about from the migration file.

**Consequences:** Any _new_ RLS policy added later that needs to check
another table (or reflect back on rows in its own table) should use or
extend one of the existing `SECURITY DEFINER` helper functions rather
than writing a fresh inline subquery — both to avoid re-discovering these
same three failure modes, and because a `SECURITY DEFINER` function
bypassing RLS internally is also generally faster (Postgres doesn't have
to re-plan/re-check RLS on the referenced table for every row). Any
function that generates a row that's referenced elsewhere in the same
transaction should generate its id in code and avoid `RETURNING` if that
table's own SELECT policy might self-reference.

---

## Flagged follow-ups (not yet fixed, found during Prompt 8's manual walkthrough)

- ~~`toggleFeatured` doesn't distinguish "blocked by RLS" from "nothing to
  change."~~ **Fixed in Prompt 11.** Both `toggleFeatured` and
  `revokeInvite` now chain `.select()` after their `update`/`delete` and
  treat a zero-row result as a `403`, rather than reporting success
  either way — see `docs/SECURITY.md` "Authorization correctness."
- **Deleting a user who owns an org-shared lesson can hit
  `org_shared_requires_org`** if the cascade order clears `org_id` (via
  the org's `on delete set null`) before the lesson itself is removed,
  or if an org is deleted while a still-owned org-shared lesson points
  to it. There's no "delete my account" or "delete org" feature yet, so
  this can't happen through the app today — but whenever account/org
  deletion is built, either clear `current_version_id` and delete owned
  lessons explicitly before the cascade, or reconsider the `on delete
set null` action on `lessons.org_id`.

---

## ADR-011: "Save a copy" reuses the current-lesson SELECT boundary instead of re-checking access

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `copy_lesson(source_lesson_id)` (Prompt 9) is
`SECURITY INVOKER` (the default), and does a plain `select * into
src_lesson from public.lessons where id = source_lesson_id` as its first
step, with no separate visibility check before it. If the row doesn't
come back, the function raises "not found or not visible" — it can't
actually distinguish those two cases, and that's the point.

**Why:** Because the function runs as the calling user, that `SELECT`
already goes through the same `lessons` RLS policy every other read
does. A caller can only ever copy a lesson they could already view via
`/library` or `/lessons` — private-to-someone-else, another org's
org-shared, all invisible for the same reason a direct fetch would be.
Writing a _second_, explicit "can this user copy this lesson" check
would either duplicate the visibility policy (a second place for it to
drift out of sync — see ADR-010) or, if it used a raw subquery instead
of an existing helper function, risk reintroducing one of the exact
failure modes ADR-010 catalogs. Letting the ordinary `SELECT` be the
access check is both less code and structurally impossible to get out of
sync with what `/library` shows in the first place.

**Consequences:** Copying always produces a `private`,
`copied_from_lesson_id`-tagged lesson regardless of the source's
visibility — there's no "keep it org-shared" option, matching the spec's
"save-a-copy... creates a new private LessonVersion." The rest of
`copy_lesson` follows the same id-generation/no-`RETURNING` pattern as
`save_lesson` (ADR-010) for `lesson_versions`/`scores`.

---

## ADR-012: Close the profiles email-exposure gap with a `profiles_public` view

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `supabase/migrations/0007_profiles_public_view.sql` locks
`profiles`' own SELECT policy to `id = auth.uid()` and adds a
`profiles_public` view (`id, display_name` only) that every cross-user
`profiles(...)` embed in the app now reads instead. This is option (a)
from `docs/SECURITY.md`'s "documented, not fixed" writeup on the
`profiles.email` exposure gap.

**Why:** `profiles`' SELECT policy was `using (true)` since Prompt 8 —
a deliberate MVP simplification, but a real one: any signed-in user
could read any other user's email directly via PostgREST
(`GET /rest/v1/profiles?select=email`), not just through Chiron's UI.
A view is the standard Postgres/Supabase pattern for this shape of
problem — it lets `account/org` (member list, lesson-authorship
attribution) and `library` (lesson-authorship attribution) keep working
exactly as before, since PostgREST resolves the FK relationship through
the view the same way it resolved it through the table, while the
underlying table itself no longer leaks `email` to anyone but its owner.

**Implementation notes:**

- `profiles_public` is deliberately _not_ `security_invoker` — Postgres
  view defaults to running RLS checks as the view _owner_ (the
  migration role, which has `BYPASSRLS` in Supabase), which is what
  lets it show every user's `display_name` to any authenticated caller
  even though `profiles`' own policy is now `id = auth.uid()`. Getting
  this backwards (`security_invoker = true`) would have made
  `profiles_public` inherit the _restrictive_ policy and return nothing
  for anyone but the caller's own row — the opposite of the point of
  the view. This is exactly the kind of behavior ADR-010 says not to
  reason about from the SQL alone; it's covered by a live test
  (`tests/rls/orgIsolation.spec.ts`: "profiles_public still returns
  display_name for another org's user").
- Every `profiles(...)` embed found by grepping the codebase
  (`src/routes/account/org/+page.server.ts` — member list and org
  lesson list; `src/routes/library/+page.server.ts` — library lesson
  list) was rewritten to `profiles_public(...)`, and the corresponding
  `.svelte` templates and TypeScript row interfaces updated to match
  (`profiles` → `profiles_public` field name). `invites/[token]`
  doesn't embed `profiles` at all — it reads `org_invites.email`, the
  invite's own column, unrelated to this gap.
- No current route reads the signed-in user's _own_ email from
  `profiles` (the layout gets it from `locals.user.email`, i.e.
  Supabase Auth's own user object, not the `profiles` table) — so there
  was nothing to migrate there. Confirmed, not just assumed: a live
  test proves a user can still read their own `profiles` row (email
  included) directly, in case a future settings page needs to.

**Alternatives considered:**

- Column-level `REVOKE`/`GRANT` on `email` (option (b) in the original
  writeup): also viable, but PostgREST's grant model interacts with
  RLS in less commonly-documented ways than the view approach, and the
  view keeps the fix legible in one place (one new object) rather than
  a column-permission change that's easy to overlook when reading the
  table's policies later.

**Consequences:** Any _new_ feature that needs to show one user's info
to another (a future "invited by" display, an assignee picker, etc.)
must read `profiles_public`, never embed `profiles` directly across
users — `email` should never again be requested in a query whose result
crosses to a different user than the one who ran it.

**2026-08-24 re-confirmation (`prompts.txt` Prompt 14):** Prompt 14
independently arrived at the same fix (a superseding prompt, not new
work) and asked to re-grep the known embed sites rather than assume
the earlier list was complete. Re-grepped `profiles(` and
`.from('profiles')` across all of `src/` fresh: zero remaining direct
embeds/queries outside `tests/rls/orgIsolation.spec.ts` itself — the
fix is complete. Also checked the one site Prompt A's own tests hadn't
separately exercised, `src/routes/library`'s lesson-author display
(only the org member list embed had a dedicated live test) — added
"the library lesson-author embed resolves through profiles_public too"
to close that gap. `org_invites.invited_by` (an "invited by" display,
the third known site named in both the original security review and
Prompt 14) turns out to have never been built as a UI feature — the
column is stored but nothing reads it back for display, so there was
never a `profiles(...)` embed there to fix. 19/19 live RLS tests pass.

---

## ADR-013: Enforce the upload size cap by reading the request body as a stream, not via `request.formData()`

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** `/api/lessons/upload/+server.ts` no longer calls
`request.formData()` directly. `readFormDataWithSizeCap()` reads
`request.body` chunk-by-chunk via its `ReadableStreamDefaultReader`,
tallying bytes as they arrive, and cancels the reader the instant the
running total exceeds `MAX_UPLOAD_SIZE_BYTES` — returning `413` without
ever handing the oversized body to a parser. Only once the cap is
confirmed _not_ exceeded are the collected chunks handed to
`Response#formData()` (the same standard multipart parser
`request.formData()` itself uses internally) to produce the `FormData`
the rest of the handler already expected.

**Why:** `docs/SECURITY.md` Section 3 documented a real gap: a client
that omits `Content-Length` (chunked transfer encoding) skipped the
existing pre-check entirely, because `request.formData()` fully
buffers the whole body in memory before any size check runs against
it — the 10MB cap existed in name only for such a client. This makes
the cap actually structural: enforcement happens _while_ reading, so
an oversized body is never fully buffered regardless of what headers
the client sends.

**Implementation notes:**

- Deliberately reuses `Response#formData()` for the actual multipart
  parsing rather than hand-rolling a boundary parser against the
  collected bytes — parsing untrusted multipart input is exactly the
  kind of thing worth leaving to a well-tested standard implementation
  instead of writing bespoke, security-sensitive parsing code for it.
- `reader.cancel()` is called on the exceeded-cap path specifically so
  the underlying connection stops being read from immediately, rather
  than continuing to drain a socket that's already known to be
  oversized — verified via a test that the stream's own `cancel()`
  callback fires and that only a fraction of the total chunks were
  ever pulled (`src/routes/api/lessons/upload/uploadSizeCap.spec.ts`).
- The existing `Content-Length`-based pre-check (added in Prompt 11)
  is kept as a fast path — cheap to check and rejects obviously
  oversized requests before any streaming read starts — but the
  streaming enforcement below it is what actually closes the gap for a
  client that omits or lies about that header.
- Platform/reverse-proxy-level body size limits (nginx, Vercel, Fly,
  etc.) are still worth confirming once hosting is chosen
  (`docs/ARCHITECTURE.md` Section 11) as defense in depth, but Chiron's
  own size enforcement no longer depends on one existing.

**Alternatives considered:**

- Hand-rolled multipart boundary parsing directly against the streamed
  bytes (to avoid the two-pass "collect chunks, then reconstruct a
  `Response` to parse them" approach): rejected — multipart parsing has
  a long history of parser-differential security bugs; reusing the
  platform's own implementation is safer than a bespoke one for a
  marginal memory saving (the collected bytes are bounded by the same
  10MB cap either way).
- Relying solely on a future hosting platform's default body-size
  limit: rejected as the sole fix — it's real defense in depth once a
  platform is chosen, but leaves the app with zero enforcement of its
  own in the meantime, and makes the guarantee depend on a decision
  (Section 11) that's still open.

**Consequences:** Any future endpoint that accepts file uploads should
follow the same pattern (stream-and-cap, not `request.formData()`
directly) rather than reintroducing this bypass in a new route.

**2026-08-24 re-confirmation (`prompts.txt` Prompt 14B):** a
superseding prompt covering the same gap as Prompt C above, not new
work. Re-verified: `readFormDataWithSizeCap()` is still in place and
still the code path `/api/lessons/upload` uses, and
`uploadSizeCap.spec.ts` still passes against it. Nothing changed.

---

## ADR-014: Routes call Supabase directly via a per-request client, not through the `DataStore` interface — recorded retroactively

**Date:** 2026-08-24 (documenting a decision effectively made across
Prompts 8-9; recorded now during the `prompts.txt` Prompt 13
documentation-reconciliation pass, which is what surfaced it)
**Status:** Accepted as the as-built state

**Decision:** `src/lib/domain/scoreLesson.ts` is the one domain function
that follows the originally planned provider-interface pattern — it
depends only on `ScoringProvider`. Everything else that touches
Supabase (lesson persistence, org/membership/invite writes, library
reads, save-a-copy) is called directly from route code
(`+page.server.ts` / `+server.ts`) against `locals.supabase` — either a
scoped `.from(...)` query or an RPC call (`save_lesson`, `copy_lesson`,
`create_org`, `accept_org_invite`) — not through the `DataStore`
interface `docs/ARCHITECTURE.md` originally sketched. `DataStore` and
its one implementation, `SupabaseDataStore`, still exist, but as built
they're unused by the app — a standalone service-role connectivity
check with its own spec test, nothing more.

**Why this is being recorded now, not silently left:** this is a real
gap between the original architecture sketch and what was actually
built, found while reconciling the docs against the repository per
`prompts.txt` Prompt 13 — `DataStore.ts`'s own comment still claimed
"the full data-access surface... is added as those features are built,
starting with the domain model in Prompt 5," which never happened, and
nothing had recorded that it never happened. Per that prompt's own
instruction not to rewrite history as though a decision were always
known: this ADR documents the divergence discovered now, not a
decision reasoned through at the time each route was written.

**Why the as-built shape is being accepted rather than reverted to the
original plan:** the actual isolation guarantee for org/visibility data
was always meant to be Postgres RLS (ADR-002), not an app-layer
`DataStore` abstraction — ADR-002 explicitly rejected "every route
remembers to scope its own query" as too fragile _precisely because_
RLS was supposed to be the real boundary regardless of what route code
does. Given that, an intervening `DataStore` interface for these calls
would have added a layer of indirection without adding a safety
guarantee RLS doesn't already provide — the adversarial RLS suite
(`tests/rls/orgIsolation.spec.ts`) proves the actual boundary holds
directly against the live database, independent of which route code
path is used to reach it.

**Alternatives considered:**

- Retroactively build out `DataStore` and route every call through it
  to match the original sketch: rejected here — this is a
  documentation-reconciliation pass (`prompts.txt` Prompt 13 explicitly
  says not to change application behavior), and the resulting
  abstraction wouldn't change the actual security posture, only add
  code. Revisit if a second concrete `DataStore` implementation is ever
  actually needed (e.g. an in-memory/test fake), which would be the
  real justification for the interface existing at all.
- Delete the unused `DataStore`/`SupabaseDataStore` now: also rejected
  as out of scope for a docs-only pass — flagged instead as known
  technical debt in `docs/STATUS.md`, a cleanup decision for whoever
  next touches that area, not a silent deletion bundled into a
  documentation commit.

**Consequences:** `docs/ARCHITECTURE.md` Sections 2 and 6 now describe
this as-built split directly rather than the original planned
abstraction. Anyone adding a new persistence-touching route should
follow the as-built pattern (call `locals.supabase` directly, lean on
RLS) unless a real second `DataStore` implementation need arises to
justify reviving the interface.

---

## ADR-015: Phase 2 sharpens the deterministic/LLM boundary — classification only, never scoring

**Date:** 2026-08-24
**Status:** Accepted (design-only — nothing built yet)

**Decision:** For Phase 2 (student assessment), an LLM may classify
observable reasoning signals present in a student's free text. It may
never directly assign a score, points, a grade, a skill percentage, or
"correctness" for that student. Application code and authored case
metadata are what turn a set of signal classifications into a score or
credit decision. This is stricter than Phase 1's rule (LLM-generated
scores, schema-validated) — full design in `docs/PHASE2.md` Section 1a.

**Why:** Phase 1's LLM-generates-the-score pattern is a defensible
design for a coaching tool aimed at a teacher: the teacher is the
professional in the loop, and the score is advisory input to their own
judgment, not a record made _about_ them. Phase 2 assesses a student —
per `docs/PHASE2.md` Section 7, very likely a minor — and produces
records _about_ that student's reasoning and performance. That's a
different act with a higher bar: an assessment result needs to be
explainable in terms of what the student actually wrote, not "the
model judged it was good reasoning." Making the LLM's role structurally
narrow (classify a named signal, point at the literal text that
justifies it) is what makes that explainability possible, rather than
trusting a prompt to produce it.

**Alternatives considered:**

- Reuse Phase 1's pattern for Phase 2 (LLM outputs a schema-validated
  score directly): rejected — this is exactly the shape Phase 1 is
  allowed to have precisely because it's advisory coaching for a
  professional, not an assessment record about a student; the stakes
  don't transfer.
- Let the LLM produce a qualitative "reasoning quality" judgment that
  application code maps to credit (a softer middle ground): rejected —
  this is what `docs/PHASE2.md`'s original `unknownIsCreditableIfReasoned`
  design already did, and it's exactly the pattern this ADR rules out;
  see `prompts.txt` Prompt 18, which replaces it with authored,
  fully-deterministic rules once that redesign pass runs.

**Consequences:** Any Phase 2 LLM-backed provider, when actually built
(`prompts.txt` Prompt 23's `ReasoningClassifierProvider`), must return
only classification structs (`signal`, `present`, `confidence`,
`evidenceQuote`) — never a numeric score or a correctness verdict — and
`evidenceQuote` must be validated as literal text from the student's
own submission, rejected/retried otherwise. `docs/PHASE2.md` Section 4
is explicitly flagged as pending revision under this rule rather than
silently left inconsistent — see that section's own pending-revision
note.

---

## ADR-016: Phase 2's judgment model is a five-level evidence-support scale, not `true | false | unknown`

**Date:** 2026-08-24
**Status:** Accepted (design-only — nothing built yet)

**Decision:** `docs/PHASE2.md`'s student judgment model is replaced.
The flagship question is now "how strongly does the available evidence
support this claim?", answered on a closed five-value ordinal scale
(`strongly_unsupported` / `somewhat_unsupported` / `uncertain` /
`somewhat_supported` / `strongly_supported`), with confidence kept as a
genuinely separate 0-100 value. A case's answer key is no longer a
single `correctJudgment` — it's an authored `targetRange` (the ordinal
span the case's evidence actually supports) plus an explicit
`creditableFinalJudgments` array (the judgment values that earn credit,
not required to be a single value). Cases also declare a `responseMode`
(`'evidence_support_scale' | 'categorical' | 'decision'`), with only
`evidence_support_scale` implemented in Phase 2A.

**Why:** The original `true | false | unknown` model conflated two
different questions — _is this claim true_ and _does the currently
revealed evidence support it_ — and had no way to represent a student
correctly holding those apart (believing a claim is probably true while
correctly judging the shown evidence doesn't establish it). It also
forced binary-or-bail: no way to express "somewhat supported but not
conclusively" short of picking a side or opting out via `'unknown'`.
An ordinal scale represents graded evidential support directly, and
makes `'uncertain'` a real point on that scale rather than a
third, structurally different escape hatch.

**Alternatives considered:**

- Keep `true | false | unknown` and just add more values as an
  unordered enum: rejected — the relationship between the values
  matters (a calibration curve, Section 4, needs an ordinal scale to
  bucket against), so the scale needs to actually be a scale, not a
  bigger flat set of labels.
- A single hidden "correct" answer per case (just widen its type to
  the five-value scale): rejected — this is exactly the "reduce every
  case to one exact hidden answer" failure mode the prompt driving this
  decision explicitly warned against; `targetRange` +
  `creditableFinalJudgments` keeps a case's authored reasoning
  (the range) separate from and traceable to what actually earns credit
  (the explicit list), and lets that list legitimately contain more
  than one value.
- Design and implement `categorical`/`decision` response modes now,
  since `responseMode` already names them: rejected as premature —
  Phase 2A only needs `evidence_support_scale`; naming the other modes
  now just keeps the schema from needing a rewrite if a case that
  actually needs one is designed later, it doesn't obligate designing
  them today.

**Consequences:** Every place `docs/PHASE2.md` referenced the old
three-value model (the tutor FSM's judgment states, the "non-negotiable
invariant" that challenge selection can't see the answer key,
`PracticeAttempt`'s judgment fields, the `outcome`-computation bullets)
was updated to the new vocabulary in the same pass. The
`unknownIsCreditableIfReasoned`/`unknownCreditJustification` fields
from Prompt D's revision are renamed
`uncertainIsCreditableIfReasoned`/`uncertainCreditJustification` to
match — the _mechanism_ they describe (an LLM reasoning-quality
judgment deciding credit) is unchanged here and remains flagged
pending Prompt 18's replacement (ADR-015); this ADR only changes what
judgment values exist and what "creditable" means structurally.

---

## ADR-017: "What would change your mind?" is a first-class, per-case-optional FSM state

**Date:** 2026-08-24
**Status:** Accepted (design-only — nothing built yet)

**Decision:** `docs/PHASE2.md`'s tutor FSM (Section 3) gains a new
state, `COMMIT_UPDATE_CRITERION`, reached right after
`ASK_CONFIDENCE` and before any evidence-reveal round — only for cases
authored with `usesUpdateCriterion: true`. The student is asked what
additional evidence would change their confidence; the answer is
stored verbatim and classified against that case's own authored
`updateCriteria[].signal` set (Section 2), not the cross-case Section
1a vocabulary. Two new cross-case signals are added to Section 1a:
`relevant_update_criterion` and `moves_goalposts_after_evidence`
(`states_update_criterion` and `follows_declared_update_criterion`
were already named in Prompt 15, ahead of having a mechanic to attach
to — this is that mechanic).

**Why:** A student who commits to a standard _before_ seeing decisive
evidence, then either meets that standard when it's met or holds firm
when it isn't, is demonstrating exactly the kind of disciplined,
falsifiable reasoning Abrami's dispositions (caution about when to
commit to, suspend, or change a judgment) are about. Capturing it only
after the fact (asking "why did you change your mind?" retrospectively)
can't distinguish real evidence-responsiveness from post-hoc
rationalization — the commitment has to be prospective to mean
anything.

**The invariant this exists to protect:** mind-changing itself is not
the trained quality and must never be scored as though it were.
Holding a judgment steady when the promised evidence didn't appear is
just as creditable as updating when it did; updating without the
promised evidence appearing (`moves_goalposts_after_evidence`) is the
one outcome that shouldn't be rewarded, regardless of how confident or
articulate the student sounds while doing it.

**Alternatives considered:**

- Infer an implicit update criterion from the student's initial
  free-text reasoning (no separate FSM state, no separate question):
  rejected — an implicit criterion isn't a genuine prospective
  commitment a later update can be checked against; the whole point
  requires the student to state it as a distinct, separately-recorded
  act.
- Score `moves_goalposts_after_evidence` as a straightforward penalty
  the moment it's detected: rejected here — Prompt 26 (the pass that
  designs the actual consistency-check algorithm) is explicitly asked
  to be conservative about this specific call and to phrase feedback
  in terms of the stated criterion versus what happened, not a
  psychological label; this ADR sets that expectation now rather than
  leaving it to be decided ad hoc later.
- Require every case to use this mechanic: rejected —
  `usesUpdateCriterion` is per-case precisely because not every case
  has a clean, single decisive-evidence moment worth committing to in
  advance; forcing one would produce fake criteria on cases that don't
  really have one.

**Consequences:** `PracticeAttempt` (Section 4) gains an
`updateCriterion` field (text + `SignalClassification`), captured now
but explicitly **not** yet wired into `outcome` — the deterministic
consistency-check logic that would do that is `prompts.txt` Prompt
26's job. `practice_sessions` (the resumable-session design, Section 3) must persist the committed criterion text once given, same as the
initial judgment, since both are stated before evidence reveal and
must survive an interruption. `ReasoningClassifierProvider` (now named
in Section 6, closing a dangling forward-reference Prompt 15 left)
handles this classification, scoped per-case rather than against the
global signal vocabulary — the same closed-set-but-dynamically-scoped
discipline Section 3 already established for
`HIGHLIGHT_CONTRADICTION`'s `evidenceId` validation.

---

## ADR-018: Replace LLM-judged uncertainty credit with an authored `reasoningRubric` — resolves ADR-015's Section 4 deferral

**Date:** 2026-08-24
**Status:** Accepted (design-only when written). The
`HIGHLIGHT_CONTRADICTION`'s-`evidenceId`-validation reference in this
ADR's body describes a design later superseded by ADR-021's
`REFER_TO_REVEALED_EVIDENCE` redesign — that aside is stale, but the
`reasoningRubric` decision itself is unaffected and remains accepted.

**Decision:** `docs/PHASE2.md`'s `CreditableAnswerSpecSchema` no longer
has `creditableFinalJudgments` (a flat list) or
`uncertainIsCreditableIfReasoned` (an LLM-judged escape hatch). Both
are replaced by `reasoningRubric.finalJudgmentRules`: an array of
authored rules, each pairing a set of accepted judgments with a
required-signal count (`requiredSignals` + `minimumRequired`) that
must be met by the classifier's `SignalClassification` output for that
rule to fire. Any rule firing is independently sufficient for full
credit. `PracticeAttempt.outcome` collapses from three values
(`'correct' | 'incorrect' | 'appropriately_uncertain'`) to two
(`'correct' | 'incorrect'`) — landing on `'uncertain'` and earning
credit is now just one more rule, not a distinct code path. The old
single free-text LLM justification field is replaced by
`scoringExplanation` (detected signals + which rule matched + why).

**Why:** ADR-015 established that an LLM may classify signals but must
never decide what a classification is worth — application code and
authored case metadata do that. The uncertainty-credit mechanism this
ADR replaces was the one place Phase 2's design still violated that
rule: `uncertainIsCreditableIfReasoned` let an LLM's own
"is this reasoning grounded" judgment silently determine a student's
outcome, exactly the soft LLM-authority ADR-015 rules out. Making the
whole mechanism rule-based rather than judgment-based is what makes it
actually explainable: the system can now state, deterministically,
which signals were detected and which authored condition they
satisfied — not just report a sentence an LLM wrote about its own
call.

**Alternatives considered:**

- Keep a separate `appropriately_uncertain`-style outcome value,
  computed by the same rule mechanism: rejected — once credit for
  `'uncertain'` is just another rule with `acceptedJudgments:
['uncertain']`, a separate outcome category adds a distinction
  without a difference; a transcript UI that wants to flag "credited
  via an uncertainty rule" can derive that from `matchedRuleId`
  without a dedicated stored value.
- A single `requiredSignals` list per case (one bar for the whole
  case, not per-judgment): rejected — this can't represent "multiple
  reasoning paths may earn full credit" when different paths
  legitimately need different reasoning bars (e.g. a case where
  `'somewhat_supported'` needs no particular signal but `'uncertain'`
  needs a demonstrated evidentiary-gap signal to distinguish genuine
  uncertainty from a guess).
- Let case authors write arbitrary boolean signal expressions (AND/OR
  trees) instead of a flat required-count: rejected as premature
  complexity — "N of these M signals" (the quoted-example shape from
  the prompt driving this decision) covers every case this design
  currently anticipates; a richer expression language can be added
  later if an actual case needs one, without breaking this shape.

**Consequences:** `docs/PHASE2.md` Section 2's schema, Section 3's
non-negotiable invariant (now phrased in terms of
`reasoningRubric.finalJudgmentRules` instead of a flat judgment list),
and Section 4's whole outcome algorithm were rewritten together in
this pass so the document stays internally consistent — this ADR
doesn't leave a "pending revision" marker behind the way ADR-015 did,
because this pass _is_ the revision ADR-015 deferred. Two guardrails
were added explicitly rather than left implicit: `requiredSignals`
must be genuine, checkable reasoning moves, never a proxy for reward-
ing a particular real-world conclusion ("no hidden ideological answer
matching," the prompt's own phrase); and `answerSpec` in full —
including `reasoningRubric` — must never reach the client before an
attempt's `SCORE_AND_RECORD` completes, extending Section 3's existing
tutor-facing version of that same invariant to the whole student-facing
surface.

---

## ADR-019: Phase 2A's `practice_cases` is static data, not a database table

**Date:** 2026-08-24
**Status:** Accepted (design-only — nothing built yet)

**Decision:** The three hand-authored canonical cases for Phase 2A
live as static, Zod-validated TypeScript data
(`src/lib/domain/practiceCases.ts`), the same pattern ADR-003 already
established for `SubjectProfile`. Not a `practice_cases` table. Session
and attempt rows (`practice_sessions`, `practice_attempts`) reference a
case by a plain string id, validated in application code against the
known static set — the same relationship `lessons.subject_profile_id`
already has to `subjectProfiles.ts`, not a foreign key.

**Why:** This wasn't decided in `docs/PHASE2.md` because it only
becomes the obviously-correct call once Phase 2A's actual scope is
pinned down (`prompts.txt` Prompt 19): exactly three fixed,
hand-authored, system-seeded cases, with AI case generation and
teacher-authored cases both explicitly out of scope. Under that scope,
a case is exactly as static as a `SubjectProfile` was in Phase 1
(ADR-003's own reasoning applies verbatim: no admin CRUD UI, no
migration, no per-write validation concerns — the requirement is
"reachable from server code," not "user-authorable"). It also
sidesteps a real secrecy problem structurally instead of solving it
with policy: `docs/PHASE2.md` Section 2 requires that `answerSpec` and
unrevealed `evidencePool` items never reach the client. If
`practice_cases` were a table, satisfying that needs the same kind of
view/column-secrecy split ADR-012 built for `profiles`/`profiles_public`
— real RLS surface, needing its own adversarial tests to get right.
Static server-side module data isn't queryable via PostgREST at all,
so there's no policy to get wrong; the only discipline required is the
one already established everywhere else in this codebase (never
`return` a secret from a `load` function or API response).

**Alternatives considered:**

- A `practice_cases` table with a `profiles_public`-style secrecy view
  from the start, anticipating Phase 2B's eventual need for one:
  rejected as premature for Phase 2A specifically — building and
  adversarially testing that RLS surface now, for content that's
  static either way in this phase, is real effort spent on a problem
  Phase 2A doesn't actually have yet. Revisit exactly when Phase 2B
  needs it (case generation or teacher authorship), not before.

**Consequences:** `docs/PHASE2A_IMPLEMENTATION.md` Sections 1 and 4-5
build the rest of the Phase 2A data model on this basis — only
`practice_sessions`, `practice_attempts`, and (optionally)
`disposition_checkins` are real tables, each with a simple owner-only
RLS policy (no `SECURITY DEFINER` cross-table helper needed anywhere
in Phase 2A, since no check requires a join). `docs/PHASE2.md` Section
5's discussion of a `practice_cases` table with a `source_lesson_version_id`
FK describes the Phase 2B shape, not Phase 2A's — noted inline there
rather than rewritten, since it becomes accurate again once
`CaseGenerationProvider` is actually built.

---

## ADR-020: Phase 2A's FSM tables grant no direct write access to `authenticated` — writes are service-role-only

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** `practice_sessions`, `practice_attempts`, and
`disposition_checkins` grant `authenticated` SELECT (owner-scoped) and
nothing else — no INSERT, UPDATE, or DELETE policy exists for the
ordinary client role at all. Every write to these tables happens
server-side, via a new `getServiceRoleClient()` helper
(`src/lib/server/serviceRoleClient.ts`), only after the transition
route (`prompts.txt` Prompt 22) has run the real FSM (`advance()`) and
scoring (`computeOutcome()`) logic.

**Why:** Found by thinking through Prompt 22's own required adversarial
test case — "jump directly to completion" — before writing it, not
after a live test caught it. `docs/PHASE2A_IMPLEMENTATION.md`'s
original RLS design (Section 5) reasoned that owner-scoped
`student_id = auth.uid()` policies were sufficient because no
cross-table check was needed. That's true for read isolation, but it
missed a different problem: ownership alone doesn't validate that a
_write_ is a legitimate FSM transition. A student authenticated as
themselves could, via a direct REST call with their own JWT (bypassing
the app's routes entirely), `PATCH` their own `practice_sessions` row's
`fsm_state` straight to `COMPLETE`, fabricate `revealed_evidence_ids`
claiming evidence was shown that wasn't, or `INSERT` a
`practice_attempts` row with a self-selected `outcome: 'correct'` and
an invented `scoring_explanation` — none of which the original
ownership-only policies would have blocked, since the row really would
belong to them. RLS enforces _whose_ row a write touches; it was never
going to enforce _that the write is the output of a real playthrough_
— only application code that actually ran the FSM can guarantee that.

**Why service-role, not a `SECURITY DEFINER` RPC (the ADR-010 pattern
used everywhere else in this codebase):** Phase 1's RPCs
(`save_lesson`, `copy_lesson`) work because the operation they perform
is expressible as a single, self-contained SQL transaction. A Phase 2A
session transition isn't — it needs `TutorProvider`/
`ReasoningClassifierProvider` calls (real HTTP requests to an LLM
vendor) interleaved with the state logic, which can't run inside a
Postgres function. The trust boundary has to be "this specific route,
having already executed the real TypeScript FSM," not "this SQL
procedure" — a service-role client scoped to that route is what makes
that boundary real, the same way Phase 1's `DEEPSEEK_API_KEY` is only
ever read server-side and never exposed to a route's response.

**Consequences:** `owns_practice_session()`/`owns_practice_attempt()`
(defined in migrations 0008/0009 per the ADR-010 helper-function
pattern) are currently unused by any live policy — kept anyway as
reusable `SECURITY DEFINER` primitives for a future RPC (e.g. teacher
visibility into a student's attempts, still an open question per
`docs/PHASE2.md` Section 7), not deleted and potentially re-added
later. Every route that writes to these three tables must go through
`getServiceRoleClient()`, never `locals.supabase` — reads stay on
`locals.supabase` (RLS-scoped), since read-isolation is exactly what
ownership-only RLS is good at and there's no reason to bypass it there.
This pattern (service-role writes gated by route logic, RLS-scoped
reads) is what should be followed for any future Phase 2A/2B table
where a write needs more validation than "do you own this row."

---

## ADR-021: The tutor's action vocabulary drops id-parameterized actions; provider failure falls back to a fixed question rather than throwing or returning empty

**Date:** 2026-08-25
**Status:** Accepted

**Decision, part 1 — `REFER_TO_REVEALED_EVIDENCE` replaces `HIGHLIGHT_CONTRADICTION(evidenceId)`.**
`prompts.txt` Prompt 24 (the real `TutorProvider` implementation)
redesigns the one action in Prompt 22's placeholder vocabulary that
carried a parameter. `TutorActionSchema` is now `{ action: TutorActionId }`
for all ten actions — no variant has an `evidenceId` field — and three
new actions are added: `ASK_ABOUT_CAUSALITY`, `ASK_ABOUT_SOURCE`,
`ASK_ABOUT_NUMBERS`.

**Why:** An id-parameterized action needs its own per-call, per-session
structural validation — the same shape `signalClassificationSchemaFor`
already needs for dynamic candidate-signal scoping — which is more
surface area than letting the model phrase a reference to already-seen
evidence naturally, in its own words, from context that's already
scoped to revealed evidence only (the prompt never includes unrevealed
evidence at all, so there's nothing for the model to name an id from
even if it wanted to). The tradeoff this accepts: the model could still
_describe_ unrevealed evidence in prose without ever naming an id,
which schema validation alone can't catch. `tutorCore.ts` covers part of
that gap with a structural, non-exhaustive heuristic (below); Prompt
33's paired-answer adversarial neutrality suite is the other, broader
layer — this is intentionally a defense-in-depth design, not a single
mechanism, matching Prompt 24's own framing.

**Decision, part 2 — provider failure falls back to a fixed question,
a third distinct failure-handling pattern.** `tutorCore.ts`'s
`selectAndPhraseChallengeWithLLM` retries once (like
`classifierCore.ts`) on: malformed JSON, an action outside the fixed
vocabulary, or a `questionText` introducing a number/percentage absent
from the scenario, claim, or evidence actually revealed for that call
(the no-invented-facts heuristic — deliberately numbers-only, not
exhaustive NLP). After exhausting retries, it returns a fixed,
hardcoded `{ action: 'ASK_FOR_REASONING', questionText: 'Can you walk
me through why you reached that judgment?' }` — never model-generated,
so it cannot leak anything or invent a fact by construction.

**Why a fallback, not `llmScoringCore.ts`'s throw-and-502 or
`classifierCore.ts`'s empty-array return:** Neither existing pattern
fits. Scoring's `ScoringError` throw is fine because a failed Phase 1
score is a single-shot operation with an obvious "try again" UX.
`classifierCore.ts`'s empty array works because "no signals detected"
is a meaningful, already-handled degenerate input to `computeOutcome`.
The tutor has no equivalent empty result: `PRESENT_CHALLENGE` must
produce _some_ action and question to keep a live student session
moving, and throwing would hard-fail a student mid-case for a
transient provider issue — a worse outcome than one generic,
educationally-neutral fallback question. This previews, in miniature,
the graceful-degradation requirement `prompts.txt` Prompt 32 will
generalize across all of Phase 2A's provider calls; it isn't Prompt
32's full cost/safeguard system, just the one provider that needed a
non-throwing, non-empty answer now.

**Consequences:** Three failure-handling shapes now coexist by design,
not by accident — throw (`llmScoringCore.ts`), empty-collection
(`classifierCore.ts`), fixed-fallback (`tutorCore.ts`). Each is
documented at its own call site; a future provider should pick
whichever shape matches what its caller can actually do with "no real
answer," not default to one pattern out of habit.

---

## ADR-022: Update-criterion consistency is a five-status deterministic function, with a structural evidence-appeared link and mechanic-level credit outside per-case rubric gating

**Date:** 2026-08-25
**Status:** Accepted

**Decision, part 1 — `UpdateCriterion.relevantEvidenceItemIds`.** Each
case-authored `updateCriteria` entry now names which specific
`evidencePool` item(s) actually deliver what it promised (validated
against the case's own evidence ids in `PracticeCaseSchema`'s
`superRefine`). "Did the promised evidence appear" is then a structural
set-membership check (`relevantEvidenceItemIds` ⊆ `revealedEvidenceIds`),
not a question re-posed to an LLM at scoring time.

**Decision, part 2 — five deterministic statuses, no "moved goalposts"
status.** `src/lib/domain/updateCriterionConsistency.ts`'s
`computeUpdateCriterionConsistency()` — pure, no I/O — lands on exactly
one of `criterion_met_and_followed`, `criterion_met_no_update`,
`criterion_not_met_no_update`, `criterion_not_met_updated`, or
`criterion_not_relevant` (matching `prompts.txt` Prompt 26's own test
list one-for-one). There is no sixth "moved goalposts" status.
`criterion_not_met_updated` — evidence never appeared, judgment changed
anyway — is the shape that scenario takes, and its statically-templated
explanation states only those two observable facts, in the register
`docs/PHASE2.md` Section 3 specifies ("Your earlier criterion said X
would matter...", never "You are biased."). This is what "be
conservative" (Prompt 26's explicit instruction) means here in
practice: never inferring or asserting _why_ the learner updated,
because the deterministic inputs available genuinely can't distinguish
"moved the goalposts" from "updated for an entirely different, valid
reason" — the prompt's own fifth test case.

**Decision, part 3 — mechanic-level credit bypasses per-case rubric
gating.** `deriveUpdateCriterionSignals()` maps a consistency result to
up to three cross-case signals — `states_update_criterion`,
`relevant_update_criterion`, and (only for `criterion_met_and_followed`)
`follows_declared_update_criterion`. The transition route feeds these
into `computeScoringEvents` (`scoringEvents.ts`, ADR from Prompt 25)
using a synthetic rubric whose `partialCreditSignals` is exactly these
three ids — not the case's own authored `reasoningRubric`. **Why:**
these three signals are about the update-criterion mechanic itself
(did you commit to something relevant, did you honor it), which is
universal whenever `usesUpdateCriterion` is on — not a case-specific
reasoning move a case author opts into via `partialCreditSignals` the
way `identifies_confounder` or `identifies_denominator_problem` are.
Gating mechanic-level credit behind per-case authoring would silently
make the mechanic uncreditable on any case whose author forgot to list
these three ids (as `causal-inference-1` in fact did, until this pass —
see the fourth decision below). Deliberately does _not_ synthesize
`updates_for_relevant_evidence` this way — that signal stays purely
classifier-driven from the case's own general reasoning text, keeping
"followed a specific stated commitment" (this mechanic) separate from
"updated reasonably in general" (ordinary signal classification a case
opts into normally).

**Decision, part 4 — fixed a real bug in the pre-existing
update-criterion classification handling, and closed an authoring
gap.** The transition route previously selected `ucClassifications.find(c => schemaValid(c))`
— "the first schema-valid classification" — without checking `present`
at all, meaning a `present: false` result could be stored as if it
were a meaningful match. `computeUpdateCriterionConsistency()` now
requires `present: true` explicitly. Separately, `causal-inference-1`'s
own `requests_comparison_street` signal was never listed in its
`reasoningRubric.partialCreditSignals`, so even a correctly-detected
match could never earn a `ScoringEvent` through the normal per-case
path; added it there too (on top of, not instead of, the new
mechanic-level credit above) so a genuinely relevant stated criterion
is visible in both channels.

**Alternatives considered:**

- Let case authors manually list `states_update_criterion` /
  `relevant_update_criterion` / `follows_declared_update_criterion` in
  their own `partialCreditSignals`, same as every other signal:
  rejected — these three are mechanic-driven, not case-content-driven;
  requiring authors to remember to add them is exactly the kind of
  authoring gap part 4 above found and fixed once already.
- A boolean `movedGoalposts` field alongside the five statuses, defaulting
  to a conservative `false` most of the time: rejected — even an
  unset-by-default boolean invites a future caller to eventually wire
  it up as an accusation; omitting the concept from the type entirely
  is a stronger guarantee than a field nobody should read.

**Consequences:** A future case adding a second `updateCriteria` entry
must also give it `relevantEvidenceItemIds`, validated at parse time.
Any future case using `usesUpdateCriterion` automatically gets
mechanic-level credit without further rubric authoring — one less thing
for `docs/CASE_AUTHORING.md` to have to instruct authors to remember.

---

## ADR-023: Confidence calibration is checked against `judgmentWithinTargetRange`, not rubric-credit `outcome`; five confidence bands, not deciles; per-case `calibrationEligible` gating

**Date:** 2026-08-25
**Status:** Accepted

**Decision, part 1 — the binary event.** `docs/PHASE2.md` Section 4's
original sketch (Prompt 18) proposed a Brier score pairing
`revisedConfidence` directly against `scoringExplanation.outcome`
(`'correct' | 'incorrect'`). Implementation (`prompts.txt` Prompt 27)
changes this: `practiceCalibration.ts`'s `judgmentWithinTargetRange(judgment, targetRange)`
— "did the revised judgment land within the case's authored
`targetRange`" — is the event calibration is actually checked against.

**Why:** The confidence question shown to students is "how confident
are you that this is the best-supported judgement given the evidence
currently available" — a question about whether their _judgment_ is
defensible. `outcome` answers a different, compound question: it's
`'correct'` only when the judgment is defensible **and** the student
articulated the specific reasoning signals a rubric rule requires in
their free text. A student holding the exact right judgment, genuinely
confident in it, who simply doesn't phrase their reasoning in a way the
classifier detects, would score `outcome: 'incorrect'` — pairing that
against their confidence would report an articulation gap as a
calibration failure, which it isn't. `judgmentWithinTargetRange` asks
exactly the question the confidence prompt asks and nothing else, which
is what makes the Brier score mathematically appropriate here (Prompt
27's own caution: "if Brier score is not mathematically clean... do not
force it" — the fix was picking the right event, not abandoning Brier
score).

**Decision, part 2 — `calibrationEligible`, structurally enforced.**
`CreditableAnswerSpecSchema` gained `calibrationEligible: boolean`
(case-authored) plus a `.refine()`: `true` requires `targetRange` to
span at most 2 adjacent judgment bands. `relative-risk-1` (Case 2) is
deliberately 3 bands wide — its entire design point is that the
defensible answer sits in the genuine middle of the scale — and is
marked ineligible; Cases 1 and 3 (2 bands each) are eligible. Enforced
structurally, not left as an authoring convention, because a case
author forgetting to consider this is exactly the kind of gap ADR-022
already found once for the update-criterion mechanic's own credit
signals.

**Decision, part 3 — five bands, not deciles.** `docs/PHASE2.md`
Section 4 proposed decile buckets (10 bands). Implementation uses five
20-point bands. **Why:** Phase 2A's realistic per-student attempt
volume (a handful of completed cases during initial testing) would
leave nearly every decile bucket permanently below any usable
sample-size threshold — "insufficient data" would be the default
result for every real user, not the occasional edge case. Coarser bands
make the report actually show something for a student who's done a
handful of cases.

**Decision, part 4 — `MIN_SAMPLE_SIZE = 5`, applied per-band and to the
overall Brier score.** Below this many data points, `observedAccuracy`
(a band) or `brierScore` (overall) is `null`, never a computed number —
`prompts.txt` Prompt 27's explicit "do not display fake precision for
small sample sizes." 5 is a deliberately low, practically-motivated
bar, not a statistically rigorous minimum — documented as such in
`docs/CALIBRATION.md` rather than presented as more rigorous than it
is.

**Decision, part 5 — no per-skill breakdown, no route/UI, in this
pass.** `docs/PHASE2.md` Section 4 also proposed per-skill (not just
overall) calibration aggregates. Not built: three canonical cases and a
handful of skill tags between them would make per-skill sample sizes
even thinner than the overall ones — `null` for essentially every real
user in the near term, i.e. real complexity with no reachable payoff
yet. Similarly, no new route exposes this report to a client yet —
Prompt 27's "storage" requirement is already satisfied by existing
`PracticeAttempt` data (no new column needed: `targetRange` is static
case data, confidence/judgment are already on the row), and
"reporting" is satisfied by `computeCalibrationReport` existing and
being tested; surfacing it in a UI is Prompt 28's or Prompt 29's job
(Prompt 29 explicitly names a "confidence/update summary").

**Alternatives considered:**

- Keep pairing confidence against `outcome`, and just caveat the
  mismatch in documentation: rejected — a documented known-wrong metric
  is still a wrong metric a future reader could reasonably trust:
  fixing the actual computation is not more work than writing a
  disclaimer, so there's no real tradeoff being passed up here.
- Drop Brier score entirely per Prompt 27's own permission to prefer a
  simpler measure: rejected — once paired with the right event,
  Brier score is exactly the right tool for "is a stated probability
  accurate," and the reliability bands alone would lose the
  single-trend-line summary a Brier score gives for free.

**Consequences:** A future case's `answerSpec` must include
`calibrationEligible`, and the two-band-width rule flows automatically
from `targetRange` — case authors can't accidentally mark a wide,
deliberately-permissive range as calibration-eligible. Any future
report-building code (Prompt 28/29's UI, or a dashboard route) must
filter attempts to `calibrationEligible` cases before calling
`computeCalibrationReport`, since the module itself has no case-lookup
capability and trusts its caller to have already done that filtering.

---

## ADR-024: Model-cost and runaway-interaction safeguards — provider timeout/retry, free-text length cap, named per-attempt call ceiling

**Date:** 2026-08-25
**Status:** Accepted

**Context.** `prompts.txt` Prompt 32 asks for an explicit checklist of
cost-containment properties: bounded tutor challenge rounds, bounded
classifier calls per stage, a bounded total per attempt, bounded
learner free-text length, a provider-call timeout, a capped retry
count, no recursive autonomous model loops, no client-controlled model
id or prompt, no unlimited "ask tutor again" affordance, and a graceful
fallback on provider failure — plus tests proving the FSM can't be
abused into unlimited calls, and documentation of the worst-case
LLM-call count per completed case.

**Audit result — most of this checklist was already satisfied before
this prompt, verified rather than assumed:**

- **Tutor challenge rounds** — `MAX_CHALLENGE_ROUNDS = 6`
  (`practiceFsm.ts`, Prompt 22) already bounds this, enforced in
  `advance()`'s `AWAIT_CHALLENGE_RESPONSE` case and covered by an
  existing `practiceFsm.spec.ts` test ("never reveals more than
  `MAX_CHALLENGE_ROUNDS` items even for a case with more evidence than
  that"). No change needed.
- **No client-controlled model id or prompt** — every provider is
  constructed with zero options at its one call site
  (`const tutorProvider = new DeepSeekTutorProvider();` etc., module
  scope in the transition route); `modelId` always resolves to the
  compiled-in default. `buildSystemPrompt()`/`buildUserMessage()` take
  only server-side session/case data plus the learner's own free text
  as structured fields, never a client-supplied instruction string.
  Already re-confirmed by `docs/SECURITY.md` Section 9's prompt-injection
  finding. No change needed.
- **No unlimited "ask tutor again" button** — grepped the practice UI:
  every "Try again" string is generic HTTP-failure recovery (retry a
  failed fetch), not an independent tutor-call trigger. The client only
  ever advances by submitting the one event the FSM's current state is
  waiting for; there's no code path that calls the transition route
  more than once per genuine user action. No change needed.
- **Graceful fallback on provider failure** — already true and already
  documented (ADR-021): `tutorCore.ts` falls back to a fixed, safe,
  never-model-generated question after exhausting retries;
  `classifierCore.ts` falls back to an empty signal list (ordinary
  non-credit, not a crash). No change needed.

**Real gaps found and fixed:**

1. **Timeout and retry count were not actually capped the way
   `MAX_ATTEMPTS = 2` in `tutorCore.ts`/`classifierCore.ts` implies.**
   Read `node_modules/openai/client.js` and confirmed: the `openai` SDK
   defaults to a 10-minute request timeout and up to 2 of its own
   silent retries on retryable errors, on top of whatever
   `tutorCore.ts`/`classifierCore.ts` do at the semantic level. Neither
   Anthropic provider set these either. Left at defaults, one
   application-level "attempt" could cost up to 3 real HTTP calls (1 +
   up to 2 SDK retries), each able to hang for up to 10 minutes —
   meaning the true worst case was `MAX_ATTEMPTS × 3` real calls, not
   `MAX_ATTEMPTS`, and a single slow provider could tie up a request
   handler far longer than any interactive flow should tolerate.
   **Fixed:** `src/lib/providers/providerCallDefaults.ts` exports
   `PROVIDER_TIMEOUT_MS = 30_000` and `PROVIDER_MAX_RETRIES = 0`,
   applied to every `OpenAI`/`Anthropic` client construction across all
   six provider files (DeepSeek tutor/classifier/scoring, Anthropic
   tutor/classifier/scoring — Anthropic isn't the active vendor per
   ADR-008, but carries the identical bug and the identical fix).
   `MAX_ATTEMPTS` in each `*Core.ts` module is now the actual, whole
   truth about how many real calls one operation can cost.
2. **No maximum length on any learner free-text field.** Every field a
   student's own text populates (`reasoning` ×2, challenge `response`,
   update-criterion `text`, reflection `text`) was `z.string().min(1)`
   with no upper bound — unbounded prompt-token cost per submission,
   not just a UX gap. **Fixed:** `FREE_TEXT_MAX_LENGTH = 2000`
   (`practiceSchemas.ts`, shared — not duplicated — between the
   transition route's real server-side enforcement and the practice
   UI's `maxlength` attributes, since a client-side hint is not itself
   the guarantee). 2000 characters is well beyond what a thoughtful
   paragraph needs. `dispositionItem` was deliberately left alone — it's
   a fixed-list selection sent as its exact string, not authored free
   text, so it's a different (already out-of-scope) concern.
3. **"Maximum classifier calls per stage" and "maximum total model
   calls per attempt" were true but only implicitly, never named or
   independently checked.** Both were already provably bounded by the
   FSM's structure (`SCORE_AND_RECORD` is reachable at most once per
   session; it makes at most 2 classifier calls) — but "provably true
   given the code as currently written" and "explicitly guarded"
   aren't the same claim, and Prompt 32 asks for the latter. **Fixed:**
   `practiceFsm.ts` now names `MAX_CLASSIFIER_CALLS_PER_STAGE = 2` and
   `MAX_MODEL_CALLS_PER_ATTEMPT = MAX_CHALLENGE_ROUNDS +
MAX_CLASSIFIER_CALLS_PER_STAGE` (= 8), and the transition route
   tracks an explicit `classifierCallCount` at `SCORE_AND_RECORD`,
   asserting it against the named bound before each of the (at most 2)
   classifier calls. This is intentionally a tautological assertion
   given today's code — real defense-in-depth against a future change
   adding a third call there without updating the bound, same rationale
   `MAX_CHALLENGE_ROUNDS`'s own comment already gives for itself, not a
   claim that this path can currently be abused past 2. Considered and
   rejected: an equivalent explicit guard on the tutor-call side inside
   the route. Traced the actual reachability and found the route's
   auto-resolve loop can only ever observe `fsmState === 'PRESENT_CHALLENGE'`
   as the direct result of an `advance()` call that itself already
   enforced `MAX_CHALLENGE_ROUNDS` (`ASK_INITIAL_CONFIDENCE` →
   `PRESENT_CHALLENGE`, `COMMIT_UPDATE_CRITERION` → `PRESENT_CHALLENGE`,
   or the loop's own `continue` from `AWAIT_CHALLENGE_RESPONSE`, itself
   gated the same way) — `PRESENT_CHALLENGE` is never a session's
   _persisted_ `fsm_state` (always resolved within the same request
   before the row is written), so no external request can even reach
   that branch with a stale count. A second guard there would be
   genuinely unreachable dead code, not defense-in-depth — per this
   project's own "don't validate scenarios that can't happen" principle,
   left out. `practiceFsm.spec.ts`'s existing coverage is the real proof
   for the tutor side.
4. **The auto-state-resolution loop's guard (`for (let guard = 0;
guard < 20; ...)`) was an unnamed, arbitrarily generous magic
   number.** Traced the true worst case: a single client event can lead
   `advance()` to at most one auto-state needing exactly one more
   resolution before a stable state (`PRESENT_CHALLENGE` or
   `SCORE_AND_RECORD`, neither chains into the other) — true max ≈ 2
   loop iterations. **Fixed:** named `MAX_AUTO_STATE_RESOLUTIONS = 4`
   (2× margin over the true worst case), with a comment explaining the
   count — directly answers Prompt 32's "no recursive autonomous model
   loops": a future bug introducing an actual cycle in `advance()` now
   fails fast at 4 iterations instead of silently permitting up to 20.

**Worst-case LLM calls per completed case, documented (Prompt 32's
explicit ask):** `MAX_MODEL_CALLS_PER_ATTEMPT = 8` — up to 6 tutor
calls (one per challenge round) plus up to 2 classifier calls (main
signals, plus update-criterion signals only for a case with
`usesUpdateCriterion`). In practice, the three canonical cases each
have fewer than 6 evidence stages, so 8 is a ceiling, not a typical
count — `docs/SECURITY.md` Section 9's original "roughly 9" estimate
(Prompt 30) is corrected to this exact, derived number.

**Tests:** `tests/rls/practiceFullPlaythrough.integration.spec.ts`
extended — after a real session reaches `COMPLETE`, resubmits
`SUBMIT_DISPOSITION_CHECKIN` and confirms `400` with no second
`practice_attempts` row (proving `SCORE_AND_RECORD`, and the classifier
calls it makes, cannot be re-triggered). `tests/rls/practiceIsolation.spec.ts`
gained a live test confirming a reasoning field one character over
`FREE_TEXT_MAX_LENGTH` is rejected with `400` before the session row is
even read, and that exactly-at-the-limit succeeds. `practiceFsm.spec.ts`'s
pre-existing `MAX_CHALLENGE_ROUNDS` coverage stands as the tutor-side
proof.

**Consequences:** `checkRateLimit`'s per-user `practice-llm-calls`
limit (ADR-006's Prompt 31 update) and this ADR's per-attempt call
ceiling are deliberately two different axes — rate (calls per user per
10 minutes, across attempts) versus a per-attempt structural bound —
and both are now named, not just one implicit and one explicit.

**2026-08-26 update (`prompts.txt` Prompt 34) — `MAX_CLASSIFIER_CALLS_PER_STAGE`
raised 2 → 3, `MAX_MODEL_CALLS_PER_ATTEMPT` raised 8 → 9.** Prompt 34's
evaluation instrumentation needs "reasoning signals added after
challenge" as a real before/after diff, which needs the student's
INITIAL reasoning classified too — nothing did that before this update,
only the revised reasoning was ever classified. Added a third
classifier call at `SCORE_AND_RECORD` (on `session.initialJudgment.reasoning`,
with `revealedEvidenceTexts: []` — the FSM never reveals any evidence
before the initial judgment, so passing the case's full final evidence
set as context would misrepresent what the student could have known
when they wrote it), storing the result in a new
`initial_reasoning_signals` column (migration 0012) — deliberately
separate from `scoring_events`, which drives the student-facing
feedback screen (Prompt 29) and must never include analysis-only data
about the pre-challenge baseline. This was a real decision, not a given
— confirmed with the user before building it, given it directly raises
the very per-attempt cost ceiling this ADR just finished hardening.
This is exactly the kind of change `MAX_CLASSIFIER_CALLS_PER_STAGE`
being a named constant (not a magic number) was for: the bound moved
because a real new call was deliberately added and the constant was
updated alongside it, not because the enforcement was loosened without
reason. Full design in `docs/EVALUATION_PLAN.md` and ADR-026.

---

## ADR-025: Model-neutrality test design — structural proof for the answer-key claim, deterministic per-call checks for leakage, sampling only for the genuinely probabilistic claim

**Date:** 2026-08-25
**Status:** Accepted

**Context.** `prompts.txt` Prompt 33 asks for a paired-answer adversarial
suite proving the tutor doesn't steer students toward the authored
answer key, explicitly anticipating that live-model tests are
probabilistic and asking for "architectural invariants and repeated
distributions" rather than brittle exact-text assertions, plus explicit
documentation of the test philosophy.

**Decision.** "Neutrality" bundles three claims that need three
different kinds of evidence, and treating them as one blurs which kind
of proof each actually has:

1. **The tutor cannot know the answer key.** This is a type-system
   fact, not a live-model question — `TutorPromptInput`
   (`tutorPrompt.ts`) has no field for `answerSpec`, hidden evidence, or
   scoring rules, so no real call site can pass one without a TypeScript
   excess-property-checking compile error. Proven with a new exhaustive
   field-list regression test in `tutorPrompt.spec.ts` (not a live
   test — a live test could only ever sample this claim, which would be
   strictly weaker evidence for something that already has a proof, not
   just a probability).
2. **The question never leaks a correctness signal.** A live-model
   question, but one that resolves to a deterministic check on each
   response's text (evaluative language, a raw internal judgment-enum
   token, an invented number) — applied identically to every learner in
   every scenario, with no statistics needed, since a single leak is
   already the finding regardless of sample size.
3. **The tutor doesn't treat a target-disagreeing-but-equally-well-reasoned
   response more harshly than a target-agreeing one.** This is the
   genuinely probabilistic claim — one call's action choice isn't
   meaningfully comparable to another's. Handled two ways: each paired
   scenario still calls both learners only once each, because claim #2
   (deterministic, applied symmetrically) is what would actually catch
   differential treatment — it would show up as leaked evaluative
   language toward one learner and not the other, not as which of ten
   equally-neutral action names got picked (the fixed action vocabulary
   has no evaluative member by name or `ACTION_GUIDANCE` description, so
   there's no principled "harshness" ranking across actions to test a
   distribution against). One dedicated test does sample repeatedly (3
   calls per learner, one scenario) specifically to raise confidence in
   the _absence_ of a leak beyond what a single sample can show, which
   is what repeated sampling is actually suited to prove here.

**Test construction.** Three paired scenarios reuse the three canonical
cases' real scenario/claim/evidence text (grounded in already
prompt-injection-audited content, rather than inventing new fictional
material) with only the _first_ evidence item revealed — learner A
reasons carefully toward the eventual authored target range from just
that; learner B reasons equally carefully to a judgment that's
defensible from that same single data point but diverges from where
the case's full evidence eventually lands. This directly implements the
prompt's "well-reasoned response whose judgement does not match but is
defensible from currently visible evidence." Two more probes add a
distinct, explicitly-named claim: agreement with the target isn't
itself a free pass — a thin, poorly-reasoned response that happens to
match the target, and a high-confidence response reasoned from only a
headline figure, both must draw a genuine challenge (checked as "the
action isn't `ACKNOWLEDGE_AND_ADVANCE`," a soft claim excluding one of
ten actions rather than asserting a single expected one — non-brittle
by construction). A final pair checks the opposite failure mode isn't
present either: a well-reasoned uncertain judgment and a low-confidence,
carefully-qualified judgment both get a leak-free question — appropriate
hedging draws no penalty.

**Alternatives considered:**

- Large-N statistical comparison of action distributions between
  learner A and learner B across many scenarios: rejected as the
  primary method — real cost for a comparison this project has no
  principled way to interpret (no severity ranking across a
  by-design-neutral action vocabulary), when the sharper, deterministic
  leaked-language check already catches the concrete failure mode the
  prompt describes. Kept as one supplementary repeated-sampling test,
  not the suite's backbone.
- Writing brand-new synthetic scenario content instead of reusing the
  three canonical cases: rejected — the canonical cases' text is
  already written carefully and already covered by the existing
  prompt-injection suite; reusing it grounds this suite in vetted
  content and avoids introducing new, unaudited fictional text whose
  own quality could confound results.

**Tests:** `tutorPrompt.spec.ts` (structural, claim 1);
`DeepSeekTutorProvider.neutrality.integration.spec.ts` (live, claims 2
and 3, `DEEPSEEK_API_KEY`-gated) — 3 paired scenarios, 2 free-pass
probes, 1 appropriate-hedging pair, 1 repeated-sampling test (7 tests,
~16 live model calls total). The existing
`DeepSeekTutorProvider.integration.spec.ts` prompt-injection suite is
unchanged and explicitly cross-referenced, not duplicated — that file
already states in its own header that the neutrality question is this
suite's job, not its own.

**Consequences:** A future case added to `practiceCases.ts` (Prompt 21
currently caps this at exactly three) that wants neutrality coverage of
its own can follow this same paired-scenario shape — reveal only the
first evidence item, construct a target-agreeing and a
target-diverging-but-defensible reasoning pair — without needing to
re-derive the underlying test philosophy this ADR records.

---

## ADR-026: Evaluation instrumentation — pure computation over existing storage, one new classifier call for the one metric that genuinely needed it, no dashboard/route

**Date:** 2026-08-26
**Status:** Accepted

**Context.** `prompts.txt` Prompt 34 asks Chiron to be instrumented so
future user testing can answer whether the practice interaction is
useful, naming ten specific metrics, explicitly warning against
invasive analytics or third-party tracking, and explicitly warning
against claiming these metrics prove critical-thinking improvement. It
also asks for `docs/EVALUATION_PLAN.md`, distinguishing product
engagement questions, immediate learning-process questions, and actual
educational efficacy (which it explicitly says requires a proper
longitudinal/pre-post design this instrumentation alone cannot provide)
— connected back to Abrami et al.'s instructional principles without
overstating what the app has established.

**Decision.**

1. **Nine of the ten named metrics were already fully derivable from
   existing storage — audited, not assumed.** `practice_sessions.fsm_state`
   (completion + per-stage abandonment, since a session's current state
   IS where it stalled if it never reached `COMPLETE`),
   `initial_judgment`/`revised_judgment` (already both stored),
   `update_criterion_text` (supplied or not), `transcript` (one entry
   per real tutor action, already exactly "tutor action categories"),
   `practice_attempts.scoring_events` (already "reasoning signals
   detected," and already tagged by `stage`) — none of this needed a new
   column or a new call. Only "reasoning signals added after challenge"
   was a genuine gap (ADR-024's Prompt 34 update, ADR-026 below).
2. **"Time per stage" is deliberately NOT instrumented.** Prompt 34
   itself gates this one metric behind "if privacy policy permits." No
   privacy policy exists — `docs/STATUS.md`'s "Known privacy/security
   debt" section already records data retention and applicable
   regulation as open, unanswered governance questions (Prompt 30).
   Collecting new per-stage timestamps now would mean guessing that a
   policy which doesn't exist yet would permit it — this ADR declines to
   guess, same discipline as every other governance question this
   project has deliberately left open rather than assumed an answer to.
   Total session duration (`practice_sessions.created_at` to
   `practice_attempts.created_at`) already exists with zero new work and
   is noted in `docs/EVALUATION_PLAN.md` as a coarser, already-available
   substitute.
3. **`practiceEvaluation.ts` mirrors `practiceCalibration.ts`'s shape**
   (ADR-023): pure functions over an already-reduced `EvaluationDataPoint[]`
   the caller builds from a DB query/join — no Supabase client, no LLM
   call, in this module. Unlike calibration's `MIN_SAMPLE_SIZE` gating
   (which suppresses an _inferential_ claim — "is this rate close to the
   true rate" — until there's enough data to say so), every rate here is
   returned with its raw counts and never suppressed for small `n`: these
   are plain descriptive counts, not accuracy estimates, and hiding
   "3 of 4 sessions completed" wouldn't make it less true. Documented
   explicitly in the module's own header so it doesn't read as an
   inconsistency with the calibration module's different choice.
4. **No dashboard, no route, no UI** — same scoping decision
   `docs/CALIBRATION.md` made for Prompt 27, for the same reason:
   "instrument so a future evaluation CAN answer these questions" is
   satisfied by the data existing and the computation being real,
   testable code, not by a reporting surface nobody has asked for yet.
   Building one now, before Prompts 36-37's real user testing exists to
   look at, would be complexity with no reachable payoff.

**Consequences:** `docs/EVALUATION_PLAN.md` is the product-facing
document (what questions get asked, at which tier, with what honesty
about what the data can and can't establish); this ADR is the
"why built this way" record, matching the `docs/CALIBRATION.md`/ADR-023
split already established for the sibling metric.

---

## ADR-027: A byte-identical resubmission still creates a new saved-lesson row — `save_lesson` is unchanged by the scoring cache

**Date:** 2026-08-27
**Status:** Accepted

**Decision:** The scoring cache added for `prompts.txt` Prompt P5
(`scoring_cache`, keyed by a hash of lessonText + subjectProfileId +
`SCORING_PROMPT_VERSION`) sits entirely in front of the LLM call, inside
`scoreLesson()`. It changes nothing about what happens when a teacher
explicitly saves a lesson: `POST /api/lessons` → the `save_lesson` RPC
still unconditionally inserts a new `lessons` row, a new
`lesson_versions` row, and a new `scores` row every time it's called —
identical content included, whether the score behind it came from the
cache or a fresh call.

**Why:** Prompt P5 asked this to be an explicit decision, not an
implicit one: should a byte-identical resubmission still create a new
version row, or be treated as a no-op? Checking what `save_lesson`
actually does first (as the prompt also asked) found something worth
recording plainly, because no existing doc states it: there is no
"append a version to an existing saved lesson" code path in this app at
all. `save_lesson` always does `insert into public.lessons (...)` and
generates a brand-new `lesson_id`/`version_id`/`score_id` on every call,
regardless of whether a similar or identical lesson was saved before.
ADR-007's "revise-and-resubmit creates a new LessonVersion" describes
the client-side scoring loop only (`/api/lessons/score`, compared with
`compareScores` in memory) — Prompt 8 shipped "Save creates an
independent library entry," never "Save appends a version to a lesson
you already saved." `lesson_versions.version_number` is hardcoded to
`1` in every `save_lesson` call today, which is the same fact from a
different angle.

Given that, "should a resubmission be a no-op instead of a new version
row" isn't actually answerable at the `save_lesson` layer as it exists —
there's no existing lesson identity for a resubmission to attach to or
be deduplicated against. Making Save a no-op on identical content would
mean inventing that identity (linking separate Save actions to one
lesson, choosing what counts as "the same lesson" across saves) — a
real, separate feature, not a side effect of adding a cache. Per Prompt
P5's own instruction not to change existing version-creation behavior
for its own sake, `save_lesson` is left untouched.

**Alternatives considered:**

- Detect a content-hash match against the caller's own most recent
  saved lesson and skip the insert: rejected — "most recent saved
  lesson" isn't a defined concept yet either (the library has no
  ordering/identity linking saves together), and inventing one here
  would be scope creep on a caching prompt.
- Dedupe at the `scores` table level (reuse an existing `scores` row
  instead of inserting a new one when content matches): rejected — the
  `scoring_cache` table already serves that purpose for the LLM-call
  cost, without touching the `scores` table's existing 1:1 relationship
  with `lesson_versions` (`unique` on `lesson_version_id`), which
  several RLS policies and the `save_lesson` function body currently
  assume.

**Consequences:** A teacher can save the exact same lesson text twice
and get two separate library entries, exactly as before this prompt.
The scoring cache only ever saves LLM spend on the scoring call itself,
never lesson-row count. If a real "revise an existing saved lesson
in place" feature is built later, it should make its own explicit
decision about resubmission semantics — this ADR doesn't pre-empt that,
it just records why P5 didn't attempt it.

---
