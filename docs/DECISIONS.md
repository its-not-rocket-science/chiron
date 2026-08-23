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

---

## ADR-006: Rate limiting mechanism

**Date:** 2026-08-22, revised 2026-08-23 (Prompt 11)
**Status:** Partially accepted — an in-memory per-IP limiter is
implemented and live-tested; the "shared store for multi-instance
deployments" half is still open, blocked on the hosting decision below.

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
