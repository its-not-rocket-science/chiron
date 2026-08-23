-- Fix: RLS policies that check ownership/membership by subquerying
-- ANOTHER RLS-protected table directly inside INSERT/UPDATE WITH CHECK
-- clauses were unreliable in practice — found by the adversarial test
-- suite. A direct SELECT on a just-inserted lesson (as its owner)
-- succeeded fine on its own, but the identical EXISTS(...) check embedded
-- in lesson_versions' WITH CHECK clause rejected the same row (error
-- 42501). 0002 already fixed one instance of this shape (memberships'
-- self-referencing policy) via a SECURITY DEFINER helper function;
-- this migration applies the same fix everywhere else the codebase was
-- inconsistent about it — every cross-table RLS check now goes through a
-- helper function (table-owner context, bypasses RLS internally) instead
-- of a raw subquery evaluated under the caller's own RLS.

create function public.is_lesson_owner(target_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.lessons where id = target_lesson_id and owner_id = auth.uid()
  );
$$;

grant execute on function public.is_lesson_owner(uuid) to authenticated;

create function public.owns_lesson_version(target_lesson_version_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.lesson_versions lv
    join public.lessons l on l.id = lv.lesson_id
    where lv.id = target_lesson_version_id and l.owner_id = auth.uid()
  );
$$;

grant execute on function public.owns_lesson_version(uuid) to authenticated;

create function public.owns_score(target_score_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.scores s
    join public.lesson_versions lv on lv.id = s.lesson_version_id
    join public.lessons l on l.id = lv.lesson_id
    where s.id = target_score_id and l.owner_id = auth.uid()
  );
$$;

grant execute on function public.owns_score(uuid) to authenticated;

create function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where org_id = target_org_id and user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_org_admin(uuid) to authenticated;

-- lesson_versions / scores / skill_coverage_entries / suggestions: owner-insert checks

drop policy "owner can insert versions into their own lessons" on public.lesson_versions;
create policy "owner can insert versions into their own lessons"
  on public.lesson_versions for insert
  to authenticated
  with check (public.is_lesson_owner(lesson_id));

drop policy "owner can insert scores for their own lesson versions" on public.scores;
create policy "owner can insert scores for their own lesson versions"
  on public.scores for insert
  to authenticated
  with check (public.owns_lesson_version(lesson_version_id));

drop policy "owner can insert skill coverage for their own scores" on public.skill_coverage_entries;
create policy "owner can insert skill coverage for their own scores"
  on public.skill_coverage_entries for insert
  to authenticated
  with check (public.owns_score(score_id));

drop policy "owner can insert suggestions for their own scores" on public.suggestions;
create policy "owner can insert suggestions for their own scores"
  on public.suggestions for insert
  to authenticated
  with check (public.owns_score(score_id));

-- lessons: insert/update org_id-membership checks, and admin-featuring

drop policy "owner can insert their own lessons" on public.lessons;
create policy "owner can insert their own lessons"
  on public.lessons for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (org_id is null or org_id in (select public.my_org_ids()))
  );

drop policy "owner can update their own lessons" on public.lessons;
create policy "owner can update their own lessons"
  on public.lessons for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (org_id is null or org_id in (select public.my_org_ids()))
  );

drop policy "org admins can update featured status of org-shared lessons" on public.lessons;
create policy "org admins can update featured status of org-shared lessons"
  on public.lessons for update
  to authenticated
  using (visibility = 'org-shared' and public.is_org_admin(org_id))
  with check (visibility = 'org-shared' and public.is_org_admin(org_id));

drop policy "view lessons per visibility rules" on public.lessons;
create policy "view lessons per visibility rules"
  on public.lessons for select
  to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'public-template'
    or (visibility = 'org-shared' and org_id in (select public.my_org_ids()))
  );

-- org_invites: admin checks

drop policy "org admins can create invites" on public.org_invites;
create policy "org admins can create invites"
  on public.org_invites for insert
  to authenticated
  with check (invited_by = auth.uid() and public.is_org_admin(org_id));

drop policy "org admins can view and revoke their org's invites, invitees can view their own" on public.org_invites;
create policy "org admins can view and revoke their org's invites, invitees can view their own"
  on public.org_invites for select
  to authenticated
  using (email = auth.email() or public.is_org_admin(org_id));

drop policy "org admins can revoke invites" on public.org_invites;
create policy "org admins can revoke invites"
  on public.org_invites for delete
  to authenticated
  using (public.is_org_admin(org_id));

-- orgs: member-visibility check

drop policy "org members can view their own org" on public.orgs;
create policy "org members can view their own org"
  on public.orgs for select
  to authenticated
  using (
    id in (select public.my_org_ids())
    or exists (
      select 1 from public.org_invites oi
      where oi.org_id = orgs.id
        and oi.email = auth.email()
        and oi.accepted_at is null
        and oi.expires_at > now()
    )
  );
