-- Chiron — Phase 2A: practice_sessions (prompts.txt Prompt 22)
-- In-progress student practice attempts — docs/PHASE2.md Section 3's
-- "Resumable sessions" requirement, docs/PHASE2A_IMPLEMENTATION.md
-- Section 4. RLS designed before this migration was written, per
-- ADR-010's discipline (see the comment on owns_practice_session below
-- for why a helper function exists even though this table's own policy
-- is a direct, non-cross-table check).
--
-- No FK to a practice_cases table — Phase 2A's cases are static
-- TypeScript data, not database rows (ADR-019). case_id is a plain
-- slug, validated in application code against the known static set,
-- the same convention lessons.subject_profile_id already uses for
-- subjectProfiles.ts.
--
-- ADR-020: INSERT/UPDATE are NOT granted to `authenticated` at all —
-- only SELECT. Ownership alone can't protect FSM integrity: a student
-- who owns their own row could otherwise PATCH fsm_state straight to
-- COMPLETE, or fabricate revealed_evidence_ids/transcript, via a direct
-- REST call with their own JWT, entirely bypassing advance()'s
-- transition validation. The only writer is the server-side transition
-- route, using the service-role client (src/lib/server/serviceRoleClient.ts)
-- after running the real FSM logic — RLS's job here is read-isolation
-- only, not write-validation, which lives in application code by design.

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  case_id text not null,
  fsm_state text not null,
  revealed_evidence_ids jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  initial_judgment jsonb,
  update_criterion_text text,
  revised_judgment jsonb,
  reflection_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practice_sessions enable row level security;

-- Direct ownership check, no join — a genuine cross-table helper
-- (ADR-010) isn't needed for this table's OWN policies, only for other
-- tables that reference a session by id (see 0009's
-- owns_practice_session() calls).
create policy "a student can read their own practice sessions"
  on public.practice_sessions for select
  to authenticated
  using (student_id = auth.uid());

-- Deliberately no insert/update/delete policy for `authenticated` at
-- all (ADR-020, see the note above) — sessions are created and updated
-- exclusively by server-side route code via the service-role client,
-- which bypasses RLS by design. A student can read their own session
-- (the policy above) but cannot write it directly through any client
-- request, no matter how it's sent.

-- Cross-table helper (ADR-010 pattern) — used by practice_attempts'
-- insert policy (0009) to verify a new attempt's session_id actually
-- belongs to the inserting student, without inlining a raw subquery
-- into that policy directly.
create function public.owns_practice_session(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.practice_sessions
    where id = p_session_id and student_id = auth.uid()
  );
$$;
