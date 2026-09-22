-- prompt.txt Prompt F4: remove-member, change-role, leave-org.
--
-- `memberships` has no client-facing UPDATE or DELETE policy at all (only
-- the SELECT policy from 0001/0002) — every existing write into it
-- (create_org, accept_org_invite, both in 0001) goes through a
-- SECURITY DEFINER function, never a raw RLS-gated update/delete. These
-- three follow that same precedent rather than introducing a new
-- UPDATE/DELETE policy on `memberships`, which would re-open the exact
-- self-referencing-subquery recursion ADR-010/0002 already hit once on
-- this table's own SELECT policy — is_org_admin() (0003) already exists
-- as the safe, non-recursive way to check "is the caller an admin of
-- this org," and every function below reuses it rather than inlining a
-- fresh subquery.
--
-- Sole-admin guard: a single boolean check
-- (public.is_sole_admin_of_own_org, below) covers all three actions'
-- "don't leave the org adminless" requirement. It only ever needs to
-- check the *caller* against their own org: removeMember and
-- changeRole both require the caller to already be an admin
-- (is_org_admin), so the only way either action could target the org's
-- sole admin is if the caller *is* that sole admin acting on themselves
-- — a second admin calling either action on a different member can
-- never zero out the org's admin count. Blocking self-targeting by a
-- sole admin is therefore sufficient; no separate "does this leave zero
-- admins" count is needed for the other-member case.
--
-- What happens to a removed member's org-shared/public-template
-- lessons: nothing, by construction, not by a new rule added here.
-- `lessons.owner_id` references `profiles` (cascades only if the
-- profile itself is deleted) and `lessons.org_id` references `orgs`
-- (set null only if the *org* is deleted) — neither references
-- `memberships`, so deleting a membership row never touches that
-- member's lessons. The org-shared/public-template SELECT policy
-- (0003) checks the *viewer's* own org membership, not the lesson
-- owner's, so a departed member's shared lessons stay exactly as
-- visible to the org as before they left.

create function public.is_sole_admin_of_own_org(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = target_user_id
      and m.role = 'admin'
      and (
        select count(*) from public.memberships m2
        where m2.org_id = m.org_id and m2.role = 'admin'
      ) = 1
  );
$$;

grant execute on function public.is_sole_admin_of_own_org(uuid) to authenticated;

create function public.remove_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid;
  target_org_id uuid;
begin
  select org_id into caller_org_id from public.memberships where user_id = auth.uid();
  if caller_org_id is null or not public.is_org_admin(caller_org_id) then
    raise exception 'Only an org admin can remove a member.';
  end if;

  select org_id into target_org_id from public.memberships where user_id = target_user_id;
  if target_org_id is distinct from caller_org_id then
    raise exception 'That user is not a member of your organization.';
  end if;

  if public.is_sole_admin_of_own_org(target_user_id) then
    raise exception 'You are the only admin - promote another member to admin before removing yourself.';
  end if;

  delete from public.memberships where user_id = target_user_id and org_id = caller_org_id;
end;
$$;

grant execute on function public.remove_member(uuid) to authenticated;

create function public.change_member_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid;
  target_org_id uuid;
begin
  if new_role not in ('admin', 'teacher') then
    raise exception 'Invalid role.';
  end if;

  select org_id into caller_org_id from public.memberships where user_id = auth.uid();
  if caller_org_id is null or not public.is_org_admin(caller_org_id) then
    raise exception 'Only an org admin can change a member''s role.';
  end if;

  select org_id into target_org_id from public.memberships where user_id = target_user_id;
  if target_org_id is distinct from caller_org_id then
    raise exception 'That user is not a member of your organization.';
  end if;

  if new_role = 'teacher' and public.is_sole_admin_of_own_org(target_user_id) then
    raise exception 'You are the only admin - promote another member to admin before demoting yourself.';
  end if;

  update public.memberships set role = new_role
    where user_id = target_user_id and org_id = caller_org_id;
end;
$$;

grant execute on function public.change_member_role(uuid, text) to authenticated;

create function public.leave_org()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'You are not a member of an organization.';
  end if;

  if public.is_sole_admin_of_own_org(auth.uid()) then
    raise exception 'You are the only admin - promote another member to admin, or delete the organization, before leaving.';
  end if;

  delete from public.memberships where user_id = auth.uid();
end;
$$;

grant execute on function public.leave_org() to authenticated;
