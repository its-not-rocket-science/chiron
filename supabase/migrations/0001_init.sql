-- Chiron — initial schema (Prompt 8: accounts + multi-tenancy)
-- Matches src/lib/domain/schemas.ts. See docs/ARCHITECTURE.md Section 3
-- and docs/DECISIONS.md ADR-002/ADR-009 for the reasoning behind the RLS
-- design here.

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users row, created automatically on signup.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "any authenticated user can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "a user can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- orgs, memberships, org_invites
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) > 0),
  created_at timestamptz not null default now()
);

alter table public.orgs enable row level security;

-- Phase 1: one org per user (docs/ARCHITECTURE.md Section 11, open question 4).
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  role text not null check (role in ('admin', 'teacher')),
  created_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'teacher')) default 'teacher',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.org_invites enable row level security;

create policy "org members can view their own org"
  on public.orgs for select
  to authenticated
  using (
    id in (select org_id from public.memberships where user_id = auth.uid())
    or exists (
      select 1 from public.org_invites oi
      where oi.org_id = orgs.id
        and oi.email = auth.email()
        and oi.accepted_at is null
        and oi.expires_at > now()
    )
  );

create policy "org members can view memberships in their own org"
  on public.memberships for select
  to authenticated
  using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "org admins can create invites"
  on public.org_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

create policy "org admins can view and revoke their org's invites, invitees can view their own"
  on public.org_invites for select
  to authenticated
  using (
    email = auth.email()
    or exists (
      select 1 from public.memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

create policy "org admins can revoke invites"
  on public.org_invites for delete
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

-- Org creation and invite acceptance are multi-step (create org + add the
-- creator as admin; validate an invite + add a membership + mark it
-- accepted) and need to happen atomically with server-trusted values
-- (e.g. the invite's role, not whatever a client sends) — so they're
-- SECURITY DEFINER functions rather than plain RLS-gated inserts. There
-- is deliberately no client-side INSERT policy on orgs or memberships.

create function public.create_org(org_name text)
returns public.orgs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.orgs;
begin
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'You already belong to an organization.';
  end if;

  insert into public.orgs (name) values (org_name) returning * into new_org;
  insert into public.memberships (user_id, org_id, role) values (auth.uid(), new_org.id, 'admin');

  return new_org;
end;
$$;

grant execute on function public.create_org(text) to authenticated;

create function public.accept_org_invite(invite_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.org_invites;
  new_membership public.memberships;
begin
  select * into inv from public.org_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;

  if not found then
    raise exception 'This invite is invalid or has expired.';
  end if;

  if inv.email <> auth.email() then
    raise exception 'This invite was sent to a different email address.';
  end if;

  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'You already belong to an organization.';
  end if;

  insert into public.memberships (user_id, org_id, role)
    values (auth.uid(), inv.org_id, inv.role)
    returning * into new_membership;

  update public.org_invites set accepted_at = now() where id = inv.id;

  return new_membership;
end;
$$;

grant execute on function public.accept_org_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- lessons, lesson_versions, scores, skill_coverage_entries, suggestions
-- ---------------------------------------------------------------------------

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.orgs (id) on delete set null,
  title text not null check (char_length(title) > 0),
  subject_profile_id text not null,
  grade_level text,
  visibility text not null check (visibility in ('private', 'org-shared', 'public-template')) default 'private',
  featured boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_shared_requires_org check (not (visibility = 'org-shared' and org_id is null))
);

create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  version_number int not null check (version_number > 0),
  source text not null check (source in ('paste', 'upload')),
  raw_text text not null check (char_length(raw_text) > 0),
  created_at timestamptz not null default now(),
  unique (lesson_id, version_number)
);

alter table public.lessons
  add constraint lessons_current_version_fk
  foreign key (current_version_id) references public.lesson_versions (id) on delete set null;

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null unique references public.lesson_versions (id) on delete cascade,
  dialogue_score int not null check (dialogue_score between 0 and 3),
  dialogue_justification text not null,
  authenticity_score int not null check (authenticity_score between 0 and 3),
  authenticity_justification text not null,
  mentoring_score int not null check (mentoring_score between 0 and 3),
  mentoring_justification text not null,
  model_id text not null,
  created_at timestamptz not null default now()
);

create table public.skill_coverage_entries (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores (id) on delete cascade,
  skill text not null check (
    skill in ('interpretation', 'analysis', 'evaluation', 'inference', 'explanation', 'self_regulation')
  ),
  covered boolean not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  justification text not null,
  unique (score_id, skill)
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores (id) on delete cascade,
  pillar text not null check (pillar in ('dialogue', 'authenticity', 'mentoring')),
  text text not null
);

alter table public.lessons enable row level security;
alter table public.lesson_versions enable row level security;
alter table public.scores enable row level security;
alter table public.skill_coverage_entries enable row level security;
alter table public.suggestions enable row level security;

-- Shared visibility check, reused by every child table below. SECURITY
-- DEFINER so it isn't itself blocked by the lessons RLS it's implementing
-- (this function is never used *by* the lessons policy itself, only by
-- lesson_versions/scores/etc., so there's no recursion).
create function public.can_view_lesson_version(target_lesson_version_id uuid)
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
    where lv.id = target_lesson_version_id
      and (
        l.owner_id = auth.uid()
        or l.visibility = 'public-template'
        or (
          l.visibility = 'org-shared'
          and l.org_id in (select org_id from public.memberships where user_id = auth.uid())
        )
      )
  );
$$;

-- lessons: this IS the source-of-truth visibility check (adversarial tests
-- in tests/rls/ target this policy directly).
create policy "view lessons per visibility rules"
  on public.lessons for select
  to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'public-template'
    or (
      visibility = 'org-shared'
      and org_id in (select org_id from public.memberships where user_id = auth.uid())
    )
  );

