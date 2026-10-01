/**
 * /api/recommendations
 *
 * Amazon-style personalised recommendation engine.
 * Uses ONLY existing tables — no schema changes.
 *
 * Data sources (by descending signal strength):
 *   1. nivaas_property_visits   — user booked a viewing   (weight: very high)
 *   2. nivaas_saved_properties  — user bookmarked         (weight: high)
 *   3. nivaas_inquiries         — user sent a message     (weight: high)
 *   4. nivaas_agreements        — past tenant             (weight: medium)
 *   5. nivaas_properties        — popularity metrics      (weight: low boost)
 *   6. nivaas_property_amenities— amenity overlap         (weight: low boost)
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *   GET /api/recommendations            → "Recommended For You"
 *   GET /api/recommendations/continue   → "Continue Exploring"
 *   GET /api/recommendations/similar/:id→ "Similar Properties"
 *   GET /api/recommendations/returning  → Returning-user meta + re-engagement
 */

import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a user preference vector from their existing activity.
 * Returns null if the user has zero activity (brand new user).
 */
async function buildUserPreferenceVector(userId) {
  // 1. Saved properties
  const [saved] = await pool.query(
    `SELECT
       p.city, p.property_type, p.listing_type, p.bedrooms,
       p.price, p.furnished, p.locality,
       sp.saved_at
     FROM nivaas_saved_properties sp
     JOIN nivaas_properties p ON p.id = sp.property_id
     WHERE sp.user_id = ?
     ORDER BY sp.saved_at DESC
     LIMIT 30`,
    [userId]
  );

  // 2. Visit requests
  const [visits] = await pool.query(
    `SELECT
       p.city, p.property_type, p.listing_type, p.bedrooms,
       p.price, p.furnished, p.locality,
       v.created_at, v.status
     FROM nivaas_property_visits v
     JOIN nivaas_properties p ON p.id = v.property_id
     WHERE v.customer_id = ?
     ORDER BY v.created_at DESC
     LIMIT 30`,
    [userId]
  );

  // 3. Inquiries
  const [inquiries] = await pool.query(
    `SELECT
       p.city, p.property_type, p.listing_type, p.bedrooms,
       p.price, p.furnished, p.locality,
       i.created_at
     FROM nivaas_inquiries i
     JOIN nivaas_properties p ON p.id = i.property_id
     WHERE i.customer_id = ?
     ORDER BY i.created_at DESC
     LIMIT 30`,
    [userId]
  );

  // 4. Rental agreements (past tenant history)
  const [agreements] = await pool.query(
    `SELECT
       p.city, p.property_type, p.listing_type, p.bedrooms,
       p.price, p.furnished, p.locality
     FROM nivaas_agreements a
     JOIN nivaas_properties p ON p.id = a.property_id
     WHERE a.tenant_id = ?
     ORDER BY a.created_at DESC
     LIMIT 10`,
    [userId]
  );

  const allActivity = [...saved, ...visits, ...inquiries, ...agreements];
  if (allActivity.length === 0) return null;

  // ── Tally frequency maps ──────────────────────────────────────────────────
  const cityCount        = {};
  const typeCount        = {};
  const listingTypeCount = {};
  const bedroomsCount    = {};
  const furnishedCount   = {};
  const prices           = [];

  // Weight: visits > saved > inquiries > agreements
  const weightedSources = [
    { rows: visits,    weight: 3 },
    { rows: saved,     weight: 2 },
    { rows: inquiries, weight: 2 },
    { rows: agreements,weight: 1 },
  ];

  for (const { rows, weight } of weightedSources) {
    for (const row of rows) {
      if (row.city)          cityCount[row.city]               = (cityCount[row.city]               || 0) + weight;
      if (row.property_type) typeCount[row.property_type]      = (typeCount[row.property_type]      || 0) + weight;
      if (row.listing_type)  listingTypeCount[row.listing_type]= (listingTypeCount[row.listing_type]|| 0) + weight;
      if (row.bedrooms != null) bedroomsCount[String(row.bedrooms)] = (bedroomsCount[String(row.bedrooms)] || 0) + weight;
      if (row.furnished)     furnishedCount[row.furnished]     = (furnishedCount[row.furnished]      || 0) + weight;
      if (row.price && row.price > 0) prices.push(Number(row.price));
    }
  }

  // ── Derive preferred values ───────────────────────────────────────────────
  const topCity        = Object.entries(cityCount).sort((a,b) => b[1]-a[1]).map(e => e[0]);
  const topType        = Object.entries(typeCount).sort((a,b) => b[1]-a[1]).map(e => e[0]);
  const topListingType = Object.entries(listingTypeCount).sort((a,b) => b[1]-a[1]).map(e => e[0]);
  const topBedrooms    = Object.entries(bedroomsCount).sort((a,b) => b[1]-a[1]).map(e => Number(e[0]));
  const topFurnished   = Object.entries(furnishedCount).sort((a,b) => b[1]-a[1]).map(e => e[0]);

  let priceMin = null;
  let priceMax = null;
  let priceMid = null;
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    priceMin = prices[Math.floor(prices.length * 0.1)];   // 10th percentile
    priceMax = prices[Math.ceil(prices.length * 0.9) - 1]; // 90th percentile
    priceMid = prices[Math.floor(prices.length / 2)];      // median
    // Give 40% headroom so recommendations aren't too narrow
    priceMin = Math.floor(priceMin * 0.6);
    priceMax = Math.ceil(priceMax * 1.4);
  }

  return {
    cities:       topCity,
    primaryCity:  topCity[0] || null,
    types:        topType,
    listingTypes: topListingType,
    bedrooms:     topBedrooms,
    furnished:    topFurnished,
    priceMin,
    priceMax,
    priceMid,
    activityCount: allActivity.length,
  };
}

