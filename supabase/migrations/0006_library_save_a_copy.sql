-- Prompt 9: shared library — "save a copy" support.
--
-- Adds Lesson.copiedFromLessonId (provenance — docs/ARCHITECTURE.md
-- Section 2.2 "save-a-copy") and a copy_lesson() RPC that duplicates a
-- lesson's current version + score + skill coverage + suggestions into a
-- new, always-private lesson owned by the caller.
--
-- SECURITY INVOKER (default, no `security definer`) is deliberate: every
-- read inside this function runs under the CALLING user's RLS, so a
-- caller can only copy a lesson they're actually allowed to view (their
-- own, their org's shared lessons, or a public template) — the same
-- boundary the lessons SELECT policy already enforces, reused for free
-- rather than re-implemented here. Per ADR-010, ids are generated up
-- front and no RETURNING is used for lesson_versions/scores, since
-- lesson_versions' own SELECT policy self-references the table.

alter table public.lessons
  add column copied_from_lesson_id uuid references public.lessons (id) on delete set null;

create function public.copy_lesson(source_lesson_id uuid)
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
    owner_id, org_id, title, subject_profile_id, grade_level, visibility, copied_from_lesson_id
  ) values (
    auth.uid(), null, src_lesson.title, src_lesson.subject_profile_id, src_lesson.grade_level,
    'private', source_lesson_id
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

grant execute on function public.copy_lesson(uuid) to authenticated;
