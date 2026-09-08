-- prompts-onboarding-examples.txt Prompt E4/E5: "duplicate and try your
-- own edit" must not silently strip attribution. copy_lesson() (0006)
-- predates the origin/attribution columns (0017) and doesn't carry them
-- into the new row at all — a copy of a system-example lesson would
-- otherwise lose its CC BY / public-domain attribution the moment a
-- teacher duplicates it, which is both a UX gap (Prompt E4) and, for a
-- CC BY-style license, an actual attribution-compliance gap (Prompt E5).
--
-- The copy itself stays `origin = 'user'` (the DEFAULT — deliberately not
-- listed in the insert's column list, same as every other pre-existing
-- column this function doesn't set) and remains a fully ordinary,
-- editable, owner-writable lesson; only the attribution *metadata* is
-- carried forward, not system-example status itself. Copying a copy
-- carries attribution forward again, the same way — `src_lesson` is
-- whatever row the caller is copying, regardless of how many times
-- removed it is from the original system example.
--
-- `create or replace` is safe here: the argument list is unchanged from
-- 0006, so this replaces the same overload rather than adding a new one.
create or replace function public.copy_lesson(source_lesson_id uuid)
returns uuid
language plpgsql
as $$
declare
  src_lesson public.lessons;
  src_version public.lesson_versions;
  src_score public.scores;
  new_lesson_id uuid;
  new_version_id uuid := gen_random_uuid();
  new_score_id uuid := gen_random_uuid();
begin
  select * into src_lesson from public.lessons where id = source_lesson_id;
  if not found then
    raise exception 'Lesson not found, or you do not have access to it.';
  end if;

  select * into src_version from public.lesson_versions where id = src_lesson.current_version_id;
  if not found then
    raise exception 'This lesson has no scored version to copy.';
  end if;

  select * into src_score from public.scores where lesson_version_id = src_version.id;

  insert into public.lessons (
    owner_id, org_id, title, subject_profile_id, grade_level, visibility, copied_from_lesson_id,
    attribution_name, attribution_url, license, license_note
  ) values (
    auth.uid(), null, src_lesson.title, src_lesson.subject_profile_id, src_lesson.grade_level,
    'private', source_lesson_id,
    src_lesson.attribution_name, src_lesson.attribution_url, src_lesson.license, src_lesson.license_note
  ) returning id into new_lesson_id;

  insert into public.lesson_versions (id, lesson_id, version_number, source, raw_text)
    values (new_version_id, new_lesson_id, 1, src_version.source, src_version.raw_text);

  if src_score.id is not null then
    insert into public.scores (
      id, lesson_version_id, dialogue_score, dialogue_justification,
      authenticity_score, authenticity_justification,
      mentoring_score, mentoring_justification, model_id
    ) values (
      new_score_id, new_version_id, src_score.dialogue_score, src_score.dialogue_justification,
      src_score.authenticity_score, src_score.authenticity_justification,
      src_score.mentoring_score, src_score.mentoring_justification, src_score.model_id
    );

    insert into public.skill_coverage_entries (score_id, skill, covered, confidence, justification)
      select new_score_id, skill, covered, confidence, justification
      from public.skill_coverage_entries
      where score_id = src_score.id;

    insert into public.suggestions (score_id, pillar, text)
      select new_score_id, pillar, text
      from public.suggestions
      where score_id = src_score.id;
  end if;

  update public.lessons set current_version_id = new_version_id where id = new_lesson_id;

  return new_lesson_id;
end;
$$;
