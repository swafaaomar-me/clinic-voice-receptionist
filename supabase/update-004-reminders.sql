-- Update 004: WhatsApp reminders.
-- Run this once in the Supabase SQL Editor. It is safe to run again.

-- Remembers when staff last sent a reminder, so they can see who still needs one
alter table appointments add column if not exists reminder_sent_at timestamptz;