/**
 * Collect all property IDs the user has already interacted with
 * so we can exclude them from "Recommended For You".
 */
async function getUserInteractedIds(userId) {
  const [saved]    = await pool.query("SELECT property_id FROM nivaas_saved_properties WHERE user_id = ?",    [userId]);
  const [visits]   = await pool.query("SELECT property_id FROM nivaas_property_visits   WHERE customer_id = ?",[userId]);
  const [inquiries]= await pool.query("SELECT property_id FROM nivaas_inquiries          WHERE customer_id = ?",[userId]);
  const [agreements]=await pool.query("SELECT property_id FROM nivaas_agreements         WHERE tenant_id = ?",  [userId]);

  const ids = new Set([
    ...saved.map(r => r.property_id),
    ...visits.map(r => r.property_id),
    ...inquiries.map(r => r.property_id),
    ...agreements.map(r => r.property_id),
  ]);
  return ids;
}

/**
 * Score a candidate property against the user's preference vector.
 * Returns an integer score (higher = better match).
 */
function scoreProperty(prop, vector, userAmenityIds) {
  let score = 0;

  // ── City signals (most important) ──────────────────────────────────────────
  if (vector.cities.length > 0) {
    const cityRank = vector.cities.indexOf(prop.city);
    if (cityRank === 0)       score += 40;   // top preferred city
    else if (cityRank === 1)  score += 25;   // 2nd preferred city
    else if (cityRank > 1)    score += 10;   // other preferred city
    // if city not in list: no city points
  }

  // ── Property type ──────────────────────────────────────────────────────────
  if (vector.types.includes(prop.property_type)) {
    const typeRank = vector.types.indexOf(prop.property_type);
    score += typeRank === 0 ? 20 : 10;
  }

  // ── Listing type ───────────────────────────────────────────────────────────
  if (vector.listingTypes.includes(prop.listing_type)) {
    score += 10;
  }

  // ── Bedrooms ───────────────────────────────────────────────────────────────
  if (prop.bedrooms != null && vector.bedrooms.includes(Number(prop.bedrooms))) {
    const bedRank = vector.bedrooms.indexOf(Number(prop.bedrooms));
    score += bedRank === 0 ? 15 : 8;
  } else if (prop.bedrooms != null && vector.bedrooms.length > 0) {
    // Allow ±1 bedroom for flexibility
    const closest = vector.bedrooms[0];
    if (Math.abs(Number(prop.bedrooms) - closest) === 1) score += 5;
  }

  // ── Furnished ─────────────────────────────────────────────────────────────
  if (vector.furnished.includes(prop.furnished)) {
    score += vector.furnished[0] === prop.furnished ? 10 : 5;
  }

  // ── Price match ───────────────────────────────────────────────────────────
  if (vector.priceMin !== null && vector.priceMax !== null && prop.price) {
    const price = Number(prop.price);
    if (price >= vector.priceMin && price <= vector.priceMax) {
      score += 20;
      // Bonus: closer to median = better match
      if (vector.priceMid) {
        const deviation = Math.abs(price - vector.priceMid) / vector.priceMid;
        if (deviation < 0.1)      score += 10;
        else if (deviation < 0.2) score += 5;
      }
    }
  }

  // ── Amenity overlap ───────────────────────────────────────────────────────
  if (userAmenityIds && userAmenityIds.size > 0 && prop.amenity_ids) {
    const propAmenities = prop.amenity_ids
      .split(",")
      .map(Number)
      .filter(Boolean);
    let overlap = 0;
    for (const id of propAmenities) {
      if (userAmenityIds.has(id)) overlap++;
    }
    score += Math.min(overlap * 5, 25); // cap at 25
  }

  // ── Popularity boost ──────────────────────────────────────────────────────
  if (Number(prop.saves_count)    > 10) score += 8;
  else if (Number(prop.saves_count) > 5) score += 4;

  if (Number(prop.views_count)    > 100) score += 5;
  else if (Number(prop.views_count) > 30) score += 2;

  // ── Verified bonus ────────────────────────────────────────────────────────
  if (prop.verified) score += 5;

  return score;
}

