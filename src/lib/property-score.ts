import { type ApiProperty } from "./api";

export interface ScoreCategory {
  score: number;
  max: number;
  label: string;
  percentage: number;
  details?: string;
}

export interface PropertyQualityScoreBreakdown {
  configuration: ScoreCategory;      // /20
  location: ScoreCategory;           // /10
  photos: ScoreCategory;             // /10
  condition: ScoreCategory;          // /10
  listingCompleteness: ScoreCategory;// /50
}

export interface PropertyScoreResult {
  totalScore: number;                // 0 to 100
  overall: number;                   // 1.0 to 5.0 (for 5-star rating display e.g. 4.5, 4.7, 4.3)
  outOf: 5;
  score100: number;                  // 0 to 100
  label: "Excellent" | "Very Good" | "Good" | "Average" | "Needs Improvement";
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  breakdown: PropertyQualityScoreBreakdown;
  highlights: string[];
}

export interface QualityInput {
  title?: string | null;
  property_type?: string | null;
  listing_type?: string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  area_sqft?: number | string | null;
  furnished?: string | null;
  amenities?: (string | { name: string })[] | null;
  city?: string | null;
  locality?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  map_url?: string | null;
  price?: number | string | null;
  deposit?: number | string | null;
  description?: string | null;
  notes?: string | null;
  imagesCount?: number | null;
  images?: unknown[] | null;
  verified?: boolean | number | null;
}

/**
 * Intelligent Property Quality Scoring Engine (100 Points Total)
 *
 * Categories:
 * 1. CONFIGURATION (20 Points)
 * 2. LOCATION (10 Points)
 * 3. PHOTOS (10 Points)
 * 4. PROPERTY CONDITION / REMARKS (10 Points)
 * 5. BASIC INFO + LISTING COMPLETENESS + PRICING (50 Points)
 */
