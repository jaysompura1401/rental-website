import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ─── MySQL Connection Pool ─────────────────────────────────────────────────────
const poolConfig = process.env.MYSQL_URL
  ? {
      uri: process.env.MYSQL_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
    }
  : {
      host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
      user: process.env.MYSQLUSER || process.env.DB_USER || "root",
      password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
      database: process.env.MYSQLDATABASE || process.env.DB_NAME || "nivaas",
      port: Number(process.env.MYSQLPORT || process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
    };

const pool = mysql.createPool(poolConfig);

pool._pool = pool; // compatibility alias

// ─── Helper: add column if it doesn't already exist ───────────────────────────
async function addColumnIfNotExists(conn, table, column, definition) {
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (cols.length === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  + Added column \`${table}\`.\`${column}\``);
    }
  } catch (err) {
    console.warn(`  Warning adding column ${table}.${column}:`, err.message);
  }
}

// ─── Auto-initialize schema extensions for MySQL ──────────────────────────────
async function initSchemaExtensions() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Ensure nivaas_properties has all required columns
    await addColumnIfNotExists(conn, "nivaas_properties", "verification_status", "VARCHAR(20) DEFAULT 'pending'");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_type", "VARCHAR(50) DEFAULT 'none'");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_url", "VARCHAR(2000) DEFAULT NULL");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_model_path", "VARCHAR(1000) DEFAULT NULL");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_model_url", "VARCHAR(2000) DEFAULT NULL");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_ai_panorama_url", "VARCHAR(2000) DEFAULT NULL");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_ai_source_images", "JSON DEFAULT NULL");
    await addColumnIfNotExists(conn, "nivaas_properties", "tour_ai_status", "VARCHAR(50) DEFAULT 'pending'");
    await addColumnIfNotExists(conn, "nivaas_properties", "panorama_360_url", "VARCHAR(2000) DEFAULT NULL");

    // 2. Ensure nivaas_agent_verifications table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_agent_verifications\` (
        \`id\`                  CHAR(36) NOT NULL DEFAULT (UUID()),
        \`property_id\`         CHAR(36) NOT NULL,
        \`agent_id\`            CHAR(36) NOT NULL,
        \`owner_id\`            CHAR(36) NOT NULL,
        \`aadhaar_card_url\`    VARCHAR(1000) DEFAULT NULL,
        \`utility_bill_url\`    VARCHAR(1000) DEFAULT NULL,
        \`owner_photo_url\`     VARCHAR(1000) DEFAULT NULL,
        \`property_photo_urls\` JSON DEFAULT NULL,
        \`mobile_verified\`     TINYINT(1) NOT NULL DEFAULT 0,
        \`verified_phone\`      VARCHAR(20) DEFAULT NULL,
        \`status\`              VARCHAR(20) NOT NULL DEFAULT 'draft',
        \`agent_notes\`         TEXT DEFAULT NULL,
        \`created_at\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_agentverif_property\` (\`property_id\`),
        KEY \`idx_agentverif_agent\` (\`agent_id\`),
        KEY \`idx_agentverif_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Ensure nivaas_audit_logs table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_audit_logs\` (
        \`id\`          CHAR(36) NOT NULL DEFAULT (UUID()),
        \`actor_id\`    CHAR(36) DEFAULT NULL,
        \`action\`      VARCHAR(100) NOT NULL,
        \`entity\`      VARCHAR(50) DEFAULT NULL,
        \`entity_id\`   CHAR(36) DEFAULT NULL,
        \`details\`     JSON DEFAULT NULL,
        \`created_at\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_audit_actor\` (\`actor_id\`),
        KEY \`idx_audit_entity\` (\`entity\`, \`entity_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Ensure nivaas_verification_logs table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_verification_logs\` (
        \`id\`           CHAR(36) NOT NULL DEFAULT (UUID()),
        \`property_id\`  CHAR(36) NOT NULL,
        \`verifier_id\`  CHAR(36) NOT NULL,
        \`action\`       VARCHAR(50) NOT NULL,
        \`notes\`        TEXT DEFAULT NULL,
        \`report_url\`   VARCHAR(1000) DEFAULT NULL,
        \`created_at\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_vlog_property\` (\`property_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Ensure nivaas_notifications table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_notifications\` (
        \`id\`          CHAR(36) NOT NULL DEFAULT (UUID()),
        \`user_id\`     CHAR(36) NOT NULL,
        \`type\`        VARCHAR(50) NOT NULL,
        \`title\`       VARCHAR(255) NOT NULL,
        \`body\`        TEXT DEFAULT NULL,
        \`link\`        VARCHAR(500) DEFAULT NULL,
        \`is_read\`     TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_notif_user\` (\`user_id\`),
        KEY \`idx_notif_read\` (\`user_id\`, \`is_read\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Ensure nivaas_popup_leads table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_popup_leads\` (
        \`id\`           CHAR(36) NOT NULL DEFAULT (UUID()),
        \`full_name\`    VARCHAR(255) NOT NULL,
        \`phone\`        VARCHAR(30)  NOT NULL,
        \`listing_type\` VARCHAR(50)  DEFAULT NULL,
        \`created_at\`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Ensure nivaas_property_locations table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_property_locations\` (
        \`id\`              CHAR(36) NOT NULL DEFAULT (UUID()),
        \`property_id\`     CHAR(36) NOT NULL,
        \`google_maps_url\` VARCHAR(1000) DEFAULT NULL,
        \`latitude\`        DECIMAL(10, 8) DEFAULT NULL,
        \`longitude\`       DECIMAL(11, 8) DEFAULT NULL,
        \`created_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_property_locations_property_id\` (\`property_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Ensure nivaas_saved_properties table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`nivaas_saved_properties\` (
        \`id\`          CHAR(36) NOT NULL DEFAULT (UUID()),
        \`user_id\`     CHAR(36) NOT NULL,
        \`property_id\` CHAR(36) NOT NULL,
        \`saved_at\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_saved_properties_user_property\` (\`user_id\`, \`property_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("✅ MySQL Schema check & auto-migrations completed");
  } catch (err) {
    console.error("⚠️ Schema extension warning:", err.message);
  } finally {
    if (conn) conn.release();
  }
}

// Test connection on startup
pool.getConnection()
  .then(async (conn) => {
    console.log(`✅ MySQL connected to database "${process.env.DB_NAME || "nivaas"}" at ${process.env.DB_HOST || "localhost"}`);
    conn.release();
    await initSchemaExtensions();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err.message);
    console.error("   Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in server/.env");
  });

export default pool;
