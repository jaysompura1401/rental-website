/**
 * server/routes/nearby.js
 *
 * GET /api/nearby?lat=&lng=&radius=
 *   OR
 * GET /api/nearby?address=New+Ranip,+Ahmedabad&radius=
 *
 * Returns nearby places using the Google Places API (New) — specifically the
 * Nearby Search (New) endpoint:
 *   POST https://places.googleapis.com/v1/places:searchNearby
 *
 * The Google API key is read from server environment variables and never
 * reaches the browser.
 *
 * Accepted query parameters:
 *   lat      – latitude  (preferred)
 *   lng      – longitude (preferred)
 *   address  – free-text address / locality string (fallback when no lat/lng)
 *   city     – city name appended to address for better geocoding
 *   radius   – search radius in metres, max 5000 (default 3000)
 *
 * Response shape:
 * {
 *   groups: [
 *     { label: "School / College", icon: "🏫",
 *       items: [{ name, distKm, lat, lng, address, rating, open_now }] }
 *   ],
 *   resolvedLat: number,
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

// Key read from server environment — never exposed to the browser
const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY;

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

// ─── Nominatim geocode — address string → { lat, lng } ───────────────────────
// Used at runtime only when lat/lng are not supplied.
// Result is NEVER written to the database.
async function geocodeAddress(addressParts) {
  const q = addressParts.filter(Boolean).join(", ");
  if (!q) return null;
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=in`;
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Nivaas/1.0 (nivaas.in)",
        "Accept":     "application/json",
      },
    }, res => {
      let body = "";
      res.on("data", c => { body += c; });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data) || data.length === 0) return resolve(null);
          const la = parseFloat(data[0].lat);
          const lo = parseFloat(data[0].lon);
          if (isNaN(la) || isNaN(lo) || (la === 0 && lo === 0)) return resolve(null);
          resolve({ lat: la, lng: lo });
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

// ─── Places API (New) — POST /v1/places:searchNearby ─────────────────────────
// Returns parsed JSON body or throws on network/parse error.
function placesNewNearbySearch(requestBody, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(requestBody);

    const req = https.request(
      {
        hostname: "places.googleapis.com",
        path:     "/v1/places:searchNearby",
        method:   "POST",
        headers: {
          "Content-Type":     "application/json",
          "Content-Length":   Buffer.byteLength(payload),
          "X-Goog-Api-Key":   apiKey,
          // Request only the fields we need — reduces cost and response size
          "X-Goog-FieldMask": [
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.currentOpeningHours.openNow",
            "places.id",
          ].join(","),
          "Accept":           "application/json",
          "Connection":       "close",
        },
      },
      res => {
        let raw = "";
        res.on("data", c => { raw += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            // Attach HTTP status so the caller can distinguish auth errors
            resolve({ _httpStatus: res.statusCode, ...parsed });
          } catch {
            reject(new Error("Invalid JSON from Places API (New): " + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Places API (New) request timed out")); });
    req.write(payload);
    req.end();
  });
}

// ─── Category definitions → Places API (New) `includedTypes` ─────────────────
// Each entry maps a user-facing label to one or more Place type strings
// as defined in the Places API (New) type table.
const CATEGORIES = [
  {
    label: "School / College",
    icon:  "🏫",
    types: ["school", "university", "primary_school", "secondary_school"],
  },
  {
    label: "Hospital / Clinic",
    icon:  "🏥",
    types: ["hospital", "pharmacy", "doctor", "dental_clinic"],
  },
  {
    label: "Police Station",
    icon:  "🚓",
    types: ["police"],
  },
  {
    label: "Metro / Bus Stop",
    icon:  "🚌",
    types: ["bus_station", "transit_station", "train_station", "subway_station"],
  },
  {
    label: "Supermarket",
    icon:  "🛒",
    types: ["supermarket", "grocery_store", "shopping_mall"],
  },
  {
    label: "Restaurant / Food",
    icon:  "🍽️",
    types: ["restaurant", "cafe", "fast_food_restaurant"],
  },
  {
    label: "ATM / Bank",
    icon:  "🏦",
    types: ["bank", "atm"],
  },
];

const MAX_PER_CAT = 5;

// ─── GET /api/nearby ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const radius = Math.min(parseInt(req.query.radius || "3000", 10), 5000);

    // ── Step 1: resolve coordinates ───────────────────────────────────────────
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);

    const coordsValid = (la, lo) =>
      !isNaN(la) && !isNaN(lo) &&
      la >= -90  && la <= 90  &&
      lo >= -180 && lo <= 180 &&
      !(la === 0 && lo === 0);

    if (!coordsValid(lat, lng)) {
      const address  = req.query.address  ? String(req.query.address)  : null;
      const city     = req.query.city     ? String(req.query.city)     : null;
      const locality = req.query.locality ? String(req.query.locality) : null;

      if (!address && !city && !locality) {
        return res.status(400).json({
          error: "Provide lat & lng coordinates, or at least one of: address, city, locality",
        });
      }

      const parts = [locality, address, city, "India"].filter(Boolean);
      const gc = await geocodeAddress(parts);
      if (!gc) {
        return res.status(422).json({
          error: `Could not geocode location: "${parts.join(", ")}"`,
          tip:   "Try providing lat/lng coordinates directly.",
        });
      }
      lat = gc.lat;
      lng = gc.lng;
    }

    if (!GOOGLE_KEY) {
      return res.status(503).json({
        error: "Google Maps API key not configured on the server",
        tip:   "Set GOOGLE_MAPS_API_KEY in server environment variables.",
      });
    }

    // ── Step 2: one Places API (New) call per category, all in parallel ───────
    const groupPromises = CATEGORIES.map(async (cat) => {
      const allItems = [];

      for (const placeType of cat.types) {
        try {
          const requestBody = {
            includedTypes:  [placeType],
            maxResultCount: 10,
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: radius,
              },
            },
          };

          const data = await placesNewNearbySearch(requestBody, GOOGLE_KEY);

          if (data._httpStatus === 403 || data._httpStatus === 401) {
            console.error(`[nearby] Places API (New) auth error for type=${placeType}:`, data.error?.message);
            break; // No point trying other types if key is rejected
          }
          if (data._httpStatus && data._httpStatus >= 400) {
            console.warn(`[nearby] Places API (New) HTTP ${data._httpStatus} for type=${placeType}:`, data.error?.message);
            continue;
          }

          for (const place of (data.places ?? [])) {
            const pLat = place.location?.latitude;
            const pLng = place.location?.longitude;
            if (pLat == null || pLng == null) continue;

            allItems.push({
              name:     place.displayName?.text || "Unknown place",
              distKm:   Math.round(haversineKm(lat, lng, pLat, pLng) * 100) / 100,
              lat:      pLat,
              lng:      pLng,
              address:  place.formattedAddress || null,
              rating:   place.rating           || null,
              open_now: place.currentOpeningHours?.openNow ?? null,
              place_id: place.id               || null,
            });
          }
        } catch (err) {
          console.warn(`[nearby] Places API (New) fetch failed for type=${placeType}:`, err.message);
        }
      }

      // Sort by distance, deduplicate by name, cap at MAX_PER_CAT
      allItems.sort((a, b) => a.distKm - b.distKm);
      const seen   = new Set();
      const unique = allItems.filter(item => {
        const k = item.name.toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return { label: cat.label, icon: cat.icon, items: unique.slice(0, MAX_PER_CAT) };
    });

    const groups = await Promise.all(groupPromises);

    res.json({ groups, resolvedLat: lat, resolvedLng: lng });
  } catch (err) {
    console.error("[nearby]", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
