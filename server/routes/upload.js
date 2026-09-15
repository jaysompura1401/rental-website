import { Router }  from "express";
import multer      from "multer";
import { v4 as uuidv4 } from "uuid";
import path        from "path";
import pool        from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, IMAGES_BUCKET } from "../lib/supabase.js";

const router = Router();

// ─── Multer — in-memory storage ───────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG and WEBP images are allowed"), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
});

// ─── Helper: upload one file buffer to Supabase Storage, return public URL ───
async function uploadToSupabase(propertyId, file) {
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const objectPath = `${propertyId}/${uuidv4()}${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(IMAGES_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(IMAGES_BUCKET)
    .getPublicUrl(objectPath);

  return { url: publicUrl, storagePath: objectPath };
}

// ─── Helper: ensure panorama_360_url column exists (one-time, silent) ─────────
let _panoramaColumnChecked = false;
async function ensurePanoramaColumn() {
  if (_panoramaColumnChecked) return;
  try {
    await pool.query(
      `ALTER TABLE nivaas_properties ADD COLUMN IF NOT EXISTS panorama_360_url VARCHAR(2000) DEFAULT NULL`
    );
    _panoramaColumnChecked = true;
  } catch {
    // Column may already exist or migration was run — ignore
    _panoramaColumnChecked = true;
  }
}

// ─── Helper: build & store panorama from property images ──────────────────────
// Uses the cover image URL as the panorama source.
// The CSS panorama viewer (background-repeat: repeat-x) creates the 360° effect
// from any single wide image — no stitching library needed.
async function updatePanorama(propertyId) {
  try {
    await ensurePanoramaColumn();

    // Get all uploaded images in sort order
    const [imgs] = await pool.query(
      `SELECT url FROM nivaas_property_images
       WHERE property_id = ?
       ORDER BY (is_cover::int) DESC, sort_order ASC
       LIMIT 20`,
      [propertyId]
    );

    if (!imgs || imgs.length === 0) return;

    // Use the cover image (first in sort) as the panorama source.
    // The CSS viewer tiles it horizontally to simulate a 360° walk.
    const panoramaUrl = imgs[0].url;

    await pool.query(
      `UPDATE nivaas_properties SET panorama_360_url = ? WHERE id = ?`,
      [panoramaUrl, propertyId]
    );
  } catch (err) {
    // Never crash the main upload — panorama is best-effort
    console.warn("[upload] panorama update failed:", err.message);
  }
}

// ─── POST /api/upload/property-images/:propertyId ─────────────────────────────
router.post(
  "/property-images/:propertyId",
  requireAuth,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }

      // Verify property belongs to this owner
      const [propRows] = await pool.query(
        "SELECT owner_id FROM nivaas_properties WHERE id = ?",
        [propertyId]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (propRows[0].owner_id !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      // How many images already exist for this property?
      const [[{ existing }]] = await pool.query(
        "SELECT COUNT(*) AS existing FROM nivaas_property_images WHERE property_id = ?",
        [propertyId]
      );
      const startOrder = Number(existing);

      const inserted = [];

      for (let i = 0; i < files.length; i++) {
        const file      = files[i];
        const id        = uuidv4();
        const sortOrder = startOrder + i;
        const isCover   = startOrder === 0 && i === 0;

        const { url, storagePath } = await uploadToSupabase(propertyId, file);

        await pool.query(
          `INSERT INTO nivaas_property_images
             (id, property_id, url, storage_path, is_cover, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, propertyId, url, storagePath, isCover, sortOrder]
        );

        inserted.push({ id, url, is_cover: isCover, sort_order: sortOrder });
      }

      // Update cover_image_url
      const coverUrl = inserted.find(i => i.is_cover)?.url ?? inserted[0]?.url;
      if (coverUrl) {
        await pool.query(
          "UPDATE nivaas_properties SET cover_image_url = ? WHERE id = ?",
          [coverUrl, propertyId]
        );
      }

      // ── Auto-update panorama_360_url from the uploaded images ──────────────
      // Runs asynchronously — response is not delayed.
      updatePanorama(propertyId);

      res.status(201).json({ images: inserted, count: inserted.length });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── DELETE /api/upload/property-images/:imageId ──────────────────────────────
