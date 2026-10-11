-- =============================================================
-- Smile Dental Clinic: database schema
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run
-- =============================================================

-- Needed for the "no double booking" rule on appointments
create extension if not exists btree_gist;

-- Dentists working at the clinic
create table dentists (
  id            bigint generated always as identity primary key,
  name          text not null,
  name_ar       text not null,
  specialty     text not null,
  specialty_ar  text not null,
  active        boolean not null default true
);

-- Treatments the clinic offers, how long they take and what they cost
create table services (
  id                bigint generated always as identity primary key,
  name              text not null unique,
  name_ar           text not null,
  description       text not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  price_sar         numeric(10, 2) not null check (price_sar >= 0)
);

-- Which dentist can perform which service
create table dentist_services (
  dentist_id  bigint not null references dentists (id) on delete cascade,
  service_id  bigint not null references services (id) on delete cascade,
  primary key (dentist_id, service_id)
);

-- Each dentist's weekly schedule.
-- weekday uses PostgreSQL numbering: 0 = Sunday ... 5 = Friday, 6 = Saturday
create table working_hours (
  id          bigint generated always as identity primary key,
  dentist_id  bigint not null references dentists (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time),
  unique (dentist_id, weekday)
);

-- Booked, cancelled and completed appointments
create table appointments (
  id             bigint generated always as identity primary key,
  dentist_id     bigint not null references dentists (id),
  service_id     bigint not null references services (id),
  patient_name   text not null,
  patient_phone  text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'booked'
                 check (status in ('booked', 'cancelled', 'completed')),
  notes          text,
  created_at     timestamptz not null default now(),
  reminder_sent_at timestamptz,  -- when staff last sent a WhatsApp reminder
  check (ends_at > starts_at),
  -- The database itself refuses two active bookings for the same dentist that overlap in time
  constraint no_double_booking exclude using gist (
    dentist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);

create index appointments_dentist_time_idx on appointments (dentist_id, starts_at);
create index appointments_phone_idx on appointments (patient_phone);

-- General clinic information the receptionist can answer questions about
create table clinic_info (
  topic       text primary key,
  content     text not null,
  content_ar  text not null
);

-- One short summary per chat with Noor, for the staff dashboard
create table conversations (
  id              bigint generated always as identity primary key,
  chat_id         text not null unique,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  language        text check (language in ('en', 'ar', 'mixed')),
  outcome         text not null default 'question'
                  check (outcome in ('booked', 'cancelled', 'question', 'emergency', 'no_action')),
  summary         text not null,
  patient_name    text,
  patient_phone   text,
  appointment_id  bigint references appointments (id) on delete set null,
  message_count   integer not null default 0
);

create index conversations_updated_idx on conversations (updated_at desc);

-- Security: turn on Row Level Security with no public policies.
-- Browsers can't read or change anything directly; only our own server code
-- (using the secret key) can access these tables.
alter table dentists          enable row level security;
alter table services          enable row level security;
alter table dentist_services  enable row level security;
alter table working_hours     enable row level security;
alter table appointments      enable row level security;
alter table clinic_info       enable row level security;
alter table conversations     enable row level security;

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
