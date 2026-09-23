-- Chiron — add CC0 to the lessons.license enum
-- (prompt.txt Prompt G6)
--
-- The two new onboarding examples this prompt sources
-- (ela-argumentative-writing, civics-current-events — see
-- docs/CONTENT_LICENSING.md) include a DocsTeach.org (National Archives
-- Foundation) teaching activity. DocsTeach's teaching activities carry a
-- CC0 Public Domain Dedication specifically — a distinct, named license
-- from the rest of that site's content (which is CC BY-NC-SA), and
-- distinct from 'Public-Domain-US-Govt' (public domain automatically, by
-- law, as a federal agency's own staff-authored work product). CC0 is a
-- voluntary waiver by the rights holder, not a statutory public-domain
-- status — worth its own enum value so the badge (licenseBadge.ts) and
-- any future case-by-case handling can tell the two apart, per
-- CONTENT_LICENSING.md rule 4 ("extend the enum, never switch to free
-- text").
alter table public.lessons drop constraint lessons_license_check;

alter table public.lessons add constraint lessons_license_check check (
  license in (
    'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0', 'Public-Domain-US-Govt',
    'Public-Domain-Expired', 'Other-Permission-Granted'
  )
);
