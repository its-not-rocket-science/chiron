-- Chiron — Phase 2A: add practice_attempts.scoring_events
-- (prompts.txt Prompt 25)
--
-- A new migration rather than editing 0009 in place — 0009 may already
-- be deployed (project convention: never edit a historical migration
-- that could already be live).
--
-- Stores the itemized ScoringEvent[] audit trail computeScoringEvents()
-- (src/lib/domain/scoringEvents.ts) produces at SCORE_AND_RECORD —
-- richer than scoring_explanation alone (which only carries the
-- pass/fail outcome and the raw detected-signal list, not per-event
-- skill/explanation mapping). Written once, at the same time as the
-- rest of the row, by the same service-role-only write path ADR-020
-- established — no RLS change needed, the existing owner-scoped SELECT
-- policy already covers this column.

alter table public.practice_attempts
  add column scoring_events jsonb not null default '[]'::jsonb;

-- Drop the default now that it's served its purpose (backfilling any
-- pre-existing rows, none of which are expected to exist yet in a
-- Phase 2A that hasn't shipped to real students) — new inserts always
-- supply this column explicitly, same convention as the table's other
-- not-null jsonb columns.
alter table public.practice_attempts
  alter column scoring_events drop default;
