-- prompts.txt Prompt P6: an org-scoped score benchmark, computed by a
-- SECURITY DEFINER function following the my_org_ids()/is_org_admin()
-- pattern (ADR-010) — never a client-supplied org_id, never a raw
-- aggregate query the client could point at an arbitrary org. Reuses
-- my_org_ids() (0002) rather than re-deriving org membership inline.
--
-- Returns only aggregate pillar-score averages over the calling user's
-- own org, for scores in the last 30 days — no individual lesson or
-- user identifying data. If fewer than two distinct teachers
-- contributed a score in that window, the averages come back null (but
-- lesson_count does not) so a single-contributor org can't have its one
-- other teacher's exact average inferred through this function.
create or replace function public.get_org_score_benchmark()
returns table (
  dialogue_avg numeric,
  authenticity_avg numeric,
  mentoring_avg numeric,
  lesson_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    case when count(distinct l.owner_id) >= 2 then avg(s.dialogue_score) end,
    case when count(distinct l.owner_id) >= 2 then avg(s.authenticity_score) end,
    case when count(distinct l.owner_id) >= 2 then avg(s.mentoring_score) end,
    count(*)::bigint
  from public.scores s
  join public.lesson_versions lv on lv.id = s.lesson_version_id
  join public.lessons l on l.id = lv.lesson_id
  where l.org_id in (select public.my_org_ids())
    and s.created_at >= now() - interval '30 days';
$$;

grant execute on function public.get_org_score_benchmark() to authenticated;
