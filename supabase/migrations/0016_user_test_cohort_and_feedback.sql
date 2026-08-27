-- Chiron — Phase 2A user-test cohort tracking + feedback
-- (chiron_calibration_feedback_and_automation_prompts.txt)
--
-- test_cohort is nullable, no default, no backfill: existing sessions
-- predate cohort tracking entirely and genuinely have no cohort — NULL
-- means "not part of a tracked test," not "unknown." A normal user who
-- never visits a /practice?test=<id> URL always gets NULL here, so
-- their behavior is unchanged (the prompt's explicit requirement).
--
-- Written by the same service-role-only path as every other
-- practice_sessions column (ADR-020) — no RLS change needed on this
-- table, the existing owner-scoped SELECT policy already covers it.
alter table public.practice_sessions add column test_cohort text;

-- user_test_feedback is NOT server-write-only like practice_sessions/
-- practice_attempts/disposition_checkins — there is no FSM integrity to
-- protect here (ADR-020's reasoning doesn't apply: a student's own
-- honest self-report has nothing to "fake" the way a forged score or
-- skipped FSM state would be). A normal owner-scoped RLS INSERT policy,
-- written via locals.supabase like most of the app (ADR-014), is both
-- simpler and sufficient.
--
-- unique(student_id, test_cohort): one feedback submission per tester
-- per cohort — the form is shown once, per the prompt's "one lightweight
-- feedback form" after completing all three cases.
create table public.user_test_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  test_cohort text not null,
  cases_understandable smallint not null check (cases_understandable between 1 and 5),
  tutor_made_think smallint not null check (tutor_made_think between 1 and 5),
  new_evidence_meaningful smallint not null check (new_evidence_meaningful between 1 and 5),
  tutor_repetitive smallint not null check (tutor_repetitive between 1 and 5),
  confidence_understandable smallint not null check (confidence_understandable between 1 and 5),
  update_criterion_understandable text not null
    check (update_criterion_understandable in ('yes', 'mostly', 'no', 'not_applicable')),
  perceived_steering boolean not null,
  perceived_steering_explanation text,
  would_continue boolean not null,
  what_worked_best text,
  what_needs_changing text,
  created_at timestamptz not null default now(),
  unique (student_id, test_cohort)
);

alter table public.user_test_feedback enable row level security;

-- No cross-user feedback browsing UI, per the prompt's explicit
-- instruction — the only reader is the report script
-- (scripts/export-user-test.ts), run locally with the service-role key,
-- which bypasses RLS entirely and needs no policy here.
create policy "a student can read their own feedback"
  on public.user_test_feedback for select
  to authenticated
  using (student_id = auth.uid());

create policy "a student can insert their own feedback"
  on public.user_test_feedback for insert
  to authenticated
  with check (student_id = auth.uid());
