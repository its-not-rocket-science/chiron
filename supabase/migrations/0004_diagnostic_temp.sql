-- TEMPORARY diagnostic — will be reverted by 0005. The always-true
-- policy from this file was already applied in an earlier run; this
-- adds functions that dump pg_policies/RLS-enabled state for
-- lesson_versions so we can see exactly what's deployed rather than
-- guessing from migration file contents.

create function public.debug_lesson_versions_policies()
returns table (
  policyname text,
  permissive text,
  roles text[],
  cmd text,
  qual text,
  with_check text
)
language sql
security definer
set search_path = public
as $$
  select policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'lesson_versions';
$$;

grant execute on function public.debug_lesson_versions_policies() to authenticated;

create function public.debug_lesson_versions_rls_enabled()
returns boolean
language sql
security definer
set search_path = public
as $$
  select relrowsecurity from pg_class where oid = 'public.lesson_versions'::regclass;
$$;

grant execute on function public.debug_lesson_versions_rls_enabled() to authenticated;
