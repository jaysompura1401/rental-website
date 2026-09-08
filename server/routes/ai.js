import express from "express";

const router = express.Router();

// Helper to extract locality from title if locality field is empty
function extractLocalityFromTitle(title, locality) {
  if (locality && locality.trim()) return locality.trim();
  if (!title) return "";
  // Match "in <locality>" e.g. "3 BHK in Bodakdev near Starbucks"
  const match = title.match(/in\s+([a-zA-Z0-9\s]+?)(?=\s+(near|with|at|for|available|under|price|opposite)|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return "";
}

// Helper to extract BHK from title if bedrooms field is empty
function extractBhkFromTitle(title, bedrooms) {
  if (bedrooms) return `${bedrooms} BHK `;
  if (!title) return "";
  const match = title.match(/(\d+)\s*(bhk|bedroom|bed)/i);
  if (match && match[1]) {
    return `${match[1]} BHK `;
  }
  return "";
}

function toSmartTitleCase(str) {
  if (!str) return "";
  let result = str.replace(/(?:^|\s|-|\/|\()([a-z])/g, match => match.toUpperCase());
  result = result
    .replace(/(\d+)\s*(bhk|Bhk|BHK)/gi, "$1 BHK")
    .replace(/\b(bhk|Bhk)\b/gi, "BHK")
    .replace(/\b(pg|Pg)\b/gi, "PG")
    .replace(/\b(rk|Rk)\b/gi, "RK")
    .replace(/\b(cctv|Cctv)\b/gi, "CCTV")
    .replace(/\b(ev)\b/gi, "EV")
    .replace(/\b(ac)\b/gi, "AC")
    .replace(/\b(tv)\b/gi, "TV")
    .replace(/\b(wifi|Wifi)\b/gi, "WiFi")
    .replace(/\b(sqft|sq\.ft|sq ft|Sqft|Sq\.Ft)\b/gi, "Sq Ft");
  return result;
}

// ─── Fully Dynamic Contextual AI Description Generator ──────────────────────
function generateSmartDescription({
  title,
  property_type = "Apartment",
  listing_type = "rent",
  bedrooms,
  bathrooms,
  area_sqft,
  locality,
  city = "Ahmedabad",
  building_name,
  landmark,
  furnished,
  amenities = [],
}) {
  const pTypeLower = (property_type || "Apartment").toLowerCase();

  const isOffice = pTypeLower.includes("office") || pTypeLower.includes("commercial") || pTypeLower.includes("workspace");
  const isShop   = pTypeLower.includes("shop") || pTypeLower.includes("retail") || pTypeLower.includes("showroom");
  const isPg     = pTypeLower.includes("pg") || pTypeLower.includes("hostel") || listing_type === "pg";
  const isVilla  = pTypeLower.includes("villa") || pTypeLower.includes("house") || pTypeLower.includes("bungalow");

  // 1. Build Location Chain: [Building], [Landmark], [Locality], [City] (No duplicate city names!)
  const bldgClean = building_name ? toSmartTitleCase(building_name.trim()) : "";
  const locClean  = locality ? toSmartTitleCase(locality.trim()) : "";
  const ctyClean  = city ? toSmartTitleCase(city.trim()) : "Ahmedabad";
  let lmkClean    = landmark ? toSmartTitleCase(landmark.trim()) : "";

  // Ensure landmark starts with appropriate preposition if not present
  if (lmkClean && !/^(near|opp|opposite|behind|beside|next to|close to|around)/i.test(lmkClean)) {
    lmkClean = `Near ${lmkClean}`;
  }

  const locParts = [];
  if (bldgClean) locParts.push(bldgClean);
  if (lmkClean) locParts.push(lmkClean);
  if (locClean && locClean.toLowerCase() !== bldgClean.toLowerCase() && locClean.toLowerCase() !== ctyClean.toLowerCase()) {
    locParts.push(locClean);
  }
  if (ctyClean && locParts.every(p => p.toLowerCase() !== ctyClean.toLowerCase())) {
    locParts.push(ctyClean);
  }

  const locationText = locParts.join(", ") || ctyClean;
  const furnishedFormatted = furnished ? toSmartTitleCase(furnished.trim()) : "";
  const areaText = area_sqft ? `${area_sqft.trim()} Sq Ft` : "";

  // 2. Line 1: Dynamic Opening Header
  let line1 = "";
  if (isOffice) {
    const seatsText = bedrooms ? ` With ${bedrooms} Dedicated Workstations` : "";
    line1 = `✨ Premium Commercial Office Space${seatsText} Available For ${listing_type === "sale" ? "Sale" : "Rent"} In ${locationText}.`;
  } else if (isShop) {
    line1 = `✨ High-Visibility Retail Shop / Showroom Available For ${listing_type === "sale" ? "Sale" : "Rent"} In Prime ${locationText}.`;
  } else if (isPg) {
    line1 = `✨ Fully Managed & Serviced PG / Hostel Accommodation Available In ${locationText}.`;
  } else if (isVilla) {
    const bhkText = bedrooms ? `${bedrooms} BHK ` : "";
    line1 = `✨ Luxury ${bhkText}Independent Villa / House Available For ${listing_type === "sale" ? "Sale" : "Rent"} In ${locationText}.`;
  } else {
    const bhkText = bedrooms ? `${bedrooms} BHK ` : "";
    const pName = toSmartTitleCase(property_type || "Apartment");
    line1 = `✨ Modern ${bhkText}${pName} Available For ${listing_type === "sale" ? "Sale" : "Rent"} In ${locationText}.`;
  }

  // 3. Line 2: Dynamic Interior Setup & Capacity Breakdown
  let line2 = "";
  if (isOffice) {
    const workstationsPart = bedrooms ? `${bedrooms} Workstations` : "Open Layout Workstations";
    const cabinsPart = bathrooms ? `, ${bathrooms} Private Cabins` : "";
    const furnPart = furnishedFormatted ? `${furnishedFormatted} Interiors` : "Modern Commercial Fitouts";
    const areaPart = areaText ? ` Spanning ${areaText}` : "";
    line2 = `🏢 Features A Fully Operational Workspace${areaPart} With ${workstationsPart}${cabinsPart} & ${furnPart}.`;
  } else if (isShop) {
    const areaPart = areaText ? ` Covering ${areaText}` : "";
    line2 = `🛍️ Features Wide Street Frontage${areaPart} With ${furnishedFormatted || "Customizable"} Layout & Maximum Footfall Exposure.`;
  } else if (isPg) {
    const bathPart = bathrooms ? ` With ${bathrooms} Attached Washrooms` : "";
    line2 = `🏡 Offers Hygienic ${furnishedFormatted || "Fully Furnished"} Rooms${bathPart}, Regular Housekeeping & High-Speed Utilities.`;
  } else if (isVilla) {
    const bhkPart = bedrooms ? `${bedrooms} Spacious Bedrooms` : "Generous Living Spaces";
    const bathPart = bathrooms ? `, ${bathrooms} Modern Bathrooms` : "";
    const areaPart = areaText ? ` Spanning ${areaText}` : "";
    line2 = `🏡 Features Private Gated Premises${areaPart} Comprising ${bhkPart}${bathPart} And ${furnishedFormatted || "High-End"} Finishes.`;
  } else {
    const bhkPart = bedrooms ? `${bedrooms} Bedrooms` : "Spacious Living Area";
    const bathPart = bathrooms ? `, ${bathrooms} Bathrooms` : "";
    const areaPart = areaText ? ` (${areaText})` : "";
    line2 = `🏡 Features A Bright & Airy Layout${areaPart} With ${bhkPart}${bathPart} And ${furnishedFormatted || "Well-Maintained"} Interiors.`;
  }

  // 4. Line 3: Dynamic Selected Amenities List
  const amenityList = Array.isArray(amenities)
    ? amenities.map(a => typeof a === "string" ? toSmartTitleCase(a) : toSmartTitleCase(a?.name || "")).filter(Boolean)
    : [];

  let line3 = "";
  if (amenityList.length > 0) {
    line3 = `🌟 Outfitted With Top Amenities Including ${amenityList.join(", ")}.`;
  } else if (isOffice || isShop) {
    line3 = `🌟 Equipped With Essential Commercial Infrastructure Including High-Speed WiFi, Power Backup, 24/7 Security & Elevator Service.`;
  } else if (isPg) {
    line3 = `🌟 Includes All Essential Services Such As High-Speed Internet, Housekeeping, Filtered Water & Security.`;
  } else {
    line3 = `🌟 Equipped With Lifestyle Amenities Including Reserved Parking, 24/7 Security & Power Backup.`;
  }

  // 5. Line 4: Dynamic Locality & Connectivity Highlights (Weaving in landmark if provided)
  let line4 = "";
  const primaryLoc = locClean || bldgClean || ctyClean;
  const lmkPhrase = lmkClean ? `, Conveniently Situated ${lmkClean}` : "";

  if (isOffice || isShop) {
    line4 = `📍 Prime Commercial Location In ${primaryLoc}${lmkPhrase}, Providing Direct Connectivity To Transit Outlets, Banking Centers, Cafes & Business Hubs.`;
  } else if (isPg) {
    line4 = `📍 Located In A Safe, Student & Professional-Friendly Neighborhood In ${primaryLoc}${lmkPhrase}, With Easy Access To Transit & Markets.`;
  } else {
    line4 = `📍 Prime Neighborhood In ${primaryLoc}${lmkPhrase}, Offering Seamless Proximity To Renowned Schools, Healthcare Facilities & Express Routes.`;
  }

  // 6. Line 5: Call to Action
  let line5 = "";
  if (isOffice || isShop) {
    line5 = `📞 Contact The Owner Today For Complete Lease Details Or To Schedule An Exclusive Site Tour.`;
  } else if (isPg) {
    line5 = `📞 Call Now To Verify Room Availability And Reserve Your Accommodation.`;
  } else if (listing_type === "sale") {
    line5 = `📞 Inquire Now For Exact Pricing, Floor Plans, Or To Arrange A Private Site Tour.`;
  } else {
    line5 = `📞 Contact The Owner Today To Inquire Further Or Schedule An Exclusive Walkthrough.`;
  }

  return `${line1}\n\n${line2}\n\n${line3}\n\n${line4}\n\n${line5}`;
}

// ─── POST /api/ai/generate-description ───────────────────────────────────────
router.post("/generate-description", async (req, res) => {
  try {
    const { title, property_type, listing_type, bedrooms, bathrooms, area_sqft, locality, city, building_name, house_number, wing, landmark, furnished, amenities } = req.body;

    const resolvedLocality = locality || extractLocalityFromTitle(title, locality);

    // Try Gemini API if key exists in env
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Write a dynamic, high-end 4 to 5 line eye-catching real estate description strictly based on these user details:
Property Type: ${property_type || "Apartment"}
Listing Type: ${listing_type || "rent"}
Building/Complex Name: ${building_name || ""}
Locality: ${resolvedLocality || ""}
City: ${city || "Ahmedabad"}
Landmark: ${landmark || ""}
Bedrooms / Workstations: ${bedrooms || ""}
Bathrooms / Cabins: ${bathrooms || ""}
Area: ${area_sqft ? `${area_sqft} Sq Ft` : ""}
Furnished Status: ${furnished || "Semi-Furnished"}
Selected Amenities: ${Array.isArray(amenities) && amenities.length > 0 ? amenities.join(", ") : "None selected"}

CRITICAL CUSTOMIZATION RULES:
1. NO STATIC HARDCODED TEMPLATES: Every sentence must dynamically adapt to the exact user inputs above.
2. Property Type Specifics:
   - For "Office Space" / "Commercial": Call it "Commercial Office Space". NEVER use words like "Apartment", "Flat", or "BHK". Use Workstations and Cabins.
   - For "PG": Call it "PG / Hostel Accommodation".
   - For "Villa": Call it "Independent Villa / House".
   - For "Shop": Call it "Retail Shop / Showroom".
3. Location Formatting:
   - Construct location strictly as: "${building_name ? `${building_name}, ` : ""}${resolvedLocality ? `${resolvedLocality}, ` : ""}${city || "Ahmedabad"}"
   - NEVER repeat city names (e.g. NEVER write "Ahmedabad, Ahmedabad").
4. Amenities:
   - If user selected specific amenities, include those exact amenities in line 3.
5. Format:
   - Exactly 4 to 5 lines starting with emojis (✨, 🏢/🛍️/🏡, 🌟, 📍, 📞).
   - Every word must start with a Capital Letter (Title Case format).`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const json = await response.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return res.json({ description: text.trim() });
        }
      } catch (aiErr) {
        console.warn("Gemini AI fetch error, using smart template fallback:", aiErr.message);
      }
    }

    // Smart AI Template Generator (Always reliable fallback)
    const generated = generateSmartDescription({
      title: (title || "").trim(),
      property_type,
      listing_type,
      bedrooms,
      bathrooms,
      area_sqft,
      locality: resolvedLocality,
      city,
      building_name,
      landmark,
      furnished,
      amenities,
    });

    res.json({ description: generated });
  } catch (error) {
    console.error("AI Generate Error:", error);
    res.status(500).json({ error: "Failed to generate AI description" });
  }
});

// ─── POST /api/ai/generate-titles ──────────────────────────────────────────
router.post("/generate-titles", async (req, res) => {
  try {
    const { property_type, listing_type, bedrooms, bathrooms, area_sqft, furnished, locality, city } = req.body;

    const isOffice = (property_type || "").toLowerCase().includes("office");
    const loc = toSmartTitleCase(locality || city || "Prime Locality");
    const cty = toSmartTitleCase(city || "Ahmedabad");
    const area = area_sqft ? `${area_sqft} Sq Ft` : "";
    const furn = furnished ? toSmartTitleCase(furnished) : "";
    const listType = listing_type === "sale" ? "For Sale" : listing_type === "pg" ? "For PG" : "For Rent";
    const propType = toSmartTitleCase(property_type || "Apartment");

    let titles = [];

    if (isOffice) {
      const seats = bedrooms ? `${bedrooms} Seats` : "";
      const cabins = bathrooms ? `${bathrooms} Cabins` : "";
      titles = [
        { tag: "Capacity & Hub", icon: "🏢", title: toSmartTitleCase(`${seats ? `${seats} ` : ""}Commercial Office Space In ${loc}, ${cty}`.trim()) },
        { tag: "Cabins & Setup", icon: "💼", title: toSmartTitleCase(`${furn ? `${furn} ` : ""}Office Space ${cabins ? `With ${cabins} ` : ""}In ${loc}`.trim()) },
        { tag: "Area & Workspace", icon: "📏", title: toSmartTitleCase(`Spacious ${area ? `${area} ` : ""}Corporate Office In Prime ${loc}`.trim()) },
        { tag: "Listing Focus", icon: "🏷️", title: toSmartTitleCase(`Premium Commercial Office Space ${listType} In ${loc}, ${cty}`.trim()) },
      ];
    } else {
      const bhk = bedrooms ? `${bedrooms} BHK` : "";
      titles = [
        { tag: "Locality & Type", icon: "📍", title: toSmartTitleCase(`Spacious ${bhk ? `${bhk} ` : ""}${propType} In ${loc}, ${cty}`.trim()) },
        { tag: "Furnishing & Style", icon: "✨", title: toSmartTitleCase(`${furn ? `${furn} ` : ""}${bhk ? `${bhk} ` : ""}${propType} In ${loc}`.trim()) },
        { tag: "Area & Layout", icon: "📏", title: toSmartTitleCase(`Modern ${area ? `${area} ` : ""}${bhk ? `${bhk} ` : ""}${propType} In Prime ${loc}`.trim()) },
        { tag: "Listing Focus", icon: "🏷️", title: toSmartTitleCase(`${bhk ? `${bhk} ` : ""}${propType} Available ${listType} In ${loc}, ${cty}`.trim()) },
      ];
    }

    res.json({ titles });
  } catch (error) {
    console.error("AI Title Generate Error:", error);
    res.status(500).json({ error: "Failed to generate AI titles" });
  }
});

export default router;
