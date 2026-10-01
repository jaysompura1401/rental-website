import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createNotification } from "../lib/notifications.js";
import { supabaseAdmin, IMAGES_BUCKET } from "../lib/supabase.js";
import { sendSmsOtp } from "../lib/sendOtp.js";

const router = Router();

// ─── Agent-only guard ─────────────────────────────────────────────────────────
function agentOnly(req, res, next) {
  if (!["agent", "admin", "verification_team"].includes(req.user.role)) {
    return res.status(403).json({ error: "Agent access required" });
  }
  next();
}

// ─── Multer — in-memory storage ───────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, WEBP and PDF files are allowed"), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// ─── Helper: upload one file buffer to Supabase Storage ──────────────────────
async function uploadVerificationDoc(propertyId, file, docType) {
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const objectPath = `verification-docs/${propertyId}/${docType}-${uuidv4()}${ext}`;

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

  return publicUrl;
}

// ─── In-memory OTP store for agent verification ──────────────────────────────
const agentOtpStore = new Map();

function generateOTP() {
  // TEMPORARY FIXED OTP — change to random in production
  return "123456";
}

// ─── GET /api/agent-verification/pending-properties ──────────────────────────
// List all properties awaiting agent verification
router.get("/pending-properties", requireAuth, agentOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.property_type, p.listing_type, p.city, p.locality,
              p.address, p.pincode, p.bedrooms, p.area_sqft, p.price, p.status,
              COALESCE(p.verification_status, 'pending') AS verification_status,
              p.cover_image_url, p.created_at,
              u.id AS owner_id, u.full_name AS owner_name, u.phone AS owner_phone,
              u.email AS owner_email, u.avatar_url AS owner_avatar,
              av.id AS verification_id, av.status AS agent_verification_status
       FROM nivaas_properties p
       JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_agent_verifications av ON av.property_id = p.id
       WHERE (p.verified = false OR p.verified IS NULL OR p.verification_status IS NULL OR p.verification_status IN ('pending', 'unverified', 'draft'))
         AND (p.verification_status != 'verified' OR p.verification_status IS NULL)
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent-verification/:propertyId ─────────────────────────────────
// Get existing verification record for a property
router.get("/:propertyId", requireAuth, agentOnly, async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Get property + owner info
    const [propRows] = await pool.query(
      `SELECT p.*, u.full_name AS owner_name, u.phone AS owner_phone,
              u.email AS owner_email, u.avatar_url AS owner_avatar
       FROM nivaas_properties p
       JOIN nivaas_users u ON u.id = p.owner_id
       WHERE p.id = ?`,
      [propertyId]
    );
    if (!propRows.length) return res.status(404).json({ error: "Property not found" });

    // Get existing verification record (if any)
    const [verifRows] = await pool.query(
      `SELECT * FROM nivaas_agent_verifications WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`,
      [propertyId]
    );

    res.json({
      property: propRows[0],
      verification: verifRows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent-verification/upload-doc/:propertyId ─────────────────────
// Upload a single verification document (aadhaar, utility_bill, owner_photo)
router.post(
  "/upload-doc/:propertyId",
  requireAuth,
  agentOnly,
  upload.single("document"),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const { doc_type } = req.body; // "aadhaar_card" | "utility_bill" | "owner_photo"
      const file = req.file;

      if (!file) return res.status(400).json({ error: "File is required" });
      if (!["aadhaar_card", "utility_bill", "owner_photo"].includes(doc_type)) {
        return res.status(400).json({ error: "Invalid doc_type. Use: aadhaar_card, utility_bill, owner_photo" });
      }

      // Verify property exists
      const [propRows] = await pool.query(
        "SELECT owner_id FROM nivaas_properties WHERE id = ?",
        [propertyId]
      );
      if (!propRows.length) return res.status(404).json({ error: "Property not found" });

      // Upload to Supabase
      const url = await uploadVerificationDoc(propertyId, file, doc_type);

      // Upsert verification record
      const [existing] = await pool.query(
        "SELECT id FROM nivaas_agent_verifications WHERE property_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1",
        [propertyId, req.user.id]
      );

      const columnName = `${doc_type}_url`;

      if (existing.length) {
        await pool.query(
          `UPDATE nivaas_agent_verifications SET ${columnName} = ?, updated_at = NOW() WHERE id = ?`,
          [url, existing[0].id]
        );
      } else {
        const id = uuidv4();
        await pool.query(
          `INSERT INTO nivaas_agent_verifications (id, property_id, agent_id, owner_id, ${columnName})
           VALUES (?, ?, ?, ?, ?)`,
          [id, propertyId, req.user.id, propRows[0].owner_id, url]
        );
      }

      res.json({ url, doc_type, message: "Document uploaded successfully" });
    } catch (err) {
      console.error("Agent doc upload error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── POST /api/agent-verification/upload-property-photos/:propertyId ─────────
// Upload multiple property verification photos
router.post(
  "/upload-property-photos/:propertyId",
  requireAuth,
  agentOnly,
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one photo is required" });
      }

      // Verify property exists
      const [propRows] = await pool.query(
        "SELECT owner_id FROM nivaas_properties WHERE id = ?",
        [propertyId]
      );
      if (!propRows.length) return res.status(404).json({ error: "Property not found" });

      // Upload all photos
      const urls = [];
      for (const file of files) {
        const url = await uploadVerificationDoc(propertyId, file, "property_photo");
        urls.push(url);
      }

      // Upsert verification record
      const [existing] = await pool.query(
        "SELECT id, property_photo_urls FROM nivaas_agent_verifications WHERE property_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1",
        [propertyId, req.user.id]
      );

      if (existing.length) {
        // Merge with existing photos
        const existingPhotos = existing[0].property_photo_urls || [];
        const allPhotos = [...existingPhotos, ...urls];
        await pool.query(
          "UPDATE nivaas_agent_verifications SET property_photo_urls = ?::jsonb, updated_at = NOW() WHERE id = ?",
          [JSON.stringify(allPhotos), existing[0].id]
        );
      } else {
        const id = uuidv4();
        await pool.query(
          `INSERT INTO nivaas_agent_verifications (id, property_id, agent_id, owner_id, property_photo_urls)
           VALUES (?, ?, ?, ?, ?::jsonb)`,
          [id, propertyId, req.user.id, propRows[0].owner_id, JSON.stringify(urls)]
        );
      }

      res.json({ urls, count: urls.length, message: "Property photos uploaded" });
    } catch (err) {
      console.error("Agent property photos upload error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── POST /api/agent-verification/send-otp ───────────────────────────────────
// Send OTP to owner's phone for mobile verification
router.post("/send-otp", requireAuth, agentOnly, async (req, res) => {
  try {
    const { phone, property_id } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    const key = `agent_verif_${phone.replace(/\s/g, "")}`;
    agentOtpStore.set(key, { otp, expiresAt, property_id });

    // Send SMS
    await sendSmsOtp(phone, otp);

    res.json({ message: "OTP sent to owner's mobile" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent-verification/verify-otp ─────────────────────────────────
// Verify the OTP entered by the agent (with owner present)
router.post("/verify-otp", requireAuth, agentOnly, async (req, res) => {
  try {
    const { phone, otp, property_id } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });

    const key = `agent_verif_${phone.replace(/\s/g, "")}`;
    const stored = agentOtpStore.get(key);

    if (!stored) return res.status(400).json({ error: "No OTP found. Request a new one." });
    if (Date.now() > stored.expiresAt) {
      agentOtpStore.delete(key);
      return res.status(400).json({ error: "OTP expired. Request a new one." });
    }
    if (stored.otp !== String(otp)) {
      return res.status(400).json({ error: "Incorrect OTP" });
    }

    agentOtpStore.delete(key);

    // Update verification record
    if (property_id) {
      const [existing] = await pool.query(
        "SELECT id FROM nivaas_agent_verifications WHERE property_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1",
        [property_id, req.user.id]
      );

      if (existing.length) {
        await pool.query(
          "UPDATE nivaas_agent_verifications SET mobile_verified = true, verified_phone = ?, updated_at = NOW() WHERE id = ?",
          [phone, existing[0].id]
        );
      } else {
        // Get owner_id from property
        const [propRows] = await pool.query(
          "SELECT owner_id FROM nivaas_properties WHERE id = ?",
          [property_id]
        );
        if (propRows.length) {
          const id = uuidv4();
          await pool.query(
            `INSERT INTO nivaas_agent_verifications (id, property_id, agent_id, owner_id, mobile_verified, verified_phone)
             VALUES (?, ?, ?, ?, true, ?)`,
            [id, property_id, req.user.id, propRows[0].owner_id, phone]
          );
        }
      }
    }

    res.json({ verified: true, message: "Mobile number verified successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent-verification/submit/:propertyId ─────────────────────────
// Submit completed verification — marks property as verified and active
router.post("/submit/:propertyId", requireAuth, agentOnly, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { agent_notes } = req.body;

    // Get verification record
    const [verifRows] = await pool.query(
      "SELECT * FROM nivaas_agent_verifications WHERE property_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1",
      [propertyId, req.user.id]
    );

    if (!verifRows.length) {
      return res.status(400).json({ error: "No verification data found. Please upload documents first." });
    }

    const verif = verifRows[0];

    // Validate all required fields are present
    const missing = [];
    if (!verif.aadhaar_card_url) missing.push("Aadhaar card");
    if (!verif.utility_bill_url) missing.push("Utility bill");
    if (!verif.owner_photo_url) missing.push("Owner photo");
    if (!verif.mobile_verified) missing.push("Mobile verification");
    const photos = verif.property_photo_urls || [];
    if (photos.length === 0) missing.push("Property photos");

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Incomplete verification. Missing: ${missing.join(", ")}`,
        missing,
      });
    }

    // Update verification record status
    await pool.query(
      "UPDATE nivaas_agent_verifications SET status = 'submitted', agent_notes = ?, updated_at = NOW() WHERE id = ?",
      [agent_notes || null, verif.id]
    );

    // Mark property as verified and active
    await pool.query(
      "UPDATE nivaas_properties SET verification_status = 'verified', verified = true, status = 'active' WHERE id = ?",
      [propertyId]
    );

    // Log to verification logs
    await pool.query(
      "INSERT INTO nivaas_verification_logs (id, property_id, verifier_id, action, notes) VALUES (?,?,?,?,?)",
      [uuidv4(), propertyId, req.user.id, "approved", `Agent verification completed. ${agent_notes || ""}`]
    );

    // Get property details for notification
    const [propRows] = await pool.query(
      "SELECT owner_id, title FROM nivaas_properties WHERE id = ?",
      [propertyId]
    );

    if (propRows.length) {
      // Notify owner
      await createNotification(
        propRows[0].owner_id,
        "verification_approved",
        "Property Verified! 🎉",
        `Your property "${propRows[0].title}" has been verified and is now live on Nivaas.`,
        `/dashboard/properties`
      );
    }

    // Audit log
    try {
      await pool.query(
        "INSERT INTO nivaas_audit_logs (id, actor_id, action, entity, entity_id, details) VALUES (?,?,?,?,?,?)",
        [uuidv4(), req.user.id, "agent_verification_submitted", "property", propertyId,
         JSON.stringify({ agent_notes, docs_uploaded: true, mobile_verified: true })]
      );
    } catch (auditErr) {
      console.warn("Audit log warning:", auditErr.message);
    }

    res.json({ message: "Verification submitted successfully. Property is now live!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