create policy "owner can insert their own lessons"
  on public.lessons for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      org_id is null
      or org_id in (select org_id from public.memberships where user_id = auth.uid())
    )
  );

create policy "owner can update their own lessons"
  on public.lessons for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      org_id is null
      or org_id in (select org_id from public.memberships where user_id = auth.uid())
    )
  );

-- Org admins may feature/pin a lesson already shared into their own org —
-- never a private lesson (the visibility policy above already hides those
-- from them) and never another org's shared lesson.
create policy "org admins can update featured status of org-shared lessons"
  on public.lessons for update
  to authenticated
  using (
    visibility = 'org-shared'
    and exists (
      select 1 from public.memberships m
      where m.org_id = lessons.org_id and m.user_id = auth.uid() and m.role = 'admin'
    )
  )
  with check (
    visibility = 'org-shared'
    and exists (
      select 1 from public.memberships m
      where m.org_id = lessons.org_id and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

create policy "owner can delete their own lessons"
  on public.lessons for delete
  to authenticated
  using (owner_id = auth.uid());

-- lesson_versions / scores / skill_coverage_entries / suggestions are
-- append-only (no UPDATE policy on any of them — a rescore creates a new
-- version, it never edits history) and inherit lessons' visibility.

create policy "view lesson versions per parent lesson visibility"
  on public.lesson_versions for select
  to authenticated
  using (public.can_view_lesson_version(id));

create policy "owner can insert versions into their own lessons"
  on public.lesson_versions for insert
  to authenticated
  with check (
    exists (select 1 from public.lessons l where l.id = lesson_id and l.owner_id = auth.uid())
  );

create policy "view scores per parent lesson visibility"
  on public.scores for select
  to authenticated
  using (public.can_view_lesson_version(lesson_version_id));

create policy "owner can insert scores for their own lesson versions"
  on public.scores for insert
  to authenticated
  with check (
    exists (
      select 1 from public.lesson_versions lv
      join public.lessons l on l.id = lv.lesson_id
      where lv.id = lesson_version_id and l.owner_id = auth.uid()
    )
  );

create policy "view skill coverage per parent lesson visibility"
  on public.skill_coverage_entries for select
  to authenticated
  using (
    public.can_view_lesson_version((select lesson_version_id from public.scores where id = score_id))
  );

create policy "owner can insert skill coverage for their own scores"
  on public.skill_coverage_entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.scores s
      join public.lesson_versions lv on lv.id = s.lesson_version_id
      join public.lessons l on l.id = lv.lesson_id
      where s.id = score_id and l.owner_id = auth.uid()
    )
  );

