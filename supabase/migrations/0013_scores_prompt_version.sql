-- prompts.txt Prompt P2: track which version of the scoring prompt
-- produced a stored score, not just which model. Nullable, no default —
-- existing rows predate this concept entirely, and we genuinely don't
-- know which prompt text scored them (SCORING_PROMPT_VERSION didn't
-- exist yet), so backfilling them with today's version string would be
-- fabricating history, not recording it. NULL honestly means "unknown,
-- predates prompt-version tracking." Every new row going forward
-- supplies a real value via save_lesson's new required parameter.
alter table public.scores add column prompt_version text;

-- `create or replace` only replaces a function with the SAME argument
-- list; adding p_prompt_version changes the arity, so without this drop
-- the old 16-arg save_lesson would stick around as a separate overload
-- instead of being replaced.
drop function if exists public.save_lesson(
  text, text, text, text, uuid, text, text,
  int, text, int, text, int, text,
  text, jsonb, jsonb
);

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
  p_prompt_version text,
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
    mentoring_score, mentoring_justification, model_id, prompt_version
  ) values (
    new_score_id, new_version_id, p_dialogue_score, p_dialogue_justification,
    p_authenticity_score, p_authenticity_justification,
    p_mentoring_score, p_mentoring_justification, p_model_id, p_prompt_version
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