export function calculatePropertyQualityScore(input: QualityInput): PropertyScoreResult {
  const highlights: string[] = [];

  const propType = (input.property_type || "Apartment").toLowerCase();
  const isOffice = propType.includes("office");
  const isVilla = propType.includes("villa");

  // Normalized amenity names
  const amenityList = Array.isArray(input.amenities)
    ? input.amenities.map(a => (typeof a === "string" ? a : a.name || "").toLowerCase().trim())
    : [];

  const hasAmenity = (keywords: string[]) =>
    amenityList.some(a => keywords.some(k => a.includes(k.toLowerCase())));

  // ═════════════════════════════════════════════════════════════════════════
  // 1. CONFIGURATION (20 POINTS)
  // ═════════════════════════════════════════════════════════════════════════
  let configScore = 0;

  if (isOffice) {
    // ── Office Space Scoring ──
    const seats = input.bedrooms ? Number(input.bedrooms) : 0;
    const cabins = input.bathrooms ? Number(input.bathrooms) : 0;
    const area = input.area_sqft ? Number(input.area_sqft) : 0;
    const furnished = (input.furnished || "").toLowerCase();

    // Workstations & Seating Capacity (up to 4 pts)
    if (seats >= 30) { configScore += 4; highlights.push(`${seats} Workstations`); }
    else if (seats >= 15) { configScore += 3.5; highlights.push(`${seats} Workstations`); }
    else if (seats >= 5) { configScore += 3; }
    else if (seats > 0) { configScore += 2; }

    // Cabins & Meeting rooms (up to 3 pts)
    if (cabins >= 4) { configScore += 3; highlights.push(`${cabins} Private Cabins`); }
    else if (cabins >= 2) { configScore += 2.5; }
    else if (cabins >= 1) { configScore += 2; }

    // Commercial Area (up to 3 pts)
    if (area >= 3000) { configScore += 3; highlights.push("Large Commercial Floor"); }
    else if (area >= 1500) { configScore += 2.5; }
    else if (area >= 800) { configScore += 2; }
    else if (area > 0) { configScore += 1.5; }

    // Commercial Furnishing (up to 2 pts)
    if (furnished.includes("fully")) { configScore += 2; highlights.push("Plug & Play Setup"); }
    else if (furnished.includes("semi")) { configScore += 1.5; }
    else { configScore += 1; }

    // High-Value Office Amenities (up to 8 pts)
    let officeAmenityPts = 0;
    if (hasAmenity(["power backup", "generator", "dg backup"])) officeAmenityPts += 1.5;
    if (hasAmenity(["24/7 access", "24x7 access", "round the clock"])) officeAmenityPts += 1.2;
    if (hasAmenity(["conference room", "meeting room", "board room"])) officeAmenityPts += 1.2;
    if (hasAmenity(["parking", "reserved parking", "visitor parking"])) officeAmenityPts += 1.0;
    if (hasAmenity(["cctv", "security", "access control"])) officeAmenityPts += 1.0;
    if (hasAmenity(["air conditioning", "central ac", "hvac", "ac"])) officeAmenityPts += 0.8;
    if (hasAmenity(["wifi", "internet", "leased line", "fiber"])) officeAmenityPts += 0.8;
    if (hasAmenity(["lift", "elevator"])) officeAmenityPts += 0.5;
    if (hasAmenity(["pantry", "cafeteria", "breakout"])) officeAmenityPts += 0.5;
    if (hasAmenity(["reception", "waiting lounge"])) officeAmenityPts += 0.5;
    if (hasAmenity(["fire safety", "smoke detector", "sprinkler"])) officeAmenityPts += 0.5;

    configScore += Math.min(officeAmenityPts, 8);
  } else {
    // ── Residential (Apartment / Villa) Scoring ──
    const beds = input.bedrooms ? Number(input.bedrooms) : 0;
    const baths = input.bathrooms ? Number(input.bathrooms) : 0;
    const area = input.area_sqft ? Number(input.area_sqft) : 0;
    const furnished = (input.furnished || "").toLowerCase();

    // Bedroom / BHK (up to 3 pts)
    if (beds >= 4) { configScore += 3; highlights.push(`${beds} BHK Luxury Layout`); }
    else if (beds >= 3) { configScore += 2.8; highlights.push(`${beds} BHK Spacious`); }
    else if (beds >= 2) { configScore += 2.5; }
    else if (beds >= 1) { configScore += 2.0; }

    // Bathroom configuration (up to 3 pts)
    if (baths >= beds && baths >= 2) { configScore += 3; }
    else if (baths >= 2) { configScore += 2.5; }
    else if (baths >= 1) { configScore += 2.0; }

    // Area & Space (up to 3 pts)
    if (isVilla && area >= 3000) { configScore += 3; highlights.push("Expansive Villa Estate"); }
    else if (area >= 2200) { configScore += 3; highlights.push("Generous Super Area"); }
    else if (area >= 1400) { configScore += 2.5; }
    else if (area >= 800) { configScore += 2.0; }
    else if (area > 0) { configScore += 1.5; }

    // Furnishing (up to 2 pts)
    if (furnished.includes("fully")) { configScore += 2; highlights.push("Fully Furnished"); }
    else if (furnished.includes("semi")) { configScore += 1.5; highlights.push("Semi-Furnished"); }
    else { configScore += 1.0; }

    // Desirable Residential Amenities (up to 9 pts)
    let resAmenityPts = 0;
    // High-value tier
    if (hasAmenity(["swimming pool", "private pool"])) resAmenityPts += 1.5;
    if (hasAmenity(["gym", "fitness center"])) resAmenityPts += 1.3;
    if (hasAmenity(["power backup", "generator", "inverter"])) resAmenityPts += 1.2;
    if (hasAmenity(["parking", "car parking", "reserved parking"])) resAmenityPts += 1.2;
    if (hasAmenity(["cctv", "security guard", "24/7 security", "gated"])) resAmenityPts += 1.2;
    if (hasAmenity(["lift", "elevator"])) resAmenityPts += 1.0;
    if (hasAmenity(["clubhouse", "club house"])) resAmenityPts += 0.8;
    if (hasAmenity(["children play area", "kids play area", "playground"])) resAmenityPts += 0.8;
    if (hasAmenity(["water supply 24/7", "24/7 water supply", "water supply"])) resAmenityPts += 0.8;
    // Comfort tier
    if (hasAmenity(["air conditioning", "ac"])) resAmenityPts += 0.6;
    if (hasAmenity(["wifi", "high speed wifi", "internet"])) resAmenityPts += 0.6;
    if (hasAmenity(["balcony", "terrace"])) resAmenityPts += 0.5;
    if (hasAmenity(["gas pipeline", "piped gas"])) resAmenityPts += 0.5;
    if (hasAmenity(["pet friendly"])) resAmenityPts += 0.4;
    if (hasAmenity(["intercom"])) resAmenityPts += 0.4;

    configScore += Math.min(resAmenityPts, 9);
  }

  configScore = Math.min(Math.max(Number(configScore.toFixed(1)), 4), 20);

  // ═════════════════════════════════════════════════════════════════════════
  // 2. LOCATION (10 POINTS)
  // ═════════════════════════════════════════════════════════════════════════
  let locScore = 4.0; // Base valid location score

  const city = (input.city || "").toLowerCase();
  const locality = (input.locality || "").toLowerCase();
  const address = (input.address || "").toLowerCase();
  const hasCoords = Boolean(input.latitude && input.longitude);
  const hasMapUrl = Boolean(input.map_url);

  // Verified coordinates / map link (up to 2.5 pts)
  if (hasCoords) {
    locScore += 2.5;
    highlights.push("GPS Verified Location");
  } else if (hasMapUrl) {
    locScore += 1.5;
  }

  // Address and locality completeness (up to 2 pts)
  if (address.length > 15) locScore += 1.5;
  else if (address.length > 5) locScore += 1.0;

  if (locality.length > 3) locScore += 0.5;

  // High-demand prime locality & city connectivity bonus (up to 1.5 pts)
  const primeLocalities = [
    "bodakdev", "prahladnagar", "satellite", "bopal", "shela", "thaltej", "sg highway",
    "vesu", "adajan", "pal", "alkapuri", "gotri", "karelibaug",
    "bkc", "bandra", "andheri", "powai", "koramangala", "indiranagar", "whitefield",
    "hitec city", "gachibowli", "cyber city", "jubilee hills",
  ];

  if (primeLocalities.some(pl => locality.includes(pl) || address.includes(pl))) {
    locScore += 1.5;
    highlights.push("Prime High-Demand Locality");
  } else if (city.length > 0) {
    locScore += 0.8;
  }

  locScore = Math.min(Math.max(Number(locScore.toFixed(1)), 3), 10);

  // ═════════════════════════════════════════════════════════════════════════
  // 3. PHOTOS (10 POINTS)
  // ═════════════════════════════════════════════════════════════════════════
  let photoScore = 1.0;
  const count = typeof input.imagesCount === "number"
    ? input.imagesCount
    : Array.isArray(input.images)
    ? input.images.length
    : 0;

  if (count >= 10) {
    photoScore = 10.0;
    highlights.push("10+ Comprehensive Photos");
  } else if (count >= 7) {
    photoScore = 9.0;
    highlights.push("Rich Photo Gallery");
  } else if (count >= 5) {
    photoScore = 8.0;
  } else if (count >= 3) {
    photoScore = 6.5;
  } else if (count >= 1) {
    photoScore = 4.5;
  } else {
    photoScore = 1.0;
  }

  photoScore = Math.min(Math.max(Number(photoScore.toFixed(1)), 1), 10);

  // ═════════════════════════════════════════════════════════════════════════
  // 4. PROPERTY CONDITION / REMARKS (10 POINTS)
  // ═════════════════════════════════════════════════════════════════════════
  let condScore = 8.0; // Baseline good condition
  const combinedText = `${input.notes || ""} ${input.description || ""}`.toLowerCase();

  const positiveMarkers = [
    "recently renovated", "renovated", "fresh paint", "freshly painted", "brand new",
    "excellent condition", "flawless", "superb condition", "mint condition", "pristine",
    "well-maintained", "well maintained", "marble flooring", "designer interiors",
  ];

  const negativeMarkers = [
    "water leakage", "leakage", "paint needs repair", "damaged floor", "plumbing issue",
    "seepage", "repair needed", "structural damage", "broken tile", "furniture needs replacement",
    "needs repair", "damaged",
  ];

  let posCount = 0;
  let negCount = 0;
  for (const pos of positiveMarkers) {
    if (combinedText.includes(pos)) posCount++;
  }
  for (const neg of negativeMarkers) {
    if (combinedText.includes(neg)) negCount++;
  }

  if (negCount > 0) {
    condScore = Math.max(3.0, 8.0 - (negCount * 2.0));
  } else if (posCount > 0) {
    condScore = Math.min(10.0, 8.0 + Math.min(posCount * 0.8, 2.0));
    highlights.push("Excellent Property Condition");
  } else {
    condScore = 8.0;
  }

  condScore = Math.min(Math.max(Number(condScore.toFixed(1)), 3), 10);

  // ═════════════════════════════════════════════════════════════════════════
  // 5. BASIC INFO + LISTING COMPLETENESS + PRICING (50 POINTS)
  // ═════════════════════════════════════════════════════════════════════════
  let completenessScore = 0;

  // Title Completeness (up to 10 pts)
  const title = (input.title || "").trim();
  if (title.length >= 20) completenessScore += 10;
  else if (title.length >= 10) completenessScore += 7;
  else if (title.length > 0) completenessScore += 4;

  // Property Type & Listing Type (up to 5 pts)
  if (input.property_type && input.listing_type) completenessScore += 5;
  else if (input.property_type || input.listing_type) completenessScore += 2.5;

  // Pricing & Security Deposit (up to 15 pts)
  const price = Number(input.price || 0);
  const deposit = input.deposit !== null && input.deposit !== undefined ? Number(input.deposit) : 0;
  if (price > 0) {
    completenessScore += 10;
    if (input.listing_type === "sale" || deposit > 0) {
      completenessScore += 5;
    }
  }

  // Address & Locality Information (up to 10 pts)
  if (city.length > 0) completenessScore += 3;
  if (locality.length > 0) completenessScore += 3;
  if (address.length > 10) completenessScore += 4;

  // Description / AI Summary Quality (up to 10 pts)
  const desc = (input.description || "").trim();
  if (desc.length >= 120) completenessScore += 10;
  else if (desc.length >= 50) completenessScore += 7;
  else if (desc.length > 0) completenessScore += 4;

  completenessScore = Math.min(Math.max(Number(completenessScore.toFixed(1)), 10), 50);

  // ═════════════════════════════════════════════════════════════════════════
  // TOTAL QUALITY SCORE (OUT OF 100) & 5-STAR RATING (OUT OF 5.0)
  // ═════════════════════════════════════════════════════════════════════════
  const totalScore = Math.round(configScore + locScore + photoScore + condScore + completenessScore);
  const clampedTotal = Math.min(Math.max(totalScore, 20), 100);

  // 5-star rating conversion (e.g. 87/100 -> 4.4, 94/100 -> 4.7, 82/100 -> 4.1)
  const fiveStarRating = Number(Math.min(5.0, Math.max(1.0, (clampedTotal / 100) * 5)).toFixed(1));

  let label: PropertyScoreResult["label"] = "Good";
  let color = "#16a34a"; // green
  let badgeBg = "#f0fdf4";
  let badgeBorder = "#bbf7d0";
  let badgeText = "#15803d";

  if (clampedTotal >= 90) {
    label = "Excellent";
    color = "#C9921A";
    badgeBg = "#fef8eb";
    badgeBorder = "#f4deb4";
    badgeText = "#C9921A";
  } else if (clampedTotal >= 80) {
    label = "Very Good";
    color = "#16a34a";
    badgeBg = "#f0fdf4";
    badgeBorder = "#bbf7d0";
    badgeText = "#15803d";
  } else if (clampedTotal >= 70) {
    label = "Good";
    color = "#0284c7";
    badgeBg = "#f0f9ff";
    badgeBorder = "#bae6fd";
    badgeText = "#0369a1";
  } else if (clampedTotal >= 60) {
    label = "Average";
    color = "#d97706";
    badgeBg = "#fffbeb";
    badgeBorder = "#fde68a";
    badgeText = "#b45309";
  } else {
    label = "Needs Improvement";
    color = "#dc2626";
    badgeBg = "#fef2f2";
    badgeBorder = "#fecaca";
    badgeText = "#b91c1c";
  }

  return {
    totalScore: clampedTotal,
    score100: clampedTotal,
    overall: fiveStarRating,
    outOf: 5,
    label,
    color,
    badgeBg,
    badgeBorder,
    badgeText,
    breakdown: {
      configuration: {
        score: Number(configScore.toFixed(1)),
        max: 20,
        label: isOffice ? "Office Setup & Facilities" : "Configuration & Amenities",
        percentage: Math.round((configScore / 20) * 100),
      },
      location: {
        score: Number(locScore.toFixed(1)),
        max: 10,
        label: "Location & Connectivity",
        percentage: Math.round((locScore / 10) * 100),
      },
      photos: {
        score: Number(photoScore.toFixed(1)),
        max: 10,
        label: "Photos & Visual Quality",
        percentage: Math.round((photoScore / 10) * 100),
      },
      condition: {
        score: Number(condScore.toFixed(1)),
        max: 10,
        label: "Condition & Maintenance",
        percentage: Math.round((condScore / 10) * 100),
      },
      listingCompleteness: {
        score: Number(completenessScore.toFixed(1)),
        max: 50,
        label: "Listing Completeness & Pricing",
        percentage: Math.round((completenessScore / 50) * 100),
      },
    },
    highlights: Array.from(new Set(highlights)).slice(0, 4),
  };
}

/**
 * Backwards compatibility helper for existing cards
 */
export function calculatePropertyScore(p: Partial<ApiProperty>): PropertyScoreResult {
  return calculatePropertyQualityScore({
    title: p.title,
    property_type: p.property_type,
    listing_type: p.listing_type,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area_sqft: p.area_sqft,
    furnished: p.furnished,
    amenities: p.amenities,
    city: p.city,
    locality: p.locality,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    price: p.price,
    deposit: p.deposit,
    description: p.description,
    images: p.images,
    verified: p.verified,
  });
}

