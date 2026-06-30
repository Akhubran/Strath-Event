-- ============================================================
-- SCHEMA ADDITIONS — Run these in Supabase SQL Editor
-- ============================================================

-- Add dual pricing + image storage to events
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS member_price DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS non_member_price DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS banner_base64 TEXT;

-- Club memberships table
CREATE TABLE IF NOT EXISTS club_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON club_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club ON club_memberships(club_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON club_memberships(status);

-- ============================================================
-- EVENT FEEDBACK TABLE — student ratings and reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS event_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_event ON event_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON event_feedback(user_id);
