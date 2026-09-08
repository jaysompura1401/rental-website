import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// ─── Supabase admin client (server-side only — uses the SERVICE ROLE key) ────
// Used for uploading/deleting files in Supabase Storage.
// NEVER expose the service role key to the frontend — server use only.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === "your_supabase_service_role_key_here") {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY not set in server/.env — image uploads to Supabase Storage will fail.\n" +
    "   Get it from: Supabase Dashboard → Settings → API → service_role key (secret)."
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Bucket name — create this bucket once in Supabase Dashboard → Storage,
// mark it "Public" so uploaded images are viewable via public URL.
export const IMAGES_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "property-images";
