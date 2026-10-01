/**
 * requirement-match.ts
 *
 * Weighted property-vs-requirement scoring engine.
 *
 * Produces a 0–100 match score plus human-readable reasons (✓ hits and △ misses).
 * Weights are configurable via WEIGHTS — change percentages here to re-tune.
 *
 * Key principle: if a requirement field is left blank, its weight is excluded from
 * the denominator so the score is never penalised for missing preferences.
 */

import type { ApiProperty } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CustomerRequirements {
  /** "rent" | "sale" | "pg" | "" (blank = not specified) */
  listing_type: string;
  /** "Apartment" | "Villa" | "PG" | "Office Space" | "Shop" | "Warehouse" | "Other" | "" */
  property_type: string;
  /** 1 | 2 | 3 | 4 (means 4+) | 0 (studio) | null (not sure) — for apartments/villas */
  bedrooms: number | null;
  /** Number of beds for PG: 1 | 2 | 3 | 4 | 0 (sharing/any) | null */
  beds: number | null;
  /** Cabins/rooms for office/shop: 1–5 | null */
  cabins: number | null;
  /** Requires swimming pool (villa / farm house) */
  hasPool: boolean;
  /** Free text — city name or locality */
  location: string;
  /** [min, max] in ₹ — [0,0] means not specified */
  budget: [number, number];
  /** "Fully Furnished" | "Semi-Furnished" | "Unfurnished" | "" (any) */
  furnished: string;
  /** Array of amenity names e.g. ["Parking", "Gym"] */
  amenities: string[];
  /** Any other free-text notes — not scored, stored for display */
  notes: string;
}

export interface MatchResult {
  /** 0–100 */
  score: number;
  /** Tier label for the score */
  tier: "Excellent" | "Good" | "Fair" | "Low";
  /** Matched criteria with ✓ */
  hits: string[];
  /** Mismatched criteria with △ */
  misses: string[];
}

// ─── Weight configuration (must sum to ≤ 100) ────────────────────────────────

const WEIGHTS = {
  listing_type:   20,
  location:       25,
  budget:         20,
  property_type:  15,
  bedrooms:       10,
  furnished:       5,
  amenities:       5,
} as const;

// ─── Storage key ─────────────────────────────────────────────────────────────

export const REQUIREMENTS_STORAGE_KEY = "nivaas_customer_requirements";
export const JUST_SCROLLING_KEY       = "nivaas_just_scrolling";

// ─── Persistence helpers ─────────────────────────────────────────────────────

export function saveRequirements(r: CustomerRequirements): void {
  try {
    localStorage.setItem(REQUIREMENTS_STORAGE_KEY, JSON.stringify(r));
    localStorage.removeItem(JUST_SCROLLING_KEY);
  } catch { /* ignore */ }
}

export function loadRequirements(): CustomerRequirements | null {
  try {
    const raw = localStorage.getItem(REQUIREMENTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomerRequirements) : null;
  } catch { return null; }
}

