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

-- Security: turn on Row Level Security with no public policies.
-- Browsers can't read or change anything directly; only our own server code
-- (using the secret key) can access these tables.
alter table dentists          enable row level security;
alter table services          enable row level security;
alter table dentist_services  enable row level security;
alter table working_hours     enable row level security;
alter table appointments      enable row level security;
alter table clinic_info       enable row level security;
