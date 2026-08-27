-- prompts.txt Prompt P5: memoization cache for repeated identical
-- scoring submissions (same lessonText + subjectProfileId +
-- SCORING_PROMPT_VERSION). Deliberately outside the
-- lessons/lesson_versions/scores visibility model ADR-002 governs — a
-- cache row isn't owned by any user or org, it's just "we scored this
-- exact content before." content_hash as the primary key both enforces
-- one row per hash and is itself the index this table is looked up by.
create table public.scoring_cache (
  content_hash text primary key,
  scoring_result jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies: default-deny for the anon/authenticated
-- roles reachable via locals.supabase. Only the service-role client
-- (used exclusively by SupabaseDataStore, never exposed to the browser)
-- can read or write this table — it bypasses RLS entirely regardless,
-- so this is defense in depth, not the actual access boundary.
alter table public.scoring_cache enable row level security;
