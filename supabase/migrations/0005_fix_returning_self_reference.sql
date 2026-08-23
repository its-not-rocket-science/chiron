-- Fix: `INSERT ... RETURNING` re-checks the inserted row against the
-- table's SELECT policy (not just its INSERT/WITH CHECK policy) — this
-- is documented Postgres behavior, not a bug in Postgres itself. The
-- `lesson_versions` SELECT policy calls `can_view_lesson_version(id)`,
-- which queries `lesson_versions` again (joined to `lessons`) to resolve
-- visibility — a genuinely SELF-referencing subquery, since the function
-- queries the very table whose row is mid-INSERT. A self-referencing
-- subquery cannot see a row inserted earlier in the *same* SQL command,
-- so that visibility check always came back false for the just-inserted
-- row specifically when RETURNING was used — even though a plain INSERT
-- with no RETURNING, or a completely separate SELECT statement
-- afterward, both worked fine. This is what "PLpgSQL's
-- `RETURNING ... INTO`" was silently hitting inside `save_lesson`.
--
-- (0002 and 0003 fixed two *other*, real RLS bugs found along the way —
-- self-referencing recursion in memberships' own policy, and unreliable
-- cross-table subqueries in several WITH CHECK clauses. Both of those
-- fixes stand; this migration fixes a third, independent issue.)
--
-- Fix: stop relying on the database to hand back generated ids for
-- lesson_versions/scores. Generate them in PL/pgSQL before inserting and
-- include them explicitly, so no RETURNING clause is needed for those
-- two tables — sidestepping the self-reference entirely rather than
-- trying to make the SELECT policy tolerate it.

create or replace function public.save_lesson(
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
  new_version_id uuid := gen_random_uuid();
  new_score_id uuid := gen_random_uuid();
  entry jsonb;
begin
  insert into public.lessons (owner_id, org_id, title, subject_profile_id, grade_level, visibility)
    values (auth.uid(), p_org_id, p_title, p_subject_profile_id, p_grade_level, p_visibility)
    returning id into new_lesson_id;

  insert into public.lesson_versions (id, lesson_id, version_number, source, raw_text)
    values (new_version_id, new_lesson_id, 1, p_source, p_raw_text);

  insert into public.scores (
    id, lesson_version_id, dialogue_score, dialogue_justification,
    authenticity_score, authenticity_justification,
    mentoring_score, mentoring_justification, model_id
  ) values (
    new_score_id, new_version_id, p_dialogue_score, p_dialogue_justification,
    p_authenticity_score, p_authenticity_justification,
    p_mentoring_score, p_mentoring_justification, p_model_id
  );

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

-- Clean up the temporary diagnostic objects added while tracking this down.
drop policy "TEMP diagnostic always allow" on public.lesson_versions;
drop function public.debug_lesson_versions_policies();
drop function public.debug_lesson_versions_rls_enabled();
