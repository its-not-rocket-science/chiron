-- Fix: infinite recursion (Postgres error 42P17) in memberships' own
-- SELECT policy. It queried `memberships` from within a policy defined
-- ON `memberships`, which re-triggers that same policy for the inner
-- query, which triggers it again, and so on — Postgres detects the cycle
-- and errors rather than looping forever.
--
-- Found by the adversarial RLS test suite (tests/rls/orgIsolation.spec.ts)
-- against the live project, not by inspection — every other policy that
-- subqueries memberships (lessons, orgs, org_invites) was tripping over
-- this same recursion transitively, since they all go through
-- memberships' RLS check when reading it as the querying user.
--
-- Fix: route the self-check through a SECURITY DEFINER function, which
-- queries memberships as the table owner — bypassing RLS internally —
-- so there's no cycle. Every other policy that reads memberships still
-- runs as the querying user and still gets correctly scoped results,
-- since this function itself only ever returns the caller's own org ids.

create function public.my_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

grant execute on function public.my_org_ids() to authenticated;

drop policy "org members can view memberships in their own org" on public.memberships;

create policy "org members can view memberships in their own org"
  on public.memberships for select
  to authenticated
  using (org_id in (select public.my_org_ids()));
