/**
 * server/routes/tour.js
 *
 * Handles all 3D / 360° Virtual Tour operations:
 *
 *   POST /api/tour/upload-model/:propertyId   — upload a GLB/GLTF 3D model file
 *   POST /api/tour/set-link/:propertyId       — save an external tour URL (Matterport / Kuula / etc.)
 *   POST /api/tour/generate-360/:propertyId   — store a pre-stitched panorama (from browser canvas)
 *                                               or fall back to server-side stitching if needed
 *   GET  /api/tour/:propertyId                — fetch tour data for a property
 *   DELETE /api/tour/:propertyId              — remove tour data (reset to 'none')
 *
 * generate-360 accepts multipart/form-data with these fields:
 *   panorama   (single file)  — pre-stitched 2:1 equirectangular JPEG from browser canvas (preferred)
 *   images[]   (array)        — raw directional source images (legacy / fallback path)
 *   directions (JSON string)  — optional metadata: [{slot, label, angle}] for each source image
 */

import { Router }       from "express";
import multer           from "multer";
import path             from "path";
import { v4 as uuidv4 } from "uuid";
import pool             from "../db.js";
import { requireAuth }  from "../middleware/auth.js";
import { supabaseAdmin, IMAGES_BUCKET } from "../lib/supabase.js";

const router = Router();

// ─── Multer — accept GLB / GLTF model files (in-memory, max 150 MB) ──────────
const modelUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "model/gltf-binary",          // .glb
      "model/gltf+json",            // .gltf
      "application/octet-stream",   // .glb sent by some browsers
      "application/json",           // .gltf sent by some browsers
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ext === ".glb" || ext === ".gltf") {
      return cb(null, true);
    }
    cb(new Error("Only GLB and GLTF 3D model files are allowed"), false);
  },
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB
});

// ─── Multer — accept images for 360° generation ───────────────────────────────
// Handles two fields:
//   "panorama" — single pre-stitched 2:1 JPEG from browser canvas (max 25 MB)
//   "images"   — up to 20 raw directional source images (max 15 MB each)
const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG and WEBP images are allowed"), false);
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — large enough for a pre-stitched 4K panorama
});

// ─── Supabase Storage bucket for 3D models ────────────────────────────────────
const MODELS_BUCKET = process.env.SUPABASE_MODELS_BUCKET || "property-models";

