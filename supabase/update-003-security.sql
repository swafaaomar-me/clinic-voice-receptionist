-- Update 003: security alerts.
-- Run this once in the Supabase SQL Editor. It is safe to run again.

-- Every suspicious thing that happens: wrong admin passwords, chat flooding,
-- attempts to trick Noor, and actions her safety checks blocked.
create table if not exists security_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in (
    'login_failed', 'login_locked', 'chat_rate_limited', 'oversized_request', 'prompt_injection', 'guard_blocked'
  )),
  severity text not null check (severity in ('info', 'warning', 'high')),
  device text not null,  -- short one-way code for the visitor's IP address (the full IP is not stored)
  ip_hint text,          -- masked IP for a rough idea of where it came from, e.g. 203.0.113.x
  chat_id text,
  details text not null,
  notified boolean not null default false  -- an instant alert was sent for this event
);

create index if not exists security_events_created_idx on security_events (created_at desc);
create index if not exists security_events_device_idx on security_events (device, kind, created_at desc);

alter table security_events enable row level security;

-- Counters for "how many chat messages has this device sent recently".
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

alter table rate_limits enable row level security;

-- Adds one hit for a key and returns the count in the current window.
-- A new window starts once the old one is older than p_window_seconds.
create or replace function hit_rate_limit(p_key text, p_window_seconds integer)
returns integer
language plpgsql
set search_path = public
as $$
declare
  current_hits integer;
begin
  insert into rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into current_hits;

  -- Now and then, tidy away counters nobody has used for a day
  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return current_hits;
end;
$$;

-- Only the server (secret key) may call it, not website visitors.
revoke execute on function hit_rate_limit(text, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function hit_rate_limit(text, integer) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function hit_rate_limit(text, integer) to service_role';
  end if;
end;
$$;
