import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadToLocal, removeLocalFile } from "../lib/storage.js";

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

// ─── Helper: ensure panorama_360_url column exists (one-time, silent) ─────────
let _panoramaColumnChecked = false;
async function ensurePanoramaColumn() {
  if (_panoramaColumnChecked) return;
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'nivaas_properties' AND COLUMN_NAME = 'panorama_360_url'`,
      [process.env.DB_NAME || "nivaas"]
    );
    if (cols.length === 0) {
      await pool.query(
        `ALTER TABLE nivaas_properties ADD COLUMN panorama_360_url VARCHAR(2000) DEFAULT NULL`
      );
    }
    _panoramaColumnChecked = true;
  } catch {
    _panoramaColumnChecked = true;
  }
}

// ─── Helper: build & store panorama from property images ──────────────────────
async function updatePanorama(propertyId) {
  try {
    await ensurePanoramaColumn();

    // Get all uploaded images in sort order
    const [imgs] = await pool.query(
      `SELECT url FROM nivaas_property_images
       WHERE property_id = ?
       ORDER BY is_cover DESC, sort_order ASC
       LIMIT 20`,
      [propertyId]
    );

    if (!imgs || imgs.length === 0) return;

    // Use the cover image (first in sort) as the panorama source.
    const panoramaUrl = imgs[0].url;

    await pool.query(
      `UPDATE nivaas_properties SET panorama_360_url = ? WHERE id = ?`,
      [panoramaUrl, propertyId]
    );
  } catch (err) {
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

        const { url, storagePath } = await uploadToLocal(`properties/${propertyId}`, file);

        await pool.query(
          `INSERT INTO nivaas_property_images
             (id, property_id, url, storage_path, is_cover, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, propertyId, url, storagePath, isCover ? 1 : 0, sortOrder]
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

      // Auto-update panorama_360_url
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

    // Delete from local disk
    if (rows[0].storage_path) {
      await removeLocalFile(rows[0].storage_path);
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
       ORDER BY is_cover DESC, sort_order ASC`,
      [req.params.propertyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/upload/panorama/:propertyId ─────────────────────────────────────
router.get("/panorama/:propertyId", async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Priority 1: real AI-generated panorama from generate-360
    let panoramaUrl = null;
    try {
      const [rows] = await pool.query(
        `SELECT tour_ai_panorama_url, panorama_360_url
         FROM nivaas_properties WHERE id = ?`,
        [propertyId]
      );
      if (rows.length > 0) {
        panoramaUrl = rows[0].tour_ai_panorama_url ?? rows[0].panorama_360_url ?? null;
      }
    } catch {
      // columns may not exist — fall through
    }

    // Priority 2: cover image
    if (!panoramaUrl) {
      try {
        const [rows] = await pool.query(
          `SELECT cover_image_url FROM nivaas_properties WHERE id = ? LIMIT 1`,
          [propertyId]
        );
        if (rows.length > 0) panoramaUrl = rows[0].cover_image_url ?? null;
      } catch { /* ignore */ }
    }

    // Priority 3: first uploaded image
    if (!panoramaUrl) {
      const [imgs] = await pool.query(
        "SELECT url FROM nivaas_property_images WHERE property_id = ? ORDER BY sort_order ASC LIMIT 1",
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
