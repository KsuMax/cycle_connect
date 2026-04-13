-- ============================================================
-- Ride intents: lightweight "I want to ride" signals
-- ============================================================

-- 1. Main intents table
CREATE TABLE ride_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  creator_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ride_intents_route_date_idx ON ride_intents(route_id, planned_date);
CREATE INDEX ride_intents_creator_idx ON ride_intents(creator_id);

ALTER TABLE ride_intents ENABLE ROW LEVEL SECURITY;

-- Anyone can read intents
CREATE POLICY "ride_intents_select" ON ride_intents FOR SELECT USING (true);
-- Auth users can create intents
CREATE POLICY "ride_intents_insert" ON ride_intents FOR INSERT WITH CHECK (auth.uid() = creator_id);
-- Only creator can delete
CREATE POLICY "ride_intents_delete" ON ride_intents FOR DELETE USING (auth.uid() = creator_id);

-- 2. Participants who joined an intent
CREATE TABLE ride_intent_participants (
  intent_id  uuid NOT NULL REFERENCES ride_intents(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, user_id)
);

ALTER TABLE ride_intent_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ride_intent_participants_select" ON ride_intent_participants FOR SELECT USING (true);
CREATE POLICY "ride_intent_participants_insert" ON ride_intent_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ride_intent_participants_delete" ON ride_intent_participants FOR DELETE USING (auth.uid() = user_id);
