-- =====================================================================
-- Migration 003: Add 3D/360° Virtual Tour fields to nivaas_properties
-- Run once against your Supabase/PostgreSQL database.
-- =====================================================================

-- 1. 3D tour type: none | link | model | ai_generated
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_type VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (tour_type IN ('none', 'link', 'model', 'ai_generated'));

-- 2. External tour embed URL (Matterport, Kuula, etc.)
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_url VARCHAR(2000) DEFAULT NULL;

-- 3. Supabase Storage path for GLB/GLTF model file
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_model_path VARCHAR(1000) DEFAULT NULL;

-- 4. Public URL of the uploaded GLB/GLTF model
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_model_url VARCHAR(2000) DEFAULT NULL;

-- 5. AI-generated 360° equirectangular panorama public URL
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_ai_panorama_url VARCHAR(2000) DEFAULT NULL;

-- 6. JSON array of source image URLs used for AI generation
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_ai_source_images JSONB DEFAULT '[]'::jsonb;

-- 7. AI processing status: pending | processing | done | failed
ALTER TABLE nivaas_properties
  ADD COLUMN IF NOT EXISTS tour_ai_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (tour_ai_status IN ('pending', 'processing', 'done', 'failed'));

-- 8. Optional index to quickly find properties that have a tour
CREATE INDEX IF NOT EXISTS idx_nivaas_properties_tour_type
  ON nivaas_properties (tour_type)
  WHERE tour_type <> 'none';
