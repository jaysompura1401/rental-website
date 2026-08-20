import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
const allowedOrigins = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:4173",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    if (/\\.vercel\\.app$/.test(origin)) return cb(null, true);
    cb(new Error("CORS: origin not allowed - " + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
import authRouter from "../server/routes/auth.js";
import propertiesRouter from "../server/routes/properties.js";
import savedRouter from "../server/routes/saved.js";
import inquiriesRouter from "../server/routes/inquiries.js";
import messagesRouter from "../server/routes/messages.js";
import agreementsRouter from "../server/routes/agreements.js";
import rentalsRouter from "../server/routes/rentals.js";
import analyticsRouter from "../server/routes/analytics.js";
import uploadRouter from "../server/routes/upload.js";
import mapsRouter from "../server/routes/maps.js";
import complaintsRouter from "../server/routes/complaints.js";
import visitsRouter from "../server/routes/visits.js";
import notificationsRouter from "../server/routes/notifications.js";
import documentsRouter from "../server/routes/documents.js";
import pricingRouter from "../server/routes/pricing.js";
import verificationRouter from "../server/routes/verification.js";
import adminRouter from "../server/routes/admin.js";

app.use("/api/auth", authRouter);
app.use("/api/properties", propertiesRouter);
app.use("/api/saved", savedRouter);
app.use("/api/inquiries", inquiriesRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/agreements", agreementsRouter);
app.use("/api/rentals", rentalsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/maps", mapsRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api/visits", visitsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/admin", adminRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    db: "supabase/postgresql",
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;
