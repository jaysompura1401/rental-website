import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

// ─── PostgreSQL connection pool ───────────────────────────────────────────────
// Reads DATABASE_URL from .env (Supabase connection string — use the
// "Transaction" or "Session" pooler URL from Supabase → Settings → Database)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ─── Thin compatibility shim ─────────────────────────────────────────────────
// mysql2 returns [rows, fields] from pool.query(sql, params).
// The pg driver returns { rows, fields }. This wrapper keeps every route file
// working without changes — all existing code does:
//   const [rows] = await pool.query(...)
//   const [[row]] = await pool.query(...)
//
// Positional params:  mysql2 uses ?  →  pg uses $1, $2, …
// This shim converts ? → $n automatically so route files stay unchanged.

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const pgPool = {
  query: async (sql, params = []) => {
    const converted = convertPlaceholders(sql);
    try {
      const result = await pool.query(converted, params);
      // Return [rows, fields] tuple to match mysql2 API
      return [result.rows, result.fields];
    } catch (err) {
      console.error("DB query error:", err.message);
      console.error("SQL:", converted);
      throw err;
    }
  },
  // Expose raw pg pool for transactions if needed in future
  _pool: pool,
};

// Auto-initialize schema extensions for agent verification
async function initSchemaExtensions(client) {
  try {
    // 1. Update nivaas_users role check constraint to include 'agent' and 'verification_team'
    await client.query(`
      ALTER TABLE nivaas_users DROP CONSTRAINT IF EXISTS nivaas_users_role_check;
      ALTER TABLE nivaas_users ADD CONSTRAINT nivaas_users_role_check 
        CHECK (role IN ('customer', 'owner', 'admin', 'agent', 'verification_team'));
    `);

    // 2. Ensure verification_status column exists on nivaas_properties
    await client.query(`
      ALTER TABLE nivaas_properties 
      ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending';
    `);

    // 3. Set default values for any legacy properties where verification_status is NULL
    await client.query(`
      UPDATE nivaas_properties 
      SET verification_status = CASE WHEN verified = true THEN 'verified' ELSE 'pending' END 
      WHERE verification_status IS NULL;
    `);

    // 4. Ensure nivaas_agent_verifications table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS nivaas_agent_verifications (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id         UUID NOT NULL REFERENCES nivaas_properties(id) ON DELETE CASCADE,
        agent_id            UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,
        owner_id            UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,
        aadhaar_card_url    VARCHAR(1000),
        utility_bill_url    VARCHAR(1000),
        owner_photo_url     VARCHAR(1000),
        property_photo_urls JSONB NOT NULL DEFAULT '[]',
        mobile_verified     BOOLEAN NOT NULL DEFAULT false,
        verified_phone      VARCHAR(20),
        status              VARCHAR(20) NOT NULL DEFAULT 'draft',
        agent_notes         TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 5. Create indexes if they don't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agentverif_property ON nivaas_agent_verifications (property_id);
      CREATE INDEX IF NOT EXISTS idx_agentverif_agent    ON nivaas_agent_verifications (agent_id);
      CREATE INDEX IF NOT EXISTS idx_agentverif_status   ON nivaas_agent_verifications (status);
    `);

    // 6. Ensure nivaas_audit_logs table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS nivaas_audit_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    UUID REFERENCES nivaas_users(id) ON DELETE SET NULL,
        action      VARCHAR(100) NOT NULL,
        entity      VARCHAR(50),
        entity_id   UUID,
        details     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_actor  ON nivaas_audit_logs (actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON nivaas_audit_logs (entity, entity_id);
    `);

    // 7. Ensure nivaas_verification_logs table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS nivaas_verification_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id  UUID NOT NULL REFERENCES nivaas_properties(id) ON DELETE CASCADE,
        verifier_id  UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,
        action       VARCHAR(50) NOT NULL,
        notes        TEXT,
        report_url   VARCHAR(1000),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_vlog_property ON nivaas_verification_logs (property_id);
    `);

    // 8. Ensure nivaas_notifications table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS nivaas_notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES nivaas_users(id) ON DELETE CASCADE,
        type        VARCHAR(50) NOT NULL,
        title       VARCHAR(255) NOT NULL,
        body        TEXT,
        link        VARCHAR(500),
        is_read     BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user ON nivaas_notifications (user_id);
      CREATE INDEX IF NOT EXISTS idx_notif_read ON nivaas_notifications (user_id, is_read);
    `);

    console.log("✅ Schema initialized: all missing tables (audit logs, verification logs, agent verification) ready");
  } catch (err) {
    console.error("⚠️ Schema extension warning:", err.message);
  }
}

// Test connection on startup
pool.connect()
  .then(async (client) => {
    console.log("✅ PostgreSQL connected to Supabase");
    await initSchemaExtensions(client);
    client.release();
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err.message);
    console.error("   Check DATABASE_URL in server/.env");
  });

export default pgPool;
