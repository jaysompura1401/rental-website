// ─── One-time migration: local server/uploads/*.jpg → Supabase Storage ───────
// Run this LOCALLY (where server/uploads/ still has the old files) after:
//   1. Creating a Public bucket in Supabase Dashboard → Storage (default name:
//      "property-images", or set SUPABASE_STORAGE_BUCKET in server/.env)
//   2. Filling SUPABASE_SERVICE_ROLE_KEY in server/.env
//
// Usage:  node server/scripts/migrate-images-to-supabase.js
//
// For every row in nivaas_property_images whose storage_path points to a file
// that still exists in server/uploads/, this uploads that file to Supabase
// Storage and updates the row's `url` + `storage_path` to the new location.
// Rows whose local file is missing are skipped and reported at the end.

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";
import { supabaseAdmin, IMAGES_BUCKET } from "../lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function main() {
  const [rows] = await pool.query(
    "SELECT id, property_id, storage_path FROM nivaas_property_images"
  );

  console.log(`Found ${rows.length} image rows in DB.`);

  let migrated = 0;
  let skippedMissing = 0;
  let skippedAlready = 0;

  for (const row of rows) {
    const { id, property_id, storage_path } = row;

    if (!storage_path) { skippedMissing++; continue; }

    // Already migrated (path contains a "/", i.e. "propertyId/uuid.ext")
    if (storage_path.includes("/")) { skippedAlready++; continue; }

    const localPath = path.join(UPLOADS_DIR, storage_path);
    if (!fs.existsSync(localPath)) {
      console.warn(`  ⚠️  Missing local file for image ${id}: ${storage_path}`);
      skippedMissing++;
      continue;
    }

    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(storage_path).toLowerCase() || ".jpg";
    const objectPath = `${property_id}/${id}${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(IMAGES_BUCKET)
      .upload(objectPath, buffer, {
        contentType: guessContentType(storage_path),
        upsert: true,
      });

    if (uploadErr) {
      console.error(`  ❌ Upload failed for ${id}: ${uploadErr.message}`);
      continue;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(IMAGES_BUCKET)
      .getPublicUrl(objectPath);

    await pool.query(
      "UPDATE nivaas_property_images SET url = ?, storage_path = ? WHERE id = ?",
      [publicUrl, objectPath, id]
    );

    console.log(`  ✅ Migrated ${storage_path} → ${objectPath}`);
    migrated++;
  }

  console.log("\n─── Done ───");
  console.log(`Migrated:        ${migrated}`);
  console.log(`Already done:    ${skippedAlready}`);
  console.log(`Skipped/missing: ${skippedMissing}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
