-- Chiron — close the profiles email-exposure gap (Prompt A / ADR-012)
-- Fixes the finding in docs/SECURITY.md Section 1 "Documented — not
-- fixed": the profiles SELECT policy was `using (true)`, so any signed-in
-- user could read any other user's `email` directly (not just through
-- Chiron's UI, e.g. `GET /rest/v1/profiles?select=email`).
--
-- This is option (a) from that writeup: a `profiles_public` view exposing
-- only `id, display_name`, with `profiles` itself locked to
-- `id = auth.uid()`.

-- ---------------------------------------------------------------------------
-- 1. profiles_public — the only cross-user-readable shape of a profile.
-- ---------------------------------------------------------------------------

create view public.profiles_public as
  select id, display_name from public.profiles;

-- Deliberately NOT `security_invoker` (Postgres defaults to false, i.e.
-- classic view semantics: the view runs with the *owner's* row-security
-- context, not the querying user's). The view owner is the migration
-- role, which has BYPASSRLS in Supabase — that's what lets this view show
-- every user's display_name to any authenticated caller even though the
-- underlying `profiles` table's own SELECT policy (below) is now locked
-- to `id = auth.uid()`. This is the standard Supabase "public profile
-- view" pattern for exactly this situation. Verified live, not just
-- reasoned about — see tests/rls/orgIsolation.spec.ts.
comment on view public.profiles_public is
  'Cross-user-readable profile fields only. Deliberately excludes email — see ADR-012.';

grant select on public.profiles_public to authenticated;

-- PostgREST needs to be able to embed this view the same way it embedded
-- `profiles(...)` before (e.g. `lessons` -> `profiles_public(display_name)`
-- via lessons.owner_id -> profiles.id). It detects this by tracing the
-- view's column back to the source table's primary key, which works here
-- because profiles_public.id is a direct, unrenamed select of profiles.id.

-- ---------------------------------------------------------------------------
-- 2. Lock profiles' own SELECT policy to the row owner.
-- ---------------------------------------------------------------------------

drop policy "any authenticated user can read profiles" on public.profiles;

create policy "a user can read their own full profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- The existing "a user can update their own profile" policy (0001) is
-- unaffected — it was already scoped to id = auth.uid().
