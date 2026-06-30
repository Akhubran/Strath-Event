-- StrathEvents v4 Schema Additions
-- Run after existing schema_additions.sql (v3)

-- Feature #3: Profile picture stored as base64 on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_base64 TEXT;

-- Feature #11 & #12: Club type (club/sport) and category
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'club' CHECK (type IN ('club','sport'));
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Club logo as base64 (alternative to logo_url, mandatory on creation)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_base64 TEXT;

-- Events: category field for filtering (Feature #12)
ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Events: registration deadline (closes registrations before event date)
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ;

-- Events: banner_base64 already added in v3 schema_additions.sql
-- If not present:
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_base64 TEXT;

-- Create index for faster event queries (upcoming filter, Feature #7)
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_registrations_user_event ON registrations(user_id, event_id);

-- ─── Confirmation email trigger (Feature #15) ──────────────────────────────
-- Implement via Resend/SendGrid in backend payments.js and registrations.js
-- The following is a Supabase DB function placeholder for reference:
-- CREATE OR REPLACE FUNCTION notify_registration() RETURNS trigger AS $$
-- BEGIN
--   PERFORM net.http_post(
--     url := 'https://your-app.com/api/internal/send-email',
--     headers := '{"Content-Type":"application/json"}'::jsonb,
--     body := json_build_object('event', 'registration_confirmed', 'user_id', NEW.user_id, 'event_id', NEW.event_id)::text
--   );
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
-- CREATE TRIGGER on_registration_confirmed AFTER UPDATE ON registrations
--   FOR EACH ROW WHEN (OLD.status <> 'confirmed' AND NEW.status = 'confirmed')
--   EXECUTE FUNCTION notify_registration();

-- ─── Fix: allow deleting a user who has payment records ────────────────────
-- payments.user_id originally had no ON DELETE clause, which defaults to
-- NO ACTION in Postgres and blocks "Delete User" in the admin panel with:
--   "update or delete on table users violates foreign key constraint
--    payments_user_id_fkey on table payments"
-- Payment records are kept for financial record-keeping (SET NULL on
-- user_id), not cascaded/deleted, so revenue history stays intact even
-- after a user account is removed.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_event_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
