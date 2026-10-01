import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ── Ensure the table exists ──────────────────────────────────────────────────
async function ensureLeadsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nivaas_popup_leads (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name    VARCHAR(255) NOT NULL,
      phone        VARCHAR(30)  NOT NULL,
      listing_type VARCHAR(50),
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);
}
ensureLeadsTable().catch((e) =>
  console.error("⚠️  nivaas_popup_leads table init failed:", e.message)
);

// POST /api/leads — save a popup lead (public, no auth required)
router.post("/", async (req, res) => {
  try {
    const { full_name, phone, listing_type } = req.body;

    if (!full_name || !full_name.trim())
      return res.status(400).json({ error: "full_name is required" });
    if (!phone || !phone.trim())
      return res.status(400).json({ error: "phone is required" });

    const [rows] = await pool.query(
      `INSERT INTO nivaas_popup_leads (full_name, phone, listing_type)
       VALUES (?, ?, ?) RETURNING id, created_at`,
      [full_name.trim(), phone.trim(), listing_type?.trim() || null]
    );

    res.status(201).json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("POST /api/leads error:", err.message);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

// GET /api/leads — list all leads (for admin use)
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM nivaas_popup_leads ORDER BY created_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
