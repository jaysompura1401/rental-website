-- =====================================================================
-- NIVAAS — Agent Verification table (PostgreSQL / Supabase)
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================================

-- Ensure nivaas_users role check constraint allows 'agent' and 'verification_team'
ALTER TABLE nivaas_users DROP CONSTRAINT IF EXISTS nivaas_users_role_check;
ALTER TABLE nivaas_users ADD CONSTRAINT nivaas_users_role_check 
  CHECK (role IN ('customer', 'owner', 'admin', 'agent', 'verification_team'));

-- Ensure verification_status column exists on nivaas_properties
ALTER TABLE nivaas_properties ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending';

-- ---------------------------------------------------------------------
-- nivaas_agent_verifications
-- Stores per-property verification data submitted by field agents.
-- Each row = one verification attempt for one property.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nivaas_agent_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES nivaas_properties(id) ON DELETE CASCADE,
  agent_id            UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,
  owner_id            UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,

  -- Document URLs (uploaded to Supabase Storage)
  aadhaar_card_url    VARCHAR(1000),
  utility_bill_url    VARCHAR(1000),
  owner_photo_url     VARCHAR(1000),
  property_photo_urls JSONB NOT NULL DEFAULT '[]',

  -- Mobile verification
  mobile_verified     BOOLEAN NOT NULL DEFAULT false,
  verified_phone      VARCHAR(20),

  -- Status
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','approved','rejected')),
  agent_notes         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agentverif_property ON nivaas_agent_verifications (property_id);
CREATE INDEX IF NOT EXISTS idx_agentverif_agent    ON nivaas_agent_verifications (agent_id);
CREATE INDEX IF NOT EXISTS idx_agentverif_status   ON nivaas_agent_verifications (status);

-- Auto-update updated_at
CREATE TRIGGER trg_agent_verif_updated_at
  BEFORE UPDATE ON nivaas_agent_verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (permissive — tighten for production)
ALTER TABLE nivaas_agent_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all - nivaas_agent_verifications"
  ON nivaas_agent_verifications FOR ALL USING (true) WITH CHECK (true);
