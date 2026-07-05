-- Личная цель по километражу на сезон (для прогресс-бара в личном кабинете).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS season_goal_km integer
  CHECK (season_goal_km > 0);

COMMENT ON COLUMN public.profiles.season_goal_km IS 'Цель по километрам на сезон. NULL — не задана.';
