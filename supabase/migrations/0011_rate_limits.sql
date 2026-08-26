-- Chiron — shared/persistent rate limiting (prompts.txt Prompt 31)
--
-- Replaces src/lib/server/rateLimit.ts's per-process in-memory Map
-- (ADR-006) with a Postgres-backed counter, so limits hold across more
-- than one app instance and survive a restart/redeploy. Chosen over
-- Redis per Prompt 31's own "prefer infrastructure already present"
-- instruction — Supabase/Postgres is already load-bearing everywhere
-- else in this project, and a single-row atomic upsert per check is
-- cheap relative to the LLM call it's usually gating.
--
-- rate_limits has no per-user rows to protect the way ADR-020's tables
-- do — it's pure infrastructure, read and written exclusively by
-- check_rate_limit() below via the service-role client (which bypasses
-- RLS regardless). RLS is still enabled with zero policies, deny-all to
-- anon/authenticated, as defense in depth: even a misconfigured caller
-- using a non-service-role client gets nothing.

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 1
);

alter table public.rate_limits enable row level security;
-- No policies at all — see the note above.

-- Atomic check-and-increment. A single INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING is one statement, so Postgres's own row-level locking on
-- the conflicting key serializes concurrent callers for the same key —
-- no separate read-then-write round trip, so no lost-update race between
-- two requests arriving at once for the same caller. Different keys
-- don't contend with each other at all (different rows).
--
-- SECURITY INVOKER (the default, no `security definer`) — deliberate,
-- same reasoning as copy_lesson (0006): this function is only ever
-- called by server-side route code via the service-role client, which
-- already bypasses RLS on its own privilege, so no elevation is needed.
-- EXECUTE is explicitly restricted to service_role below so it can't be
-- called by anon/authenticated even though the RLS-denial above would
-- also block the resulting write.
create function public.check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
  set
    count = case
      when rl.window_start <= v_now - make_interval(secs => p_window_seconds) then 1
      else rl.count + 1
    end,
    window_start = case
      when rl.window_start <= v_now - make_interval(secs => p_window_seconds) then v_now
      else rl.window_start
    end
  returning rl.window_start, rl.count into v_window_start, v_count;

  -- Cleanup/expiry, handled inline rather than via a scheduled job:
  -- pg_cron isn't guaranteed to be enabled on every Supabase tier, and a
  -- self-contained function has no dependency on one existing. On
  -- roughly 1% of calls, delete rows whose window closed over an hour
  -- ago. This bounds steady-state table size to (distinct keys active
  -- in the last hour) rather than every key ever seen, without adding
  -- cleanup cost to every single call.
  if random() < 0.01 then
    delete from public.rate_limits
    where window_start < v_now - interval '1 hour';
  end if;

  if v_count > p_max_requests then
    return query select
      false,
      greatest(1, ceil(extract(epoch from (
        v_window_start + make_interval(secs => p_window_seconds) - v_now
      ))))::integer;
  else
    return query select true, 0;
  end if;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
