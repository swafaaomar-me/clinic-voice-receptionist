-- =============================================================
-- Update 1: add the clinic's phone number (fictional) so Noor can
-- give it when she tells patients to call.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
-- =============================================================
insert into clinic_info (topic, content, content_ar) values
  ('phone', 'Call or WhatsApp Smile Dental Clinic on 011 555 0123.',
            'اتصل أو راسلنا واتساب على رقم عيادة سمايل لطب الأسنان: 011 555 0123.')
on conflict (topic) do update
  set content = excluded.content, content_ar = excluded.content_ar;
