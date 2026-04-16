-- Автоматическое обновление likes_count через триггеры (SECURITY DEFINER)
-- Это исправляет баг: RLS на таблицах routes/events разрешала UPDATE только автору,
-- поэтому client-side обновление счётчика молча падало для всех остальных пользователей.

-- 1. Trigger function for route_likes
CREATE OR REPLACE FUNCTION update_route_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE routes SET likes_count = likes_count + 1 WHERE id = NEW.route_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE routes SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.route_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 2. Trigger function for event_likes
CREATE OR REPLACE FUNCTION update_event_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE events SET likes_count = likes_count + 1 WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE events SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.event_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Attach triggers
CREATE TRIGGER trg_route_likes_count
AFTER INSERT OR DELETE ON route_likes
FOR EACH ROW EXECUTE FUNCTION update_route_likes_count();

CREATE TRIGGER trg_event_likes_count
AFTER INSERT OR DELETE ON event_likes
FOR EACH ROW EXECUTE FUNCTION update_event_likes_count();

-- 4. Resync likes_count from actual rows (fixes existing stale counts)
UPDATE routes r
SET likes_count = (SELECT COUNT(*) FROM route_likes rl WHERE rl.route_id = r.id);

UPDATE events e
SET likes_count = (SELECT COUNT(*) FROM event_likes el WHERE el.event_id = e.id);

-- 5. Fix route_likes INSERT policy: must insert own user_id only
DROP POLICY IF EXISTS "route_likes: insert authenticated" ON route_likes;
CREATE POLICY "route_likes: manage own" ON route_likes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
