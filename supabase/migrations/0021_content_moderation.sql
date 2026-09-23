-- prompt.txt Prompt G4: content moderation for public-template lessons.
-- Any user can currently mark their own lesson public-template, making it
-- visible to any Chiron user regardless of org — with no way for anyone to
-- remove one once it's live. This adds a Chiron-level (not org-level)
-- moderator capability, deliberately kept separate from is_org_admin()
-- (0003) — an org admin has no special standing here, and this concept
-- has no relationship to any one org.
--
-- Three new tables, matching this project's existing precedents:
--
-- `chiron_moderators` — who holds the capability. Deliberately NO
-- insert/update/delete policy for `authenticated` at all, the same "no
-- direct write access, service-role-only" pattern ADR-020 already
-- established for the FSM tables. This is what makes "the moderator
-- capability can't be self-granted through any exposed path" true
-- structurally, not just by convention — there is no RLS policy any
-- authenticated request could ever satisfy to write this table. Granting
-- moderator access is a manual insert via the Supabase SQL editor by
-- someone with project (service-role) access — see docs/OPERATIONS.md.
-- No SELECT policy either: nobody needs to browse this table directly,
-- only check "am I a moderator," which is_chiron_moderator() answers
-- without needing row-level read access (same shape as is_org_admin()).
--
-- `lesson_reports` — any signed-in user can flag a lesson; only a
-- moderator can read or resolve reports. Deliberately does not restrict
-- reporting to public-template lessons at the RLS layer (no WITH CHECK
-- subquery against `lessons`) — ADR-010's own lesson (self-referencing/
-- cross-table RLS subqueries are the exact recurring bug class that ADR
-- documents) argues against adding one for a table this low-stakes: a
-- report row grants no access to anything and reveals nothing by
-- existing, so restricting *which* lesson can be reported isn't a
-- security boundary worth the risk, just a UI affordance (the app only
-- shows the report action on public-template lessons).
--
-- `moderation_actions` — an audit log, written only by unpublish_lesson()
-- below (no client insert policy, same "SECURITY DEFINER writes, RLS
-- doesn't need to grant it" pattern as `scores`/`skill_coverage_entries`
-- etc. via save_lesson). Snapshots the lesson's title at the time of
-- action so the log stays meaningful even after the lesson is no longer
-- publicly visible to reconstruct it from.

create table public.chiron_moderators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.chiron_moderators enable row level security;

create function public.is_chiron_moderator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chiron_moderators where user_id = auth.uid()
  );
$$;

grant execute on function public.is_chiron_moderator() to authenticated;

create table public.lesson_reports (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);

alter table public.lesson_reports enable row level security;

create policy "any signed-in user can report a lesson as themselves"
  on public.lesson_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "moderators can view all reports"
  on public.lesson_reports for select
  to authenticated
  using (public.is_chiron_moderator());

create policy "moderators can resolve reports"
  on public.lesson_reports for update
  to authenticated
  using (public.is_chiron_moderator())
  with check (public.is_chiron_moderator());

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  lesson_title text not null,
  moderator_id uuid not null references public.profiles (id),
  action text not null check (action in ('unpublish')),
  reason text not null check (char_length(reason) > 0),
  created_at timestamptz not null default now()
);

alter table public.moderation_actions enable row level security;

create policy "moderators can view moderation history"
  on public.moderation_actions for select
  to authenticated
  using (public.is_chiron_moderator());

create function public.unpublish_lesson(target_lesson_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lesson_title_snapshot text;
  lesson_is_public boolean;
begin
  if not public.is_chiron_moderator() then
    raise exception 'Only a Chiron moderator can unpublish a lesson.';
  end if;
  if reason is null or char_length(trim(reason)) = 0 then
    raise exception 'A reason is required to unpublish a lesson.';
  end if;

  -- Read the title (and confirm public-template status) BEFORE the
  -- update, in a separate statement, deliberately not via
  -- `UPDATE ... RETURNING` — ADR-010 point 3's exact documented gotcha:
  -- RETURNING re-checks the affected row against the table's SELECT
  -- policy using the row's POST-update state, and a moderator is neither
  -- the lesson's owner nor (usually) a member of its org, so the row's
  -- new 'private' state would fail "view lessons per visibility rules"
  -- and RETURNING would come back empty even though the UPDATE itself
  -- succeeded. Reading first, while the row is still public-template
  -- (visible to any authenticated user under that same policy), avoids
  -- the recheck entirely — the same fix `save_lesson` already applies.
  select title, (visibility = 'public-template') into lesson_title_snapshot, lesson_is_public
    from public.lessons where id = target_lesson_id;

  if lesson_title_snapshot is null then
    raise exception 'That lesson does not exist.';
  end if;
  if not lesson_is_public then
    raise exception 'That lesson is not a public template (already unpublished, or does not exist).';
  end if;

  update public.lessons set visibility = 'private' where id = target_lesson_id;

  insert into public.moderation_actions (lesson_id, lesson_title, moderator_id, action, reason)
    values (target_lesson_id, lesson_title_snapshot, auth.uid(), 'unpublish', reason);

  update public.lesson_reports
    set resolved_at = now(), resolved_by = auth.uid()
    where lesson_id = target_lesson_id and resolved_at is null;
end;
$$;

grant execute on function public.unpublish_lesson(uuid, text) to authenticated;

create function public.resolve_lesson_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chiron_moderator() then
    raise exception 'Only a Chiron moderator can resolve a report.';
  end if;

  update public.lesson_reports
    set resolved_at = now(), resolved_by = auth.uid()
    where id = target_report_id and resolved_at is null;

  if not found then
    raise exception 'That report was not found or is already resolved.';
  end if;
end;
$$;

grant execute on function public.resolve_lesson_report(uuid) to authenticated;