export function setJustScrolling(): void {
  try {
    localStorage.setItem(JUST_SCROLLING_KEY, "1");
    localStorage.removeItem(REQUIREMENTS_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function clearRequirements(): void {
  try {
    localStorage.removeItem(REQUIREMENTS_STORAGE_KEY);
    localStorage.removeItem(JUST_SCROLLING_KEY);
  } catch { /* ignore */ }
}

/** Returns true if user has already made a choice (either requirements or just-scrolling) */
export function hasExistingChoice(): boolean {
  try {
    return !!(
      localStorage.getItem(REQUIREMENTS_STORAGE_KEY) ||
      localStorage.getItem(JUST_SCROLLING_KEY)
    );
  } catch { return false; }
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function normalise(str: string | null | undefined): string {
  return (str ?? "").toLowerCase().trim();
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Score a single property against the customer's requirements.
 * Returns a MatchResult with score 0–100 plus hit/miss explanations.
 */
export function scoreProperty(
  req: CustomerRequirements,
  prop: ApiProperty,
): MatchResult {
  let earned   = 0;   // weighted points earned
  let possible = 0;   // maximum possible points (only for specified requirements)
  const hits:  string[] = [];
  const misses: string[] = [];

  // ── 1. Listing type (Rent / Buy / PG) ─────────────────────────────────────
  if (req.listing_type) {
    possible += WEIGHTS.listing_type;
    if (normalise(prop.listing_type) === normalise(req.listing_type)) {
      earned += WEIGHTS.listing_type;
      hits.push(req.listing_type === "sale" ? "For sale" : req.listing_type === "pg" ? "PG accommodation" : req.listing_type === "short_term" ? "Short-Term Stay" : "Available for rent");
    } else {
      misses.push(`Listed as ${prop.listing_type}, you want ${req.listing_type}`);
    }
  }

  // ── 2. Location ────────────────────────────────────────────────────────────
  if (req.location.trim()) {
    possible += WEIGHTS.location;
    const reqLoc   = normalise(req.location);
    const propCity = normalise(prop.city);
    const propLoc  = normalise(prop.locality ?? "");
    const propAddr = normalise(prop.address ?? "");

    const exactLocality = propLoc.includes(reqLoc) || reqLoc.includes(propLoc);
    const cityMatch     = propCity.includes(reqLoc) || reqLoc.includes(propCity);
    const addressHint   = propAddr.includes(reqLoc);

    if (exactLocality) {
      earned += WEIGHTS.location;
      hits.push(`In ${prop.locality || prop.city}`);
    } else if (cityMatch || addressHint) {
      // Partial — same city
      earned += Math.round(WEIGHTS.location * 0.6);
      hits.push(`In ${prop.city} (your preferred area)`);
    } else {
      misses.push(`Located in ${prop.city}, not your preferred area`);
    }
  }

  // ── 3. Budget ──────────────────────────────────────────────────────────────
  const [budMin, budMax] = req.budget;
  if (budMax > 0) {
    possible += WEIGHTS.budget;
    const price = prop.listing_type === "short_term" && prop.short_term_price ? prop.short_term_price : prop.price;

    if (price <= budMax && (budMin === 0 || price >= budMin)) {
      // Perfectly within range
      earned += WEIGHTS.budget;
      hits.push("Within your budget");
    } else if (price > budMax) {
      const overBy = price - budMax;
      const overPct = (overBy / budMax) * 100;
      if (overPct <= 10) {
        // ≤10% over — partial credit
        earned += Math.round(WEIGHTS.budget * 0.5);
        const overAmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(overBy);
        misses.push(`${overAmt} above your budget`);
      } else if (overPct <= 25) {
        earned += Math.round(WEIGHTS.budget * 0.25);
        misses.push(`Slightly above your budget`);
      } else {
        misses.push(`Above your budget`);
      }
    } else {
      // Below min (unexpectedly cheap — still a win but worth noting)
      earned += WEIGHTS.budget;
      hits.push("Within your budget");
    }
  }

  // ── 4. Property type ───────────────────────────────────────────────────────
  if (req.property_type && req.property_type !== "Other") {
    possible += WEIGHTS.property_type;
    // Normalise aliases
    const aliases: Record<string, string[]> = {
      "apartment": ["apartment", "flat"],
      "villa":     ["villa", "house", "bungalow", "row house"],
      "pg":        ["pg", "co-living", "hostel"],
      "office space": ["office", "office space"],
      "shop":      ["shop", "showroom", "retail"],
      "warehouse": ["warehouse", "godown", "industrial"],
    };
    const reqNorm  = normalise(req.property_type);
    const propNorm = normalise(prop.property_type);
    const reqAliases = aliases[reqNorm] ?? [reqNorm];
    const match = reqAliases.some(a => propNorm.includes(a)) ||
                  propNorm === reqNorm;

    if (match) {
      earned += WEIGHTS.property_type;
      hits.push(prop.property_type);
    } else {
      misses.push(`${prop.property_type} (you prefer ${req.property_type})`);
    }
  }

  // ── 5. BHK / Bedrooms ─────────────────────────────────────────────────────
  if (req.bedrooms !== null) {
    possible += WEIGHTS.bedrooms;
    const propBed = prop.bedrooms ?? 0;

    if (req.bedrooms === 0) {
      // Studio — expect 0 or 1 bedrooms
      if (propBed <= 1) {
        earned += WEIGHTS.bedrooms;
        hits.push("Studio / 1 BHK");
      } else {
        misses.push(`${propBed} BHK (you want studio)`);
      }
    } else if (req.bedrooms === 4) {
      // 4+ BHK
      if (propBed >= 4) {
        earned += WEIGHTS.bedrooms;
        hits.push(`${propBed} BHK`);
      } else if (propBed === 3) {
        earned += Math.round(WEIGHTS.bedrooms * 0.5);
        misses.push(`${propBed} BHK (you want 4+)`);
      } else {
        misses.push(`${propBed} BHK (you want 4+)`);
      }
    } else {
      if (propBed === req.bedrooms) {
        earned += WEIGHTS.bedrooms;
        hits.push(`${propBed} BHK`);
      } else if (Math.abs(propBed - req.bedrooms) === 1) {
        // 1 BHK off — partial
        earned += Math.round(WEIGHTS.bedrooms * 0.5);
        misses.push(`${propBed} BHK (you want ${req.bedrooms} BHK)`);
      } else {
        misses.push(`${propBed} BHK (you want ${req.bedrooms} BHK)`);
      }
    }
  }

  // ── 6. Furnishing ─────────────────────────────────────────────────────────
  if (req.furnished) {
    possible += WEIGHTS.furnished;
    const propFur = normalise(prop.furnished);
    const reqFur  = normalise(req.furnished);

    if (propFur === reqFur) {
      earned += WEIGHTS.furnished;
      hits.push(prop.furnished);
    } else if (
      (reqFur === "fully furnished" && propFur.includes("semi")) ||
      (reqFur === "semi-furnished" && propFur.includes("fully"))
    ) {
      // Close match
      earned += Math.round(WEIGHTS.furnished * 0.6);
      misses.push(`${prop.furnished} (you prefer ${req.furnished})`);
    } else {
      misses.push(`${prop.furnished} (you prefer ${req.furnished})`);
    }
  }

  // ── 7. Amenities ──────────────────────────────────────────────────────────
  if (req.amenities.length > 0) {
    possible += WEIGHTS.amenities;
    const propAmenityNames = (prop.amenities ?? []).map(a => normalise(a.name));
    const matched = req.amenities.filter(a =>
      propAmenityNames.some(pa => pa.includes(normalise(a)) || normalise(a).includes(pa))
    );
    const ratio = matched.length / req.amenities.length;
    earned += Math.round(WEIGHTS.amenities * ratio);

    if (matched.length > 0) {
      hits.push(`${matched.length}/${req.amenities.length} amenities matched`);
    }
    if (matched.length < req.amenities.length) {
      const missing = req.amenities.filter(a =>
        !propAmenityNames.some(pa => pa.includes(normalise(a)) || normalise(a).includes(pa))
      );
      if (missing.length > 0) {
        misses.push(`Missing: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? ` +${missing.length - 2}` : ""}`);
      }
    }
  }

  // ── 8. Pool requirement (Villa / Farm House) ───────────────────────────────
  if (req.hasPool) {
    possible += 5;
    const propAmenityNames = (prop.amenities ?? []).map(a => normalise(a.name));
    const hasPool = propAmenityNames.some(a => a.includes("pool") || a.includes("swimming"));
    if (hasPool) {
      earned += 5;
      hits.push("Has swimming pool");
    } else {
      misses.push("No swimming pool");
    }
  }

  // ── 9. PG beds ─────────────────────────────────────────────────────────────
  if (req.beds !== null && req.property_type === "PG") {
    possible += WEIGHTS.bedrooms; // reuse bedrooms weight
    const propBed = prop.bedrooms ?? 0;
    if (req.beds === 0 || req.beds === null) {
      // sharing / any — always matches
      earned += WEIGHTS.bedrooms;
      hits.push("Sharing / any bed type");
    } else if (propBed === req.beds) {
      earned += WEIGHTS.bedrooms;
      hits.push(`${req.beds}-bed room`);
    } else {
      misses.push(`${propBed}-bed room (you want ${req.beds})`);
    }
  }

  // ── 10. Cabins / office rooms ──────────────────────────────────────────────
  if (req.cabins !== null && (req.property_type === "Office Space" || req.property_type === "Shop")) {
    possible += WEIGHTS.bedrooms;
    const propBed = prop.bedrooms ?? 0; // DB stores rooms as bedrooms for commercial
    if (req.cabins === null) {
      earned += WEIGHTS.bedrooms;
    } else if (propBed >= (req.cabins ?? 0)) {
      earned += WEIGHTS.bedrooms;
      hits.push(`${propBed} cabins / rooms available`);
    } else {
      misses.push(`Only ${propBed} cabins (you need ${req.cabins})`);
    }
  }

  // ── Final score ────────────────────────────────────────────────────────────
  const raw = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  // Clamp to [0, 100]
  const score = Math.min(100, Math.max(0, raw));

  const tier: MatchResult["tier"] =
    score >= 80 ? "Excellent" :
    score >= 65 ? "Good" :
    score >= 45 ? "Fair" :
    "Low";

  return { score, tier, hits, misses };
}

/**
 * Score all properties and return them sorted best-match first.
 * Properties with no requirements set return score = 0 and are unchanged in order.
 */
export function rankProperties(
  props: ApiProperty[],
  req: CustomerRequirements | null,
): Array<ApiProperty & { matchScore: number; matchResult: MatchResult }> {
  if (!req) {
    return props.map(p => ({
      ...p,
      matchScore: 0,
      matchResult: { score: 0, tier: "Low" as const, hits: [], misses: [] },
    }));
  }
  return props
    .map(p => {
      const result = scoreProperty(req, p);
      return { ...p, matchScore: result.score, matchResult: result };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