/**
 * Attach images and amenities to a list of property rows.
 * Mirrors the approach used in routes/properties.js.
 */
async function attachImagesAndAmenities(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);

  // Images
  const imgResult = await pool._pool.query(
    "SELECT property_id, url, is_cover, sort_order FROM nivaas_property_images WHERE property_id = ANY($1) ORDER BY sort_order ASC",
    [ids]
  );
  const imgMap = {};
  imgResult.rows.forEach(img => {
    if (!imgMap[img.property_id]) imgMap[img.property_id] = [];
    imgMap[img.property_id].push(img.url);
  });

  // Amenities
  const amenResult = await pool._pool.query(
    `SELECT pa.property_id, a.name, a.icon, a.category
     FROM nivaas_property_amenities pa
     JOIN nivaas_amenities a ON a.id = pa.amenity_id
     WHERE pa.property_id = ANY($1)`,
    [ids]
  );
  const amenMap = {};
  amenResult.rows.forEach(a => {
    if (!amenMap[a.property_id]) amenMap[a.property_id] = [];
    amenMap[a.property_id].push({ name: a.name, icon: a.icon, category: a.category });
  });

  // Locations
  const locResult = await pool._pool.query(
    "SELECT property_id, latitude, longitude, google_maps_url FROM nivaas_property_locations WHERE property_id = ANY($1)",
    [ids]
  );
  const locMap = {};
  locResult.rows.forEach(l => { locMap[l.property_id] = l; });

  return rows.map(p => {
    const loc = locMap[p.id];
    const lat = loc?.latitude  != null ? Number(loc.latitude)  : null;
    const lng = loc?.longitude != null ? Number(loc.longitude) : null;
    return {
      ...p,
      latitude:  lat,
      longitude: lng,
      map_url:   loc?.google_maps_url ?? p.map_url ?? null,
      location_approximate: false,
      images:    imgMap[p.id] || (p.cover_image_url ? [p.cover_image_url] : []),
      amenities: amenMap[p.id] || [],
    };
  });
}

/**
 * Collect user's preferred amenity IDs from their saved/visited properties.
 */
