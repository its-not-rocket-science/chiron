-- prompt.txt Prompt D2 — the lesson detail page's "Edit" action needs to
-- revise an EXISTING saved lesson's text and resubmit for re-scoring,
-- producing a new LessonVersion under the same lesson (ADR-007 already
-- established this is the intended shape: a resubmission creates a new
-- version, never edits history in place). No existing code path does
-- this: save_lesson() (0001, updated 0005/0013) always INSERTs a brand
-- new lessons row — there is no "add a version to a lesson I already
-- own" RPC anywhere yet. add_lesson_version() fills that gap, mirroring
-- save_lesson()'s own shape (same atomic version+score+skill-coverage+
-- suggestions insert, same NOT SECURITY DEFINER so every insert still
-- runs as the calling user and is independently checked by RLS — never
-- trust this function's own ownership check alone).
create or replace function public.add_lesson_version(
  p_lesson_id uuid,
  p_subject_profile_id text,
  p_grade_level text,
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
  new_version_id uuid := gen_random_uuid();
  new_score_id uuid := gen_random_uuid();
  next_version_number int;
  entry jsonb;
begin
  -- Explicit check, not just relying on the INSERT policy below to fail
  -- silently into a generic RLS error — this also lets us compute
  -- next_version_number safely before inserting anything.
  if not exists (
    select 1 from public.lessons where id = p_lesson_id and owner_id = auth.uid()
  ) then
    raise exception 'Lesson not found, or you do not have access to it.';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version_number
    from public.lesson_versions where lesson_id = p_lesson_id;

  insert into public.lesson_versions (id, lesson_id, version_number, source, raw_text)
    values (new_version_id, p_lesson_id, next_version_number, p_source, p_raw_text);

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

  update public.lessons
    set current_version_id = new_version_id,
        subject_profile_id = p_subject_profile_id,
        grade_level = p_grade_level
    where id = p_lesson_id;

  return new_version_id;
end;
$$;
