-- Chiron — Phase 2A: practice_attempts + disposition_checkins
-- (prompts.txt Prompt 22)
--
-- Both tables reference a row in another new table by id
-- (practice_attempts -> practice_sessions; disposition_checkins ->
-- practice_attempts) — exactly the cross-table-check shape ADR-010
-- says must go through a SECURITY DEFINER helper, never an inline
-- subquery in the policy itself.
--
-- ADR-020: like 0008's practice_sessions, neither table grants INSERT
-- to `authenticated` — attempts and disposition checkins are written
-- exclusively by server-side route code via the service-role client,
-- after running the real FSM + deterministic scoring logic. A raw
-- client insert (fabricating a favorable outcome, or "completing" a
-- case that was never actually played through) has no policy path to
-- succeed through. owns_practice_session()/owns_practice_attempt()
-- below are kept as reusable SECURITY DEFINER primitives (ADR-010)
-- even though no live policy currently calls them — genuinely useful
-- building blocks for a future RPC (e.g. teacher visibility, Section 7)
-- rather than something to delete and potentially re-add later.

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  case_id text not null,
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  initial_judgment jsonb not null,
  update_criterion jsonb,
  revised_judgment jsonb not null,
  scoring_explanation jsonb not null,
  -- Denormalized from scoring_explanation->>'outcome' so calibration
  -- aggregate queries (docs/PHASE2.md Section 4) can filter/group
  -- cheaply without parsing jsonb per row.
  outcome text not null check (outcome in ('correct', 'incorrect')),
  created_at timestamptz not null default now()
);

alter table public.practice_attempts enable row level security;

create policy "a student can read their own practice attempts"
  on public.practice_attempts for select
  to authenticated
  using (student_id = auth.uid());

-- No insert, update, or delete policy for `authenticated` at all —
-- see the ADR-020 note above. Attempts are written server-side only,
-- and immutable once written (the same "audit record, not a mutable
-- row" treatment Phase 1's scores table gets).

-- Cross-table helper (ADR-010 pattern) — used by disposition_checkins'
-- insert policy below.
create function public.owns_practice_attempt(p_attempt_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.practice_attempts
    where id = p_attempt_id and student_id = auth.uid()
  );
$$;

create table public.disposition_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid not null references public.practice_attempts (id) on delete cascade,
  -- A dispositionClusters[].items[] string (static data, taxonomy.ts) —
  -- not FK'd, same convention as practice_sessions.case_id.
  disposition_item text not null,
  response smallint not null check (response between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.disposition_checkins enable row level security;

create policy "a student can read their own disposition checkins"
  on public.disposition_checkins for select
  to authenticated
  using (student_id = auth.uid());

-- No insert policy for `authenticated` — same ADR-020 reasoning as
-- above; disposition checkins are also written server-side only, via
-- the same transition route.
