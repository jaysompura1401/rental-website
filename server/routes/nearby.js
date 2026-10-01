/**
 * server/routes/nearby.js
 *
 * GET /api/nearby?lat=&lng=&radius=
 *   OR
 * GET /api/nearby?address=New+Ranip,+Ahmedabad&radius=
 *
 * Returns nearby places for a given location using the
 * Google Places Nearby Search API (New) via server-side fetch.
 * The API key never reaches the browser.
 *
 * When lat/lng are not supplied (or are invalid) the endpoint resolves
 * the address string via OpenStreetMap Nominatim at runtime — NO database
 * changes needed. The resulting coordinates are used only in-memory.
 *
 * Accepted query parameters:
 *   lat      – latitude  (preferred)
 *   lng      – longitude (preferred)
 *   address  – free-text address / locality string (fallback)
 *   city     – city name appended to address for better geocoding
 *   radius   – search radius in metres, max 5000 (default 3000)
 *
 * Response shape:
 * {
 *   groups: [
 *     { label: "School / College", icon: "🏫",
 *       items: [{ name, distKm, lat, lng, address, rating, open_now }] }
 *   ],
 *   resolvedLat: number,   // coords actually used (useful for debugging)
 *   resolvedLng: number
 * }
 *
 * Error responses:
 *   400 – lat/lng invalid AND address not provided
 *   422 – address could not be geocoded to coordinates
 *   503 – Google Maps API key not configured on the server
 *   500 – unexpected server error
 */

import { Router } from "express";
import https from "https";

const router = Router();

const GOOGLE_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

// ─── Haversine distance (km) ──────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Lightweight HTTPS GET — returns parsed JSON body ────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Nivaas/1.0",
        "Accept":     "application/json",
      },
    }, res => {
      let body = "";
      res.on("data", c => { body += c; });
      res.on("end", () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ─── Nominatim geocode — address string → { lat, lng } ───────────────────────
// Used at runtime only; result is NEVER written to the database.
async function geocodeAddress(addressParts) {
  const q = addressParts.filter(Boolean).join(", ");
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=in`;
  try {
    const { status, body } = await httpsGet(url);
    if (status !== 200 || !Array.isArray(body) || body.length === 0) return null;
    const la = parseFloat(body[0].lat);
    const lo = parseFloat(body[0].lon);
    if (isNaN(la) || isNaN(lo) || (la === 0 && lo === 0)) return null;
    return { lat: la, lng: lo };
  } catch {
    return null;
  }
}

// ─── Category definitions → Google Places `type` values ──────────────────────
const CATEGORIES = [
  { label: "School / College",  icon: "🏫", types: ["school"] },
  { label: "Hospital / Clinic", icon: "🏥", types: ["hospital", "pharmacy"] },
  { label: "Police Station",    icon: "🚓", types: ["police"] },
  { label: "Metro / Bus Stop",  icon: "🚌", types: ["bus_station", "transit_station"] },
  { label: "Supermarket",       icon: "🛒", types: ["supermarket", "shopping_mall"] },
  { label: "Restaurant / Food", icon: "🍽️", types: ["restaurant"] },
  { label: "ATM / Bank",        icon: "🏦", types: ["bank", "atm"] },
];

const MAX_PER_CAT = 5;

// ─── GET /api/nearby ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const radius = Math.min(parseInt(req.query.radius || "3000", 10), 5000);

    // ── Step 1: resolve coordinates ───────────────────────────────────────────
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);
    let coordSource = "query_params";

    const coordsValid = (la, lo) =>
      !isNaN(la) && !isNaN(lo) &&
      la >= -90 && la <= 90 &&
      lo >= -180 && lo <= 180 &&
      !(la === 0 && lo === 0);

    if (!coordsValid(lat, lng)) {
      // No valid lat/lng — try to geocode from address / city / locality
      const address  = req.query.address  ? String(req.query.address)  : null;
      const city     = req.query.city     ? String(req.query.city)     : null;
      const locality = req.query.locality ? String(req.query.locality) : null;

      if (!address && !city && !locality) {
        return res.status(400).json({
          error: "Provide lat & lng coordinates, or at least one of: address, city, locality",
        });
      }

      // Runtime geocode — result not saved to DB
      const parts = [locality, address, city, "India"].filter(Boolean);
      const gc = await geocodeAddress(parts);
      if (!gc) {
        return res.status(422).json({
          error: `Could not geocode location: "${parts.join(", ")}"`,
          tip:   "Try providing more specific address details or lat/lng coordinates directly.",
        });
      }
      lat = gc.lat;
      lng = gc.lng;
      coordSource = "nominatim_geocode";
    }

    if (!GOOGLE_KEY) {
      return res.status(503).json({
        error: "Google Maps API key not configured on the server",
        tip:   "Set GOOGLE_MAPS_API_KEY in the server environment variables.",
      });
    }

    // ── Step 2: run all category searches in parallel ─────────────────────────
    const groupPromises = CATEGORIES.map(async (cat) => {
      const allItems = [];

      for (const type of cat.types) {
        try {
          const url =
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
            `?location=${lat},${lng}` +
            `&radius=${radius}` +
            `&type=${type}` +
            `&key=${GOOGLE_KEY}`;

          const { status: httpStatus, body } = await httpsGet(url);

          if (httpStatus !== 200 || body.status === "REQUEST_DENIED") {
            console.warn(
              `[nearby] Google API error for type=${type}:`,
              body.error_message || body.status,
            );
            continue;
          }

          for (const place of (body.results ?? [])) {
            const pLat = place.geometry?.location?.lat;
            const pLng = place.geometry?.location?.lng;
            if (!pLat || !pLng) continue;

            allItems.push({
              name:     place.name,
              distKm:   Math.round(haversineKm(lat, lng, pLat, pLng) * 100) / 100,
              lat:      pLat,
              lng:      pLng,
              address:  place.vicinity || null,
              rating:   place.rating   || null,
              open_now: place.opening_hours?.open_now ?? null,
              place_id: place.place_id,
            });
          }
        } catch (err) {
          console.warn(`[nearby] fetch failed for type=${type}:`, err.message);
        }
      }

      // Sort by distance, dedupe by name, cap at MAX_PER_CAT
      allItems.sort((a, b) => a.distKm - b.distKm);
      const seen   = new Set();
      const unique = allItems.filter(item => {
        const key = item.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { label: cat.label, icon: cat.icon, items: unique.slice(0, MAX_PER_CAT) };
    });

    const groups = await Promise.all(groupPromises);

    res.json({ groups, resolvedLat: lat, resolvedLng: lng, coordSource });
  } catch (err) {
    console.error("[nearby]", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