create policy "view suggestions per parent lesson visibility"
  on public.suggestions for select
  to authenticated
  using (
    public.can_view_lesson_version((select lesson_version_id from public.scores where id = score_id))
  );

create policy "owner can insert suggestions for their own scores"
  on public.suggestions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.scores s
      join public.lesson_versions lv on lv.id = s.lesson_version_id
      join public.lessons l on l.id = lv.lesson_id
      where s.id = score_id and l.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- save_lesson — persists a fully-computed ScoringResult (already produced by
-- the scoring API, docs/ARCHITECTURE.md Section 5) as a lesson + version +
-- score + skill coverage + suggestions in one atomic transaction.
--
-- Deliberately SECURITY INVOKER (the default — no `security definer`
-- above): it runs as the calling user, so every insert inside it still
-- goes through the exact same RLS policies as a direct client insert
-- would. Atomicity comes from it being one function call in one
-- transaction, not from bypassing row-level security.
-- ---------------------------------------------------------------------------

create function public.save_lesson(
  p_title text,
  p_subject_profile_id text,
  p_grade_level text,
  p_visibility text,
  p_org_id uuid,
  p_source text,
  p_raw_text text,
  p_dialogue_score int,
  p_dialogue_justification text,
  p_authenticity_score int,
  p_authenticity_justification text,
  p_mentoring_score int,
  p_mentoring_justification text,
  p_model_id text,
  p_skill_coverage jsonb,
  p_suggestions jsonb
)
returns uuid
language plpgsql
as $$
declare
  new_lesson_id uuid;
  new_version_id uuid;
  new_score_id uuid;
  entry jsonb;
begin
  insert into public.lessons (owner_id, org_id, title, subject_profile_id, grade_level, visibility)
    values (auth.uid(), p_org_id, p_title, p_subject_profile_id, p_grade_level, p_visibility)
    returning id into new_lesson_id;

  insert into public.lesson_versions (lesson_id, version_number, source, raw_text)
    values (new_lesson_id, 1, p_source, p_raw_text)
    returning id into new_version_id;

  insert into public.scores (
    lesson_version_id, dialogue_score, dialogue_justification,
    authenticity_score, authenticity_justification,
    mentoring_score, mentoring_justification, model_id
  ) values (
    new_version_id, p_dialogue_score, p_dialogue_justification,
    p_authenticity_score, p_authenticity_justification,
    p_mentoring_score, p_mentoring_justification, p_model_id
  ) returning id into new_score_id;

  for entry in select * from jsonb_array_elements(p_skill_coverage) loop
    insert into public.skill_coverage_entries (score_id, skill, covered, confidence, justification)
      values (
        new_score_id,
        entry ->> 'skill',
        (entry ->> 'covered')::boolean,
        entry ->> 'confidence',
        entry ->> 'justification'
      );
  end loop;

  for entry in select * from jsonb_array_elements(p_suggestions) loop
    insert into public.suggestions (score_id, pillar, text)
      values (new_score_id, entry ->> 'pillar', entry ->> 'text');
  end loop;

  update public.lessons set current_version_id = new_version_id where id = new_lesson_id;

  return new_lesson_id;
end;
$$;

grant execute on function public.save_lesson(
  text, text, text, text, uuid, text, text, int, text, int, text, int, text, text, jsonb, jsonb
) to authenticated;