router.delete("/property-images/:imageId", requireAuth, async (req, res) => {
  try {
    const { imageId } = req.params;

    const [rows] = await pool.query(
      `SELECT pi.*, p.owner_id
       FROM nivaas_property_images pi
       JOIN nivaas_properties p ON p.id = pi.property_id
       WHERE pi.id = ?`,
      [imageId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Image not found" });
    if (rows[0].owner_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Delete from Supabase Storage
    if (rows[0].storage_path) {
      const { error: removeErr } = await supabaseAdmin.storage
        .from(IMAGES_BUCKET)
        .remove([rows[0].storage_path]);
      if (removeErr) console.error("Supabase remove error:", removeErr.message);
    }

    await pool.query("DELETE FROM nivaas_property_images WHERE id = ?", [imageId]);

    // Refresh panorama after deletion
    updatePanorama(rows[0].property_id);

    res.json({ message: "Image deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/upload/property-images/:propertyId ──────────────────────────────
router.get("/property-images/:propertyId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, url, is_cover, sort_order, caption
       FROM nivaas_property_images
       WHERE property_id = ?
       ORDER BY (is_cover::int) DESC, sort_order ASC`,
      [req.params.propertyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/upload/panorama/:propertyId ─────────────────────────────────────
// Returns the best available panorama URL for a property.
// Priority: tour_ai_panorama_url (real stitched 360°) → panorama_360_url
// (cover image auto-set on upload) → cover_image_url → first uploaded image.
// This endpoint is used as a fallback by the property detail page.
router.get("/panorama/:propertyId", async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Priority 1: real AI-generated panorama from generate-360
    let panoramaUrl = null;
    try {
      const [rows] = await pool.query(
        `SELECT tour_ai_panorama_url, panorama_360_url
         FROM nivaas_properties WHERE id = $1`,
        [propertyId]
      );
      if (rows.length > 0) {
        // Prefer the real stitched panorama over the auto-set cover image
        panoramaUrl = rows[0].tour_ai_panorama_url ?? rows[0].panorama_360_url ?? null;
      }
    } catch {
      // columns may not exist — fall through
    }

    // Priority 2: cover image
    if (!panoramaUrl) {
      try {
        const [rows] = await pool.query(
          `SELECT cover_image_url FROM nivaas_properties WHERE id = $1 LIMIT 1`,
          [propertyId]
        );
        if (rows.length > 0) panoramaUrl = rows[0].cover_image_url ?? null;
      } catch { /* ignore */ }
    }

    // Priority 3: first uploaded image
    if (!panoramaUrl) {
      const [imgs] = await pool.query(
        "SELECT url FROM nivaas_property_images WHERE property_id = $1 ORDER BY sort_order ASC LIMIT 1",
        [propertyId]
      );
      if (imgs.length > 0) panoramaUrl = imgs[0].url;
    }

    if (!panoramaUrl) {
      return res.status(404).json({ error: "No images found for this property" });
    }

    res.json({ panorama_url: panoramaUrl, property_id: propertyId });
  } catch (err) {
    console.error("[upload/panorama]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/upload/panorama/:propertyId ────────────────────────────────────
// Manually trigger a panorama refresh for a property (owner only).
router.post("/panorama/:propertyId", requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const [check] = await pool.query(
      "SELECT owner_id FROM nivaas_properties WHERE id = ?",
      [propertyId]
    );
    if (!check.length) return res.status(404).json({ error: "Property not found" });
    if (check[0].owner_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await updatePanorama(propertyId);

    // Return updated URL
    const [rows] = await pool.query(
      "SELECT panorama_360_url FROM nivaas_properties WHERE id = ?",
      [propertyId]
    ).catch(() => [[{ panorama_360_url: null }]]);
    const url = rows?.[0]?.panorama_360_url ?? null;

    res.json({ message: "Panorama updated", panorama_url: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
