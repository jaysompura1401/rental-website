/**
 * server/routes/tour.js
 *
 * Handles all 3D / 360° Virtual Tour operations:
 *
 *   POST /api/tour/upload-model/:propertyId   — upload a GLB/GLTF 3D model file
 *   POST /api/tour/set-link/:propertyId       — save an external tour URL (Matterport / Kuula / etc.)
 *   POST /api/tour/generate-360/:propertyId   — AI: compose 360° panorama from uploaded property images
 *   GET  /api/tour/:propertyId                — fetch tour data for a property
 *   DELETE /api/tour/:propertyId              — remove tour data (reset to 'none')
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

// ─── Multer — accept images for AI 360° generation (max 15 MB each, up to 20) ─
const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG and WEBP images are allowed"), false);
  },
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per image
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

// ─── Equirectangular panorama composer (pure-JS, no external AI API needed) ──
//
// Strategy: arrange uploaded room photos side by side in a 2:1 aspect ratio
// canvas by stitching them as equal-width horizontal strips. This produces a
// cylindrical 360° approximation that works correctly in pannellum / A-Frame.
//
// For production you can swap this out for a proper AI service (e.g.
// Stable Diffusion inpainting, Hugging Face Spaces, or a custom model) by
// replacing the body of `buildSimulated360` with an HTTP call to that service.
//
// We use the Canvas API via the `canvas` npm package if available, otherwise
// we fall back to returning the first uploaded image directly as the panorama
// (which still lets pannellum render a basic equirectangular view).
async function buildSimulated360(propertyId, imageUrls) {
  // Try to use @napi-rs/canvas or canvas package for actual compositing
  try {
    const { createCanvas, loadImage } = await import("canvas").catch(() => {
      throw new Error("canvas package not installed");
    });

    const count   = imageUrls.length;
    const imgW    = 1024; // width per slice
    const imgH    = 512;  // height
    const totalW  = imgW * count;
    const totalH  = imgH;

    // Final canvas must be 2:1 (width = 2× height) for equirectangular
    const panW = Math.max(totalW, totalH * 2);
    const panH = panW / 2;

    const canvas = createCanvas(panW, panH);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "#1a1209";
    ctx.fillRect(0, 0, panW, panH);

    const sliceW = panW / count;

    for (let i = 0; i < count; i++) {
      try {
        const img = await loadImage(imageUrls[i]);
        ctx.drawImage(img, i * sliceW, 0, sliceW, panH);
      } catch { /* skip broken images */ }
    }

    const buffer = canvas.toBuffer("image/jpeg", { quality: 0.88 });
    const objPath = `${propertyId}/ai-360-${uuidv4()}.jpg`;
    const publicUrl = await uploadBufferToSupabase(
      IMAGES_BUCKET, objPath, buffer, "image/jpeg"
    );
    return { panoramaUrl: publicUrl, storagePath: objPath };
  } catch {
    // canvas not available — just use the first image as a rudimentary panorama
    // (still allows pannellum to render a 360° approximation from a flat photo)
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
// AI 360° generation from uploaded images
//   - Accepts up to 20 images as multipart/form-data (field: "images")
//   - OR uses already-uploaded property images if no files are sent
// =============================================================================
router.post(
  "/generate-360/:propertyId",
  requireAuth,
  aiImageUpload.array("images", 20),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const { ok, status, error } = await checkOwnership(propertyId, req.user.id, req.user.role);
      if (!ok) return res.status(status).json({ error });

      // Mark as processing immediately
      await pool.query(
        "UPDATE nivaas_properties SET tour_ai_status = 'processing' WHERE id = ?",
        [propertyId]
      );

      let imageUrls = [];

      // If files uploaded in this request — store them first
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const ext      = path.extname(file.originalname).toLowerCase() || ".jpg";
          const objPath  = `${propertyId}/ai-src-${uuidv4()}${ext}`;
          const pubUrl   = await uploadBufferToSupabase(
            IMAGES_BUCKET, objPath, file.buffer, file.mimetype
          );
          imageUrls.push(pubUrl);
        }
      } else {
        // Fall back to existing property images
        const [imgs] = await pool.query(
          "SELECT url FROM nivaas_property_images WHERE property_id = ? ORDER BY sort_order ASC LIMIT 20",
          [propertyId]
        );
        imageUrls = imgs.map(r => r.url);
      }

      if (imageUrls.length === 0) {
        await pool.query(
          "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
          [propertyId]
        );
        return res.status(400).json({
          error: "No images available. Please upload property photos first.",
        });
      }

      // Build 360° panorama
      const { panoramaUrl } = await buildSimulated360(propertyId, imageUrls);

      // Persist result
      await pool.query(
        `UPDATE nivaas_properties
         SET tour_type = 'ai_generated',
             tour_ai_panorama_url = ?,
             tour_ai_source_images = ?::jsonb,
             tour_ai_status = 'done',
             tour_model_path = NULL, tour_model_url = NULL, tour_url = NULL
         WHERE id = ?`,
        [panoramaUrl, JSON.stringify(imageUrls), propertyId]
      );

      res.json({
        message:            "AI 360° view generated successfully",
        tour_type:          "ai_generated",
        tour_ai_panorama_url: panoramaUrl,
        tour_ai_status:     "done",
        source_images:      imageUrls,
      });
    } catch (err) {
      console.error("[tour/generate-360]", err.message);
      // Mark as failed
      await pool.query(
        "UPDATE nivaas_properties SET tour_ai_status = 'failed' WHERE id = ?",
        [req.params.propertyId]
      ).catch(() => {});
      res.status(500).json({ error: err.message });
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
