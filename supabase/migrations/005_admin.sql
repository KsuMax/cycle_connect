-- ============================================================
-- Admin role + stickers system
-- ============================================================

-- 1. Add is_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Grant admin to ksumax (by username)
UPDATE profiles SET is_admin = true WHERE username = 'ksumax';

-- 3. RLS: allow admins to add any user to any event
--    (existing policy only allows users to manage their own participation)
CREATE POLICY IF NOT EXISTS "Admins can manage all event_participants"
  ON event_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