// ─── Helper: verify property ownership ───────────────────────────────────────
async function checkOwnership(propertyId, userId, role) {
  const [rows] = await pool.query(
    "SELECT owner_id FROM nivaas_properties WHERE id = ?",
    [propertyId]
  );
  if (rows.length === 0) return { ok: false, status: 404, error: "Property not found" };
  if (rows[0].owner_id !== userId && role !== "admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

// ─── Helper: upload a buffer to Supabase Storage ──────────────────────────────
async function uploadBufferToSupabase(bucket, objectPath, buffer, mimetype) {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(objectPath);
  return publicUrl;
}

// ─── Helper: delete a file from Supabase Storage (silent failure) ─────────────
async function removeFromSupabase(bucket, storagePath) {
  if (!storagePath) return;
  try {
    await supabaseAdmin.storage.from(bucket).remove([storagePath]);
  } catch (e) {
    console.warn("[tour] Supabase remove error:", e.message);
  }
}

// ─── Panorama storage helper ──────────────────────────────────────────────────
//
// PRIMARY PATH — browser pre-stitched panorama:
//   The browser canvas has already produced a proper 2:1 equirectangular JPEG
//   and sent it as the "panorama" field. We just store it in Supabase.
//
// FALLBACK PATH — server-side stitching:
//   Called when only raw source images are provided (legacy / programmatic use).
//   Tries the `canvas` npm package; if unavailable, falls back to the first
//   image so the viewer always has something to render.
//
async function storePanorama(propertyId, panoramaBuffer, mimetype) {
  const objPath   = `${propertyId}/panorama-360-${uuidv4()}.jpg`;
  const publicUrl = await uploadBufferToSupabase(IMAGES_BUCKET, objPath, panoramaBuffer, mimetype);
  return { panoramaUrl: publicUrl, storagePath: objPath };
}

async function buildSimulated360(propertyId, imageUrls, directions) {
  // directions: optional [{slot, label, angle}] — used for angular placement when stitching
  try {
    const { createCanvas, loadImage } = await import("canvas").catch(() => {
      throw new Error("canvas package not installed");
    });

    const count  = imageUrls.length;
    const PAN_W  = 4096;
    const PAN_H  = 2048;

    const canvas = createCanvas(PAN_W, PAN_H);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "#1a1209";
    ctx.fillRect(0, 0, PAN_W, PAN_H);

    // If we have direction metadata, place each image at its angular position.
    // Otherwise fall back to equal-width horizontal strips.
    if (directions && directions.length === imageUrls.length) {
      // Sort by angle
      const sorted = imageUrls
        .map((url, i) => ({ url, angle: Number(directions[i]?.angle ?? i * (360 / count)) }))
        .sort((a, b) => a.angle - b.angle);

      for (let i = 0; i < sorted.length; i++) {
        const { url, angle } = sorted[i];
        const nextAngle = sorted[(i + 1) % sorted.length].angle + (i === sorted.length - 1 ? 360 : 0);
        const gapBefore = (angle - (sorted[(i - 1 + sorted.length) % sorted.length].angle + (i === 0 ? -360 : 0) + 360)) % 360;
        const gapAfter  = (nextAngle - angle + 360) % 360;

        const startAngle = (angle - gapBefore / 2 + 360) % 360;
        const endAngle   = (angle + gapAfter  / 2 + 360) % 360;
        const startX     = Math.round((startAngle / 360) * PAN_W);
        let   destW      = Math.round(((endAngle - startAngle + 360) % 360 / 360) * PAN_W);
        if (destW <= 0) destW = Math.round(PAN_W / count);

        try {
          const img = await loadImage(url);
          if (startX + destW <= PAN_W) {
            ctx.drawImage(img, startX, 0, destW, PAN_H);
          } else {
            const part1W = PAN_W - startX;
            const part2W = destW - part1W;
            const frac   = part1W / destW;
            ctx.drawImage(img, 0, 0, Math.round(img.width * frac), img.height, startX, 0, part1W, PAN_H);
            ctx.drawImage(img, Math.round(img.width * frac), 0, img.width - Math.round(img.width * frac), img.height, 0, 0, part2W, PAN_H);
          }
        } catch { /* skip unloadable images */ }
      }
    } else {
      // Equal-width strips fallback
      const sliceW = PAN_W / count;
      for (let i = 0; i < count; i++) {
        try {
          const img = await loadImage(imageUrls[i]);
          ctx.drawImage(img, i * sliceW, 0, sliceW, PAN_H);
        } catch { /* skip */ }
      }
    }

    const buffer    = canvas.toBuffer("image/jpeg", { quality: 0.88 });
    const objPath   = `${propertyId}/panorama-360-${uuidv4()}.jpg`;
    const publicUrl = await uploadBufferToSupabase(IMAGES_BUCKET, objPath, buffer, "image/jpeg");
    return { panoramaUrl: publicUrl, storagePath: objPath };
  } catch {
    // canvas not available — use first image directly; the equirectangular
    // viewer in PanoramaViewer handles any image by scrolling it as a cylinder
    return { panoramaUrl: imageUrls[0], storagePath: null };
  }
}

// =============================================================================
// POST /api/tour/upload-model/:propertyId
// Upload a GLB/GLTF 3D model file → store in Supabase Storage
// =============================================================================
router.post(
  "/upload-model/:propertyId",
  requireAuth,
  modelUpload.single("model"),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const { ok, status, error } = await checkOwnership(propertyId, req.user.id, req.user.role);
      if (!ok) return res.status(status).json({ error });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No model file uploaded" });

      const ext       = path.extname(file.originalname).toLowerCase() || ".glb";
      const objPath   = `${propertyId}/${uuidv4()}${ext}`;
      const publicUrl = await uploadBufferToSupabase(
        MODELS_BUCKET, objPath, file.buffer, file.mimetype || "application/octet-stream"
      );

      // Remove old model from storage if one exists
      const [[prev]] = await pool.query(
        "SELECT tour_model_path FROM nivaas_properties WHERE id = ?",
        [propertyId]
      );
      if (prev?.tour_model_path) {
        await removeFromSupabase(MODELS_BUCKET, prev.tour_model_path);
      }

      await pool.query(
        `UPDATE nivaas_properties
         SET tour_type = 'model', tour_model_path = ?, tour_model_url = ?,
             tour_url = NULL, tour_ai_panorama_url = NULL, tour_ai_status = 'pending'
         WHERE id = ?`,
        [objPath, publicUrl, propertyId]
      );

      res.status(201).json({
        message: "3D model uploaded successfully",
        tour_type: "model",
        tour_model_url: publicUrl,
      });
    } catch (err) {
      console.error("[tour/upload-model]", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// =============================================================================
// POST /api/tour/set-link/:propertyId
// Save an external 3D tour URL (Matterport / Kuula / etc.)
// =============================================================================
router.post("/set-link/:propertyId", requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { ok, status, error } = await checkOwnership(propertyId, req.user.id, req.user.role);
    if (!ok) return res.status(status).json({ error });

    const { tour_url } = req.body;
    if (!tour_url || typeof tour_url !== "string" || !tour_url.trim()) {
      return res.status(400).json({ error: "tour_url is required" });
    }

    // Basic URL validation
    try { new URL(tour_url.trim()); } catch {
      return res.status(400).json({ error: "Invalid tour_url — must be a valid HTTPS URL" });
    }

    await pool.query(
      `UPDATE nivaas_properties
       SET tour_type = 'link', tour_url = ?,
           tour_model_path = NULL, tour_model_url = NULL,
           tour_ai_panorama_url = NULL, tour_ai_status = 'pending'
       WHERE id = ?`,
      [tour_url.trim(), propertyId]
    );

    res.json({ message: "Tour link saved", tour_type: "link", tour_url: tour_url.trim() });
  } catch (err) {
    console.error("[tour/set-link]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /api/tour/generate-360/:propertyId
// Store a 360° panorama for a property.
//
// Preferred flow (browser canvas pre-stitched):
//   multipart field "panorama" — single pre-stitched 2:1 JPEG from browser
//   multipart field "images[]" — raw source images for server-side logging
//   body field   "directions"  — JSON string [{slot, label, angle}]
//
// Legacy / fallback flow (server stitches):
//   multipart field "images[]" — raw directional images, stitched server-side
//   body field   "directions"  — optional JSON string [{slot, label, angle}]
//
// Image validation (server side):
//   • File must be JPG/PNG/WEBP (enforced by multer fileFilter)
//   • Panorama file must be > 1 KB
//   • At least 1 source image or 1 panorama required
// =============================================================================
router.post(
  "/generate-360/:propertyId",
  requireAuth,
  aiImageUpload.fields([
    { name: "panorama", maxCount: 1  },   // pre-stitched panorama from browser
    { name: "images",   maxCount: 20 },   // raw source images (legacy or supplementary)
  ]),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const { ok, status, error } = await checkOwnership(propertyId, req.user.id, req.user.role);
      if (!ok) return res.status(status).json({ error });

      // Parse optional directions metadata
      let directions = null;
      if (req.body?.directions) {
        try {
          directions = JSON.parse(req.body.directions);
          if (!Array.isArray(directions)) directions = null;
        } catch {
          // Malformed JSON — ignore, proceed without direction metadata
          console.warn("[tour/generate-360] Could not parse directions metadata");
        }
      }

      // Mark as processing
      await pool.query(
        "UPDATE nivaas_properties SET tour_ai_status = 'processing' WHERE id = ?",
        [propertyId]
      );

      const files = req.files ?? {};
      const panoramaFiles = files["panorama"] ?? [];
      const sourceFiles   = files["images"]   ?? [];

      console.log(`[tour/generate-360] propertyId=${propertyId} panoramaFiles=${panoramaFiles.length} sourceFiles=${sourceFiles.length} panoramaSize=${panoramaFiles[0]?.size ?? 0}`);

      let panoramaUrl  = null;
      let sourceImages = [];   // public URLs of source images stored in Supabase

      // ── Path A: pre-stitched panorama blob from browser canvas ────────────
      if (panoramaFiles.length > 0) {
        const panoFile = panoramaFiles[0];

        // Basic size sanity check — reject suspiciously small files
        if (panoFile.size < 1024) {
          await pool.query(
            "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
            [propertyId]
          );
          return res.status(400).json({ error: "Panorama file is too small — it may be corrupt" });
        }

        // Store the pre-stitched panorama
        const result = await storePanorama(propertyId, panoFile.buffer, panoFile.mimetype || "image/jpeg");
        panoramaUrl = result.panoramaUrl;
        console.log(`[tour/generate-360] Path A — panorama stored: ${panoramaUrl}`);

        // Also store source images for reference (best-effort, non-blocking)
        for (const srcFile of sourceFiles) {
          try {
            const ext     = path.extname(srcFile.originalname).toLowerCase() || ".jpg";
            const objPath = `${propertyId}/360-src-${uuidv4()}${ext}`;
            const pubUrl  = await uploadBufferToSupabase(IMAGES_BUCKET, objPath, srcFile.buffer, srcFile.mimetype);
            sourceImages.push(pubUrl);
          } catch (e) {
            console.warn("[tour/generate-360] Could not store source image:", e.message);
          }
        }
      }

      // ── Path B: server-side stitching (legacy / fallback) ─────────────────
      else if (sourceFiles.length > 0) {
        // Upload source files to Supabase first
        for (const srcFile of sourceFiles) {
          const ext     = path.extname(srcFile.originalname).toLowerCase() || ".jpg";
          const objPath = `${propertyId}/360-src-${uuidv4()}${ext}`;
          const pubUrl  = await uploadBufferToSupabase(IMAGES_BUCKET, objPath, srcFile.buffer, srcFile.mimetype);
          sourceImages.push(pubUrl);
        }
        const result = await buildSimulated360(propertyId, sourceImages, directions);
        panoramaUrl = result.panoramaUrl;
      }

      // ── Path C: use existing property images ──────────────────────────────
      else {
        const [imgs] = await pool.query(
          "SELECT url FROM nivaas_property_images WHERE property_id = ? ORDER BY sort_order ASC LIMIT 20",
          [propertyId]
        );
        sourceImages = imgs.map(r => r.url);
        if (sourceImages.length === 0) {
          await pool.query(
            "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
            [propertyId]
          );
          return res.status(400).json({
            error: "No images available. Upload wall photos or property images first.",
          });
        }
        const result = await buildSimulated360(propertyId, sourceImages, directions);
        panoramaUrl = result.panoramaUrl;
      }

      if (!panoramaUrl) {
        await pool.query(
          "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
          [propertyId]
        );
        return res.status(500).json({ error: "Panorama generation failed — no output produced" });
      }

      // Persist panorama URL and source image list
      console.log(`[tour/generate-360] Saving to DB — propertyId=${propertyId} panoramaUrl=${panoramaUrl}`);
      await pool.query(
        `UPDATE nivaas_properties
         SET tour_type             = 'ai_generated',
             tour_ai_panorama_url  = ?,
             tour_ai_source_images = ?::jsonb,
             tour_ai_status        = 'done',
             tour_model_path       = NULL,
             tour_model_url        = NULL,
             tour_url              = NULL
         WHERE id = ?`,
        [panoramaUrl, JSON.stringify(sourceImages), propertyId]
      );

      res.json({
        message:              "360° panorama created successfully",
        tour_type:            "ai_generated",
        tour_ai_panorama_url: panoramaUrl,
        tour_ai_status:       "done",
        source_images:        sourceImages,
      });
    } catch (err) {
      console.error("[tour/generate-360]", err.message);
      // Mark as failed — do not expose internal error detail to client
      await pool.query(
        "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
        [req.params.propertyId]
      ).catch(() => {});
      res.status(500).json({ error: "Panorama generation failed. Please retry." });
    }
  }
);

// =============================================================================
// GET /api/tour/:propertyId
// Public — fetch tour data (no auth required)
// =============================================================================
router.get("/:propertyId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tour_type, tour_url, tour_model_url, tour_model_path,
              tour_ai_panorama_url, tour_ai_source_images, tour_ai_status
       FROM nivaas_properties WHERE id = ?`,
      [req.params.propertyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Property not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// DELETE /api/tour/:propertyId
// Owner resets tour data back to 'none'
// =============================================================================
router.delete("/:propertyId", requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { ok, status, error } = await checkOwnership(propertyId, req.user.id, req.user.role);
    if (!ok) return res.status(status).json({ error });

    // Clean up model file from storage if present
    const [[prev]] = await pool.query(
      "SELECT tour_model_path FROM nivaas_properties WHERE id = ?",
      [propertyId]
    );
    if (prev?.tour_model_path) {
      await removeFromSupabase(MODELS_BUCKET, prev.tour_model_path);
    }

    await pool.query(
      `UPDATE nivaas_properties
       SET tour_type = 'none', tour_url = NULL, tour_model_path = NULL,
           tour_model_url = NULL, tour_ai_panorama_url = NULL,
           tour_ai_source_images = '[]'::jsonb, tour_ai_status = 'pending'
       WHERE id = ?`,
      [propertyId]
    );

    res.json({ message: "Tour removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
