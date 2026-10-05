-- =============================================================
-- Update 2: conversation summaries for the staff dashboard.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
-- =============================================================
create table if not exists conversations (
  id              bigint generated always as identity primary key,
  chat_id         text not null unique,          -- the chat window's own ID
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

create index if not exists conversations_updated_idx on conversations (updated_at desc);

-- Same rule as the other tables: only our server code can read or write
alter table conversations enable row level security;
