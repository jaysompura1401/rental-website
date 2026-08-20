import { Router }  from "express";
import multer      from "multer";
import { v4 as uuidv4 } from "uuid";
import path        from "path";
import pool        from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, IMAGES_BUCKET } from "../lib/supabase.js";

const router = Router();

// ─── Multer — in-memory storage ───────────────────────────────────────────────
// IMPORTANT: We do NOT write to local disk anymore. On Vercel/serverless the
// filesystem is read-only/ephemeral, so files saved to disk vanish between
// requests. Instead we keep the file in memory and stream it straight to
// Supabase Storage, which gives us a permanent public URL.
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
        // First image of the first batch is the cover
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

      // Update cover_image_url on the property with the first/cover image
      const coverUrl = inserted.find(i => i.is_cover)?.url ?? inserted[0]?.url;
      if (coverUrl) {
        await pool.query(
          "UPDATE nivaas_properties SET cover_image_url = ? WHERE id = ?",
          [coverUrl, propertyId]
        );
      }

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

export default router;
