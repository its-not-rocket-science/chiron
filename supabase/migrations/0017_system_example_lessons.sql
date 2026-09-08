-- Chiron — system-example onboarding lessons
-- (prompts-onboarding-examples.txt Prompt E2)
--
-- Adds `origin` ('user' | 'system_example') plus structured attribution
-- metadata to `lessons`. Named `origin`, not `source`, to avoid colliding
-- with `lesson_versions.source` (paste/upload) — a different concept on
-- a different table.
--
-- owner_id becomes nullable: a system-example lesson has no user owner
-- at all. This is the design call Prompt E2 asks for explicitly —
-- "nobody's my lessons list should include them" is enforced structurally
-- by owner_id never matching auth.uid() (see below), not by routing
-- ownership to some sentinel user id that would need its own account and
-- its own cleanup story.
alter table public.lessons alter column owner_id drop not null;

alter table public.lessons add column origin text not null default 'user'
  check (origin in ('user', 'system_example'));

alter table public.lessons add column attribution_name text;
alter table public.lessons add column attribution_url text;
alter table public.lessons add column license text
  check (
    license in (
      'CC-BY-4.0', 'CC-BY-SA-4.0', 'Public-Domain-US-Govt',
      'Public-Domain-Expired', 'Other-Permission-Granted'
    )
  );
alter table public.lessons add column license_note text;

alter table public.lessons add constraint lessons_origin_owner_consistency check (
  (origin = 'system_example' and owner_id is null)
  or (origin = 'user' and owner_id is not null)
);

-- Attribution is REQUIRED for a system-example row, but not forbidden for
-- a 'user' row — a "duplicate and try your own edit" copy of a
-- system-example lesson (Prompt E4) is a `user`-origin lesson that must
-- still carry the original attribution forward (CC BY and its relatives
-- require attribution to survive into a derivative; see migration 0018's
-- update to `copy_lesson()`). An ordinary, never-copied user lesson
-- simply never has these columns populated in the first place — nothing
-- in the app's normal lesson-creation path sets them.
alter table public.lessons add constraint lessons_origin_requires_attribution check (
  origin != 'system_example'
  or (attribution_name is not null and attribution_url is not null and license is not null)
);

alter table public.lessons add constraint lessons_attribution_url_is_https check (
  attribution_url is null or attribution_url like 'https://%'
);

-- No new INSERT/UPDATE/DELETE policy for `authenticated` on system-example
-- rows, deliberately (the same discipline ADR-020 applied to Phase 2A's
-- FSM tables, even though the mechanism here is different): the three
-- existing write policies on `lessons` ("owner can insert/update/delete
-- their own lessons") all require `owner_id = auth.uid()`. A
-- system-example row's owner_id is NULL, and `NULL = auth.uid()` is never
-- TRUE in Postgres for any authenticated caller — so those policies
-- structurally can never match a system-example row. No new policy is
-- needed to say "ordinary users can't write these rows"; that's already
-- true by construction, and adding a redundant explicit-deny policy would
-- only be able to restate the same thing less directly. The only role
-- that can write these rows is service_role (bypasses RLS entirely),
-- used exclusively by scripts/seed-onboarding-examples.ts (Prompt E3) —
-- never by any route reachable from the browser.
--
-- READ access needs no new policy either: the existing "view lessons per
-- visibility rules" SELECT policy already grants access whenever
-- `visibility = 'public-template'`, with no owner_id check in that
-- branch at all — a system-example lesson (always seeded with
-- visibility = 'public-template') is therefore readable by any
-- authenticated user exactly like a user's own public-template lesson
-- already is. Confirmed by a live adversarial test in
-- tests/rls/systemExampleLessons.spec.ts rather than assumed — this
-- migration comment is a claim about the existing policy's behavior,
-- not a substitute for checking it.
--
-- The app has no signed-out browsing today (docs/ARCHITECTURE.md — every
-- data route requires a session; see src/routes/library/+page.server.ts's
-- `if (!locals.user) throw redirect(...)`), so "at minimum to any
-- signed-in user regardless of org" is the applicable bar here, not
-- anonymous access. No `anon`-role policy is added; if signed-out
-- browsing is ever added, this table needs its own explicit look then.