async function getUserPreferredAmenityIds(userId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT pa.amenity_id
     FROM nivaas_property_amenities pa
     WHERE pa.property_id IN (
       SELECT property_id FROM nivaas_saved_properties WHERE user_id = ?
       UNION ALL
       SELECT property_id FROM nivaas_property_visits   WHERE customer_id = ?
       UNION ALL
       SELECT property_id FROM nivaas_inquiries          WHERE customer_id = ?
     )`,
    [userId, userId, userId]
  );
  return new Set(rows.map(r => r.amenity_id));
}


// ═════════════════════════════════════════════════════════════════════════════
// GET /api/recommendations
// "Recommended For You" — personalised list, excludes interacted properties
// ═════════════════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit  = Math.min(Number(req.query.limit) || 12, 24);

    // Build preference vector
    const vector = await buildUserPreferenceVector(userId);

    // If the user has no activity at all → return popular properties as fallback
    if (!vector) {
      const [popular] = await pool.query(
        `SELECT p.*,
                u.full_name AS owner_name, u.phone AS owner_phone,
                ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
                COUNT(DISTINCT r.id) AS review_count,
                STRING_AGG(pa.amenity_id::text, ',') AS amenity_ids
         FROM nivaas_properties p
         LEFT JOIN nivaas_users u ON u.id = p.owner_id
         LEFT JOIN nivaas_reviews r ON r.property_id = p.id
         LEFT JOIN nivaas_property_amenities pa ON pa.property_id = p.id
         WHERE p.status = 'active'
         GROUP BY p.id, u.full_name, u.phone
         ORDER BY (p.saves_count + p.views_count + p.inquiries_count) DESC
         LIMIT ?`,
        [limit]
      );
      const enriched = await attachImagesAndAmenities(popular);
      return res.json({
        data: enriched,
        meta: {
          type: "popular_fallback",
          reason: "No activity found — showing popular properties",
          activity_count: 0,
          preference_vector: null,
        },
      });
    }

    // Get interacted IDs to exclude
    const interactedIds = await getUserInteractedIds(userId);
    const userAmenityIds = await getUserPreferredAmenityIds(userId);

    // Build candidate query based on preference vector
    const cityPlaceholders = vector.cities.slice(0, 5).map(() => "?").join(",");
    const cityParams       = vector.cities.slice(0, 5);
    const typeParams       = vector.types.slice(0, 3);
    const typePlaceholders = typeParams.length > 0 ? typeParams.map(() => "?").join(",") : null;

    let whereClauses = ["p.status = 'active'"];
    let params       = [];

    // Exclude already-interacted properties
    if (interactedIds.size > 0) {
      const excludeIds = [...interactedIds];
      // Use = ANY($n) for the exclusion — direct pg query
      // We'll handle this differently below (pg-native)
    }

    // Build WHERE: city OR type match (broad net, then score narrows it)
    if (cityParams.length > 0 && typePlaceholders) {
      whereClauses.push(`(p.city IN (${cityPlaceholders}) OR p.property_type IN (${typePlaceholders}))`);
      params.push(...cityParams, ...typeParams);
    } else if (cityParams.length > 0) {
      whereClauses.push(`p.city IN (${cityPlaceholders})`);
      params.push(...cityParams);
    } else if (typePlaceholders) {
      whereClauses.push(`p.property_type IN (${typePlaceholders})`);
      params.push(...typeParams);
    }

    // Price range filter (with generous buffer already applied in vector)
    if (vector.priceMin !== null && vector.priceMax !== null) {
      whereClauses.push("p.price BETWEEN ? AND ?");
      params.push(vector.priceMin, vector.priceMax);
    }

    const whereSQL = whereClauses.join(" AND ");

    // Fetch candidates (fetch more than needed — we score and rank)
    const [candidates] = await pool.query(
      `SELECT p.*,
              u.full_name AS owner_name, u.phone AS owner_phone,
              ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
              COUNT(DISTINCT r.id) AS review_count,
              STRING_AGG(pa.amenity_id::text, ',') AS amenity_ids
       FROM nivaas_properties p
       LEFT JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_reviews r ON r.property_id = p.id
       LEFT JOIN nivaas_property_amenities pa ON pa.property_id = p.id
       WHERE ${whereSQL}
       GROUP BY p.id, u.full_name, u.phone
       ORDER BY p.created_at DESC
       LIMIT 100`,
      params
    );

    // Filter out interacted + score remaining
    const scored = candidates
      .filter(p => !interactedIds.has(p.id))
      .map(p => ({ ...p, _score: scoreProperty(p, vector, userAmenityIds) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);

    const enriched = await attachImagesAndAmenities(scored);

    res.json({
      data: enriched.map(({ _score, amenity_ids, ...p }) => p),
      meta: {
        type:             "personalised",
        reason:           "Based on your saved properties and visit history",
        activity_count:   vector.activityCount,
        preferred_cities: vector.cities.slice(0, 3),
        preferred_types:  vector.types.slice(0, 2),
        price_range:      { min: vector.priceMin, max: vector.priceMax },
      },
    });
  } catch (err) {
    console.error("[recommendations /]", err);
    res.status(500).json({ error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /api/recommendations/continue
// "Continue Exploring" — properties the user showed interest in but
// did NOT complete a booking or agreement on
// ═════════════════════════════════════════════════════════════════════════════
router.get("/continue", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Saved but never visited (strong "continue" signal)
    const [savedNotVisited] = await pool.query(
      `SELECT
         p.*,
         u.full_name AS owner_name, u.phone AS owner_phone,
         sp.saved_at AS interaction_date,
         'saved_not_visited' AS interaction_type,
         'You saved this but haven''t visited yet' AS reason_label,
         ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM nivaas_saved_properties sp
       JOIN nivaas_properties p ON p.id = sp.property_id
       LEFT JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_reviews r ON r.property_id = p.id
       WHERE sp.user_id = ?
         AND p.status = 'active'
         AND p.id NOT IN (
           SELECT property_id FROM nivaas_property_visits WHERE customer_id = ?
         )
         AND p.id NOT IN (
           SELECT property_id FROM nivaas_agreements WHERE tenant_id = ?
         )
       GROUP BY p.id, u.full_name, u.phone, sp.saved_at
       ORDER BY sp.saved_at DESC
       LIMIT 6`,
      [userId, userId, userId]
    );

    // 2. Inquired but no visit (interest signal without follow-through)
    const [inquiredNotVisited] = await pool.query(
      `SELECT
         p.*,
         u.full_name AS owner_name, u.phone AS owner_phone,
         i.created_at AS interaction_date,
         'inquired_not_visited' AS interaction_type,
         'You inquired about this property' AS reason_label,
         ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM nivaas_inquiries i
       JOIN nivaas_properties p ON p.id = i.property_id
       LEFT JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_reviews r ON r.property_id = p.id
       WHERE i.customer_id = ?
         AND p.status = 'active'
         AND i.status IN ('pending', 'responded')
         AND p.id NOT IN (
           SELECT property_id FROM nivaas_property_visits WHERE customer_id = ?
         )
         AND p.id NOT IN (
           SELECT property_id FROM nivaas_agreements WHERE tenant_id = ?
         )
       GROUP BY p.id, u.full_name, u.phone, i.created_at
       ORDER BY i.created_at DESC
       LIMIT 6`,
      [userId, userId, userId]
    );

    // 3. Visited but not rented (visit happened, no agreement)
    const [visitedNotRented] = await pool.query(
      `SELECT
         p.*,
         u.full_name AS owner_name, u.phone AS owner_phone,
         v.visit_date::text AS interaction_date,
         'visited_not_rented' AS interaction_type,
         'You visited this property' AS reason_label,
         ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM nivaas_property_visits v
       JOIN nivaas_properties p ON p.id = v.property_id
       LEFT JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_reviews r ON r.property_id = p.id
       WHERE v.customer_id = ?
         AND p.status = 'active'
         AND v.status IN ('completed', 'confirmed')
         AND p.id NOT IN (
           SELECT property_id FROM nivaas_agreements WHERE tenant_id = ?
         )
       GROUP BY p.id, u.full_name, u.phone, v.visit_date
       ORDER BY v.visit_date DESC
       LIMIT 6`,
      [userId, userId]
    );

    // Merge, deduplicate by property id (prefer higher-signal interaction)
    const seen = new Set();
    const merged = [];
    for (const row of [...visitedNotRented, ...inquiredNotVisited, ...savedNotVisited]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }

    const enriched = await attachImagesAndAmenities(merged.slice(0, 12));

    res.json({
      data: enriched,
      meta: {
        counts: {
          saved_not_visited:    savedNotVisited.length,
          inquired_not_visited: inquiredNotVisited.length,
          visited_not_rented:   visitedNotRented.length,
        },
      },
    });
  } catch (err) {
    console.error("[recommendations /continue]", err);
    res.status(500).json({ error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /api/recommendations/similar/:propertyId
// "Similar Properties" — based on city, type, bedrooms, price band, amenities
// Excludes the seed property itself; returns up to 8 results
// ═════════════════════════════════════════════════════════════════════════════
router.get("/similar/:propertyId", async (req, res) => {
  try {
    const { propertyId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 8, 16);

    // Fetch seed property
    const [seedRows] = await pool.query(
      `SELECT p.*,
              STRING_AGG(pa.amenity_id::text, ',') AS amenity_ids
       FROM nivaas_properties p
       LEFT JOIN nivaas_property_amenities pa ON pa.property_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [propertyId]
    );
    if (!seedRows.length) return res.status(404).json({ error: "Property not found" });
    const seed = seedRows[0];

    const seedAmenityIds = seed.amenity_ids
      ? new Set(seed.amenity_ids.split(",").map(Number).filter(Boolean))
      : new Set();

    const priceLo = Math.floor(Number(seed.price) * 0.5);
    const priceHi = Math.ceil(Number(seed.price)  * 1.5);

    // Fetch candidates: same city, same listing_type, similar price band
    const [candidates] = await pool.query(
      `SELECT p.*,
              u.full_name AS owner_name, u.phone AS owner_phone,
              ROUND(AVG(r.rating)::numeric,1) AS avg_rating,
              COUNT(DISTINCT r.id) AS review_count,
              STRING_AGG(pa.amenity_id::text, ',') AS amenity_ids
       FROM nivaas_properties p
       LEFT JOIN nivaas_users u ON u.id = p.owner_id
       LEFT JOIN nivaas_reviews r ON r.property_id = p.id
       LEFT JOIN nivaas_property_amenities pa ON pa.property_id = p.id
       WHERE p.status = 'active'
         AND p.id != ?
         AND p.city = ?
         AND p.listing_type = ?
         AND p.price BETWEEN ? AND ?
       GROUP BY p.id, u.full_name, u.phone
       ORDER BY p.created_at DESC
       LIMIT 60`,
      [propertyId, seed.city, seed.listing_type, priceLo, priceHi]
    );

    // Build a pseudo-vector from the seed property for scoring
    const seedVector = {
      cities:       [seed.city],
      primaryCity:  seed.city,
      types:        [seed.property_type],
      listingTypes: [seed.listing_type],
      bedrooms:     seed.bedrooms != null ? [Number(seed.bedrooms)] : [],
      furnished:    seed.furnished ? [seed.furnished] : [],
      priceMin:     priceLo,
      priceMax:     priceHi,
      priceMid:     Number(seed.price),
    };

    const scored = candidates
      .map(p => ({ ...p, _score: scoreProperty(p, seedVector, seedAmenityIds) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);

    const enriched = await attachImagesAndAmenities(scored);

    res.json({
      data: enriched.map(({ _score, amenity_ids, ...p }) => p),
      seed: {
        id:            seed.id,
        city:          seed.city,
        property_type: seed.property_type,
        listing_type:  seed.listing_type,
        price:         seed.price,
        bedrooms:      seed.bedrooms,
      },
    });
  } catch (err) {
    console.error("[recommendations /similar]", err);
    res.status(500).json({ error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /api/recommendations/returning
// Returning-user detection + re-engagement meta + smart notification
// ═════════════════════════════════════════════════════════════════════════════
router.get("/returning", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Last activity timestamp across all interaction tables
    const [activityRows] = await pool.query(
      `SELECT MAX(ts) AS last_activity FROM (
         SELECT MAX(saved_at)   AS ts FROM nivaas_saved_properties  WHERE user_id     = ?
         UNION ALL
         SELECT MAX(created_at) AS ts FROM nivaas_property_visits   WHERE customer_id = ?
         UNION ALL
         SELECT MAX(created_at) AS ts FROM nivaas_inquiries          WHERE customer_id = ?
         UNION ALL
         SELECT MAX(created_at) AS ts FROM nivaas_agreements         WHERE tenant_id   = ?
       ) t`,
      [userId, userId, userId, userId]
    );

    const lastActivity   = activityRows[0]?.last_activity ?? null;
    const now            = new Date();
    const lastActivityDt = lastActivity ? new Date(lastActivity) : null;
    const daysSince      = lastActivityDt
      ? Math.floor((now - lastActivityDt) / (1000 * 60 * 60 * 24))
      : null;

    // ── Activity counts ────────────────────────────────────────────────────
    const [[{ saved_count }]]   = await pool.query("SELECT COUNT(*) AS saved_count   FROM nivaas_saved_properties WHERE user_id = ?",     [userId]);
    const [[{ visit_count }]]   = await pool.query("SELECT COUNT(*) AS visit_count   FROM nivaas_property_visits  WHERE customer_id = ?",  [userId]);
    const [[{ inquiry_count }]] = await pool.query("SELECT COUNT(*) AS inquiry_count FROM nivaas_inquiries         WHERE customer_id = ?", [userId]);

    const totalActivity = Number(saved_count) + Number(visit_count) + Number(inquiry_count);
    const isReturning   = totalActivity > 0;

    // ── Smart re-engagement message ────────────────────────────────────────
    let reEngagementMessage = null;
    let reEngagementType    = "new_user";

    if (!isReturning) {
      reEngagementMessage = "Welcome! Start exploring properties tailored for you.";
      reEngagementType    = "new_user";
    } else if (daysSince !== null && daysSince >= 30) {
      reEngagementMessage = `Welcome back! It's been ${daysSince} days. New properties matching your preferences are available.`;
      reEngagementType    = "long_absent";
    } else if (daysSince !== null && daysSince >= 7) {
      reEngagementMessage = `Good to see you again! We have new listings matching your interests.`;
      reEngagementType    = "returning";
    } else if (daysSince !== null && daysSince >= 2) {
      reEngagementMessage = `Welcome back! Check out what's new since your last visit.`;
      reEngagementType    = "recent_return";
    } else {
      reEngagementMessage = null; // Very recent — don't show banner
      reEngagementType    = "active";
    }

    // ── Recently interacted properties (for "recently interested" section) ─
    const [recentlyInterested] = await pool.query(
      `SELECT p.id, p.title, p.city, p.locality, p.price, p.listing_type,
              p.property_type, p.bedrooms, p.cover_image_url, p.status,
              p.verified, p.saves_count, p.views_count,
              activity.interaction_type, activity.interaction_date
       FROM (
         SELECT property_id, 'saved'  AS interaction_type, saved_at   AS interaction_date
         FROM nivaas_saved_properties WHERE user_id = ?
         UNION ALL
         SELECT property_id, 'visited' AS interaction_type, created_at AS interaction_date
         FROM nivaas_property_visits WHERE customer_id = ?
         UNION ALL
         SELECT property_id, 'inquired' AS interaction_type, created_at AS interaction_date
         FROM nivaas_inquiries WHERE customer_id = ?
       ) activity
       JOIN nivaas_properties p ON p.id = activity.property_id
       ORDER BY activity.interaction_date DESC
       LIMIT 6`,
      [userId, userId, userId]
    );

    // Deduplicate by property id (keep most recent interaction)
    const recentSeen = new Set();
    const recentUnique = [];
    for (const row of recentlyInterested) {
      if (!recentSeen.has(row.id)) {
        recentSeen.add(row.id);
        recentUnique.push(row);
      }
    }

    const enrichedRecent = await attachImagesAndAmenities(recentUnique);

    // ── Smart re-engagement notification ──────────────────────────────────
    // Idempotent: only fire if user is returning (≥7 days gap) AND
    // no recommendation notification has been sent in the last 7 days
    let notificationCreated = false;
    if (isReturning && daysSince !== null && daysSince >= 7) {
      const [[{ recent_notif }]] = await pool.query(
        `SELECT COUNT(*) AS recent_notif
         FROM nivaas_notifications
         WHERE user_id = ?
           AND type = 'recommendation'
           AND created_at >= NOW() - INTERVAL '7 days'`,
        [userId]
      );
      if (Number(recent_notif) === 0) {
        // Generate a contextual notification based on what's new
        const [[{ new_props }]] = await pool.query(
          `SELECT COUNT(*) AS new_props
           FROM nivaas_properties p
           WHERE p.status = 'active'
             AND p.created_at >= NOW() - INTERVAL '7 days'`,
          []
        );

        let notifBody = "Check out new properties matching your preferences.";
        if (Number(new_props) > 0) {
          notifBody = `${new_props} new properties were listed that match your interests. Don't miss them!`;
        }

        await createNotification(
          userId,
          "recommendation",
          "New Properties For You 🏠",
          notifBody,
          "/dashboard"
        );
        notificationCreated = true;
      }
    }

    res.json({
      is_returning:          isReturning,
      days_since_activity:   daysSince,
      last_activity:         lastActivity,
      re_engagement_type:    reEngagementType,
      re_engagement_message: reEngagementMessage,
      activity_summary: {
        saved_count:    Number(saved_count),
        visit_count:    Number(visit_count),
        inquiry_count:  Number(inquiry_count),
        total:          totalActivity,
      },
      recently_interested:    enrichedRecent,
      notification_triggered: notificationCreated,
    });
  } catch (err) {
    console.error("[recommendations /returning]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
