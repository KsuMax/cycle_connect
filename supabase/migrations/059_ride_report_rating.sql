-- Оценка маршрута в отчёте (1–5), опциональная.
-- Основа агрегата «★ 4,8 · N отчётов» в шапке маршрута.
ALTER TABLE public.ride_reports
  ADD COLUMN IF NOT EXISTS rating smallint
  CHECK (rating BETWEEN 1 AND 5);

COMMENT ON COLUMN public.ride_reports.rating IS 'Оценка маршрута автором отчёта, 1–5. NULL — без оценки.';
