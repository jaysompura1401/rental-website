import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AIPricingWidget } from "@/components/dashboard/AIPricingWidget";
import { PropertyPublishConfirmation } from "@/components/dashboard/PropertyPublishConfirmation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { properties as propertiesApi, uploadImages, aiApi, tourApi, type ApiPropertyImage, API_BASE } from "@/lib/api";
import { AI360Generator, type TourFormState } from "@/components/property/AI360Generator";
import { cities, propertyTypes } from "@/lib/mock-properties";
import { fetchProfile, type CachedProfile } from "@/lib/auth-cache";
import { calculatePropertyQualityScore } from "@/lib/property-score";
import {
  Loader2, ChevronLeft, ChevronRight, ChevronDown, Check,
  ImagePlus, X, Star, Upload, AlertCircle, MapPin, Navigation, ExternalLink, Sparkles, Plus,
  Bed, Bath, Home, Armchair, Building2, Pencil, Briefcase, Compass, Flame, Sun, Phone,
  Calendar, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/_authenticated/dashboard/properties/new")({
  head: () => ({ meta: [{ title: "Post Property — Nivaas" }] }),
  component: NewProperty,
});

// ─── Automated Vastu Calculation Engine ──────────────────────────────────────
function calculateVastuScore(entrance: string, kitchen: string, bedroom: string, balcony: string): {
  score: number;
  badgeLabel: string;
  badgeColor: string;
  isCertified: boolean;
  breakdown: { entranceScore: number; kitchenScore: number; bedroomScore: number; balconyScore: number };
  recommendations: string[];
} {
  let entranceScore = 0;
  let kitchenScore = 0;
  let bedroomScore = 0;
  let balconyScore = 0;
  const recommendations: string[] = [];

  // 1. Entrance Score (Max 35 Points)
  const ent = (entrance || "").trim();
  if (ent === "North-East" || ent === "East" || ent === "North") {
    entranceScore = 35;
  } else if (ent === "North-West" || ent === "South-East") {
    entranceScore = 20;
    recommendations.push("Consider placing a Vastu pyramid or Om symbol at the main entrance.");
  } else if (ent === "West") {
    entranceScore = 15;
    recommendations.push("West entrances benefit from warm yellow lighting near the doorway.");
  } else {
    entranceScore = 10;
    recommendations.push("South/South-West entrances benefit from a brass threshold decoration.");
  }

  // 2. Kitchen Placement Score (Max 25 Points)
  const kit = (kitchen || "").trim();
  if (kit === "South-East") {
    kitchenScore = 25; // Ideal Agni zone
  } else if (kit === "North-West") {
    kitchenScore = 20;
  } else if (kit === "East" || kit === "North") {
    kitchenScore = 15;
  } else {
    kitchenScore = 10;
    recommendations.push("Ensure cooktop faces East while cooking.");
  }

  // 3. Master Bedroom Score (Max 25 Points)
  const bed = (bedroom || "").trim();
  if (bed === "South-West") {
    bedroomScore = 25; // Ideal Nairutya zone
  } else if (bed === "South" || bed === "West") {
    bedroomScore = 20;
  } else if (bed === "North-West") {
    bedroomScore = 15;
  } else {
    bedroomScore = 10;
    recommendations.push("Place headboards toward South or East for restful sleep.");
  }

  // 4. Balcony/Window Alignment Score (Max 15 Points)
  const bal = (balcony || "").trim();
  if (bal === "East" || bal === "North" || bal === "North-East") {
    balconyScore = 15; // Morning sunlight
  } else if (bal === "North-West" || bal === "South-East") {
    balconyScore = 10;
  } else {
    balconyScore = 5;
    recommendations.push("Decorate balconies with green plants to enhance positive energy.");
  }

  const totalScore = entranceScore + kitchenScore + bedroomScore + balconyScore;
  const isCertified = totalScore >= 75;

  let badgeLabel = "Needs Vastu Tweaks";
  let badgeColor = "bg-amber-50 text-amber-700 border-amber-200";

  if (totalScore >= 85) {
    badgeLabel = "100% Certified Vastu Compliant ✓";
    badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-300 font-extrabold";
  } else if (totalScore >= 70) {
    badgeLabel = "Highly Vastu Compliant ✓";
    badgeColor = "bg-green-50 text-green-700 border-green-200 font-bold";
  } else if (totalScore >= 50) {
    badgeLabel = "Moderately Vastu Compliant";
    badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
  }

  return {
    score: totalScore,
    badgeLabel,
    badgeColor,
    isCertified,
    breakdown: { entranceScore, kitchenScore, bedroomScore, balconyScore },
    recommendations,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
function toSmartTitleCase(str: string): string {
  if (!str) return "";

  // 1. Capitalize first letter of every word
  let result = str.replace(/(?:^|\s|-|\/|\()([a-z])/g, match => match.toUpperCase());

  // 2. Format specific acronyms and real estate terms automatically to standard uppercase/TitleCase
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

function hasCapitalFirstLetters(str: string): boolean {
  if (!str || !str.trim()) return true;
  const words = str.trim().split(/\s+/);
  return words.every(w => {
    if (/^[0-9₹#\(\)\[\]\.\,\-\/\\]+$/.test(w)) return true;
    return /^[A-Z0-9₹#\(\)\[\]\.\,\-\/\\]/.test(w);
  });
}

// Levenshtein Similarity (0 to 1) for fuzzy matching spelling/typing errors
function getFuzzySimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim().replace(/[^a-z0-9]/gi, "");
  const s2 = str2.toLowerCase().trim().replace(/[^a-z0-9]/gi, "");
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// Strip society suffixes (Society, Residency, Apartments, Heights, Enclave, Complex, etc.)
function stripSocietySuffixes(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(society|residency|apartment|apartments|heights|enclave|complex|flats|flat|tower|towers|villa|villas|bhavan|niwas|bungalow|bungalows|homes|home|greens|park|view|shoppes|hub|plaza)\b/gi, "")
    .trim();
}

function generateDynamicTitleOptions(form: FormState): Array<{ tag: string; icon: string; title: string }> {
  const isOffice = form.property_type === "Office Space";
  const locRaw = form.locality.trim();
  const ctyRaw = form.city.trim() || "Ahmedabad";

  const loc = toSmartTitleCase(locRaw);
  const cty = toSmartTitleCase(ctyRaw);

  let locationText = cty;
  if (loc && loc.toLowerCase() !== cty.toLowerCase()) {
    locationText = `${loc}, ${cty}`;
  } else if (loc) {
    locationText = loc;
  }

  const primaryLoc = loc || cty;
  const area = form.area_sqft.trim() ? `${form.area_sqft.trim()} Sq Ft` : "";
  const furn = form.furnished.trim() ? toSmartTitleCase(form.furnished.trim()) : "";
  const listType = form.listing_type === "sale" ? "For Sale" : form.listing_type === "pg" ? "For PG" : form.listing_type === "short_term" ? "For Short-Term Stay" : "For Rent";
  const propType = toSmartTitleCase(form.property_type || "Apartment");

  if (isOffice) {
    const seats = form.bedrooms.trim() ? `${form.bedrooms.trim()} Seats` : "";
    const cabins = form.bathrooms.trim() ? `${form.bathrooms.trim()} Cabins` : "";
    return [
      {
        tag: "Capacity",
        icon: "",
        title: toSmartTitleCase(`${seats ? `${seats} ` : ""}Commercial Office Space In ${locationText}`.trim()),
      },
      {
        tag: "Setup",
        icon: "",
        title: toSmartTitleCase(`${furn ? `${furn} ` : ""}Office Space ${cabins ? `With ${cabins} ` : ""}In ${primaryLoc}`.trim()),
      },
      {
        tag: "Area",
        icon: "",
        title: toSmartTitleCase(`Spacious ${area ? `${area} ` : ""}Corporate Office In Prime ${primaryLoc}`.trim()),
      },
      {
        tag: "Listing",
        icon: "",
        title: toSmartTitleCase(`Premium Commercial Workspace ${listType} In ${locationText}`.trim()),
      },
    ];
  } else {
    const bhk = form.bedrooms.trim() ? `${form.bedrooms.trim()} BHK` : "";
    return [
      {
        tag: "Locality",
        icon: "",
        title: toSmartTitleCase(`Spacious ${bhk ? `${bhk} ` : ""}${propType} In ${locationText}`.trim()),
      },
      {
        tag: "Style",
        icon: "",
        title: toSmartTitleCase(`${furn ? `${furn} ` : ""}${bhk ? `${bhk} ` : ""}${propType} In ${primaryLoc}`.trim()),
      },
      {
        tag: "Area",
        icon: "",
        title: toSmartTitleCase(`Modern ${area ? `${area} ` : ""}${bhk ? `${bhk} ` : ""}${propType} In Prime ${primaryLoc}`.trim()),
      },
      {
        tag: "Listing",
        icon: "",
        title: toSmartTitleCase(`${bhk ? `${bhk} ` : ""}${propType} Available ${listType} In ${locationText}`.trim()),
      },
    ];
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AMENITY_OPTIONS = [
  "WiFi","Air Conditioning","Parking","Power Backup","Water Supply 24/7","Lift/Elevator",
  "CCTV Security","Security Guard","Gym","Swimming Pool","Clubhouse","Children Play Area",
  "Housekeeping","Laundry","Meals Included","Pet Friendly","Balcony","Gas Pipeline",
  "Intercom","Jogging Track",
];

const STEPS = [
  { id: 1, label: "Configuration", sub: "Property details & setup" },
  { id: 2, label: "Location", sub: "Where it's located" },
  { id: 3, label: "Photos", sub: "Add photos" },
  { id: 4, label: "3D View", sub: "Virtual tour & 360°" },
  { id: 5, label: "Vastu", sub: "Vastu score" },
  { id: 6, label: "Pricing & Summary", sub: "Price & publish" },
];

interface FormState {
  title: string; description: string; property_type: string; listing_type: string;
  bedrooms: string; bathrooms: string; area_sqft: string; furnished: string;
  amenities: string[]; city: string; locality: string; address: string;
  house_number: string; building_name: string; wing: string; landmark: string; pincode: string;
  price: string; deposit: string;
  /** Short-term date window (ISO YYYY-MM-DD) */
  short_term_from: string;
  short_term_to: string;
  /** Weekly price for short-term stays */
  short_term_price: string;
  latitude: string; longitude: string;
  map_url: string;
  google_place_id: string;
  location_locked: boolean;
  entrance_direction: string;
  kitchen_location: string;
  master_bedroom_location: string;
  balcony_direction: string;
}

const INITIAL: FormState = {
  title: "", description: "", property_type: "Apartment", listing_type: "rent",
  bedrooms: "", bathrooms: "", area_sqft: "", furnished: "Semi-Furnished",
  amenities: [], city: "Ahmedabad", locality: "", address: "",
  house_number: "", building_name: "", wing: "", landmark: "", pincode: "",
  price: "", deposit: "",
  short_term_from: "", short_term_to: "", short_term_price: "",
  latitude: "", longitude: "", map_url: "",
  google_place_id: "", location_locked: false,
  entrance_direction: "North-East",
  kitchen_location: "South-East",
  master_bedroom_location: "South-West",
  balcony_direction: "East",
};

// ─── Extract lat/lng from any Google Maps URL format ─────────────────────────
function extractLatLng(url: string): { lat: string; lng: string } | null {
  if (!url) return null;
  let m: RegExpMatchArray | null;

  m = url.match(/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/[?&]q=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/\bll=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/\bcenter=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/\/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/!8m2!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  m = url.match(/[sd]addr=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: m[1], lng: m[2] };

  return null;
}

function validLatLng(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90  && lat <= 90   &&
    lng >= -180 && lng <= 180  &&
    !(lat === 0 && lng === 0)
  );
}

// ─── Image preview type ───────────────────────────────────────────────────────
interface PreviewImage {
  file: File;
  previewUrl: string;
  isCover: boolean;
}

const MIN_IMAGES = 1;
const MAX_IMAGES = 10;

import { cityCoords, isCoordsPlausibleForCity } from "@/lib/mock-properties";

// ─── GooglePlacesSearch — Location Autocomplete ──────────────────────────────
// Architecture (2-layer fallback, all with AbortController timeouts):
//   1. Server-side proxy  → /api/maps/places-autocomplete
//        Primary:  OpenStreetMap Nominatim  (free, no API key, India-aware)
//        Fallback: Google Places API (New) → legacy Places API  (if key has them enabled)
//   2. Google Maps JS API → AutocompleteService  (browser-side, only if GMAPS_KEY works)
//   3. Use Current Location → /api/maps/reverse-geocode  (Nominatim reverse, no key needed)
//
// When the proxy returns an osm:* place_id the embedded lat/lng from the
// autocomplete response is forwarded to /api/maps/place-details so only one
// network round-trip is needed instead of two.

const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || "";

// ── Fetch helper with timeout ──────────────────────────────────────────────
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Load the Google Maps JS API — kept for potential future use.
// Currently not loaded on page mount; only the server-side proxy is used for
// autocomplete and place details.
let gmapsLoadPromise: Promise<void> | null = null;
function loadGoogleMapsApiIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const g = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (g.google?.maps?.places) return Promise.resolve();
  if (gmapsLoadPromise) return gmapsLoadPromise;
  gmapsLoadPromise = new Promise((resolve, reject) => {
    if (!GMAPS_KEY) { reject(new Error("No API key")); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=en`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { gmapsLoadPromise = null; reject(new Error("Failed to load Google Maps API")); };
    document.head.appendChild(script);
  });
  return gmapsLoadPromise;
}
// Suppress unused warning — function available for future use
void loadGoogleMapsApiIfNeeded;

// ─── DraggableLeafletMap — Leaflet-based draggable marker for owner location ──
// Uses the same Leaflet + Google Maps tiles setup as the rest of the app.
// No Google Maps JS SDK billing required — tiles are fetched directly.
// Owner can drag the red pin to fine-tune the exact property location.
let _ownerLeafletPromise: Promise<unknown> | null = null;
function loadOwnerLeaflet() {
  if (_ownerLeafletPromise) return _ownerLeafletPromise;
  _ownerLeafletPromise = (async () => {
    await import("leaflet/dist/leaflet.css");
    const mod = await import("leaflet");
    const L = mod.default ?? mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    return L;
  })();
  return _ownerLeafletPromise;
}

function DraggableLeafletMap({
  lat,
  lng,
  onPinMoved,
}: {
  lat: number;
  lng: number;
  onPinMoved: (newLat: number, newLng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef    = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const onPinMovedRef = useRef(onPinMoved);
  useEffect(() => { onPinMovedRef.current = onPinMoved; }, [onPinMoved]);

  // Initial map + marker creation
  useEffect(() => {
    let destroyed = false;
    loadOwnerLeaflet().then((L: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Leaflet = L as any;
      if (destroyed || !containerRef.current || mapRef.current) return;

      const map = Leaflet.map(containerRef.current, {
        center:           [lat, lng],
        zoom:             17,
        zoomControl:      true,
        attributionControl: false,
        scrollWheelZoom:  false,
      });

      // Google Maps road tiles — same as the rest of the app
      Leaflet.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        { subdomains: "0123", maxZoom: 20 }
      ).addTo(map);

      // Red draggable pin using a custom DivIcon (no external image needed)
      const icon = Leaflet.divIcon({
        html: `<div style="
          width:28px;height:40px;position:relative;cursor:grab;
          filter:drop-shadow(0 4px 8px rgba(220,38,38,0.5));
        ">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="28" height="40">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z"
              fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
            <circle cx="14" cy="13" r="6" fill="#fff"/>
            <circle cx="14" cy="13" r="3" fill="#dc2626"/>
          </svg>
        </div>`,
        className:  "",
        iconSize:   [28, 40],
        iconAnchor: [14, 40],
      });

      const marker = Leaflet.marker([lat, lng], { icon, draggable: true }).addTo(map);

      marker.on("dragend", (e: { target: { getLatLng(): { lat: number; lng: number } } }) => {
        const { lat: newLat, lng: newLng } = e.target.getLatLng();
        onPinMovedRef.current(newLat, newLng);
      });

      mapRef.current    = map;
      markerRef.current = marker;
      if (!destroyed) setReady(true);
    }).catch(() => {/* map load failure — silent */});

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current    = null;
        markerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-centre map + move marker when parent lat/lng change (new place selected)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const pos = [lat, lng] as [number, number];
    mapRef.current.setView(pos, 17, { animate: true });
    markerRef.current.setLatLng(pos);
  }, [lat, lng]);

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-[#e8d9c0] shadow-sm relative" style={{ height: 220 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5ede0] z-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#C9921A" }} />
        </div>
      )}
      {ready && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
          style={{
            background: "rgba(26,18,9,0.72)", color: "#fff",
            fontSize: 10, fontWeight: 700, borderRadius: 999,
            padding: "3px 10px", whiteSpace: "nowrap",
          }}
        >
          Drag the pin to fine-tune exact location
        </div>
      )}
    </div>
  );
}

interface PlaceSuggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
  /** Embedded coords from Nominatim — avoids a second place-details round-trip */
  _lat?: string;
  _lng?: string;
}

interface PlaceDetails {
  place_id: string;
  formatted_address: string;
  lat: number;
  lng: number;
  city: string;
  locality: string;
  pincode: string;
  state?: string;
  country?: string;
}

function GooglePlacesSearch({
  value,
  lat,
  lng,
  cityHint,
  onLocationSelected,
  onClear,
}: {
  value: string;
  lat: string;
  lng: string;
  /** City already chosen higher up in the form (e.g. "Ahmedabad") — used to bias
   *  search results so a name like "Krishna Complex" doesn't match a place with
   *  the same name in a completely different city/state. */
  cityHint?: string;
  onLocationSelected: (details: PlaceDetails) => void;
  onClear: () => void;
}) {
  const [query, setQuery]               = useState(value);
  const [suggestions, setSuggestions]   = useState<PlaceSuggestion[]>([]);
  const [open, setOpen]                 = useState(false);
  const [loading, setLoading]           = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [gpsLoading, setGpsLoading]     = useState(false);
  const [searchError, setSearchError]   = useState<string | null>(null);
  const containerRef                    = useRef<HTMLDivElement>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef                 = useRef<string>(crypto.randomUUID());

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Autocomplete: server-side proxy only ──────────────────────────────────
  // The proxy calls Photon → Nominatim → Google Places API server-side.
  // The Google Maps JS SDK is NOT used for suggestions — it requires Maps JS API
  // billing which is separate from Places API billing.
  const fetchViaProxy = async (input: string): Promise<PlaceSuggestion[]> => {
    const params = new URLSearchParams({
      input:        input.trim(),
      sessiontoken: sessionTokenRef.current,
    });
    if (cityHint) {
      params.set("city", cityHint);
      const centre = cityCoords[cityHint];
      if (centre) {
        params.set("lat", String(centre.lat));
        params.set("lng", String(centre.lng));
      }
    }
    const res = await fetchWithTimeout(
      `${API_BASE}/maps/places-autocomplete?${params.toString()}`,
      {},
      10_000
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error((errBody as { message?: string; error?: string }).message || (errBody as { error?: string }).error || `Server error ${res.status}`);
    }
    const data = await res.json();
    if (!data.predictions || !Array.isArray(data.predictions)) {
      throw new Error("Unexpected response from server");
    }
    if (data.status === "ZERO_RESULTS") return [];
    return (data.predictions as Array<{
      place_id: string;
      description: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
      _lat?: string;
      _lng?: string;
    }>).map(p => ({
      place_id:       p.place_id,
      description:    p.description,
      main_text:      p.structured_formatting?.main_text    || p.description.split(",")[0],
      secondary_text: p.structured_formatting?.secondary_text || p.description.split(",").slice(1).join(",").trim(),
      _lat:           p._lat,
      _lng:           p._lng,
    }));
  };

  const fetchSuggestions = async (input: string) => {
    if (!input.trim() || input.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setSearchError(null);
    let items: PlaceSuggestion[] = [];
    let lastError = "";

    try {
      items = await fetchViaProxy(input);
    } catch (proxyErr: unknown) {
      const msg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      console.error("[GooglePlacesSearch] proxy failed:", msg);
      lastError = msg;
    }

    if (items.length > 0) {
      setSuggestions(items);
      setOpen(true);
      setSearchError(null);
    } else if (lastError) {
      const isTimeout = lastError.toLowerCase().includes("timeout") || lastError.includes("abort");
      setSearchError(
        isTimeout
          ? "Search timed out. Check your connection and try again."
          : "Search unavailable right now. Please try again."
      );
      setSuggestions([]);
      setOpen(false);
    } else {
      setSuggestions([]);
      setOpen(false);
      setSearchError(
        `No results for "${input.trim()}". Try searching the society, building or area name instead.`
      );
    }

    setLoading(false);
  };

  // ── Place details: server proxy only ─────────────────────────────────────
  // The server calls Places API (New) or Nominatim lookup depending on place_id type.
  // We do NOT fall back to the browser-side PlacesService — that requires Maps JS API
  // billing which is separate from Places API billing.
  const fetchPlaceDetails = async (placeId: string, hint?: { lat?: string; lng?: string }): Promise<PlaceDetails> => {
    const params = new URLSearchParams({
      place_id:     placeId,
      sessiontoken: sessionTokenRef.current,
    });
    if (hint?.lat && hint?.lng) {
      params.set("lat", hint.lat);
      params.set("lng", hint.lng);
    }
    const res = await fetchWithTimeout(
      `${API_BASE}/maps/place-details?${params.toString()}`,
      {},
      12_000
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(errBody.message || errBody.error || `Place details failed (HTTP ${res.status})`);
    }
    const data = await res.json() as PlaceDetails;
    if (!data.lat || !data.lng) {
      throw new Error("Could not get coordinates for this location");
    }
    return data;
  };

  // ── Use Current Location (GPS → reverse-geocode) ──────────────────────────
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetchWithTimeout(
            `${API_BASE}/maps/reverse-geocode?lat=${latitude}&lng=${longitude}`,
            {},
            10_000
          );
          if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
          const data = await res.json() as PlaceDetails;
          if (!data.formatted_address) throw new Error("No address returned");
          setQuery(data.formatted_address);
          onLocationSelected({ ...data, lat: latitude, lng: longitude });
        } catch (err) {
          console.error("[GPS reverse-geocode]", err);
          // Fallback: just use raw coordinates
          onLocationSelected({
            place_id:          "",
            formatted_address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            lat:               latitude,
            lng:               longitude,
            city: "", locality: "", pincode: "",
          });
          setQuery(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        const msg =
          err.code === 1 ? "Location access denied. Please allow location in your browser settings." :
          err.code === 2 ? "Location unavailable. Check your GPS or network." :
                           "Location request timed out. Please try again.";
        toast.error(msg);
      },
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false }
    );
  };

  const handleInput = (val: string) => {
    setQuery(val);
    setSearchError(null);
    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
      onClear();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const selectPlace = async (item: PlaceSuggestion) => {
    setOpen(false);
    setQuery(item.description);
    setFetchingDetails(true);
    setSuggestions([]);
    sessionTokenRef.current = crypto.randomUUID();

    try {
      const details = await fetchPlaceDetails(
        item.place_id,
        item._lat && item._lng ? { lat: item._lat, lng: item._lng } : undefined
      );
      if (!details.lat || !details.lng) {
        toast.error("Could not get coordinates for this location. Please try another result.");
        return;
      }
      onLocationSelected(details);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[GooglePlacesSearch] place details error:", msg);
      toast.error("Could not fetch place details. Please try again or use a different result.");
    } finally {
      setFetchingDetails(false);
    }
  };

  const clearAll = () => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setSearchError(null);
    onClear();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const pinned = !!(lat && lng);
  const busy   = loading || fetchingDetails || gpsLoading;

  return (
    <div ref={containerRef} className="relative">
      {/* Search input row */}
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
              else if (query.trim().length >= 2 && !pinned) fetchSuggestions(query);
            }}
            onKeyDown={e => {
              if (e.key === "Escape") { setOpen(false); setSearchError(null); }
              if (e.key === "Enter" && query.trim().length >= 2 && !busy) {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                fetchSuggestions(query);
              }
            }}
            placeholder="Search society, building, shop, office, area, landmark or full address…"
            className="w-full rounded-xl border border-[#e8d9c0] pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-white outline-none focus:border-[#C9921A] transition-colors"
            style={{ borderColor: pinned ? "#16a34a" : undefined }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search location"
            aria-expanded={open}
            aria-haspopup="listbox"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {busy && (
              <span className="h-4 w-4 border-2 border-[#C9921A] border-t-transparent rounded-full animate-spin block" aria-label="Loading" />
            )}
            {!busy && pinned && (
              <Check className="h-4 w-4 text-green-600" />
            )}
            {!busy && query && (
              <button
                type="button"
                onClick={clearAll}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Use Current Location button */}
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={busy}
          title="Use my current GPS location"
          className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e8d9c0] bg-white hover:bg-[#fef8eb] hover:border-[#C9921A] text-[#836737] text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Use current location"
        >
          {gpsLoading
            ? <span className="h-3.5 w-3.5 border-2 border-[#C9921A] border-t-transparent rounded-full animate-spin block" />
            : <Navigation className="h-3.5 w-3.5 text-[#C9921A]" />
          }
          <span className="hidden sm:inline">Use Current Location</span>
        </button>
      </div>

      {/* Error / empty state message */}
      {searchError && !open && (
        <p className="mt-1.5 text-xs text-red-600 font-medium px-1 flex items-center gap-1" role="alert">
          <span>⚠</span> {searchError}
        </p>
      )}

      {/* Autocomplete dropdown */}
      {open && suggestions.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-2xl bg-white border border-[#e8d9c0] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1"
          role="listbox"
          aria-label="Location suggestions"
        >
          {/* Header */}
          <div className="px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#836737] border-b border-[#f0e4d2] flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-[#C9921A]" />
            <span>Google Places Results</span>
          </div>
          {/* Results list */}
          <div className="max-h-64 overflow-y-auto">
            {suggestions.map((item) => (
              <button
                key={item.place_id}
                type="button"
                role="option"
                onClick={() => selectPlace(item)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-[#fef8eb] transition-colors border-b last:border-b-0 border-[#f8f1e5] flex items-start gap-2.5 cursor-pointer group"
              >
                <MapPin className="h-4 w-4 text-[#C9921A] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-[#1a1209] truncate group-hover:text-[#C9921A]">
                    {item.main_text}
                  </p>
                  {item.secondary_text && (
                    <p className="text-[10px] text-[#836737] line-clamp-1 mt-0.5 truncate">
                      {item.secondary_text}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
          {/* Google attribution — required by ToS */}
          <div className="px-3.5 py-2 border-t border-[#f0e4d2] flex items-center justify-end gap-1.5 bg-[#fdfbf7]">
            <span className="text-[9px] text-[#a08858] font-medium">Powered by</span>
            <img
              src="https://developers.google.com/static/maps/documentation/images/google_on_white.png"
              alt="Google"
              className="h-3 object-contain opacity-80"
            />
          </div>
        </div>
      )}

      {/* Confirmed location banner */}
      {pinned && (
        <div className="mt-2 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 flex items-start gap-2.5">
          <span className="text-base shrink-0 mt-0.5">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-green-800 truncate">{query}</p>
            <p className="text-[11px] text-green-700 mt-0.5 font-medium">
              {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
              &nbsp;·&nbsp;
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}&z=17`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-900"
              >
                Open in Google Maps ↗
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-green-600 hover:text-red-500 p-0.5 rounded transition-colors"
            title="Change location"
            aria-label="Change location"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
function NewProperty() {
  const [step, setStep]                 = useState<number>(1);
  const [loading, setLoading]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [form, setForm]                 = useState<FormState>({ ...INITIAL });
  const [images, setImages]             = useState<PreviewImage[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isDragging, setIsDragging]     = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [amenityList, setAmenityList]   = useState<string[]>(AMENITY_OPTIONS);
  const [customAmenityInput, setCustomAmenityInput] = useState("");
  const [showCustomAmenity, setShowCustomAmenity]   = useState(false);
  const [showScoreModal, setShowScoreModal]         = useState(false);
  const [showUnsavedModal, setShowUnsavedModal]     = useState(false);
  const [showPhotoGalleryModal, setShowPhotoGalleryModal] = useState(false);
  const [activeModalPhotoIndex, setActiveModalPhotoIndex] = useState(0);
  const [currentUser, setCurrentUser]               = useState<CachedProfile | null>(null);
  const [generatingTitles, setGeneratingTitles]     = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const navigate                        = useNavigate();

  // 3D / 360° tour form state (pending — applied after property is created)
  const [tourState, setTourState] = useState<TourFormState>({
    tourType: "none",
    tourUrl: "",
    modelFile: null,
    tourModelUrl: "",
    tourPanoramaUrl: "",
    aiSourceFiles: [],
    panoramaBlob: null,
  });

  // Fetch logged in user profile to display owner details and phone number
  useEffect(() => {
    fetchProfile().then(user => {
      if (user) setCurrentUser(user);
    }).catch(() => {});
  }, []);

  const upd = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Dynamic computation of 4 AI title options based on form inputs
  const aiTitleOptions = useMemo(() => {
    return generateDynamicTitleOptions(form);
  }, [form.bedrooms, form.bathrooms, form.property_type, form.listing_type, form.furnished, form.area_sqft, form.locality, form.city]);

  // ── Auto Geocode Address & Nearby Maps Location Dropdown ──────────────────
  const [showTitleMenu, setShowTitleMenu]           = useState(false);
  const titleContainerRef = useRef<HTMLDivElement>(null);

  // Synchronize full address whenever structured components change
  useEffect(() => {
    // When location is locked (Google place selected), address is already set from Google — don't overwrite.
    // Only auto-assemble when the user is manually filling the structured fields.
    if (form.location_locked) return;
    const fullStr = [
      form.house_number ? `Flat/House ${form.house_number}` : "",
      form.wing ? `${form.wing}` : "",
      form.building_name,
      form.landmark,
      form.locality,
      form.city,
      form.pincode ? `- ${form.pincode}` : "",
    ].filter(Boolean).join(", ");
    if (fullStr) setForm(f => ({ ...f, address: fullStr }));
  }, [form.house_number, form.wing, form.building_name, form.landmark, form.locality, form.city, form.pincode, form.location_locked]);

  // Close title dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (titleContainerRef.current && !titleContainerRef.current.contains(e.target as Node)) {
        setShowTitleMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Dynamic Property Quality Score calculation in real time
  const qualityScore = useMemo(() => {
    return calculatePropertyQualityScore({
      title: form.title,
      property_type: form.property_type,
      listing_type: form.listing_type,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      area_sqft: form.area_sqft,
      furnished: form.furnished,
      amenities: form.amenities,
      city: form.city,
      locality: form.locality,
      address: form.address,
      latitude: form.latitude,
      longitude: form.longitude,
      map_url: form.map_url,
      price: form.price,
      deposit: form.deposit,
      description: form.description,
      imagesCount: images.length,
    });
  }, [form, images.length]);

  // Automated Vastu Score calculation in real time
  const vastuCalc = useMemo(() => {
    return calculateVastuScore(
      form.entrance_direction,
      form.kitchen_location,
      form.master_bedroom_location,
      form.balcony_direction
    );
  }, [form.entrance_direction, form.kitchen_location, form.master_bedroom_location, form.balcony_direction]);

  // ── AI Generate Location Description based on Basic Info, Config & Location ───
  const handleAiGenerate = async () => {
    const rawTitle = form.title.trim() || `${form.bedrooms ? `${form.bedrooms} BHK ` : ""}${form.property_type} in ${form.locality || form.city}`;
    const capitalizedTitle = toSmartTitleCase(rawTitle);
    setGeneratingAi(true);
    try {
      const res = await aiApi.generateDescription({
        title: capitalizedTitle,
        property_type: form.property_type,
        listing_type: form.listing_type,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        area_sqft: form.area_sqft,
        building_name: form.building_name,
        house_number: form.house_number,
        wing: form.wing,
        landmark: form.landmark,
        locality: form.locality,
        city: form.city,
        furnished: form.furnished,
        amenities: form.amenities,
      });
      if (res?.description) {
        upd("description", toSmartTitleCase(res.description));
        toast.success("✨ Eye-Catching AI Description Generated Successfully!");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI description.");
    } finally {
      setGeneratingAi(false);
    }
  };

  const toggleAmenity = (name: string) =>
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(name)
        ? f.amenities.filter(a => a !== name)
        : [...f.amenities, name],
    }));

  const handleAddCustomAmenity = () => {
    const trimmed = customAmenityInput.trim();
    if (!trimmed) return;
    const formatted = toSmartTitleCase(trimmed);
    if (!amenityList.includes(formatted)) {
      setAmenityList(prev => [...prev, formatted]);
    }
    if (!form.amenities.includes(formatted)) {
      setForm(f => ({ ...f, amenities: [...f.amenities, formatted] }));
    }
    setCustomAmenityInput("");
    setShowCustomAmenity(false);
    toast.success(`Added "${formatted}" to Amenities!`);
  };




  // ── Image Handling ────────────────────────────────────────────────────────
  const addFiles = (fileList: FileList | File[]) => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const incoming = Array.from(fileList);

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.warning(`Maximum ${MAX_IMAGES} photos allowed.`);
      return;
    }

    const toProcess = incoming.slice(0, remaining);
    if (incoming.length > remaining) {
      toast.info(`Only ${remaining} more photo${remaining > 1 ? "s" : ""} could be added.`);
    }

    const newPreviews: PreviewImage[] = [];

    for (const file of toProcess) {
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid file type. Only JPG, PNG, WEBP are allowed.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: File is larger than 10 MB.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      newPreviews.push({
        file,
        previewUrl,
        isCover: images.length === 0 && newPreviews.length === 0,
      });
    }

    if (newPreviews.length > 0) {
      setImages(prev => {
        const combined = [...prev, ...newPreviews];
        if (!combined.some(img => img.isCover)) {
          combined[0].isCover = true;
        }
        return combined;
      });
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.previewUrl);
      const updated = prev.filter((_, i) => i !== index);
      if (removed.isCover && updated.length > 0) {
        updated[0].isCover = true;
      }
      return updated;
    });
    setActivePhotoIdx(0);
  };

  const setCover = (index: number) => {
    setImages(prev =>
      prev.map((img, i) => ({ ...img, isCover: i === index }))
    );
    toast.success("Cover photo updated ★");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!form.property_type) {
        toast.error("(Property Type) this field is req.");
        return false;
      }
      if (!form.listing_type) {
        toast.error("(Listing Type) this field is req.");
        return false;
      }
      if (form.listing_type === "short_term") {
        if (!form.short_term_from) {
          toast.error("(Check-in Date) this field is req.");
          return false;
        }
        if (!form.short_term_to) {
          toast.error("(Check-out Date) this field is req.");
          return false;
        }
        const diff = (new Date(form.short_term_to).getTime() - new Date(form.short_term_from).getTime()) / 86_400_000;
        if (diff < 7) {
          toast.error("(Stay Duration) Minimum stay duration for Short-Term Property is 1 week (7 days).");
          return false;
        }
        if (diff > 183) {
          toast.error("(Stay Duration) Maximum stay duration for Short-Term Property is 6 months (183 days).");
          return false;
        }
        if (!form.short_term_price || Number(form.short_term_price) <= 0) {
          toast.error("(Short-Term Price) this field is req.");
          return false;
        }
      } else if (form.short_term_from || form.short_term_to) {
        if (form.short_term_from && !form.short_term_to) {
          toast.error("(Check-out Date) this field is req.");
          return false;
        }
        if (!form.short_term_from && form.short_term_to) {
          toast.error("(Check-in Date) this field is req.");
          return false;
        }
        const diff = (new Date(form.short_term_to).getTime() - new Date(form.short_term_from).getTime()) / 86_400_000;
        if (diff < 7) {
          toast.error("(Stay Duration) Minimum stay duration is 1 week (7 days).");
          return false;
        }
        if (diff > 183) {
          toast.error("(Stay Duration) Maximum stay duration is 6 months (183 days).");
          return false;
        }
      }
    }
    if (s === 2) {
      if (!form.city.trim()) {
        toast.error("(City) this field is req.");
        return false;
      }
      if (!form.locality.trim()) {
        toast.error("(Locality / Area) this field is req.");
        return false;
      }
      if (!form.building_name.trim()) {
        toast.error("(Society / Building Name) this field is req.");
        return false;
      }
      if (!form.address.trim()) {
        toast.error("(Full Address) this field is req.");
        return false;
      }
      if (!form.latitude.trim() || !form.longitude.trim()) {
        toast.error("(Google Maps Location) this field is req.");
        return false;
      }
      if (!form.title.trim()) {
        toast.error("(Property Title) this field is req.");
        return false;
      }
      upd("locality", toSmartTitleCase(form.locality));
      upd("building_name", toSmartTitleCase(form.building_name));
      upd("address", toSmartTitleCase(form.address));
      upd("title", toSmartTitleCase(form.title));
    }
    if (s === 3) {
      if (images.length < MIN_IMAGES) {
        toast.error("(Property Photos) this field is req.");
        return false;
      }
    }
    // Step 4 (3D View) is optional — always passes
    // Step 5 (Vastu) is optional — always passes
    if (s === 6) {
      if (form.listing_type === "short_term") {
        if (!form.short_term_price || Number(form.short_term_price) <= 0) {
          toast.error("(Short-Term Price) this field is req.");
          return false;
        }
        if (!form.short_term_from) {
          toast.error("(Check-in Date) this field is req.");
          return false;
        }
        if (!form.short_term_to) {
          toast.error("(Check-out Date) this field is req.");
          return false;
        }
      } else {
        if (!form.price || Number(form.price) <= 0) {
          const priceLabel = form.listing_type === "sale" ? "Sale Price" : "Monthly Rent";
          toast.error(`(${priceLabel}) this field is req.`);
          return false;
        }
        if (form.listing_type !== "sale" && (!form.deposit || Number(form.deposit) <= 0)) {
          toast.error("(Security Deposit) this field is req.");
          return false;
        }
      }
    }
    return true;
  };

  const next = () => { if (validateStep(step)) setStep(s => Math.min(s + 1, STEPS.length)); };
  const prev = () => setStep(s => Math.max(s - 1, 1));

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    // Validate each step in sequence so that if any step was missed, we navigate the user there and show toast
    for (let stepIndex = 1; stepIndex <= 6; stepIndex++) {
      if (!validateStep(stepIndex)) {
        setStep(stepIndex);
        return;
      }
    }
    setLoading(true);
    try {
      const createdProp = await propertiesApi.create({
        title:            toSmartTitleCase(form.title),
        description:      toSmartTitleCase(form.description) || undefined,
        property_type:    form.property_type,
        listing_type:     form.listing_type as "rent" | "sale" | "pg" | "short_term",
        bedrooms:         form.bedrooms ? Number(form.bedrooms) : 0,
        bathrooms:        form.bathrooms ? Number(form.bathrooms) : 0,
        area_sqft:        form.area_sqft ? Number(form.area_sqft) : 0,
        furnished:        form.furnished,
        amenities:        form.amenities.map(a => ({ name: toSmartTitleCase(a), icon: a, category: "General" })),
        city:             form.city,
        locality:         toSmartTitleCase(form.locality) || undefined,
        address:          toSmartTitleCase(form.address) || undefined,
        pincode:          form.pincode || undefined,
        map_url:          form.map_url   || undefined,
        price:            form.listing_type === "short_term" ? 0 : Number(form.price),
        deposit:          form.deposit ? Number(form.deposit) : null,
        short_term_from:  form.short_term_from || undefined,
        short_term_to:    form.short_term_to   || undefined,
        short_term_price: form.short_term_price ? Number(form.short_term_price) : undefined,
        latitude:         form.latitude ? Number(form.latitude) : undefined,
        longitude:        form.longitude ? Number(form.longitude) : undefined,
        facing:           form.entrance_direction,
        // Google Place ID — saved in map_url field as it's the closest existing field
        // The google_place_id is available for future DB migration if needed
      });

      try {
        const coverIdx = images.findIndex(img => img.isCover);
        const sortedImages = [...images];
        if (coverIdx > 0) {
          const [cover] = sortedImages.splice(coverIdx, 1);
          sortedImages.unshift(cover);
        }
        await uploadImages(createdProp.id, sortedImages.map(img => img.file));
      } catch (uploadErr) {
        console.error("Image upload error:", uploadErr);
        toast.warning("Property created but some images failed to upload. You can re-upload from My Properties.");
      }

      // ── 3D / 360° tour — apply pending local state now that property exists ──
      try {
        if (tourState.tourType === "link" && tourState.tourUrl) {
          await tourApi.setLink(createdProp.id, tourState.tourUrl);
        } else if (tourState.tourType === "model" && tourState.modelFile) {
          await tourApi.uploadModel(createdProp.id, tourState.modelFile);
        } else if (tourState.tourType === "ai_generated" && tourState.aiSourceFiles.length > 0) {
          // Send the pre-stitched panorama blob (generated in-browser) to server.
          // This ensures the server stores the real equirectangular panorama, not
          // just the first raw source image (which happens when the canvas npm
          // package is unavailable server-side).
          const panoramaFile = tourState.panoramaBlob
            ? new File([tourState.panoramaBlob], `panorama-${createdProp.id}.jpg`, { type: "image/jpeg" })
            : null;
          const directions = tourState.aiSourceFiles.map((_f, i) => ({
            slot: i, label: `Wall ${i + 1}`, angle: i * (360 / tourState.aiSourceFiles.length),
          }));
          await tourApi.generate360(createdProp.id, tourState.aiSourceFiles, panoramaFile, directions);
        }
      } catch (tourErr) {
        console.error("Tour upload error:", tourErr);
        toast.warning("Property published but 3D tour could not be saved. You can add it later from My Properties.");
      }

      toast.success("✅ Property Published Successfully!");
      try {
        sessionStorage.removeItem("nivaas_new_prop_step");
        sessionStorage.removeItem("nivaas_new_prop_form");
      } catch {}
      setShowConfirm(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed To Post Property");
    } finally {
      setLoading(false);
    }
  };

  // ── Step bar with Live Quality Score ──────────────────────────────────────
  const StepBar = () => (
    <div className="mb-6 sm:mb-8 space-y-4">
      {/* Top Live Score Badge Row */}
      <div className="flex items-center justify-between gap-3 bg-[#fdfbf7] border border-[#f0e4d2] rounded-2xl p-3 sm:px-4 sm:py-2.5 shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#fef8eb] border border-[#f4deb4] flex items-center justify-center text-[#C9921A] font-black text-xs shadow-2xs">
              ★
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-bold text-[#836737] uppercase tracking-wider">Live Quality Score</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-[#1a1209] transition-all duration-300">
                  {qualityScore.totalScore}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-[#836737]">/ 100</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
                  style={{ backgroundColor: qualityScore.badgeBg, color: qualityScore.badgeText, border: `1px solid ${qualityScore.badgeBorder}` }}
                >
                  {qualityScore.label}
                </span>
              </div>
            </div>
          </div>

          {/* Mini progress bar on medium screens */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-[180px] ml-2">
            <div className="h-2 w-full rounded-full bg-[#faf6ee] overflow-hidden border border-[#f0e4d2]">
              <div
                className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#C9921A] to-[#e4ba63]"
                style={{ width: `${qualityScore.totalScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* 5-star rating and Breakdown trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-[#836737] font-semibold block">Listing Rating</span>
            <span className="text-xs font-black text-[#C9921A]">★ {qualityScore.overall} / 5.0</span>
          </div>
          <button
            type="button"
            onClick={() => setShowScoreModal(true)}
            className="text-[11px] font-bold text-[#C9921A] hover:text-[#a07412] hover:underline bg-[#fef8eb] hover:bg-[#fef3d4] border border-[#f4deb4] px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
          >
            <span>Score Breakdown</span>
            <span>▾</span>
          </button>
        </div>
      </div>

      {/* Step Wizard Dots / Stepper */}
      <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-none">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none shrink-0 sm:shrink">
            <button type="button" onClick={() => {
              if (s.id < step) {
                setStep(s.id);
              } else if (s.id > step) {
                if (validateStep(step)) {
                  setStep(s.id);
                }
              }
            }}
              className={cn(
                "flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-semibold border-2 transition",
                step === s.id  ? "border-primary bg-primary text-white"
                : step > s.id  ? "border-primary bg-primary/10 text-primary cursor-pointer"
                : "border-muted-foreground/30 bg-background text-muted-foreground cursor-pointer hover:border-primary/50",
              )}>
              {step > s.id ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : s.id}
            </button>
            <div className="ml-1.5 sm:ml-2 hidden min-[500px]:block">
              <span className={cn("text-[11px] sm:text-xs font-bold whitespace-nowrap block leading-tight", step >= s.id ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap block leading-tight">
                {s.sub}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-1.5 sm:mx-3 flex-1 min-w-3 sm:min-w-6 h-px", step > s.id ? "bg-primary/40" : "bg-muted-foreground/20")} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Step panels ───────────────────────────────────────────────────────────
  const panels = [
    // ── Step 1: Configuration (merged Basic Info + Config) ───────────────────
    <div className="space-y-5">
      {/* Property Type & Listing Type */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="font-bold">Property Type</Label>
          <Select value={form.property_type} onValueChange={v => upd("property_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{propertyTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-bold">Listing Type</Label>
          <Select value={form.listing_type} onValueChange={v => upd("listing_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rent">Rent</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="pg">PG</SelectItem>
              <SelectItem value="short_term">Short-Term Property</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Short-Term Stay & Availability Window Section (Visible by default) ── */}
      {(() => {
        const isShortTerm = form.listing_type === "short_term";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().slice(0, 10);

        // Compute min/max for To date (1 week ≤ stay ≤ 6 months)
        const fromDate = form.short_term_from ? new Date(form.short_term_from) : null;
        const minTo = fromDate ? new Date(fromDate.getTime() + 7 * 86_400_000).toISOString().slice(0, 10) : todayStr;
        const maxTo = fromDate ? new Date(fromDate.getTime() + 183 * 86_400_000).toISOString().slice(0, 10) : "";

        // Formatted display dates
        const formatHumanDate = (dateStr: string) => {
          if (!dateStr) return "";
          try {
            const d = new Date(dateStr + "T00:00:00");
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            });
          } catch {
            return dateStr;
          }
        };

        // Quick Preset handler
        const applyPreset = (days: number, label: string) => {
          const baseDate = form.short_term_from ? new Date(form.short_term_from) : new Date();
          baseDate.setHours(0, 0, 0, 0);
          const startDateStr = baseDate.toISOString().slice(0, 10);
          const targetDate = new Date(baseDate.getTime() + days * 86_400_000);
          const targetDateStr = targetDate.toISOString().slice(0, 10);
          setForm(f => ({
            ...f,
            short_term_from: f.short_term_from || startDateStr,
            short_term_to: targetDateStr,
          }));
          toast.success(`Stay duration set to ${label} ✓`);
        };

        // Date difference & validation
        let dateError = "";
        let nights = 0;
        let weeks = 0;
        if (form.short_term_from && form.short_term_to) {
          const diff = Math.round((new Date(form.short_term_to).getTime() - new Date(form.short_term_from).getTime()) / 86_400_000);
          nights = diff;
          weeks = Math.round(diff / 7);
          if (diff < 7) {
            dateError = "Minimum stay is 1 week (7 days).";
          } else if (diff > 183) {
            dateError = "Maximum stay is 6 months (~183 days).";
          }
        }

        return (
          <div
            className={cn(
              "rounded-2xl border p-4 sm:p-5 space-y-4 transition-all duration-200",
              isShortTerm
                ? "border-[#c4b5fd] bg-[#faf6ff] ring-2 ring-[#7C3AED]/15 shadow-sm"
                : "border-[#e8d9c0] bg-[#fdfbf7]"
            )}
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3" style={{ borderColor: isShortTerm ? "#e0ceff" : "#e8d9c0" }}>
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black shadow-2xs",
                    isShortTerm ? "bg-[#7C3AED] text-white" : "bg-[#f4ece1] text-[#836737]"
                  )}
                >
                  <Calendar className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1a1209]">Short-Term Stay & Availability Window</span>
                    {isShortTerm ? (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-[#7C3AED] text-white px-2 py-0.5 rounded-full shadow-2xs animate-pulse">
                        ★ Mandatory
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#f0e4d2] text-[#836737] px-2 py-0.5 rounded-full">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#836737] mt-0.5">
                    {isShortTerm
                      ? "Check-in, check-out, and weekly pricing are mandatory for short-term properties."
                      : "Optional flexible stay window and weekly pricing if this property also accepts short-term guests."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-[#836737] bg-white border border-[#e8d9c0] px-2.5 py-1 rounded-full font-semibold">
                  Allowed: 1 week – 6 months
                </span>
                {(form.short_term_from || form.short_term_to) && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, short_term_from: "", short_term_to: "" }))}
                    className="text-[11px] text-destructive hover:underline font-semibold cursor-pointer"
                  >
                    Clear dates
                  </button>
                )}
              </div>
            </div>

            {/* Quick Presets row */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#836737]">
                Quick Duration Presets (1-Click Selection)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "1 Week", days: 7 },
                  { label: "2 Weeks", days: 14 },
                  { label: "1 Month", days: 30 },
                  { label: "2 Months", days: 60 },
                  { label: "3 Months", days: 90 },
                  { label: "6 Months", days: 180 },
                ].map(p => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => applyPreset(p.days, p.label)}
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer shadow-2xs active:scale-95",
                      nights === p.days
                        ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                        : "bg-white hover:bg-[#f3e8ff] hover:text-[#7C3AED] border-[#e8d9c0] text-[#1a1209]"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Date Selection Cards */}
            <div className="grid gap-3 sm:grid-cols-11 items-center">
              {/* Check-in (From) Card */}
              <div className="sm:col-span-5 bg-white rounded-2xl border border-[#c4b5fd]/80 p-3.5 space-y-2 shadow-2xs hover:border-[#7C3AED] transition">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-extrabold uppercase tracking-wider text-[#7C3AED] flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Check-in Date (From)</span>
                  </Label>
                  {isShortTerm && <span className="text-destructive font-black text-xs">*</span>}
                </div>

                <CustomDatePicker
                  value={form.short_term_from}
                  onChange={val => upd("short_term_from", val)}
                  minDate={todayStr}
                  placeholder="Select check-in date"
                  theme="purple"
                  rangeStart={form.short_term_from}
                  rangeEnd={form.short_term_to}
                />
              </div>

              {/* Arrow separator in middle */}
              <div className="sm:col-span-1 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-[#f3e8ff] border border-[#c4b5fd] flex items-center justify-center text-[#7C3AED] shrink-0">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>

              {/* Check-out (To) Card */}
              <div className="sm:col-span-5 bg-white rounded-2xl border border-[#c4b5fd]/80 p-3.5 space-y-2 shadow-2xs hover:border-[#7C3AED] transition">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-extrabold uppercase tracking-wider text-[#7C3AED] flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Check-out Date (To)</span>
                  </Label>
                  {isShortTerm && <span className="text-destructive font-black text-xs">*</span>}
                </div>

                <CustomDatePicker
                  value={form.short_term_to}
                  onChange={val => upd("short_term_to", val)}
                  minDate={minTo}
                  maxDate={maxTo || undefined}
                  disabled={!form.short_term_from}
                  placeholder={form.short_term_from ? "Select check-out date (1 wk – 6 mos)" : "Select check-in date first"}
                  theme="purple"
                  rangeStart={form.short_term_from}
                  rangeEnd={form.short_term_to}
                />
              </div>
            </div>

            {/* Validation & Duration Status Bar */}
            {dateError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 flex items-center gap-2 text-destructive text-xs font-bold animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{dateError}</span>
              </div>
            )}

            {form.short_term_from && form.short_term_to && !dateError && (
              <div className="rounded-xl border border-[#c4b5fd] bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#16a34a] text-white text-[11px] font-black">
                    ✓
                  </span>
                  <span className="text-xs font-extrabold text-[#1a1209]">
                    Valid Short-Term Stay Duration:{" "}
                    <span className="text-[#7C3AED] font-black">
                      {nights} Night{nights !== 1 ? "s" : ""} ({weeks} Week{weeks !== 1 ? "s" : ""})
                    </span>
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#836737] bg-[#faf6ee] px-2.5 py-0.5 rounded-full border border-[#f0e4d2]">
                  {formatHumanDate(form.short_term_from)} → {formatHumanDate(form.short_term_to)}
                </span>
              </div>
            )}

            {/* Separate Short-Term Weekly Price Card */}
            <div className="pt-2 border-t" style={{ borderColor: isShortTerm ? "#e0ceff" : "#e8d9c0" }}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-[#1a1209] flex items-center gap-1.5">
                    <span className="text-[#7C3AED] font-black">₹</span>
                    <span>Short-Term Price per Week (₹)</span>
                    {isShortTerm ? (
                      <span className="text-destructive font-black text-xs">* (Mandatory)</span>
                    ) : (
                      <span className="text-[11px] text-[#836737] font-semibold">(Optional)</span>
                    )}
                  </Label>
                  {form.short_term_price && Number(form.short_term_price) > 0 && (
                    <div className="text-[11px] font-bold text-[#7C3AED] flex items-center gap-2">
                      <span>≈ ₹{Math.round(Number(form.short_term_price) / 7).toLocaleString("en-IN")}/day</span>
                      <span>·</span>
                      <span>≈ ₹{Math.round(Number(form.short_term_price) * 4.3).toLocaleString("en-IN")}/mo</span>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-[#c4b5fd] focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 transition shadow-2xs">
                  <span className="font-black text-base text-[#7C3AED]">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={form.short_term_price}
                    onChange={e => upd("short_term_price", e.target.value)}
                    placeholder="Enter short-term weekly price (e.g. 8500)"
                    className="bg-transparent text-sm sm:text-base font-black text-[#1a1209] w-full outline-none placeholder:text-[#a08858] placeholder:font-normal"
                  />
                  <span className="text-xs font-bold text-[#836737] whitespace-nowrap bg-[#faf6ff] px-2.5 py-1 rounded-lg border border-[#e0ceff]">
                    per week
                  </span>
                </div>
                <p className="text-[10px] text-[#836737]">
                  Weekly rate is maintained completely separate from standard monthly rent or total sale pricing.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Divider */}
      <div className="border-t border-[#e8d9c0]/60 pt-4" />
      <div className="grid gap-4 sm:grid-cols-3">
        {form.property_type === "Office Space" ? (
          <>
            <div className="space-y-1.5">
              <Label className="font-bold">Workstations</Label>
              <Input
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={e => upd("bedrooms", e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">Cabins</Label>
              <Input
                type="number"
                min={0}
                value={form.bathrooms}
                onChange={e => upd("bathrooms", e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">Area (Sq Ft)</Label>
              <Input
                type="number"
                min={0}
                value={form.area_sqft}
                onChange={e => upd("area_sqft", e.target.value)}
                placeholder="e.g. 1800"
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="font-bold">Bedrooms</Label>
              <Input
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={e => upd("bedrooms", e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">Bathrooms</Label>
              <Input
                type="number"
                min={0}
                value={form.bathrooms}
                onChange={e => upd("bathrooms", e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">Area (Sq Ft)</Label>
              <Input
                type="number"
                min={0}
                value={form.area_sqft}
                onChange={e => upd("area_sqft", e.target.value)}
                placeholder="e.g. 1200"
              />
            </div>
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="font-bold">Furnished Status</Label>
        <Select value={form.furnished} onValueChange={v => upd("furnished", v)}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
            <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
            <SelectItem value="Unfurnished">Unfurnished</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Label className="font-bold text-base text-[#1a1209]">Amenities</Label>
            
            {/* Select All Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#836737] hover:text-[#1a1209] transition select-none bg-[#fdfbf7] px-2.5 py-1 rounded-lg border border-[#e8d9c0]">
              <Checkbox
                checked={amenityList.length > 0 && amenityList.every(a => form.amenities.includes(a))}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setForm(f => ({ ...f, amenities: [...amenityList] }));
                    toast.success("All amenities selected ✓");
                  } else {
                    setForm(f => ({ ...f, amenities: [] }));
                    toast.info("All amenities cleared");
                  }
                }}
                className="h-4 w-4 border-[#C9921A] data-[state=checked]:bg-[#C9921A] data-[state=checked]:text-white"
              />
              <span>Select All</span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowCustomAmenity(s => !s)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#C9921A] hover:underline cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Custom Amenity</span>
          </button>
        </div>

        {showCustomAmenity && (
          <div className="space-y-1.5 p-3 rounded-xl border border-[#e8d9c0] bg-[#fef9f0] animate-in fade-in">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-bold text-[#836737]">Custom Amenity Name:</span>
              {!hasCapitalFirstLetters(customAmenityInput) && customAmenityInput.length > 0 && (
                <span className="text-[10px] font-semibold text-destructive animate-pulse bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                  Plz Write First Letter In Capital
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={customAmenityInput}
                onChange={e => setCustomAmenityInput(toSmartTitleCase(e.target.value))}
                onBlur={e => setCustomAmenityInput(toSmartTitleCase(e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomAmenity(); } }}
                placeholder="e.g. EV Charger, Private Terrace, Home Automation"
                className="bg-white text-xs sm:text-sm h-9"
              />
              <Button
                type="button"
                size="sm"
                variant="hero"
                onClick={handleAddCustomAmenity}
                disabled={!customAmenityInput.trim()}
                className="h-9 px-4 whitespace-nowrap text-xs font-bold"
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { setShowCustomAmenity(false); setCustomAmenityInput(""); }}
                className="h-9 px-2 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
          {amenityList.map(a => (
            <label key={a} className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition select-none",
              form.amenities.includes(a)
                ? "border-primary bg-primary/5 text-primary font-medium"
                : "border-border hover:border-primary/40",
            )}>
              <Checkbox checked={form.amenities.includes(a)}
                onCheckedChange={() => toggleAmenity(a)} className="pointer-events-none" />
              {a}
            </label>
          ))}
        </div>
      </div>
    </div>,

    // ── Step 3: Location (Mandatory Address & Map Link) ──────────────────────
    <div className="space-y-5">
      {/* ── Structured Address Fields ── */}
      <div className="space-y-4 rounded-2xl border border-[#e8d9c0] bg-white p-4 sm:p-5 shadow-xs">
        <div className="border-b border-[#e8d9c0]/60 pb-2">
          <Label className="text-base font-bold text-[#1a1209]">Property Location & Address Details</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Enter structured details below to auto-fetch exact Google Maps location</p>
        </div>

        {/* Row 1: City & Locality */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-bold text-xs sm:text-sm text-[#1a1209]">
              City <span className="text-destructive font-bold">*</span>
              {form.location_locked && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md">
                  <Check className="h-2.5 w-2.5" /> Auto-filled
                </span>
              )}
            </Label>
            {form.location_locked ? (
              <div className="flex items-center gap-2 h-9 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-[#1a1209]">
                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="truncate">{form.city}</span>
              </div>
            ) : (
              <Select value={form.city} onValueChange={v => upd("city", v)}>
                <SelectTrigger className="bg-white border-[#e8d9c0]"><SelectValue /></SelectTrigger>
                <SelectContent>{cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <Label className="font-bold text-xs sm:text-sm text-[#1a1209]">
                <span>Locality / Area</span>
                <span className="text-destructive font-bold">*</span>
                {form.location_locked && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md">
                    <Check className="h-2.5 w-2.5" /> Auto-filled
                  </span>
                )}
              </Label>
              {!form.location_locked && !hasCapitalFirstLetters(form.locality) && form.locality.length > 0 && (
                <span className="text-[10px] font-semibold text-destructive animate-pulse bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                  Plz Write First Letter In Capital
                </span>
              )}
            </div>
            {form.location_locked ? (
              <div className="flex items-center gap-2 h-9 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-[#1a1209]">
                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="truncate">{form.locality || <span className="text-muted-foreground font-normal text-xs">Not available for this place</span>}</span>
              </div>
            ) : (
              <Input
                value={form.locality}
                onChange={e => upd("locality", toSmartTitleCase(e.target.value))}
                onBlur={e => upd("locality", toSmartTitleCase(e.target.value))}
                placeholder="e.g. Bodakdev, Bopal, Prahladnagar"
                className="bg-white border-[#e8d9c0]"
              />
            )}
          </div>
        </div>

        {/* Row 2: Society / Building / Complex Name */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <Label className="font-bold text-xs sm:text-sm text-[#1a1209]">
              <span>Society / Building / Complex Name</span>
              <span className="text-destructive font-bold">*</span>
            </Label>
            {!hasCapitalFirstLetters(form.building_name) && form.building_name.length > 0 && (
              <span className="text-[10px] font-semibold text-destructive animate-pulse bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                Plz Write First Letter In Capital
              </span>
            )}
          </div>
          <Input
            value={form.building_name}
            onChange={e => upd("building_name", toSmartTitleCase(e.target.value))}
            onBlur={e => upd("building_name", toSmartTitleCase(e.target.value))}
            placeholder="e.g. Krishna Complex, Dev Aurum, Royal Residency"
            className="bg-white border-[#e8d9c0]"
          />
        </div>

        {/* Row 3: House/Flat No. & Wing/Block */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-semibold text-xs sm:text-sm text-[#1a1209]">Flat / House / Shop No.</Label>
            <Input
              value={form.house_number}
              onChange={e => upd("house_number", e.target.value.toUpperCase())}
              placeholder="e.g. Flat 402, House 45"
              className="bg-white border-[#e8d9c0]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold text-xs sm:text-sm text-[#1a1209]">Wing / Block / Tower</Label>
            <Input
              value={form.wing}
              onChange={e => upd("wing", e.target.value.toUpperCase())}
              placeholder="e.g. Wing A, Block B"
              className="bg-white border-[#e8d9c0]"
            />
          </div>
        </div>

        {/* Row 4: Landmark (Opposite / Near By) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <Label className="font-semibold text-xs sm:text-sm text-[#1a1209]">
              Landmark (Near By / Opposite / Behind)
            </Label>
            {!hasCapitalFirstLetters(form.landmark) && form.landmark.length > 0 && (
              <span className="text-[10px] font-semibold text-destructive animate-pulse bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                Plz Write First Letter In Capital
              </span>
            )}
          </div>
          <Input
            value={form.landmark}
            onChange={e => upd("landmark", toSmartTitleCase(e.target.value))}
            onBlur={e => upd("landmark", toSmartTitleCase(e.target.value))}
            placeholder="e.g. Near Mocha Cafe, Opp. Courtyard Marriott"
            className="bg-white border-[#e8d9c0]"
          />
        </div>

        {/* Row 5: Pincode */}
        <div className="space-y-1.5">
          <Label className="font-semibold text-xs sm:text-sm text-[#1a1209]">
            Pincode
            {form.location_locked && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md">
                <Check className="h-2.5 w-2.5" /> Auto-filled
              </span>
            )}
          </Label>
          {form.location_locked ? (
            <div className="flex items-center gap-2 h-9 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-[#1a1209]">
              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <span>{form.pincode || <span className="text-muted-foreground font-normal text-xs">Not available for this place</span>}</span>
            </div>
          ) : (
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={e => upd("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="e.g. 380015"
              className="bg-white border-[#e8d9c0]"
            />
          )}
        </div>

        {/* Row 6: Auto-Assembled Full Address */}
        <div className="space-y-1.5 pt-2 border-t border-[#e8d9c0]/60">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <Label className="font-bold text-xs sm:text-sm text-[#836737]">Auto-Assembled Full Address (Saved for listing)</Label>
          </div>
          <Textarea
            rows={2}
            value={form.address}
            onChange={e => upd("address", toSmartTitleCase(e.target.value))}
            onBlur={e => upd("address", toSmartTitleCase(e.target.value))}
            placeholder="Complete address will auto-assemble here as you type above…"
            className="bg-[#fdfbf7] border-[#e8d9c0] text-xs sm:text-sm font-semibold text-[#1a1209]"
          />
        </div>
      </div>

      {/* ── Google Maps Location — Google Places Autocomplete ── */}
      <div className="space-y-1.5 relative">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <Label className="flex items-center gap-1.5 font-bold">
            <MapPin className="h-4 w-4 text-[#C9921A]" />
            <span>Google Maps Location</span>
            <span className="text-destructive font-bold">*</span>
          </Label>
          <span className="text-[11px] font-semibold text-[#836737] flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#C9921A]" />
            <span>Auto-Geocoded Nearby Places</span>
          </span>
        </div>

        {/* Helper hint */}
        <p className="text-[11px] text-[#a08858]">
          Search any society, shop, office, street or full address — select from Google results to auto-fill location details.
        </p>

        {/* Google Places Autocomplete input */}
        <GooglePlacesSearch
          value={form.map_url}
          lat={form.latitude}
          lng={form.longitude}
          cityHint={form.city}
          onLocationSelected={(details) => {
            // Match city to our supported cities list (case-insensitive)
            const matchedCity = cities.find(
              c => c.toLowerCase() === (details.city || "").toLowerCase()
            ) || form.city;

            // Safety net: even with search biased toward form.city, warn (don't
            // block) if the picked result is nowhere near it — e.g. a same-named
            // place in another state.
            if (form.city && !isCoordsPlausibleForCity(details.lat, details.lng, form.city)) {
              toast.warning(
                `That result looks far from ${form.city}. Please double-check the pin before continuing.`
              );
            }

            setForm(f => ({
              ...f,
              latitude:        details.lat.toFixed(7),
              longitude:       details.lng.toFixed(7),
              map_url:         details.formatted_address,
              google_place_id: details.place_id,
              city:            matchedCity,
              locality:        details.locality ? toSmartTitleCase(details.locality) : f.locality,
              pincode:         details.pincode || f.pincode,
              address:         details.formatted_address,
              location_locked: true,
            }));
          }}
          onClear={() => {
            setForm(f => ({
              ...f,
              latitude:        "",
              longitude:       "",
              map_url:         "",
              google_place_id: "",
              location_locked: false,
            }));
          }}
        />

        {/* Interactive map with draggable red pin — shown after location is selected.
            Owner can drag the pin to fine-tune the exact position before publishing. */}
        {form.latitude && form.longitude && !isNaN(parseFloat(form.latitude)) && !isNaN(parseFloat(form.longitude)) && (
          <DraggableLeafletMap
            lat={parseFloat(form.latitude)}
            lng={parseFloat(form.longitude)}
            onPinMoved={(newLat, newLng) => {
              setForm(f => ({
                ...f,
                latitude:  newLat.toFixed(7),
                longitude: newLng.toFixed(7),
              }));
            }}
          />
        )}

        {/* Location details summary card — shown after selection */}
        {form.location_locked && (
          <div className="mt-2 rounded-xl border border-[#e8d9c0] bg-[#fdfbf7] px-3.5 py-3 space-y-1.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#836737] flex items-center gap-1.5">
              <Check className="h-3 w-3 text-green-600" />
              Location Confirmed — Auto-filled Details
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
              {form.city && (
                <div><span className="text-[#a08858] font-semibold">City: </span><span className="text-[#1a1209] font-bold">{form.city}</span></div>
              )}
              {form.locality && (
                <div><span className="text-[#a08858] font-semibold">Locality: </span><span className="text-[#1a1209] font-bold">{form.locality}</span></div>
              )}
              {form.pincode && (
                <div><span className="text-[#a08858] font-semibold">Pincode: </span><span className="text-[#1a1209] font-bold">{form.pincode}</span></div>
              )}
              {form.latitude && (
                <div><span className="text-[#a08858] font-semibold">Lat: </span><span className="text-[#1a1209] font-bold">{Number(form.latitude).toFixed(6)}</span></div>
              )}
              {form.longitude && (
                <div><span className="text-[#a08858] font-semibold">Lng: </span><span className="text-[#1a1209] font-bold">{Number(form.longitude).toFixed(6)}</span></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Property Title (Single Combined Editable Input + AI Suggestions Popup) ── */}
      <div className="space-y-1.5 pt-3 border-t border-[#e8d9c0]/60 relative" ref={titleContainerRef}>
        <div className="flex items-center justify-between flex-wrap gap-1">
          <Label className="font-bold flex items-center gap-1.5 text-[#1a1209]">
            <span>Property Title</span>
            <span className="text-destructive font-bold">*</span>
          </Label>
          <span className="text-[11px] font-semibold text-[#836737] flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#C9921A]" />
            <span>AI Generated Titles (Click chevron to pick)</span>
          </span>
        </div>

        {/* Single Combined Editable Field + Popup Chevron */}
        <div className="relative">
          <Input
            value={form.title}
            onChange={e => upd("title", toSmartTitleCase(e.target.value))}
            onFocus={() => setShowTitleMenu(true)}
            placeholder="Type custom title or click chevron to pick AI title…"
            className="text-sm font-semibold bg-white border-[#e8d9c0] focus:border-[#C9921A] h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowTitleMenu(o => !o)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#836737] hover:text-[#C9921A] p-1 rounded-md transition cursor-pointer"
            title="View AI Suggested Titles"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showTitleMenu ? "rotate-180" : ""}`} />
          </button>

          {/* Popup Menu inside single field */}
          {showTitleMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl bg-white border border-[#e8d9c0] shadow-2xl py-1.5 z-50 animate-in fade-in max-h-60 overflow-y-auto">
              <div className="px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#836737] border-b border-[#f0e4d2] flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-[#C9921A]" />
                <span>AI Generated Titles (Click option to insert & edit)</span>
              </div>
              {aiTitleOptions.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { upd("title", opt.title); setShowTitleMenu(false); }}
                  className="w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#1a1209] hover:bg-[#fef8eb] hover:text-[#C9921A] transition-colors border-b last:border-b-0 border-[#f8f1e5] flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="truncate">{opt.title}</span>
                  {form.title === opt.title && <Check className="h-3.5 w-3.5 text-[#16a34a] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Location Description with AI Generate Button ─────────────── */}
      <div className="space-y-2 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <Label className="text-sm font-bold">Location Description</Label>
            <p className="text-xs text-muted-foreground">Eye-catching 4-5 line description with key connectivity and highlights</p>
          </div>
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={generatingAi}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#C9921A]/40 bg-[#fef3d4] px-3.5 py-1 text-xs font-bold text-[#C9921A] transition-all hover:bg-[#C9921A] hover:text-white disabled:opacity-50 shadow-2xs cursor-pointer active:scale-95"
          >
            {generatingAi ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Generating AI Description…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI Generate Description ✨</span>
              </>
            )}
          </button>
        </div>
        <Textarea
          value={form.description}
          onChange={e => upd("description", toSmartTitleCase(e.target.value))}
          onBlur={e => upd("description", toSmartTitleCase(e.target.value))}
          rows={5}
          placeholder="Click 'AI Generate Description' to automatically create an eye-catching 4-5 line capitalized summary with amenities and connectivity!"
        />
      </div>
    </div>,

    // ── Step 4: Property Photos ──────────────────────────────────────────────
    <div className="space-y-5">
      <div>
        <Label className="text-base font-bold">
          Property Photos <span className="text-destructive">*</span>
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Upload up to 10 photos. The first photo (marked with ★) will be the cover image.
          <span className="ml-1 text-xs">Allowed: JPG, PNG, WEBP · Max 10 MB Each</span>
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all py-10 px-6",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          images.length >= MAX_IMAGES && "opacity-50 pointer-events-none",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-3">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <p className="font-bold text-sm">
          {isDragging ? "Drop Photos Here" : "Click To Upload Or Drag & Drop"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {images.length}/{MAX_IMAGES} Photos Added
          {images.length < MIN_IMAGES && ` (${MIN_IMAGES - images.length} More Required)`}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {images.length < MIN_IMAGES && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {images.length === 0
            ? `Please Upload At Least ${MIN_IMAGES} Property Image To Publish.`
            : `${MIN_IMAGES - images.length} More Image${MIN_IMAGES - images.length > 1 ? "s" : ""} Required (Minimum ${MIN_IMAGES}).`}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border-2 transition"
              style={{ borderColor: img.isCover ? "hsl(var(--primary))" : "transparent" }}>

              <img src={img.previewUrl} alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover" />

              {img.isCover && (
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                  <Star className="h-2.5 w-2.5 fill-white" /> Cover
                </div>
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                {!img.isCover && (
                  <button type="button" onClick={() => setCover(i)}
                    title="Set As Cover"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 hover:bg-white transition">
                    <Star className="h-4 w-4 text-amber-500" />
                  </button>
                )}
                <button type="button" onClick={() => removeImage(i)}
                  title="Remove Photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 hover:bg-white transition">
                  <X className="h-4 w-4 text-destructive" />
                </button>
              </div>

              <div className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">
                {i + 1}
              </div>
            </div>
          ))}

          {images.length < MAX_IMAGES && (
            <button type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">Add More</span>
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Tip: Hover over a photo and click <Star className="inline h-3 w-3 text-amber-500" /> to set it as the cover image shown in listings.
      </p>
    </div>,

    // ── Step 4: 3D Property View (Virtual Tour) ──────────────────────────────
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-[#e8d9c0] bg-white p-5 space-y-1.5 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-[#1a1209] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fef8eb] border border-[#f4deb4] text-base">
                🏠
              </span>
              3D Property View
              <span className="text-[11px] font-bold text-[#C9921A] bg-[#fef8eb] border border-[#f4deb4] px-2 py-0.5 rounded-full">
                Optional
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-lg">
              Give buyers an immersive property experience. Add an interactive 3D tour, upload a 3D model, or let our AI generate a 360° view from your room photos.
            </p>
          </div>

          {/* Status chip */}
          {tourState.tourType !== "none" && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              {tourState.tourType === "link"         && "Tour Link Saved"}
              {tourState.tourType === "model"        && "3D Model Ready"}
              {tourState.tourType === "ai_generated" && "AI 360° Ready"}
            </div>
          )}
        </div>

        {/* Benefits chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            "🔍 Better property visualization",
            "📈 Higher user engagement",
            "📅 More visit requests",
            "⭐ Premium listing advantage",
          ].map(b => (
            <span key={b} className="text-[11px] font-medium text-[#836737] bg-[#faf6ee] border border-[#e8d9c0] rounded-full px-2.5 py-1">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Generator */}
      <AI360Generator
        propertyId={null}
        initialTourType={tourState.tourType}
        initialTourUrl={tourState.tourUrl || null}
        initialModelUrl={tourState.tourModelUrl || null}
        initialPanoUrl={tourState.tourPanoramaUrl || null}
        onLocalChange={setTourState}
      />
    </div>,

    // ── Step 5: Vastu Compliance Engine (Orientation & Vastu Score) ─────────
    <div className="space-y-6">
      {/* Top Banner Card: Live Vastu Score & Certification Badge */}
      <div className="rounded-3xl border border-[#e8d9c0] bg-white p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[#e8d9c0]/60 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#C9921A]" />
              <h3 className="text-lg font-bold text-[#1a1209]">Vastu Compliance Engine</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Automated Vastu Score calculated based on cardinal orientations & layout alignment
            </p>
          </div>

          {/* Vastu Certification Badge */}
          <div className={cn("px-4 py-2 rounded-2xl border text-xs sm:text-sm shadow-2xs flex items-center gap-2", vastuCalc.badgeColor)}>
            <Sparkles className="h-4 w-4 shrink-0 text-[#C9921A]" />
            <span>{vastuCalc.badgeLabel}</span>
          </div>
        </div>

        {/* Live Score Meter & Breakdown Grid */}
        <div className="grid gap-4 sm:grid-cols-5 pt-5">
          {/* Main Score Box */}
          <div className="sm:col-span-2 rounded-2xl bg-[#fdfbf7] border border-[#e8d9c0] p-4 text-center flex flex-col items-center justify-center relative shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#836737]">Automated Vastu Score</span>
            <div className="my-2 flex items-baseline justify-center gap-1">
              <span className="text-4xl sm:text-5xl font-black text-[#1a1209]">{vastuCalc.score}</span>
              <span className="text-sm font-bold text-[#836737]">/ 100</span>
            </div>
            <div className="w-full bg-[#e8d9c0]/60 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#C9921A] via-[#E5A922] to-[#16a34a] transition-all duration-500 rounded-full"
                style={{ width: `${vastuCalc.score}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-2 font-medium">
              {vastuCalc.isCertified ? "✓ Eligible for Verified Vastu Badge on listing" : "Adjust orientations to reach 75+ for Verified Badge"}
            </span>
          </div>

          {/* 4 Score Breakdown Cards */}
          <div className="sm:col-span-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[#e8d9c0] bg-white p-3 text-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase">Main Entrance</p>
              <p className="text-base font-black text-[#1a1209] mt-0.5">{vastuCalc.breakdown.entranceScore} <span className="text-xs font-normal text-muted-foreground">/ 35</span></p>
              <p className="text-[10px] font-semibold text-[#C9921A] truncate">{form.entrance_direction}</p>
            </div>
            <div className="rounded-xl border border-[#e8d9c0] bg-white p-3 text-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase">Kitchen Zone</p>
              <p className="text-base font-black text-[#1a1209] mt-0.5">{vastuCalc.breakdown.kitchenScore} <span className="text-xs font-normal text-muted-foreground">/ 25</span></p>
              <p className="text-[10px] font-semibold text-[#C9921A] truncate">{form.kitchen_location}</p>
            </div>
            <div className="rounded-xl border border-[#e8d9c0] bg-white p-3 text-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase">Master Bedroom</p>
              <p className="text-base font-black text-[#1a1209] mt-0.5">{vastuCalc.breakdown.bedroomScore} <span className="text-xs font-normal text-muted-foreground">/ 25</span></p>
              <p className="text-[10px] font-semibold text-[#C9921A] truncate">{form.master_bedroom_location}</p>
            </div>
            <div className="rounded-xl border border-[#e8d9c0] bg-white p-3 text-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase">Balcony / Window</p>
              <p className="text-base font-black text-[#1a1209] mt-0.5">{vastuCalc.breakdown.balconyScore} <span className="text-xs font-normal text-muted-foreground">/ 15</span></p>
              <p className="text-[10px] font-semibold text-[#C9921A] truncate">{form.balcony_direction}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cardinal Direction Selection Inputs */}
      <div className="rounded-3xl border border-[#e8d9c0] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="border-b border-[#e8d9c0]/60 pb-2">
          <Label className="text-base font-bold text-[#1a1209]">Property Orientations & Cardinal Placements</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Select accurate cardinal directions from layout plan or site visit</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* 1. Main Entrance Direction */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-xs sm:text-sm text-[#1a1209] flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-[#C9921A]" />
                <span>Main Entrance Direction</span>
              </Label>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Best: NE / E / N</span>
            </div>
            <Select value={form.entrance_direction} onValueChange={v => upd("entrance_direction", v)}>
              <SelectTrigger className="bg-white border-[#e8d9c0] text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="North-East">North-East (NE) ★ Highest Auspicious</SelectItem>
                <SelectItem value="East">East (E) ★ Highly Auspicious</SelectItem>
                <SelectItem value="North">North (N) ★ Highly Auspicious</SelectItem>
                <SelectItem value="North-West">North-West (NW) - Good</SelectItem>
                <SelectItem value="South-East">South-East (SE) - Moderate</SelectItem>
                <SelectItem value="West">West (W) - Moderate</SelectItem>
                <SelectItem value="South">South (S)</SelectItem>
                <SelectItem value="South-West">South-West (SW)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">East and North-East entrances bring health, wealth, and spiritual growth.</p>
          </div>

          {/* 2. Kitchen Placement */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-xs sm:text-sm text-[#1a1209] flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-[#C9921A]" />
                <span>Kitchen Placement</span>
              </Label>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Best: SE (Agni Zone)</span>
            </div>
            <Select value={form.kitchen_location} onValueChange={v => upd("kitchen_location", v)}>
              <SelectTrigger className="bg-white border-[#e8d9c0] text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="South-East">South-East (SE) ★ Ideal Agni Corner</SelectItem>
                <SelectItem value="North-West">North-West (NW) ★ Secondary Best</SelectItem>
                <SelectItem value="East">East (E) - Good</SelectItem>
                <SelectItem value="North">North (N)</SelectItem>
                <SelectItem value="North-East">North-East (NE)</SelectItem>
                <SelectItem value="South">South (S)</SelectItem>
                <SelectItem value="South-West">South-West (SW)</SelectItem>
                <SelectItem value="West">West (W)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">South-East is the Agni (Fire) element zone for cooking and vitality.</p>
          </div>

          {/* 3. Master Bedroom Location */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-xs sm:text-sm text-[#1a1209] flex items-center gap-1.5">
                <Bed className="h-4 w-4 text-[#C9921A]" />
                <span>Master Bedroom Location</span>
              </Label>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Best: SW (Nairutya)</span>
            </div>
            <Select value={form.master_bedroom_location} onValueChange={v => upd("master_bedroom_location", v)}>
              <SelectTrigger className="bg-white border-[#e8d9c0] text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="South-West">South-West (SW) ★ Ideal Owner Stability</SelectItem>
                <SelectItem value="South">South (S) - Good</SelectItem>
                <SelectItem value="West">West (W) - Good</SelectItem>
                <SelectItem value="North-West">North-West (NW)</SelectItem>
                <SelectItem value="North">North (N)</SelectItem>
                <SelectItem value="East">East (E)</SelectItem>
                <SelectItem value="North-East">North-East (NE)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">South-West ensures stability, authority, and harmonious family relationships.</p>
          </div>

          {/* 4. Balcony / Window Alignment */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-xs sm:text-sm text-[#1a1209] flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-[#C9921A]" />
                <span>Balcony / Main Window Alignment</span>
              </Label>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Best: E / N / NE</span>
            </div>
            <Select value={form.balcony_direction} onValueChange={v => upd("balcony_direction", v)}>
              <SelectTrigger className="bg-white border-[#e8d9c0] text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="East">East (E) ★ Morning Sunlight</SelectItem>
                <SelectItem value="North">North (N) ★ Positive Energy</SelectItem>
                <SelectItem value="North-East">North-East (NE) ★ Maximum Light</SelectItem>
                <SelectItem value="North-West">North-West (NW)</SelectItem>
                <SelectItem value="South-East">South-East (SE)</SelectItem>
                <SelectItem value="West">West (W)</SelectItem>
                <SelectItem value="South">South (S)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">East and North balconies welcome beneficial morning sunlight and fresh airflow.</p>
          </div>
        </div>

        {/* Dynamic Vastu Recommendations Box */}
        {vastuCalc.recommendations.length > 0 && (
          <div className="rounded-2xl border border-[#e8d9c0] bg-[#fdfbf7] p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#836737]">
              <Sparkles className="h-3.5 w-3.5 text-[#C9921A]" />
              <span>Vastu Optimization Tips for Highest Ranking:</span>
            </div>
            <ul className="space-y-1 text-xs text-[#1a1209] list-disc list-inside font-medium">
              {vastuCalc.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,

    // ── Step 6: Spacious Luxury Property Showcase & Integrated Publish Control ──
    <div className="space-y-6">

      {/* ═══ 2-COLUMN MAIN SHOWCASE & CONTROL CONTAINER ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">

        {/* ── LEFT SECTION (7 cols): Spacious Showcase Cards ── */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-6">

          {/* 1. Property Identity & Photo Showcase Card */}
          <div className="rounded-3xl border border-[#f0e4d2] bg-white p-6 sm:p-7 shadow-xs space-y-6">
            
            {/* Header with Title, Location, and Status Badges */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#f0e4d2]/80 pb-5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1.5 flex-nowrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#fef8eb] text-[#C9921A] border border-[#f4deb4]">
                    {form.property_type} · {form.listing_type.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    ✓ Verified Ready to Publish
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-[#1a1209] leading-snug tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {form.title ? toSmartTitleCase(form.title) : "Premium Residential Listing"}
                </h2>
                <p className="text-[11px] text-[#836737] font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-[#C9921A] shrink-0" />
                  <span>{toSmartTitleCase(form.address || form.locality || form.city)}, {toSmartTitleCase(form.city)}</span>
                </p>
              </div>

              {/* Quality & Vastu Badges Top Right */}
              <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowScoreModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#fef8eb] border border-[#f4deb4] text-xs font-bold text-[#C9921A] hover:scale-105 transition cursor-pointer"
                >
                  <Star className="h-3.5 w-3.5 fill-[#C9921A] text-[#C9921A]" />
                  <span className="font-black">{qualityScore.overall} / 5.0</span>
                  <span className="text-[#836737] font-medium">Quality</span>
                </button>
                <div className={cn("px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5", vastuCalc.badgeColor)}>
                  <Compass className="h-3.5 w-3.5" />
                  <span>{vastuCalc.score}/100 Vastu</span>
                </div>
              </div>
            </div>

            {/* 5-Photo Bento Showcase Grid */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Photo 1: Main Cover Photo (Spans 2 cols & 2 rows on sm) */}
                <div
                  onClick={() => { setActiveModalPhotoIndex(0); setShowPhotoGalleryModal(true); }}
                  className="col-span-2 row-span-2 relative aspect-[16/10] sm:aspect-auto rounded-2xl overflow-hidden bg-black/5 border border-[#f0e4d2] shadow-xs group cursor-pointer"
                >
                  {images[0] ? (
                    <>
                      <img
                        src={images[0].previewUrl}
                        alt="Main Cover Photo"
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute top-3 left-3 bg-[#C9921A] text-white text-[11px] font-black px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                        <Star className="h-3 w-3 fill-white" /> Cover Photo
                      </div>
                      <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-white text-xs font-bold px-3 py-1 rounded-lg">
                        1 / {images.length}
                      </div>
                    </>
                  ) : (
                    <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-xs text-muted-foreground bg-[#faf6ee] p-4 text-center">
                      <ImagePlus className="h-8 w-8 text-[#C9921A]/60 mb-2" />
                      <span className="font-bold text-[#836737]">No photos uploaded yet</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Add photos in Step 3 to see live preview</span>
                    </div>
                  )}
                </div>

                {/* Photo 2 */}
                <div
                  onClick={() => { setActiveModalPhotoIndex(1); setShowPhotoGalleryModal(true); }}
                  className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-black/5 border border-[#f0e4d2] shadow-xs cursor-pointer group"
                >
                  {images[1] ? (
                    <img src={images[1].previewUrl} alt="Photo 2" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground bg-[#faf6ee]">
                      <ImagePlus className="h-5 w-5 text-[#C9921A]/40" />
                    </div>
                  )}
                </div>

                {/* Photo 3 */}
                <div
                  onClick={() => { setActiveModalPhotoIndex(2); setShowPhotoGalleryModal(true); }}
                  className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-black/5 border border-[#f0e4d2] shadow-xs cursor-pointer group"
                >
                  {images[2] ? (
                    <img src={images[2].previewUrl} alt="Photo 3" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground bg-[#faf6ee]">
                      <ImagePlus className="h-5 w-5 text-[#C9921A]/40" />
                    </div>
                  )}
                </div>

                {/* Photo 4 */}
                <div
                  onClick={() => { setActiveModalPhotoIndex(3); setShowPhotoGalleryModal(true); }}
                  className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-black/5 border border-[#f0e4d2] shadow-xs cursor-pointer group"
                >
                  {images[3] ? (
                    <img src={images[3].previewUrl} alt="Photo 4" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground bg-[#faf6ee]">
                      <ImagePlus className="h-5 w-5 text-[#C9921A]/40" />
                    </div>
                  )}
                </div>

                {/* Photo 5 (with +X More overlay if user uploaded > 5 photos) */}
                <div
                  onClick={() => { setActiveModalPhotoIndex(4); setShowPhotoGalleryModal(true); }}
                  className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-black/5 border border-[#f0e4d2] shadow-xs cursor-pointer group"
                >
                  {images[4] ? (
                    <img src={images[4].previewUrl} alt="Photo 5" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground bg-[#faf6ee]">
                      <ImagePlus className="h-5 w-5 text-[#C9921A]/40" />
                    </div>
                  )}
                  {images.length > 5 && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-white p-2 text-center group-hover:bg-black/80 transition">
                      <span className="text-base sm:text-lg font-black">+{images.length - 5} More</span>
                      <span className="text-[10px] font-bold underline mt-0.5">See All Photos</span>
                    </div>
                  )}
                </div>
              </div>

              {/* See All Photos button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setActiveModalPhotoIndex(0); setShowPhotoGalleryModal(true); }}
                  className="text-xs font-extrabold text-[#C9921A] hover:underline flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#fef8eb] border border-[#f4deb4] shadow-2xs hover:scale-105 transition cursor-pointer"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>See All {images.length} Photos</span>
                </button>
              </div>
            </div>

            {/* 4 Stat Badges Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-[#fdfbf7] p-3.5 rounded-2xl border border-[#f0e4d2] text-center hover:border-[#C9921A]/60 transition">
                <p className="text-[11px] font-bold text-[#836737] uppercase tracking-widest leading-none">
                  {form.property_type === "Office Space" ? "Workstations" : "Bedrooms"}
                </p>
                <p className="text-base font-black text-[#1a1209] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                  {form.property_type === "Office Space" ? `${form.bedrooms || "20"} Seats` : `${form.bedrooms || "1"} BHK`}
                </p>
              </div>
              <div className="bg-[#fdfbf7] p-3.5 rounded-2xl border border-[#f0e4d2] text-center hover:border-[#C9921A]/60 transition">
                <p className="text-[11px] font-bold text-[#836737] uppercase tracking-widest leading-none">
                  {form.property_type === "Office Space" ? "Cabins" : "Bathrooms"}
                </p>
                <p className="text-base font-black text-[#1a1209] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                  {form.bathrooms || "1"} {form.property_type === "Office Space" ? "Cabins" : "Baths"}
                </p>
              </div>
              <div className="bg-[#fdfbf7] p-3.5 rounded-2xl border border-[#f0e4d2] text-center hover:border-[#C9921A]/60 transition">
                <p className="text-[11px] font-bold text-[#836737] uppercase tracking-widest leading-none">Super Area</p>
                <p className="text-base font-black text-[#1a1209] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>{form.area_sqft || "700"} <span className="text-sm font-semibold">sq.ft</span></p>
              </div>
              <div className="bg-[#fdfbf7] p-3.5 rounded-2xl border border-[#f0e4d2] text-center hover:border-[#C9921A]/60 transition">
                <p className="text-[11px] font-bold text-[#836737] uppercase tracking-widest leading-none">Furnishing</p>
                <p className="text-sm font-black text-[#2563eb] mt-1.5 leading-tight">{form.furnished || "Semi-Furnished"}</p>
              </div>
            </div>

          </div>

          {/* 2. Listed By Owner Profile Card */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl border border-[#f0e4d2] bg-white shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-full bg-[#C9921A] text-white font-black text-lg flex items-center justify-center shadow-xs">
                {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : (form.title ? form.title.charAt(0).toUpperCase() : "O")}
              </div>
              <div>
                <p className="font-bold text-base text-[#1a1209]">
                  {currentUser?.full_name ? currentUser.full_name : "Listed by Owner"}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span className="text-emerald-600 font-bold">✓ Verified Property Owner</span> · Direct Listing
                </p>
              </div>
            </div>
            <a
              href={currentUser?.phone ? `tel:${currentUser.phone}` : "#"}
              onClick={(e) => {
                if (!currentUser?.phone) {
                  e.preventDefault();
                  toast.info("Phone number fetched from registered account details.");
                }
              }}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#C9921A] to-[#b38014] text-white font-extrabold text-xs sm:text-sm shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Phone className="h-4 w-4" />
              <span>{currentUser?.phone ? `Call Owner (${currentUser.phone})` : "Call Owner"}</span>
            </a>
          </div>

          {/* 3. Spacious AI Description Card */}
          <div className="rounded-3xl border border-[#f0e4d2] bg-white p-6 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#f0e4d2] pb-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#C9921A]" />
                <h3 className="font-black text-lg text-[#1a1209]">About This Property</h3>
              </div>
              <span className="text-xs font-bold text-[#836737] bg-[#fdfbf7] border border-[#f0e4d2] px-3 py-1 rounded-full">
                AI Enhanced Description
              </span>
            </div>
            <div className="text-sm sm:text-base text-[#4a3b20] leading-relaxed whitespace-pre-line bg-[#fdfbf7] p-5 sm:p-6 rounded-2xl border border-[#f0e4d2]">
              {form.description ? toSmartTitleCase(form.description) : "No description provided."}
            </div>
          </div>



          {/* 6. Spacious Location & Connectivity Card */}
          <div className="rounded-3xl border border-[#f0e4d2] bg-white p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#f0e4d2] pb-3.5">
              <div>
                <h3 className="font-black text-lg text-[#1a1209]">Location & Transit</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <MapPin className="h-4 w-4 text-[#C9921A]" />
                  <span>{toSmartTitleCase(form.address || form.locality || form.city)}, {toSmartTitleCase(form.city)}</span>
                </p>
              </div>
              {form.latitude && form.longitude && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${form.latitude},${form.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs sm:text-sm font-extrabold text-[#C9921A] hover:underline flex items-center gap-1"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {/* Nearby Transit Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f0e4d2] flex items-center justify-between shadow-2xs">
                <span className="text-xs sm:text-sm font-bold text-[#1a1209]">🏫 School</span>
                <span className="text-xs font-black text-[#836737] bg-white px-2.5 py-1 rounded-lg border border-[#f0e4d2]">500 m</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f0e4d2] flex items-center justify-between shadow-2xs">
                <span className="text-xs sm:text-sm font-bold text-[#1a1209]">🚇 Metro Station</span>
                <span className="text-xs font-black text-[#836737] bg-white px-2.5 py-1 rounded-lg border border-[#f0e4d2]">1.2 km</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f0e4d2] flex items-center justify-between shadow-2xs">
                <span className="text-xs sm:text-sm font-bold text-[#1a1209]">🏥 Hospital</span>
                <span className="text-xs font-black text-[#836737] bg-white px-2.5 py-1 rounded-lg border border-[#f0e4d2]">800 m</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT STICKY CONTROL & PUBLISH PANEL (5 cols) ── */}
        <div className="lg:col-span-5 xl:col-span-5 sticky top-6 space-y-5">
          <div className="rounded-3xl border-2 border-[#dcb059] bg-white p-6 sm:p-8 shadow-xl shadow-[#dcb059]/10 space-y-5">

            {/* Price Header Display */}
            <div className="border-b border-[#e8d9c0]/80 pb-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-3xl sm:text-4xl font-black text-[#1a1209] tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    ₹{form.listing_type === "short_term"
                      ? (form.short_term_price ? Number(form.short_term_price).toLocaleString("en-IN") : "—")
                      : (form.price ? Number(form.price).toLocaleString("en-IN") : "—")}
                  </span>
                  <span className="text-xs font-semibold text-[#836737] whitespace-nowrap">
                    {form.listing_type === "sale" ? "/total" : form.listing_type === "short_term" ? "/week" : "/month"}
                  </span>
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#C9921A] bg-[#fef8eb] border border-[#f4deb4] px-3 py-1 rounded-full shrink-0">
                  {form.listing_type === "short_term" ? "SHORT-TERM" : form.listing_type.toUpperCase()}
                </span>
              </div>
              {form.listing_type === "short_term" && form.short_term_from && form.short_term_to && (
                <p className="text-xs text-[#7C3AED] font-semibold mt-2">
                  📅 {form.short_term_from} → {form.short_term_to}
                </p>
              )}
            </div>

            {/* Editable Price Fields */}
            <div className="space-y-3">
              {form.listing_type === "short_term" ? (
                <div className="rounded-xl border border-[#e0ceff] bg-[#faf6ff] p-4 space-y-2">
                  <p className="text-xs font-bold text-[#5b21b6]">Short-Term pricing is set in Step 1 (Configuration).</p>
                  <p className="text-[11px] text-[#836737]">
                    Weekly price: <strong className="text-[#1a1209]">₹{form.short_term_price ? Number(form.short_term_price).toLocaleString("en-IN") : "—"}</strong>
                    {" · "}
                    Window: <strong className="text-[#1a1209]">{form.short_term_from || "—"} → {form.short_term_to || "—"}</strong>
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1a1209] flex items-center justify-between">
                    <span>{form.listing_type === "sale" ? "Sale Price (₹)" : "Monthly Rent (₹)"}</span>
                    <span className="text-destructive">*</span>
                  </label>
                <div className="bg-[#fdfbf7] border border-[#e8d9c0] focus-within:border-[#C9921A] focus-within:ring-2 focus-within:ring-[#C9921A]/15 rounded-2xl px-4 py-3 flex items-center gap-2.5 transition">
                  <span className="font-bold text-base text-[#836737]">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={e => upd("price", e.target.value)}
                    placeholder={form.listing_type === "sale" ? "Add sale amount here" : "Add amount for rent"}
                    className="bg-transparent text-base sm:text-lg font-black text-[#1a1209] w-full outline-none placeholder:text-[#c4a96f] placeholder:font-normal" style={{ fontFamily: 'var(--font-display)' }}
                  />
                </div>
              </div>
              )}

              {form.listing_type !== "sale" && form.listing_type !== "short_term" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1a1209] flex items-center justify-between">
                    <span>Security Deposit (₹)</span>
                    <span className="text-destructive">*</span>
                  </label>
                  <div className="bg-[#fdfbf7] border border-[#e8d9c0] focus-within:border-[#C9921A] focus-within:ring-2 focus-within:ring-[#C9921A]/15 rounded-2xl px-4 py-3 flex items-center gap-2.5 transition">
                    <span className="font-bold text-base text-[#836737]">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={form.deposit}
                      onChange={e => upd("deposit", e.target.value)}
                      placeholder="Add amount for security deposit"
                      className="bg-transparent text-base sm:text-lg font-black text-[#1a1209] w-full outline-none placeholder:text-[#c4a96f] placeholder:font-normal" style={{ fontFamily: 'var(--font-display)' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* AI Pricing Recommendation Assistant */}
            <AIPricingWidget
              city={form.city}
              property_type={form.property_type}
              listing_type={form.listing_type}
              bedrooms={form.bedrooms ? Number(form.bedrooms) : undefined}
              area_sqft={form.area_sqft ? Number(form.area_sqft) : undefined}
              locality={form.locality || undefined}
              onApply={price => {
                upd("price", String(price));
                toast.success(`✅ Optimal price ₹${price.toLocaleString("en-IN")} applied!`);
              }}
            />

            {/* Primary Action Button: Complete Publish Now */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={submit}
                variant="hero"
                size="lg"
                disabled={loading}
                className="w-full py-4 text-base font-black shadow-lg shadow-[#C9921A]/20 hover:shadow-xl hover:scale-[1.01] transition-all rounded-2xl cursor-pointer bg-gradient-to-r from-[#C9921A] via-[#dcb059] to-[#b38014] text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span>Publishing Listing…</span>
                  </>
                ) : (
                  <>
                    <span>🚀 Publish Property Now</span>
                    <ChevronRight className="h-5 w-5 ml-1.5" />
                  </>
                )}
              </Button>
            </div>

            {/* Quick Listing Quality & Vastu Verification Box */}
            <div className="rounded-2xl border border-[#e8d9c0] bg-[#fdfbf7] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between font-extrabold text-[#1a1209]">
                <span>Listing Readiness</span>
                <span className="text-emerald-600">100% Ready</span>
              </div>
              <div className="space-y-1.5 text-muted-foreground text-[11px]">
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="text-emerald-600 font-bold">✓</span> {images.length} High-Res Photos Uploaded
                </p>
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="text-emerald-600 font-bold">✓</span> Google Maps Location Pinned
                </p>
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="text-emerald-600 font-bold">✓</span> Vastu Score: {vastuCalc.score}/100 ({vastuCalc.badgeLabel})
                </p>
              </div>
            </div>

          </div>

          {/* ── CARD 2: Quality & Vastu Compliance Card ── */}
          <div className="rounded-3xl border border-[#f0e4d2] bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-[#f0e4d2] pb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-[#C9921A] shrink-0" />
                  <h3 className="font-black text-sm text-[#1a1209] truncate">Quality & Vastu Compliance</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                  Automated proprietary scoring based on layout, configuration, location, and cardinal alignment.
                </p>
              </div>
              <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
                {vastuCalc.score}% Vastu Score
              </span>
            </div>

            {/* 4 Category Stat Mini Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Box 1: Configuration & Layout */}
              <div className="bg-[#fdfbf7] p-3 sm:p-3.5 rounded-2xl border border-[#f0e4d2] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="font-bold text-[#1a1209] truncate flex items-center gap-1">
                    <span>🏢</span> Layout & Config
                  </span>
                  <span className="font-black text-[#836737] shrink-0">{qualityScore?.breakdown?.configuration?.score || 12.4}/20</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#e8d9c0]/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C9921A]"
                    style={{ width: `${Math.min(qualityScore?.breakdown?.configuration?.percentage || 62, 100)}%` }}
                  />
                </div>
              </div>

              {/* Box 2: Location & GPS Verified */}
              <div className="bg-[#fdfbf7] p-3 sm:p-3.5 rounded-2xl border border-[#f0e4d2] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="font-bold text-[#1a1209] truncate flex items-center gap-1">
                    <span>📍</span> Location & GPS
                  </span>
                  <span className="font-black text-[#836737] shrink-0">{qualityScore?.breakdown?.location?.score || 9.3}/10</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#e8d9c0]/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C9921A]"
                    style={{ width: `${Math.min(qualityScore?.breakdown?.location?.percentage || 93, 100)}%` }}
                  />
                </div>
              </div>

              {/* Box 3: Photos & Visual */}
              <div className="bg-[#fdfbf7] p-3 sm:p-3.5 rounded-2xl border border-[#f0e4d2] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="font-bold text-[#1a1209] truncate flex items-center gap-1">
                    <span>📷</span> Photos & Visual
                  </span>
                  <span className="font-black text-[#836737] shrink-0">{qualityScore?.breakdown?.photos?.score || 8}/10</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#e8d9c0]/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C9921A]"
                    style={{ width: `${Math.min(qualityScore?.breakdown?.photos?.percentage || 80, 100)}%` }}
                  />
                </div>
              </div>

              {/* Box 4: Vastu Direction */}
              <div className="bg-[#fdfbf7] p-3 sm:p-3.5 rounded-2xl border border-[#f0e4d2] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="font-bold text-[#1a1209] truncate flex items-center gap-1">
                    <span>🧭</span> Vastu Direction
                  </span>
                  <span className="font-black text-emerald-600 shrink-0">{vastuCalc.score}/100</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(vastuCalc.score, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── CARD 3: What This Place Offers Card ── */}
          <div className="rounded-3xl border border-[#f0e4d2] bg-white p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#f0e4d2] pb-3">
              <h3 className="font-black text-sm text-[#1a1209]">What This Place Offers</h3>
              <span className="text-[10px] font-extrabold text-[#836737] bg-[#fdfbf7] border border-[#f0e4d2] px-2.5 py-0.5 rounded-full">
                {form.amenities.length} Selected
              </span>
            </div>

            {/* Amenity Badges Flow Layout */}
            {form.amenities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {form.amenities.map((a, i) => (
                  <div
                    key={i}
                    className="bg-[#fdfbf7] border border-[#f0e4d2] px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[#1a1209] shadow-2xs hover:border-[#C9921A] transition"
                  >
                    <span className="text-[#C9921A] font-black text-xs">✦</span>
                    <span className="whitespace-nowrap">{toSmartTitleCase(a)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#fdfbf7] border border-[#f0e4d2] text-center text-xs text-muted-foreground font-medium">
                No amenities selected yet. Select amenities in Step 4.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>,
  ];

  return (
    <DashboardShell title="Post A Property" subtitle="Takes About 3 Minutes">
      <PropertyPublishConfirmation
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
      />

      {/* ── Unsaved Listing Changes Modal Popup ── */}
      {showUnsavedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowUnsavedModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[#f0e4d2] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="font-black text-lg text-[#1a1209]">Leave without publishing?</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  Your property details will be lost if you leave now. Do you want to continue?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {/* Discard & Leave */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  try {
                    sessionStorage.removeItem("nivaas_new_prop_form");
                    sessionStorage.removeItem("nivaas_new_prop_step");
                    localStorage.removeItem("nivaas_active_draft");
                  } catch {}
                  setShowUnsavedModal(false);
                  navigate({ to: "/dashboard/properties" });
                }}
                className="w-full py-2.5 text-xs font-bold rounded-2xl border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
              >
                🗑️ Leave without saving
              </Button>

              {/* Option 3: Keep Editing */}
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="text-xs font-bold text-muted-foreground hover:text-[#1a1209] py-1 cursor-pointer"
              >
                Keep Editing Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Property Quality Score Breakdown Modal ── */}
      {showScoreModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowScoreModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[#f0e4d2] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#f0e4d2] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#fef8eb] border border-[#f4deb4] flex items-center justify-center text-[#C9921A] font-black text-base shadow-xs">
                  ★
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[#1a1209]">Property Quality Score</h3>
                  <p className="text-xs text-[#836737]">Dynamic evaluation of listing readiness & appeal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScoreModal(false)}
                className="w-8 h-8 rounded-full bg-[#fdfbf7] border border-[#f0e4d2] flex items-center justify-center text-[#836737] hover:text-[#1a1209] hover:bg-[#f0e4d2] transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Total Score Summary Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-[#fef8eb] to-[#fdfbf7] border border-[#f4deb4] p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#836737] uppercase tracking-wider">Overall Quality Score</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-[#1a1209]">{qualityScore.totalScore}</span>
                  <span className="text-sm font-bold text-[#836737]">/ 100</span>
                  <span
                    className="ml-2 text-xs font-extrabold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: qualityScore.badgeBg, color: qualityScore.badgeText, border: `1px solid ${qualityScore.badgeBorder}` }}
                  >
                    {qualityScore.label}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-[#836737]">Card Rating</p>
                <p className="text-xl font-black text-[#C9921A] flex items-center gap-1 justify-end">
                  <span>★</span> {qualityScore.overall} <span className="text-xs text-[#836737] font-semibold">/ 5.0</span>
                </p>
              </div>
            </div>

            {/* 5 Categories Progress Breakdown */}
            <div className="space-y-3.5 pt-1">
              {Object.entries(qualityScore?.breakdown || {}).map(([key, cat]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1a1209]">{cat.label}</span>
                    <span className="font-extrabold text-[#C9921A] font-mono">{cat.score} / {cat.max} pts</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#faf6ee] overflow-hidden border border-[#f0e4d2]">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#C9921A] to-[#e4ba63]"
                      style={{ width: `${Math.min(cat.percentage || 0, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quality Highlights */}
            {(qualityScore?.highlights || []).length > 0 && (
              <div className="pt-2 border-t border-[#f0e4d2]">
                <p className="text-xs font-bold text-[#1a1209] mb-2">Key Quality Strengths</p>
                <div className="flex flex-wrap gap-1.5">
                  {(qualityScore?.highlights || []).map((h, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#fdfbf7] border border-[#f0e4d2] text-[#1a1209] px-2.5 py-1 rounded-xl">
                      <span className="text-[#C9921A]">✦</span> {h}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button
                type="button"
                variant="hero"
                onClick={() => setShowScoreModal(false)}
                className="w-full font-bold cursor-pointer"
              >
                Got It
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Property Photo Gallery Lightbox Modal ── */}
      {showPhotoGalleryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
          onClick={() => setShowPhotoGalleryModal(false)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-[#f0e4d2] bg-white p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#f0e4d2] pb-3.5">
              <div>
                <h3 className="font-black text-lg text-[#1a1209]">Property Photos Showcase</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Showing Photo {activeModalPhotoIndex + 1} of {images.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoGalleryModal(false)}
                className="h-9 w-9 rounded-full bg-[#faf6ee] hover:bg-[#f0e4d2] border border-[#e8d9c0] flex items-center justify-center text-[#1a1209] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Active Large Image Display */}
            <div className="relative aspect-[16/10] sm:aspect-[16/9] rounded-2xl overflow-hidden bg-black border border-[#f0e4d2]">
              <img
                src={images[activeModalPhotoIndex]?.previewUrl}
                alt={`Photo ${activeModalPhotoIndex + 1}`}
                className="h-full w-full object-contain"
              />
              {activeModalPhotoIndex === 0 && (
                <div className="absolute top-3 left-3 bg-[#C9921A] text-white text-xs font-black px-3.5 py-1 rounded-full shadow-md flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-white" /> Cover Photo
                </div>
              )}

              {/* Prev / Next Controls */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveModalPhotoIndex(prev => (prev > 0 ? prev - 1 : images.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition backdrop-blur-xs cursor-pointer"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModalPhotoIndex(prev => (prev < images.length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition backdrop-blur-xs cursor-pointer"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Photo Thumbnails Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveModalPhotoIndex(idx)}
                  className={cn(
                    "relative h-16 w-20 rounded-xl overflow-hidden border-2 shrink-0 transition cursor-pointer",
                    activeModalPhotoIndex === idx
                      ? "border-[#C9921A] ring-2 ring-[#C9921A]/30 scale-105"
                      : "border-[#f0e4d2] opacity-70 hover:opacity-100"
                  )}
                >
                  <img src={img.previewUrl} alt={`Thumb ${idx + 1}`} className="h-full w-full object-cover" />
                  {idx === 0 && (
                    <div className="absolute top-0.5 left-0.5 bg-[#C9921A] text-white text-[8px] font-black px-1 rounded">
                      Cover
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-[1720px] mx-auto px-0 sm:px-1">
        <div className="space-y-6">
          <StepBar />
          <div className="min-h-[320px]">{panels[step - 1]}</div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border border-[#f0e4d2] bg-white p-4 sm:p-5 rounded-3xl shadow-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (step === 1) {
                    if (form.title || form.city || form.price || form.bedrooms) {
                      setShowUnsavedModal(true);
                    } else {
                      navigate({ to: "/dashboard/properties" });
                    }
                  } else {
                    prev();
                  }
                }}
                className="border-[#e8d9c0] bg-white hover:bg-[#faf6ee] text-[#1a1209] font-bold px-6 py-2.5 rounded-2xl cursor-pointer w-full sm:w-auto"
              >
                <ChevronLeft className="h-4 w-4 mr-1.5" />{step === 1 ? "Cancel" : "Back"}
              </Button>
            </div>

            {step < STEPS.length ? (
              <Button type="button" onClick={next} variant="hero" className="font-extrabold px-8 py-2.5 rounded-2xl cursor-pointer w-full sm:w-auto">
                Next <ChevronRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} variant="hero" size="lg" disabled={loading}
                className="px-10 py-3 font-black shadow-lg shadow-[#C9921A]/20 cursor-pointer rounded-2xl bg-gradient-to-r from-[#C9921A] to-[#b38014] text-white w-full sm:w-auto">
                {loading && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
                {loading ? "Publishing…" : "🚀 Review & Publish Now"}
                {!loading && <ChevronRight className="h-5 w-5 ml-1.5" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
