-- =============================================================
-- Smile Dental Clinic: sample data (fictional clinic)
-- Run AFTER schema.sql. Times are Riyadh time (+03).
-- =============================================================

insert into dentists (name, name_ar, specialty, specialty_ar) values
  ('Dr. Sara Al-Harbi', 'د. سارة الحربي', 'General Dentistry',  'طب الأسنان العام'),
  ('Dr. Omar Khalid',   'د. عمر خالد',    'Orthodontics',       'تقويم الأسنان'),
  ('Dr. Lina Haddad',   'د. لينا حداد',    'Cosmetic Dentistry', 'تجميل الأسنان');

insert into services (name, name_ar, description, duration_minutes, price_sar) values
  ('Check-up and consultation', 'فحص واستشارة',        'Full examination of teeth and gums, with advice on any treatment needed.', 30, 150),
  ('Teeth cleaning',            'تنظيف الأسنان',        'Scaling and polishing to remove plaque and stains.',                         45, 250),
  ('Filling',                   'حشوة',                'Tooth-coloured filling for a cavity.',                                       60, 350),
  ('Teeth whitening',           'تبييض الأسنان',        'In-clinic whitening session.',                                               90, 1200),
  ('Root canal treatment',      'علاج العصب',          'Treatment of an infected tooth nerve.',                                      90, 1500),
  ('Braces consultation',       'استشارة تقويم',        'Assessment and treatment plan for braces or clear aligners.',                30, 200),
  ('Tooth extraction',          'خلع سن',              'Simple removal of a tooth.',                                                 45, 400),
  ('Children''s check-up',      'فحص أسنان الأطفال',    'Gentle check-up for children under 12.',                                     30, 120);

-- Who does what
insert into dentist_services (dentist_id, service_id)
select d.id, s.id
from dentists d
join services s on
  (d.name = 'Dr. Sara Al-Harbi' and s.name in ('Check-up and consultation', 'Teeth cleaning', 'Filling', 'Root canal treatment', 'Tooth extraction', 'Children''s check-up'))
  or (d.name = 'Dr. Omar Khalid' and s.name in ('Check-up and consultation', 'Braces consultation', 'Children''s check-up'))
  or (d.name = 'Dr. Lina Haddad' and s.name in ('Check-up and consultation', 'Teeth cleaning', 'Filling', 'Teeth whitening'));

-- Weekly schedules (0 = Sunday ... 6 = Saturday; the clinic is closed on Friday)
insert into working_hours (dentist_id, weekday, start_time, end_time)
select d.id, h.weekday, h.start_time, h.end_time
from dentists d
join (values
  ('Dr. Sara Al-Harbi', 0, time '09:00', time '17:00'),
  ('Dr. Sara Al-Harbi', 1, time '09:00', time '17:00'),
  ('Dr. Sara Al-Harbi', 2, time '09:00', time '17:00'),
  ('Dr. Sara Al-Harbi', 3, time '09:00', time '17:00'),
  ('Dr. Sara Al-Harbi', 4, time '09:00', time '17:00'),
  ('Dr. Omar Khalid',   6, time '13:00', time '21:00'),
  ('Dr. Omar Khalid',   0, time '13:00', time '21:00'),
  ('Dr. Omar Khalid',   1, time '13:00', time '21:00'),
  ('Dr. Omar Khalid',   2, time '13:00', time '21:00'),
  ('Dr. Omar Khalid',   3, time '13:00', time '21:00'),
  ('Dr. Lina Haddad',   6, time '10:00', time '14:00'),
  ('Dr. Lina Haddad',   0, time '10:00', time '18:00'),
  ('Dr. Lina Haddad',   2, time '10:00', time '18:00'),
  ('Dr. Lina Haddad',   4, time '10:00', time '18:00')
) as h(dentist_name, weekday, start_time, end_time) on h.dentist_name = d.name;

-- A few existing bookings, so the calendar isn't empty
insert into appointments (dentist_id, service_id, patient_name, patient_phone, starts_at, ends_at)
select d.id, s.id, a.patient_name, a.patient_phone, a.starts_at, a.starts_at + make_interval(mins => s.duration_minutes)
from (values
  ('Dr. Sara Al-Harbi', 'Teeth cleaning',            'Ahmed Saleh',   '0500000001', timestamptz '2026-10-01 10:00+03'),
  ('Dr. Omar Khalid',   'Braces consultation',       'Noura Fahad',   '0500000002', timestamptz '2026-10-03 14:00+03'),
  ('Dr. Sara Al-Harbi', 'Check-up and consultation', 'Khalid Nasser', '0500000003', timestamptz '2026-10-04 09:00+03'),
  ('Dr. Sara Al-Harbi', 'Filling',                   'Reem Abdullah', '0500000004', timestamptz '2026-10-05 11:00+03'),
  ('Dr. Lina Haddad',   'Teeth whitening',           'Maha Ali',      '0500000005', timestamptz '2026-10-06 11:00+03')
) as a(dentist_name, service_name, patient_name, patient_phone, starts_at)
join dentists d on d.name = a.dentist_name
join services s on s.name = a.service_name;

insert into clinic_info (topic, content, content_ar) values
  ('location',  'Smile Dental Clinic, King Fahd Road, Al Olaya, Riyadh.',
                'عيادة سمايل لطب الأسنان، طريق الملك فهد، حي العليا، الرياض.'),
  ('phone',     'Call or WhatsApp Smile Dental Clinic on 011 555 0123.',
                'اتصل أو راسلنا واتساب على رقم عيادة سمايل لطب الأسنان: 011 555 0123.'),
  ('hours',     'Open Saturday to Thursday. Saturday 10 AM to 9 PM, Sunday to Wednesday 9 AM to 9 PM, Thursday 9 AM to 6 PM. Closed on Friday.',
                'نعمل من السبت إلى الخميس. السبت من 10 صباحاً حتى 9 مساءً، ومن الأحد إلى الأربعاء من 9 صباحاً حتى 9 مساءً، والخميس من 9 صباحاً حتى 6 مساءً. الجمعة مغلق.'),
  ('parking',   'Free parking for patients in front of the clinic.',
                'مواقف مجانية للمرضى أمام العيادة.'),
  ('payment',   'We accept cash, mada and credit cards.',
                'نقبل الدفع نقداً وبطاقات مدى والبطاقات الائتمانية.'),
  ('insurance', 'We work with most major insurance companies. Please bring your insurance card to your appointment.',
                'نتعامل مع أغلب شركات التأمين الرئيسية. يرجى إحضار بطاقة التأمين عند موعدك.'),
  ('emergency', 'For a dental emergency during opening hours, call us and we will try to see you the same day. Outside opening hours, please go to the nearest hospital emergency department.',
                'في حالات الطوارئ خلال أوقات العمل، اتصل بنا وسنحاول استقبالك في نفس اليوم. وخارج أوقات العمل، يرجى التوجه إلى قسم الطوارئ في أقرب مستشفى.');
