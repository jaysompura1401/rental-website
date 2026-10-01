-- =====================================================================
-- NIVAAS — MySQL Database Update Script (Safe / Idempotent)
-- Import/Run in phpMyAdmin: database "nivaas" -> SQL tab -> Paste & Execute
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ensure 3D Tour & Verification columns on nivaas_properties
ALTER TABLE `nivaas_properties`
  ADD COLUMN IF NOT EXISTS `verification_status` VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS `tour_type` VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS `tour_url` VARCHAR(2000) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tour_model_path` VARCHAR(1000) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tour_model_url` VARCHAR(2000) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tour_ai_panorama_url` VARCHAR(2000) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tour_ai_source_images` JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tour_ai_status` VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS `panorama_360_url` VARCHAR(2000) DEFAULT NULL;

-- 2. Agent Verifications table
CREATE TABLE IF NOT EXISTS `nivaas_agent_verifications` (
  `id`                  CHAR(36) NOT NULL DEFAULT (UUID()),
  `property_id`         CHAR(36) NOT NULL,
  `agent_id`            CHAR(36) NOT NULL,
  `owner_id`            CHAR(36) NOT NULL,
  `aadhaar_card_url`    VARCHAR(1000) DEFAULT NULL,
  `utility_bill_url`    VARCHAR(1000) DEFAULT NULL,
  `owner_photo_url`     VARCHAR(1000) DEFAULT NULL,
  `property_photo_urls` JSON DEFAULT NULL,
  `mobile_verified`     TINYINT(1) NOT NULL DEFAULT 0,
  `verified_phone`      VARCHAR(20) DEFAULT NULL,
  `status`              VARCHAR(20) NOT NULL DEFAULT 'draft',
  `agent_notes`         TEXT DEFAULT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_agentverif_property` (`property_id`),
  KEY `idx_agentverif_agent` (`agent_id`),
  KEY `idx_agentverif_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Audit Logs table
CREATE TABLE IF NOT EXISTS `nivaas_audit_logs` (
  `id`          CHAR(36) NOT NULL DEFAULT (UUID()),
  `actor_id`    CHAR(36) DEFAULT NULL,
  `action`      VARCHAR(100) NOT NULL,
  `entity`      VARCHAR(50) DEFAULT NULL,
  `entity_id`   CHAR(36) DEFAULT NULL,
  `details`     JSON DEFAULT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor` (`actor_id`),
  KEY `idx_audit_entity` (`entity`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Verification Logs table
CREATE TABLE IF NOT EXISTS `nivaas_verification_logs` (
  `id`           CHAR(36) NOT NULL DEFAULT (UUID()),
  `property_id`  CHAR(36) NOT NULL,
  `verifier_id`  CHAR(36) NOT NULL,
  `action`       VARCHAR(50) NOT NULL,
  `notes`        TEXT DEFAULT NULL,
  `report_url`   VARCHAR(1000) DEFAULT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vlog_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Notifications table
CREATE TABLE IF NOT EXISTS `nivaas_notifications` (
  `id`          CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id`     CHAR(36) NOT NULL,
  `type`        VARCHAR(50) NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `body`        TEXT DEFAULT NULL,
  `link`        VARCHAR(500) DEFAULT NULL,
  `is_read`     TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`),
  KEY `idx_notif_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Popup Leads table
CREATE TABLE IF NOT EXISTS `nivaas_popup_leads` (
  `id`           CHAR(36) NOT NULL DEFAULT (UUID()),
  `full_name`    VARCHAR(255) NOT NULL,
  `phone`        VARCHAR(30)  NOT NULL,
  `listing_type` VARCHAR(50)  DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Property Locations table
CREATE TABLE IF NOT EXISTS `nivaas_property_locations` (
  `id`              CHAR(36) NOT NULL DEFAULT (UUID()),
  `property_id`     CHAR(36) NOT NULL,
  `google_maps_url` VARCHAR(1000) DEFAULT NULL,
  `latitude`        DECIMAL(10, 8) DEFAULT NULL,
  `longitude`       DECIMAL(11, 8) DEFAULT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_property_locations_property_id` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Saved Properties table
CREATE TABLE IF NOT EXISTS `nivaas_saved_properties` (
  `id`          CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id`     CHAR(36) NOT NULL,
  `property_id` CHAR(36) NOT NULL,
  `saved_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saved_properties_user_property` (`user_id`, `property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Nivaas MySQL Schema update script finished successfully!' AS status;
