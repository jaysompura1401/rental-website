/*  *//**
 * /properties/:id  — Airbnb-style property detail page
 *
 * Map strategy — always Google Maps, 100% client-side, no API key needed:
 *  1. map_url (owner-pinned) → backend resolves to exact coords + named-place embed URL
 *     If resolution fails for any reason → show "Map location not set" (never fall back)
 *  2. lat + lng in DB (only when no map_url) → Google Maps Embed ?q=lat,lng
 *  3. Neither present → show "Map location not set"
 *
 * Locality / address / city are NEVER used to geocode the map pin.
 * They are text-only display labels.
 */
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { PropertyCard } from "@/components/site/PropertyCard";
import { SimilarProperties } from "@/components/dashboard/SimilarProperties";
import {
  properties as propertiesApi, inquiries as inquiriesApi, saved as savedApi,
  complaints as complaintsApi, visits as visitsApi, messages as messagesApi,
  tourApi,
  type ApiProperty, type ApiReview, type VisitType,
} from "@/lib/api";
import { formatINR } from "@/lib/mock-properties";
import { calculatePropertyScore } from "@/lib/property-score";
import {
  BedDouble, Bath, Heart, BadgeCheck, ChevronRight, ChevronLeft,
  Phone, MessageSquare, Calendar, Loader2, Wifi, Car, Shield, Zap, Wind,
  CheckCircle2, Box, Leaf, Grid3X3, MapPin, Star, MapPinned, X,
  Maximize2, Navigation, Copy, ExternalLink, Clock, Sparkles, Award,
} from "lucide-react";
import { Calendar as NivaasCalendar } from "@/components/ui/calendar";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { ThreeDViewer } from "@/components/property/ThreeDViewer";
import { stitchPanorama } from "@/lib/panorama-stitch";
import { recordPropertyView } from "@/lib/view-history";

export const Route = createFileRoute("/properties/$id")({
  head: () => ({ meta: [{ title: "Property — Nivaas" }] }),
  // loader runs on the server during SSR — skip it there because the backend
  // is a separate Express process (localhost:4000) that is not reachable via
  // relative /api paths in the SSR Node context. Data is fetched client-side
  // inside PropertyDetail instead, so a page reload never shows "not found".
  loader: async () => {
    if (typeof window === "undefined") return null;
    return null;
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF6EE" }}>
      <Navbar />
      <div className="flex-1 flex items-center justify-center text-center p-12">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1a1209" }}>Property not found</h1>
          <Link to="/properties" className="mt-6 inline-block rounded-xl px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: "#C9921A" }}>Browse all</Link>
        </div>
      </div>
      <Footer />
    </div>
  ),
  component: PropertyDetail,
});

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD        = "#C9921A";
const BG          = "#FAF6EE";
// Images come only from DB — never use stock/random placeholders.
// PLACEHOLDER is only used as an img onError fallback for broken URLs.
const PLACEHOLDER = "/placeholder-property.svg";

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  "WiFi":             <Wifi  className="h-4 w-4" style={{ color: GOLD }} />,
  "Air Conditioning": <Wind  className="h-4 w-4" style={{ color: GOLD }} />,
  "Air conditioning": <Wind  className="h-4 w-4" style={{ color: GOLD }} />,
  "Parking":          <Car   className="h-4 w-4" style={{ color: GOLD }} />,
  "CCTV Security":    <Shield className="h-4 w-4" style={{ color: GOLD }} />,
  "24x7 Security":    <Shield className="h-4 w-4" style={{ color: GOLD }} />,
  "Power Backup":     <Zap   className="h-4 w-4" style={{ color: GOLD }} />,
  "Lift/Elevator":    <Box   className="h-4 w-4" style={{ color: GOLD }} />,
  "Balcony":          <Leaf  className="h-4 w-4" style={{ color: GOLD }} />,
};

// ─── Map section component (v4 — Leaflet, no iframe) ─────────────────────────
/**
 * MapSection — uses Leaflet (same library as the map search page).
 * Google Maps iframes are blocked by X-Frame-Options: SAMEORIGIN without an API key.
 * Leaflet with CartoDB tiles works 100% without any key.
 *
 * Priority:
 *  1. DB lat/lng  → exact owner pin, instant, zero network
 *  2. map_url only → client-side regex extraction → server resolve (short links)
 *              → Nominatim locality+city fallback when server resolve fails
 *  3. locality/city only → Nominatim geocode (approximate area pin)
 *  4. Neither → "Map location not set"
 *
 * "Open in Google Maps" always uses resolved lat/lng coordinates so the link
 * works reliably on all devices (short links can fail on some mobile browsers).
 */

export interface NearbyItem {
  name: string;
  distKm: number;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  opening_hours?: string;
  address?: string;
  categoryIcon?: string;
  categoryLabel?: string;
}

export interface NearbyGroup {
  label: string;
  icon: string;
  items: NearbyItem[];
}

interface MapSectionProps {
  property: ApiProperty;
  onCoordsResolved?: (coords: { lat: number; lng: number }) => void;
  nearbyPOIs?: NearbyItem[];
  activeCategory?: string;
  focusedPOI?: NearbyItem | null;
}

// Validate GPS coords — reject null, NaN, and the (0,0) artifact
function isValidCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  if (lat == null || lng == null) return false;
  const la = Number(lat);
  const lo = Number(lng);
  return (
    !isNaN(la) && !isNaN(lo) &&
    la >= -90 && la <= 90 &&
    lo >= -180 && lo <= 180 &&
    !(la === 0 && lo === 0)
  );
}

// Extract coords from any Google Maps URL string (client-side, no network)
function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  let m: RegExpMatchArray | null;
  m = url.match(/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);           if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);       if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/[?&]q=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);      if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/\bll=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);       if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/\bcenter=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);   if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/\/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);         if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/!8m2!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);  if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/!1d(-?\d{1,3}\.\d{4,})!2d(-?\d{1,3}\.\d{4,})/);       if (m) return { lat: +m[2], lng: +m[1] };
  m = url.match(/[sd]addr=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);   if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}

// Singleton loader for Leaflet — same pattern as PropertyMap.tsx
let detailLeafletPromise: Promise<{ L: typeof import("leaflet"); RL: typeof import("react-leaflet") }> | null = null;
function getDetailLeaflet() {
  if (!detailLeafletPromise) {
    detailLeafletPromise = (async () => {
      await import("leaflet/dist/leaflet.css");
      const [lm, rlm] = await Promise.all([import("leaflet"), import("react-leaflet")]);
      const L = lm.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      return { L, RL: rlm };
    })();
  }
  return detailLeafletPromise;
}

// Category-tailored SVG icons and color palettes for map markers
function getCategorySvg(cat: string): { svg: string; color: string; bg: string; name: string } {
  const c = (cat || "").toLowerCase();
  if (c.includes("school") || c.includes("college") || c.includes("university") || c.includes("🏫")) {
    return {
      name: "Education",
      color: "#2563eb",
      bg: "#eff6ff",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    };
  }
  if (c.includes("hospital") || c.includes("clinic") || c.includes("pharmacy") || c.includes("doctor") || c.includes("🏥")) {
    return {
      name: "Healthcare",
      color: "#e11d48",
      bg: "#fff1f2",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12M6 12h12"/><rect width="18" height="18" x="3" y="3" rx="4"/></svg>`,
    };
  }
  if (c.includes("police") || c.includes("🚓")) {
    return {
      name: "Security",
      color: "#4f46e5",
      bg: "#eef2ff",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    };
  }
  if (c.includes("bus") || c.includes("metro") || c.includes("transit") || c.includes("train") || c.includes("🚌")) {
    return {
      name: "Transit",
      color: "#ea580c",
      bg: "#fff7ed",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M6 19v2M18 19v2"/></svg>`,
    };
  }
  if (c.includes("supermarket") || c.includes("market") || c.includes("mall") || c.includes("store") || c.includes("🛒")) {
    return {
      name: "Shopping",
      color: "#7c3aed",
      bg: "#f5f3ff",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
    };
  }
  if (c.includes("restaurant") || c.includes("food") || c.includes("cafe") || c.includes("dining") || c.includes("🍽️")) {
    return {
      name: "Dining",
      color: "#d97706",
      bg: "#fffbeb",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2M15 11v11M5 2v10M9 2v10M5 7h4M7 12v10"/></svg>`,
    };
  }
  if (c.includes("atm") || c.includes("bank") || c.includes("🏦")) {
    return {
      name: "Banking",
      color: "#059669",
      bg: "#ecfdf5",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11"/></svg>`,
    };
  }
  return {
    name: "Place",
    color: "#C9921A",
    bg: "#fef3d4",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };
}

// Build prominent red property pin with property name badge and clean SVG icon
function buildRedPropertyPin(title: string): string {
  const safeTitle = (title || "Property Location")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 5px 12px rgba(220,38,38,0.45));">
      <div style="background:#dc2626;color:#ffffff;font-size:11px;font-weight:800;padding:3px 9px;border-radius:12px;white-space:nowrap;margin-bottom:2px;border:1.5px solid #ffffff;max-width:180px;overflow:hidden;text-overflow:ellipsis;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.2px;display:flex;align-items:center;gap:4px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        <span>${safeTitle}</span>
      </div>
      <div style="position:relative;width:36px;height:44px;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 42" width="36" height="44" style="position:absolute;inset:0;">
          <path d="M17 0C7.611 0 0 7.611 0 17c0 11.25 17 25 17 25S34 28.25 34 17C34 7.611 26.389 0 17 0z"
            fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
          <circle cx="17" cy="16" r="11" fill="#ffffff"/>
        </svg>
        <div style="position:relative;z-index:2;color:#dc2626;margin-top:-6px;display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
      </div>
    </div>
  `;
}

// Build nearby place pin with place name badge & category vector SVG icon
function buildPoiPin(category: string, name: string): string {
  const { color, svg } = getCategorySvg(category);
  const safeName = (name || "Place")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.3));">
      <div style="background:#1a1209;color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;white-space:nowrap;margin-bottom:2px;border:1.5px solid #ffffff;max-width:140px;overflow:hidden;text-overflow:ellipsis;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.2px;">
        ${safeName}
      </div>
      <div style="position:relative;width:34px;height:42px;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 42" width="34" height="42" style="position:absolute;inset:0;">
          <path d="M17 0C7.611 0 0 7.611 0 17c0 11.25 17 25 17 25S34 28.25 34 17C34 7.611 26.389 0 17 0z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="17" cy="16" r="11" fill="#ffffff"/>
        </svg>
        <div style="position:relative;z-index:2;color:${color};margin-top:-6px;display:flex;align-items:center;justify-content:center;">
          ${svg}
        </div>
      </div>
    </div>
  `;
}

// Leaflet map supporting property marker and dynamic nearby POI markers
function DetailLeafletMap({
  lat,
  lng,
  openLink,
  propertyTitle = "Property Location",
  propertyAddress = "",
  nearbyPOIs = [],
  activeCategory = "",
  focusedPOI = null,
}: {
  lat: number;
  lng: number;
  openLink: string;
  propertyTitle?: string;
  propertyAddress?: string;
  nearbyPOIs?: NearbyItem[];
  activeCategory?: string;
  focusedPOI?: NearbyItem | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertyMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poiLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poiMarkersMapRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let destroyed = false;
    getDetailLeaflet().then(({ L, RL: _RL }) => {
      if (destroyed || !containerRef.current) return;

      // Avoid double-init if strict mode remounts
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        center:          [lat, lng],
        zoom:            16,
        zoomControl:     true,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        {
          subdomains: "0123",
          maxZoom: 20,
          attribution: '© <a href="https://maps.google.com">Google Maps</a>',
        }
      ).addTo(map);

      // Red property pin with title tag
      // Use iconSize/iconAnchor that match the actual rendered HTML:
      // The pin SVG is 36×44px, anchored at bottom-center; the label badge
      // sits above it (~20px). Total height ≈ 64px, width ≈ 180px.
      const redIcon = L.divIcon({
        html: buildRedPropertyPin(propertyTitle),
        className: "property-custom-pin",
        iconSize:   [36, 64],
        iconAnchor: [18, 64],
      });

      const propMarker = L.marker([lat, lng], { icon: redIcon, zIndexOffset: 1000 }).addTo(map);
      propMarker.bindPopup(`
        <div style="font-family:system-ui,-apple-system,sans-serif;padding:3px 4px;min-width:160px;">
          <div style="font-size:12px;font-weight:800;color:#dc2626;margin-bottom:3px;display:flex;align-items:center;gap:4px;">
            <span>🏠</span> <span>${propertyTitle}</span>
          </div>
          <div style="font-size:11px;color:#666;line-height:1.3;">${propertyAddress}</div>
        </div>
      `);
      propertyMarkerRef.current = propMarker;

      // Layer group for nearby POIs
      const poiLayer = L.layerGroup().addTo(map);
      poiLayerRef.current = poiLayer;

      mapRef.current = map;
      if (!destroyed) setReady(true);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, propertyTitle, propertyAddress]);

  // Update POI markers on the map whenever nearbyPOIs change
  useEffect(() => {
    if (!ready || !mapRef.current || !poiLayerRef.current) return;
    getDetailLeaflet().then(({ L }) => {
      const map = mapRef.current;
      const poiLayer = poiLayerRef.current;
      if (!map || !poiLayer) return;

      poiLayer.clearLayers();
      poiMarkersMapRef.current.clear();

      if (!nearbyPOIs || nearbyPOIs.length === 0) {
        map.setView([lat, lng], 16, { animate: true });
        return;
      }

      const allLatLngs: [number, number][] = [[lat, lng]];

      nearbyPOIs.forEach((poi) => {
        if (!isValidCoord(poi.lat, poi.lng)) return;
        allLatLngs.push([poi.lat, poi.lng]);

        const catCategory = poi.categoryLabel || poi.categoryIcon || activeCategory || "Place";
        const catInfo = getCategorySvg(catCategory);

        const poiIcon = L.divIcon({
          html: buildPoiPin(catCategory, poi.name),
          className: "poi-custom-pin",
          iconSize:   [34, 62],
          iconAnchor: [17, 62],
        });

        const marker = L.marker([poi.lat, poi.lng], { icon: poiIcon, zIndexOffset: 500 });
        const distStr = poi.distKm < 1 ? `${Math.round(poi.distKm * 1000)} m` : `${poi.distKm.toFixed(1)} km`;
        const walkStr = kmToWalkMins(poi.distKm);

        marker.bindPopup(`
          <div style="font-family:system-ui,-apple-system,sans-serif;min-width:170px;padding:3px 2px;">
            <div style="font-size:12px;font-weight:800;color:#1a1209;margin-bottom:3px;line-height:1.25;">${poi.name}</div>
            <div style="font-size:11px;color:#836737;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
              <span style="color:${catInfo.color};font-weight:700;">${poi.categoryLabel || catInfo.name}</span> • 
              <b style="color:#C9921A;">${distStr} (${walkStr} walk)</b>
            </div>
            <a href="https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:#C9921A;text-decoration:none;">
              Open in Google Maps ↗
            </a>
          </div>
        `);

        poiLayer.addLayer(marker);
        poiMarkersMapRef.current.set(`${poi.lat}_${poi.lng}`, marker);
      });

      if (allLatLngs.length > 1) {
        const bounds = L.latLngBounds(allLatLngs);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true });
      }
    });
  }, [ready, nearbyPOIs, lat, lng, activeCategory]);

  // Handle focusedPOI when user clicks an individual place in the list
  useEffect(() => {
    if (!ready || !mapRef.current || !focusedPOI) return;
    const map = mapRef.current;
    if (isValidCoord(focusedPOI.lat, focusedPOI.lng)) {
      map.flyTo([focusedPOI.lat, focusedPOI.lng], 17, { duration: 0.8 });
      const markerKey = `${focusedPOI.lat}_${focusedPOI.lng}`;
      const marker = poiMarkersMapRef.current.get(markerKey);
      if (marker) {
        setTimeout(() => marker.openPopup(), 400);
      }
    }
  }, [ready, focusedPOI]);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      overflow: "hidden",
      contain: "layout paint",
      borderRadius: "inherit",
    }}>
      {/* Map container */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />

      {/* Loading overlay */}
      {!ready && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f5ede0", zIndex: 10,
        }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
        </div>
      )}

      {/* "Open in Google Maps" overlay button */}
      {ready && (
        <a
          href={openLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: "absolute", bottom: 10, right: 10, zIndex: 500,
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(6px)",
            borderRadius: 999, padding: "6px 14px",
            fontSize: 11, fontWeight: 700, color: "#1a1209",
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            textDecoration: "none",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <ExternalLink style={{ width: 11, height: 11 }} />
          Open in Google Maps
        </a>
      )}
    </div>
  );
}

// Build a working Google Maps URL from lat/lng (guaranteed to work on all devices)
function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Geocode a text query via Nominatim — returns coords or null
async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const la = parseFloat(data[0].lat);
      const lo = parseFloat(data[0].lon);
      if (isValidCoord(la, lo)) return { lat: la, lng: lo };
    }
  } catch { /* network error */ }
  return null;
}

function MapSection({
  property,
  onCoordsResolved,
  nearbyPOIs = [],
  activeCategory = "",
  focusedPOI = null,
}: MapSectionProps) {
  const [coords,    setCoords]    = useState<{ lat: number; lng: number } | null>(null);
  const [openLink,  setOpenLink]  = useState("");
  const [status,    setStatus]    = useState<"loading" | "ready" | "no_location">("loading");

  // Pre-load Leaflet eagerly so map renders immediately when coords are ready
  useEffect(() => { getDetailLeaflet().catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setStatus("loading");
      setCoords(null);

      // ── Priority 1: exact coords already stored in DB ─────────────────────
      const la = property.latitude  != null ? Number(property.latitude)  : null;
      const lo = property.longitude != null ? Number(property.longitude) : null;

      if (isValidCoord(la, lo)) {
        if (!cancelled) {
          const c = { lat: la!, lng: lo! };
          setCoords(c);
          // Always use a standard ?query=lat,lng URL so it opens reliably on all devices
          setOpenLink(buildGoogleMapsUrl(c.lat, c.lng));
          setStatus("ready");
          onCoordsResolved?.(c);
        }
        return;
      }

      // ── Priority 2: extract from map_url ──────────────────────────────────
      if (property.map_url) {
        // 2a. client-side regex — instant for full google.com URLs with coords embedded
        const cc = extractCoordsFromUrl(property.map_url);
        if (cc && isValidCoord(cc.lat, cc.lng)) {
          if (!cancelled) {
            setCoords(cc);
            setOpenLink(buildGoogleMapsUrl(cc.lat, cc.lng));
            setStatus("ready");
            onCoordsResolved?.(cc);
          }
          return;
        }

        // 2b. server resolve — follows redirects on short links (maps.app.goo.gl)
        try {
          const ctrl = new AbortController();
          const tid  = setTimeout(() => ctrl.abort(), 15_000);
          const res  = await fetch(
            `/api/maps/resolve?url=${encodeURIComponent(property.map_url)}`,
            { signal: ctrl.signal },
          );
          clearTimeout(tid);
          if (!cancelled && res.ok) {
            const d = await res.json();
            if (isValidCoord(d.lat, d.lng)) {
              const c = { lat: d.lat, lng: d.lng };
              setCoords(c);
              setOpenLink(buildGoogleMapsUrl(c.lat, c.lng));
              setStatus("ready");
              onCoordsResolved?.(c);
              return;
            }
          }
        } catch { /* timeout / network error — fall through to Nominatim */ }

        // 2c. Server resolve failed — try Nominatim with locality+city so the
        //     map still shows an approximate area pin and nearby places load.
        const locality = property.locality?.trim();
        const city     = property.city?.trim();
        if (locality || city) {
          const q = [locality, city, "India"].filter(Boolean).join(", ");
          const gc = await nominatimGeocode(q);
          if (!cancelled && gc) {
            setCoords(gc);
            // Use encoded address query for Google Maps — makes it clear it's approximate
            setOpenLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
            setStatus("ready");
            onCoordsResolved?.(gc);
            return;
          }
        }

        // 2d. Nothing worked — show unavailable state
        if (!cancelled) setStatus("no_location");
        return;
      }

      // ── Priority 3: no map_url — geocode locality+city via Nominatim ──────
      // Handles properties where the owner never added a map URL.
      const locality = property.locality?.trim();
      const city     = property.city?.trim();
      if (locality || city) {
        const q = [locality, city, "India"].filter(Boolean).join(", ");
        const gc = await nominatimGeocode(q);
        if (!cancelled && gc) {
          setCoords(gc);
          setOpenLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
          setStatus("ready");
          onCoordsResolved?.(gc);
          return;
        }
      }

      // ── Priority 4: no location data at all ───────────────────────────────
      if (!cancelled) setStatus("no_location");
    }

    resolve();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, property.latitude, property.longitude, property.map_url,
      property.locality, property.city]);

  return (
    <div
      className="rounded-2xl w-full shadow-sm"
      style={{
        height: "clamp(280px, 45vw, 420px)",
        border: "1px solid #e8d9c0",
        position: "relative",
        background: "#f5ede0",
        minWidth: 0,
        overflow: "hidden",
        contain: "layout paint",
        isolation: "isolate",
      }}
    >
      {/* Loading */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
          style={{ background: "#f5ede0" }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
          <p className="text-xs" style={{ color: "#a08858" }}>Loading map…</p>
        </div>
      )}

      {/* No location */}
      {status === "no_location" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center z-10"
          style={{ background: "#f5ede0" }}>
          <MapPin className="h-9 w-9" style={{ color: "#d4b896" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#836737" }}>
              {property.map_url ? "Location unavailable" : "Map location not set"}
            </p>
            <p className="text-xs mt-1" style={{ color: "#c8b08a" }}>
              {property.map_url
                ? "Could not resolve coordinates from the map link"
                : "Owner hasn't added an exact map pin yet"}
            </p>
          </div>
          {property.map_url && (
            <a href={property.map_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition hover:bg-amber-50"
              style={{ color: GOLD, border: `1px solid ${GOLD}` }}>
              <ExternalLink className="h-3.5 w-3.5" /> Open location link
            </a>
          )}
        </div>
      )}

      {/* Leaflet map with property & nearby POI markers */}
      {status === "ready" && coords && (
        <DetailLeafletMap
          lat={coords.lat}
          lng={coords.lng}
          openLink={openLink}
          propertyTitle={property.title || "Property Location"}
          propertyAddress={[property.locality, property.city, property.state].filter(Boolean).join(", ")}
          nearbyPOIs={nearbyPOIs}
          activeCategory={activeCategory}
          focusedPOI={focusedPOI}
        />
      )}
    </div>
  );
}

// ─── Photo gallery lightbox ───────────────────────────────────────────────────

function PhotoGallery({ images, title, hasTour, onView360 }: {
  images: string[];
  title: string;
  hasTour?: boolean;
  onView360?: () => void;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const imgs = (() => {
    const arr = [...images];
    if (arr.length === 0) arr.push(PLACEHOLDER);
    return arr;
  })();

  const openLightbox = (i: number) => { setLightbox(i); setActiveIdx(i); };
  const closeLightbox = () => setLightbox(null);
  const prevImg = () => setActiveIdx(i => (i - 1 + imgs.length) % imgs.length);
  const nextImg = () => setActiveIdx(i => (i + 1) % imgs.length);

  // Keyboard navigation
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  prevImg();
      if (e.key === "ArrowRight") nextImg();
      if (e.key === "Escape")     closeLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* ── Photo gallery ── */}
      {/* Mobile: single image with tap-to-view; md+: Airbnb-style 5-up grid */}
      <div className="relative rounded-2xl overflow-hidden" style={{ cursor: "pointer" }}>

        {/* ── MOBILE: single hero image (hidden on md+) ── */}
        <div
          className="block md:hidden relative overflow-hidden rounded-2xl"
          style={{ aspectRatio: "4/3" }}
          onClick={() => openLightbox(0)}
        >
          <img
            src={imgs[0]}
            alt={title}
            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Photo count pill */}
          {imgs.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); openLightbox(0); }}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
                border: "1px solid rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 600, color: "#1a1209",
              }}
            >
              <Grid3X3 style={{ width: 13, height: 13 }} />
              {imgs.length} photos
            </button>
          )}
          {/* 360° button on mobile */}
          {hasTour && onView360 && (
            <button
              onClick={e => { e.stopPropagation(); onView360(); }}
              className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                background: "linear-gradient(135deg, #C9921A, #b38014)",
                border: "none", fontSize: 12, fontWeight: 700, color: "#fff",
                boxShadow: "0 2px 12px rgba(201,146,26,0.45)",
              }}
            >
              <span>✨</span> 360° View
            </button>
          )}
        </div>

        {/* ── DESKTOP: 5-up grid (hidden below md) ── */}
        <div
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "2fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: 4,
            height: "min(420px, 52vw)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {/* Main image — spans 2 rows */}
          <div
            style={{ gridRow: "1 / 3", position: "relative", overflow: "hidden" }}
            onClick={() => openLightbox(0)}
          >
            <img
              src={imgs[0]}
              alt={title}
              onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
              style={{ width: "100%", height: "100%", objectFit: "cover",
                transition: "transform 0.35s ease", display: "block" }}
              className="hover:scale-105"
            />
          </div>

          {/* 4 thumbnails */}
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                position: "relative", overflow: "hidden",
                borderTopRightRadius: i === 2 ? 16 : 0,
                borderBottomRightRadius: i === 4 ? 16 : 0,
              }}
              onClick={() => openLightbox(i)}
            >
              <img
                src={imgs[i] ?? imgs[0]}
                alt={`${title} — ${i + 1}`}
                onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                style={{ width: "100%", height: "100%", objectFit: "cover",
                  transition: "transform 0.35s ease", display: "block" }}
                className="hover:scale-105"
              />
              {/* "Show all" overlay on last thumb */}
              {i === 4 && imgs.length > 5 && (
                <div
                  style={{
                    position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", gap: 4,
                  }}
                >
                  <Grid3X3 style={{ width: 18, height: 18, color: "#fff" }} />
                  <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
                    Show all {imgs.length} photos
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* "Show all" pill + optional 360° button — positioned inside the grid wrapper */}
          <div style={{ position: "absolute", bottom: 14, right: 14, display: "flex", gap: 8, alignItems: "center" }}>
            {/* 360° View button — shown only when property has a tour */}
            {hasTour && onView360 && (
              <button
                onClick={e => { e.stopPropagation(); onView360(); }}
                style={{
                  background: "linear-gradient(135deg, #C9921A, #b38014)",
                  border: "none", borderRadius: 999,
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  color: "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 12px rgba(201,146,26,0.45)",
                }}
              >
                <span style={{ fontSize: 14 }}>✨</span>
                360° View
              </button>
            )}

            {/* Show all photos pill */}
            <button
              onClick={() => openLightbox(0)}
              style={{
                background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
                border: "1px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                color: "#1a1209", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Grid3X3 style={{ width: 13, height: 13 }} />
              {imgs.length > 1 ? `Show all ${imgs.length} photos` : "View photo"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightbox !== null && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            touchAction: "pan-y",
          }}
          onClick={closeLightbox}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchStartX.current === null) return;
            const diff = touchStartX.current - e.changedTouches[0].clientX;
            if (diff > 45) nextImg();
            else if (diff < -45) prevImg();
            touchStartX.current = null;
          }}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,0.12)", border: "none",
              borderRadius: "50%", width: 40, height: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#fff",
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>

          {/* Counter */}
          <p style={{ position: "absolute", top: 24, left: 0, right: 0,
            textAlign: "center", color: "#fff", fontSize: 13, fontWeight: 600 }}>
            {activeIdx + 1} / {imgs.length}
          </p>

          {/* Image */}
          <img
            src={imgs[activeIdx]}
            alt={title}
            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "90vw", maxHeight: "80vh",
              objectFit: "contain", borderRadius: 8,
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}
          />

          {/* Prev / Next */}
          {imgs.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); prevImg(); }}
                style={{
                  position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.12)", border: "none",
                  borderRadius: "50%", width: 44, height: 44,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#fff",
                }}
              >
                <ChevronLeft style={{ width: 20, height: 20 }} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); nextImg(); }}
                style={{
                  position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.12)", border: "none",
                  borderRadius: "50%", width: 44, height: 44,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#fff",
                }}
              >
                <ChevronRight style={{ width: 20, height: 20 }} />
              </button>
            </>
          )}

          {/* Thumbnail strip */}
          {imgs.length > 1 && (
            <div style={{
              position: "absolute", bottom: 20,
              display: "flex", gap: 6, maxWidth: "80vw",
              overflowX: "auto", padding: "0 8px",
            }}>
              {imgs.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`thumb ${i + 1}`}
                  onClick={e => { e.stopPropagation(); setActiveIdx(i); }}
                  onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                  style={{
                    width: 56, height: 40, objectFit: "cover",
                    borderRadius: 6, cursor: "pointer", flexShrink: 0,
                    border: i === activeIdx ? `2px solid ${GOLD}` : "2px solid transparent",
                    opacity: i === activeIdx ? 1 : 0.6,
                    transition: "opacity 0.15s, border-color 0.15s",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Nearby places — powered by Google Places API (New) via /api/nearby ─────

import { API_BASE } from "@/lib/api";

// Haversine distance in km between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

// Walking speed ~5 km/h
function kmToWalkMins(km: number): string {
  const mins = Math.round((km / 5) * 60);
  if (mins < 2) return "< 1 min";
  return `${mins} min`;
}

// ── In-memory + sessionStorage cache ─────────────────────────────────────────
const _nearbyMemCache = new Map<string, NearbyGroup[]>();

function cacheKey(lat: number, lng: number): string {
  return `nearby_v3:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function readCache(key: string): NearbyGroup[] | null {
  if (_nearbyMemCache.has(key)) return _nearbyMemCache.get(key)!;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as NearbyGroup[];
      _nearbyMemCache.set(key, parsed);
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function writeCache(key: string, data: NearbyGroup[]) {
  _nearbyMemCache.set(key, data);
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* quota full */ }
}

/**
 * Fetch nearby POIs from /api/nearby which uses Google Places API (New) server-side.
 * The API key never reaches the browser.
 * Response: { groups: [{label, icon, items: [{name, distKm, lat, lng, address, rating, open_now}]}] }
 */
async function fetchNearbyPOIs(
  lat: number,
  lng: number,
  radius = 3000,
): Promise<NearbyGroup[]> {
  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    lat:    lat.toString(),
    lng:    lng.toString(),
    radius: radius.toString(),
  });

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${API_BASE}/nearby?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Nearby search failed (HTTP ${res.status})`);
    }

    const data = await res.json() as {
      groups: Array<{
        label: string;
        icon: string;
        items: Array<{
          name: string;
          distKm: number;
          lat: number;
          lng: number;
          address?: string | null;
          rating?: number | null;
          open_now?: boolean | null;
          place_id?: string;
        }>;
      }>;
    };

    // Normalise to NearbyGroup[] — add missing fields the UI expects
    const groups: NearbyGroup[] = (data.groups || []).map(g => ({
      label: g.label,
      icon:  g.icon,
      items: (g.items || []).map(item => ({
        name:          item.name,
        distKm:        item.distKm,
        lat:           item.lat,
        lng:           item.lng,
        address:       item.address || undefined,
        categoryIcon:  g.icon,
        categoryLabel: g.label,
        // Google Places provides rating/open_now — map to NearbyItem fields
        opening_hours: item.open_now != null
          ? (item.open_now ? "Open now" : "Closed now")
          : undefined,
      })),
    }));

    writeCache(key, groups);
    return groups;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

// ─── POI hover-card — pure function, no hooks, rendered by NearbyPlaces ─────
function POIHoverCard({
  item, posX, posY, copied, onCopy, onMouseEnter, onMouseLeave,
}: {
  item: NearbyItem;
  posX: number;
  posY: number;
  copied: boolean;
  onCopy: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const dist = item.distKm < 1
    ? `${Math.round(item.distKm * 1000)} m`
    : `${item.distKm.toFixed(1)} km`;
  const walk = kmToWalkMins(item.distKm);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}&ll=${item.lat},${item.lng}`;

  const CARD_W     = 272;
  const CARD_H_EST = 280;
  const GAP        = 14;
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const left = posX + GAP + CARD_W > vw ? posX - CARD_W - GAP : posX + GAP;
  const top  = Math.min(Math.max(posY - 20, 8), vh - CARD_H_EST - 8);

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position:        "fixed",
        zIndex:          99999,
        width:           CARD_W,
        left,
        top,
        border:          "1.5px solid #e8d9c0",
        borderRadius:    16,
        backgroundColor: "#fff",
        boxShadow:       "0 12px 40px -8px rgba(0,0,0,0.22), 0 4px 16px -4px rgba(201,146,26,0.15)",
        pointerEvents:   "auto",        // ← card is fully interactive
        overflow:        "hidden",
        animation:       "poi-fade-in 0.1s ease-out",
      }}
    >
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Header: category badge + name prominently + Google Maps button */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: 12,
            backgroundColor: "#fef3d4", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 20,
            border: "1.5px solid #e8c97a",
          }}>
            {item.categoryIcon}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#1a1209",
              lineHeight: 1.25, wordBreak: "break-word" }}>
              {item.name}
            </p>
            <span style={{
              display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700,
              padding: "2px 8px", borderRadius: 999,
              backgroundColor: "#fef3d4", color: GOLD,
            }}>
              {item.categoryLabel}
            </span>
          </div>
          {/* Open in Maps button */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: 8,
              backgroundColor: GOLD, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 14, textDecoration: "none",
              cursor: "pointer",
            }}
            title="Open in Google Maps"
          >
            ↗
          </a>
        </div>

        {/* Distance + walk */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#836737" }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{dist}</span>
          <span>·</span>
          <span>{walk} walk</span>
        </div>

        {/* Phone row — prominent */}
        <div style={{
          borderRadius: 10, padding: "10px 12px",
          backgroundColor: item.phone ? "#faf6ee" : "#f5f5f5",
          border: `1px solid ${item.phone ? "#e8d9c0" : "#e0e0e0"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ color: item.phone ? GOLD : "#bbb", fontSize: 15 }}>📞</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: item.phone ? "#1a1209" : "#aaa",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.phone || "No phone number listed"}
              </p>
              {item.phone && (
                <p style={{ margin: 0, fontSize: 9, color: "#a08858", marginTop: 1 }}>
                  Tap Call to dial directly
                </p>
              )}
            </div>
          </div>

          {/* Copy + Call — pointer-events-auto so they're clickable */}
          {item.phone && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0, pointerEvents: "auto" }}>
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); onCopy(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  cursor: "pointer", border: `1px solid ${copied ? "#6ee7b7" : "#e8d9c0"}`,
                  backgroundColor: copied ? "#d1fae5" : "#fff",
                  color: copied ? "#059669" : "#836737",
                }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <a
                href={`tel:${item.phone}`}
                onClick={e => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  backgroundColor: GOLD, color: "#fff",
                  textDecoration: "none", pointerEvents: "auto",
                }}
              >
                Call
              </a>
            </div>
          )}
        </div>

        {/* Opening hours */}
        {item.opening_hours && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: "#4a3818" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>🕐</span>
            <span style={{ lineHeight: 1.4 }}>{item.opening_hours}</span>
          </div>
        )}

        {/* Address */}
        {item.address && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: "#836737" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>📍</span>
            <span style={{ lineHeight: 1.4 }}>{item.address}</span>
          </div>
        )}

        {/* Website */}
        {item.website && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: GOLD }}>
            <span>🌐</span>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
            </span>
          </div>
        )}

        {/* Maps hint — clickable */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            paddingTop: 8, marginTop: 2,
            borderTop: "1px solid #f0e4cc",
            fontSize: 10, fontWeight: 600, color: GOLD,
            display: "flex", alignItems: "center", gap: 6,
            textDecoration: "none", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 12 }}>↗</span>
          Open in Google Maps
        </a>
      </div>
    </div>
  );
}

interface NearbyPlacesProps {
  lat: number;
  lng: number;
  city?: string;
  locality?: string;
  onActiveCategoryChange?: (items: NearbyItem[], label: string) => void;
  onItemSelect?: (item: NearbyItem) => void;
}

function NearbyPlaces({
  lat,
  lng,
  city,
  locality,
  onActiveCategoryChange,
  onItemSelect,
}: NearbyPlacesProps) {
  const [groups, setGroups]       = useState<NearbyGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [openLabel, setOpenLabel] = useState<string>("");
  const [retryKey, setRetryKey]   = useState(0); // increment to retry
  const [hoveredItem, setHoveredItem] = useState<NearbyItem | null>(null);
  const [mousePos, setMousePos]       = useState({ x: 0, y: 0 });
  const [copied, setCopied]           = useState(false);
  // Delay timer — keeps card alive while mouse travels from row → card
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCard = (item: NearbyItem, x: number, y: number) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setCopied(false);
    setMousePos({ x, y });
    setHoveredItem(item);
  };

  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => {
      setHoveredItem(null);
      hideTimer.current = null;
    }, 120);   // 120 ms grace period
  };

  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };

  const copyPhone = () => {
    if (!hoveredItem?.phone) return;
    navigator.clipboard.writeText(hoveredItem.phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setGroups([]);
    setOpenLabel("");
    setHoveredItem(null);

    fetchNearbyPOIs(lat, lng, 3000)
      .then(results => {
        if (cancelled) return;
        setGroups(results);
        setLoading(false);
        const first = results.find(g => g.items.length > 0);
        if (first) setOpenLabel(first.label);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[NearbyPlaces] fetch failed:", msg);
        setErrorMsg(msg);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lat, lng, retryKey]);

  // Notify parent component whenever active category or groups change
  useEffect(() => {
    const active = groups.find(g => g.label === openLabel);
    onActiveCategoryChange?.(active ? active.items : [], openLabel);
  }, [openLabel, groups, onActiveCategoryChange]);

  const toggle = (label: string) =>
    setOpenLabel(prev => (prev === label ? "" : label));

  return (
    <div className="flex flex-col w-full">
      {/* ── Hover card rendered here, outside all overflow containers ── */}
      {hoveredItem && (
        <POIHoverCard
          item={hoveredItem}
          posX={mousePos.x}
          posY={mousePos.y}
          copied={copied}
          onCopy={copyPhone}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#a08858" }}>
            NEARBY PLACES
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#836737" }}>
            Explore landmarks, transit, healthcare, and amenities near this property
          </p>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-2">
          {["🏫 School / College", "🏥 Hospital / Clinic", "🚓 Police Station",
            "🚌 Metro / Bus Stop", "🛒 Supermarket", "🍽️ Restaurant / Food", "🏦 ATM / Bank"
          ].map((label, i) => (
            <div
              key={i}
              className="rounded-xl px-4 py-3.5 animate-pulse flex items-center justify-between"
              style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span style={{ fontSize: 16 }}>{label.split(" ")[0]}</span>
                <div className="h-4 rounded" style={{ backgroundColor: "#e8d9c0", width: 120 + i * 10 }} />
              </div>
              <div className="h-4 w-12 rounded" style={{ backgroundColor: "#e8d9c0" }} />
            </div>
          ))}
          <p className="text-xs text-center mt-2" style={{ color: "#a08858" }}>
            Searching nearby places…
          </p>
        </div>
      )}

      {/* Error state */}
      {!loading && errorMsg && (
        <div
          className="rounded-xl px-4 py-3.5 space-y-2.5"
          style={{ border: "1px solid #fcd9a0", backgroundColor: "#fff8ec" }}
        >
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: "#92400e" }}>
                Could not load nearby places
              </p>
              <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "#a08858" }}>
                {errorMsg.includes("HTTP 429") || errorMsg.includes("429")
                  ? "The nearby places service is busy right now. Please wait a moment and try again."
                  : errorMsg.includes("timeout") || errorMsg.includes("abort") || errorMsg.includes("Timeout")
                  ? "The request timed out. Please check your connection and try again."
                  : "Could not load nearby places. Please check your connection or try again."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRetryKey(k => k + 1)}
            className="px-4 rounded-lg py-1.5 text-xs font-bold transition-colors"
            style={{ backgroundColor: GOLD, color: "#fff" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loaded FAQ-style vertical accordion */}
      {!loading && !errorMsg && (
        <div className="space-y-2">
          {groups.filter(g => g.items.length > 0).map(group => {
            const isOpen   = openLabel === group.label;
            const hasItems = group.items.length > 0;
            const nearest  = hasItems ? group.items[0] : null;
            const nearestDist = nearest
              ? nearest.distKm < 1
                ? `${Math.round(nearest.distKm * 1000)} m`
                : `${nearest.distKm.toFixed(1)} km`
              : null;

            return (
              <div
                key={group.label}
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}
              >
                {/* ── Accordion header (same as FAQ) ── */}
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[#fef9f0]"
                  style={{ backgroundColor: isOpen ? "#fef9f0" : "#fff" }}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{group.icon}</span>
                    <span className="text-sm font-semibold truncate" style={{ color: "#1a1209" }}>
                      {group.label}
                    </span>
                    {hasItems && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: "#fef3d4", color: GOLD }}
                      >
                        {group.items.length} {group.items.length === 1 ? "place" : "places"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {nearestDist && (
                      <span className="text-xs font-bold" style={{ color: GOLD }}>
                        {nearestDist}
                      </span>
                    )}
                    {!hasItems && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#f5ede0", color: "#a08858" }}
                      >
                        none
                      </span>
                    )}
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform duration-200"
                      style={{
                        color: "#a08858",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    />
                  </div>
                </button>

                {/* ── Accordion body (same as FAQ) ── */}
                {isOpen && (
                  <div
                    className="border-t divide-y"
                    style={{
                      borderColor: "#f0e4cc",
                      backgroundColor: "#faf6ee",
                    }}
                  >
                    {hasItems ? (
                      <ul className="divide-y" style={{ borderColor: "#f0e4cc" }}>
                        {group.items.map((item, idx) => {
                          const dist = item.distKm < 1
                            ? `${Math.round(item.distKm * 1000)} m`
                            : `${item.distKm.toFixed(1)} km`;
                          const walk = kmToWalkMins(item.distKm);
                          // Opens Google Maps centred on the exact POI coordinates
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
                          const isHov = hoveredItem?.lat === item.lat && hoveredItem?.lng === item.lng;
                          return (
                            <li
                              key={`${item.name}-${idx}`}
                              onMouseEnter={e => showCard(
                                { ...item, categoryIcon: group.icon, categoryLabel: group.label },
                                e.clientX, e.clientY
                              )}
                              onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
                              onMouseLeave={scheduleHide}
                            >
                              <div
                                onClick={() => {
                                  onItemSelect?.({ ...item, categoryIcon: group.icon, categoryLabel: group.label });
                                }}
                                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[#fef3d4]"
                                style={{ backgroundColor: isHov ? "#fef3d4" : "transparent" }}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span
                                    className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ backgroundColor: idx === 0 ? GOLD : "#c8b08a" }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <p className="text-sm font-medium truncate" style={{ color: "#1a1209" }}>
                                    {item.name}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <div className="text-right">
                                    <p className="text-xs font-bold leading-none" style={{ color: GOLD }}>{dist}</p>
                                    <p className="text-[10px] mt-0.5 leading-none" style={{ color: "#a08858" }}>{walk} walk</p>
                                  </div>
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="p-1 rounded-md hover:bg-amber-100 transition-colors"
                                    title="Open in Google Maps"
                                  >
                                    <Navigation className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                                  </a>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="px-4 py-3 text-sm" style={{ color: "#a08858" }}>
                        No {group.label.toLowerCase()} found within 3 km.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Property FAQ component ───────────────────────────────────────────────────
function PropertyFAQ({ property }: { property: ApiProperty }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  // Build dynamic FAQ list from the property's actual data
  const faqs = [
    {
      q: "What is the monthly rent and what does it include?",
      a: `The monthly rent for this property is ${
        property.price ? `₹${Number(property.price).toLocaleString("en-IN")}` : "as listed"
      }. ${
        property.amenities && property.amenities.length > 0
          ? `It includes amenities such as ${property.amenities.slice(0, 5).map(a => typeof a === "string" ? a : a.name).join(", ")}.`
          : "Please contact the owner for details on what is included."
      }`,
    },
    {
      q: "How many bedrooms and bathrooms does the property have?",
      a: `This property has ${property.bedrooms ?? "—"} bedroom${property.bedrooms !== 1 ? "s" : ""} and ${
        property.bathrooms ?? "—"
      } bathroom${property.bathrooms !== 1 ? "s" : ""}${
        property.area_sqft ? `, spread across ${property.area_sqft} sq.ft` : ""
      }.`,
    },
    {
      q: "Is the property available for immediate move-in?",
      a: property.available_from
        ? `The property is available from ${new Date(property.available_from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Please confirm availability directly with the owner.`
        : "Please contact the owner to confirm the move-in date and current availability.",
    },
    {
      q: "What is the security deposit required?",
      a: property.deposit
        ? `The security deposit for this property is ₹${Number(property.deposit).toLocaleString("en-IN")}, which is typically refundable at the end of the lease.`
        : "Security deposit details are not specified. Please contact the owner directly to discuss deposit terms.",
    },
    {
      q: "What tenant preferences does the owner have?",
      a: property.preferred_tenants
        ? `The owner prefers tenants who are: ${property.preferred_tenants}. Please confirm eligibility when you contact the owner.`
        : "The owner has not specified tenant preferences. All prospective tenants are welcome to apply.",
    },
    {
      q: "How do I schedule a visit to the property?",
      a: "You can schedule a visit by clicking the \"Book a visit\" button on this page and selecting your preferred date and time. The owner will confirm your visit. Alternatively, use \"Contact owner\" or \"Send message\" to coordinate directly.",
    },
    {
      q: "Is the property verified and what does that mean?",
      a: property.verified
        ? "Yes, this property has been verified by the Nivaas team. Verification confirms that the property details, images, and ownership documents have been reviewed for authenticity."
        : "This property is currently pending verification. You can still contact the owner and schedule a visit, but we recommend verifying details in person.",
    },
    {
      q: `What is nearby this property in ${property.city}?`,
      a: `The property is located in ${[property.locality, property.city].filter(Boolean).join(", ")}. Use the "Nearby" accordion above the map to explore the closest schools, hospitals, police stations, supermarkets, restaurants, and ATMs — each with real walking distances.`,
    },
  ];

  return (
    <div className="space-y-2">
      {faqs.map((faq, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div
            key={idx}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[#fef9f0]"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-semibold leading-snug" style={{ color: "#1a1209" }}>
                {faq.q}
              </span>
              <ChevronRight
                className="h-4 w-4 mt-0.5 shrink-0 transition-transform duration-200"
                style={{
                  color: "#a08858",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {isOpen && (
              <div
                className="px-4 pb-4 pt-1 text-sm leading-relaxed border-t"
                style={{ color: "#4a3818", borderColor: "#f0e4cc", backgroundColor: "#faf6ee" }}
              >
                {faq.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function PropertyDetail() {
  const { id }       = Route.useParams();
  const { profile }  = useAuth();
  const navigate     = useNavigate();

  // Fetch property client-side so reloads always work correctly.
  // (The loader is intentionally a no-op to avoid SSR issues with the
  //  separate Express backend not being reachable via relative /api paths.)
  const [property, setProperty]     = useState<ApiProperty | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    setProperty(null);
    setFetchError(false);
    propertiesApi.get(id)
      .then(p => {
        setProperty(p);
        // Track client-side view history for recommendation popup
        recordPropertyView(p);
      })
      .catch(() => setFetchError(true));
  }, [id]);

  // ── 360° panorama URL ────────────────────────────────────────────────────
  // Priority order:
  //   1. property.tour_ai_panorama_url   — saved panorama from generate-360
  //   2. fallbackPanoramaUrl             — fetched via tourApi.get() for
  //                                        properties posted before the fix
  //   3. Auto-stitched from images       — built on-the-fly in the browser
  //                                        from existing uploaded images, then
  //                                        saved to DB via generate-360
  const [fallbackPanoramaUrl, setFallbackPanoramaUrl] = useState<string | null>(null);
  const [autoStitchUrl,       setAutoStitchUrl]       = useState<string | null>(null);
  const [autoStitching,       setAutoStitching]       = useState(false);

  // Derived: the best panorama URL available right now
  const activePanoramaUrl =
    property?.tour_ai_panorama_url || fallbackPanoramaUrl || autoStitchUrl || null;

  // Whether the 360° section should be visible
  const hasPanorama = !!(
    (property?.tour_type === "link"          && property.tour_url) ||
    (property?.tour_type === "model"         && property.tour_model_url) ||
    (property?.tour_type === "ai_generated"  && activePanoramaUrl) ||
    autoStitchUrl  // auto-generated even when tour_type is none
  );

  // Fetch fallback URL when tour_type is ai_generated but URL missing
  useEffect(() => {
    if (!property) return;
    if (property.tour_type === "ai_generated" && !property.tour_ai_panorama_url) {
      tourApi.get(property.id)
        .then(t => { if (t.tour_ai_panorama_url) setFallbackPanoramaUrl(t.tour_ai_panorama_url); })
        .catch(() => {});
    }
  }, [property]);

  // Auto-stitch panorama from uploaded images when no panorama URL exists
  useEffect(() => {
    if (!property) return;
    // Skip if we already have a panorama URL from any source
    if (property.tour_ai_panorama_url || fallbackPanoramaUrl) return;
    // Skip if tour_type is link or model — those have their own viewers
    if (property.tour_type === "link" || property.tour_type === "model") return;
    // Need at least 2 images to make a meaningful panorama
    const imgs = [...(property.images || [])];
    if (imgs.length < 2) return;
    // Only run once
    if (autoStitchUrl || autoStitching) return;

    setAutoStitching(true);

    const slots = imgs.slice(0, 8).map((url, i) => ({
      url,
      angle: i * (360 / Math.min(imgs.length, 8)),
    }));

    stitchPanorama(slots)
      .then(async ({ blob, dataUrl }) => {
        // Show the viewer immediately with the local data URL
        setAutoStitchUrl(dataUrl);
        setAutoStitching(false);

        // Persist to DB so next page load shows it instantly from tour_ai_panorama_url
        try {
          const panoramaFile = new File([blob], `panorama-${property.id}.jpg`, { type: "image/jpeg" });
          const directions = slots.map((s, i) => ({ slot: i, label: `Image ${i + 1}`, angle: s.angle }));
          const res = await tourApi.generate360(property.id, [], panoramaFile, directions);
          if (res.tour_ai_panorama_url) {
            // Upgrade from data URL to server URL
            setAutoStitchUrl(null);
            setFallbackPanoramaUrl(res.tour_ai_panorama_url);
          }
        } catch {
          // Save failed — keep the local data URL, viewer still works
        }
      })
      .catch(() => { setAutoStitching(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, property?.images?.length]);

  const [saved, setSaved]           = useState(false);
  const [showAll, setShowAll]       = useState(false);
  const [showTour, setShowTour]     = useState(false);
  const tourSectionRef              = useRef<HTMLDivElement>(null);
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeNearbyPOIs, setActiveNearbyPOIs] = useState<NearbyItem[]>([]);
  const [activeCategoryLabel, setActiveCategoryLabel] = useState<string>("");
  const [focusedNearbyPOI, setFocusedNearbyPOI] = useState<NearbyItem | null>(null);

  // Pre-load Leaflet JS+CSS immediately on page load — not lazy — so map renders without delay
  useEffect(() => { getDetailLeaflet().catch(() => {}); }, []);

  // Re-seed resolvedCoords whenever property loads.
  // MapSection.onCoordsResolved (passed as prop) also updates this for
  // map_url / Nominatim resolved coords.
  // Priority 1: exact stored coords from DB — instant, no network needed
  // Priority 2: MapSection callback will update resolvedCoords after its
  //             async resolution (map_url short links or Nominatim geocode)
  useEffect(() => {
    if (!property) { setResolvedCoords(null); return; }
    const storedLat = property.latitude  ? Number(property.latitude)  : null;
    const storedLng = property.longitude ? Number(property.longitude) : null;
    if (
      storedLat !== null && storedLng !== null &&
      !isNaN(storedLat) && !isNaN(storedLng) &&
      !(storedLat === 0 && storedLng === 0)
    ) {
      setResolvedCoords({ lat: storedLat, lng: storedLng });
    }
    // Note: map_url / Nominatim resolution is handled inside MapSection,
    // which calls onCoordsResolved={setResolvedCoords} when coords are ready.
  }, [property]);

  // Reviews
  const [reviews, setReviews]           = useState<ApiReview[]>([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Sync reviews when property loads
  useEffect(() => {
    if (property?.reviews) setReviews(property.reviews);
  }, [property]);

  // Inquiry
  const [inquiryMsg, setInquiry] = useState("");
  const [sending, setSending]    = useState(false);

  // Visit booking state
  const [visitDate, setVisitDate]         = useState("");
  const [visitTime, setVisitTime]         = useState("10:00");
  const [visitType, setVisitType]         = useState<VisitType>("in_person");
  const [bookingVisit, setBookingVisit]   = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);

  // 12-hour AM/PM time slots matching the dashboard (09:00–18:00)
  const VISIT_TIME_SLOTS = [
    { value: "09:00", label: "09:00 AM" },
    { value: "10:00", label: "10:00 AM" },
    { value: "11:00", label: "11:00 AM" },
    { value: "12:00", label: "12:00 PM" },
    { value: "13:00", label: "01:00 PM" },
    { value: "14:00", label: "02:00 PM" },
    { value: "15:00", label: "03:00 PM" },
    { value: "16:00", label: "04:00 PM" },
    { value: "17:00", label: "05:00 PM" },
    { value: "18:00", label: "06:00 PM" },
  ];

  // Message
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [messageText, setMessageText]         = useState("");
  const [sendingMessage, setSendingMessage]   = useState(false);

  const images = (() => {
    if (!property) return [];
    const arr = [...(property.images || [])];
    if (arr.length === 0 && property.cover_image_url) arr.push(property.cover_image_url);
    return arr;
  })();

  const amenities = property?.amenities ?? [];
  const visible   = showAll ? amenities : amenities.slice(0, 8);
  const score = calculatePropertyScore({ ...property, amenities });

  useEffect(() => {
    if (!property) return;
    if (profile) {
      savedApi.check(property.id).then(r => setSaved(r.saved)).catch(() => {});
    }
  }, [property?.id, profile]);

  const toggleSave = useCallback(async () => {
    if (!profile || !property) { navigate({ to: "/auth" }); return; }
    try {
      if (saved) { await savedApi.unsave(property.id); setSaved(false); toast.success("Removed from saved"); }
      else       { await savedApi.save(property.id);   setSaved(true);  toast.success("Saved!"); }
    } catch { toast.error("Failed"); }
  }, [profile, property, saved, navigate]);

  const sendInquiry = useCallback(async () => {
    if (!profile || !property) { navigate({ to: "/auth" }); return; }
    if (!inquiryMsg.trim()) { toast.error("(Message) this field is req."); return; }
    setSending(true);
    try {
      await inquiriesApi.send({ property_id: property.id, message: inquiryMsg });
      toast.success("Inquiry sent!");
      setInquiry("");
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  }, [profile, property, inquiryMsg, navigate]);

  const submitReview = useCallback(async () => {
    if (!profile || !property) { navigate({ to: "/auth" }); return; }
    if (!reviewRating) { toast.error("(Star Rating) this field is req."); return; }
    setSubmittingReview(true);
    try {
      const review = await complaintsApi.submitReview(property.id, reviewRating, reviewComment || undefined);
      setReviews(prev => [review, ...prev.filter(r => r.reviewer_id !== profile.id)]);
      setReviewRating(0); setReviewComment("");
      toast.success("Review submitted!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmittingReview(false); }
  }, [profile, property, reviewRating, reviewComment, navigate]);

  const sendDirectMessage = useCallback(async () => {
    if (!profile || !property) { navigate({ to: "/auth" }); return; }
    if (!messageText.trim()) { toast.error("(Message) this field is req."); return; }
    setSendingMessage(true);
    try {
      await messagesApi.send({ receiver_id: property.owner_id, content: messageText.trim(), property_id: property.id });
      toast.success("Message sent!");
      setMessageText(""); setShowMessageForm(false);
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSendingMessage(false); }
  }, [profile, property, messageText, navigate]);

  const bookVisit = useCallback(async () => {
    if (!profile || !property) { navigate({ to: "/auth" }); return; }
    if (!visitDate) { toast.error("(Visit Date) this field is req."); return; }
    if (!visitTime) { toast.error("(Time Slot) this field is req."); return; }
    setBookingVisit(true);
    try {
      await visitsApi.book({
        property_id: property.id,
        visit_date:  visitDate,
        visit_time:  visitTime,
        visit_type:  visitType,
      });
      toast.success("Visit booked! You'll receive a confirmation shortly.");
      setShowVisitForm(false);
      setVisitDate("");
      setVisitTime("10:00");
    } catch (e: any) { toast.error(e.message); }
    finally { setBookingVisit(false); }
  }, [profile, property, visitDate, visitTime, visitType, navigate]);

  // ── Loading / error states (after all hooks) ─────────────────────────────
  if (fetchError) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF6EE" }}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-center p-12">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "#1a1209" }}>Property not found</h1>
            <Link to="/properties" className="mt-6 inline-block rounded-xl px-6 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: "#C9921A" }}>Browse all</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF6EE" }}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9921A" }} />
        </div>
        <Footer />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      <Navbar />

      {/* ── Breadcrumb ───────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-10 py-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: "#a08858" }}>
        <Link to="/" className="hover:underline shrink-0" style={{ color: "#a08858" }}>Home</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link to="/properties" className="hover:underline shrink-0" style={{ color: "#a08858" }}>Properties</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span style={{ color: "#1a1209" }} className="font-medium truncate min-w-0 max-w-[120px] sm:max-w-xs">{property.title}</span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }}
            className="flex items-center gap-1.5 text-xs font-medium hover:underline"
            style={{ color: "#1a1209" }}
          >
            <Copy className="h-3.5 w-3.5" /> Share
          </button>
          <button
            onClick={toggleSave}
            className="flex items-center gap-1.5 text-xs font-medium hover:underline"
            style={{ color: saved ? "#ef4444" : "#1a1209" }}
          >
            <Heart className="h-3.5 w-3.5" style={{ fill: saved ? "#ef4444" : "none" }} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 pb-24 lg:pb-16">

        {/* ── Title (above gallery on mobile, standard desktop) ─── */}
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight break-words" style={{ color: "#1a1209", fontFamily: "'Sora',sans-serif" }}>
            {property.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" style={{ color: "#836737" }}>
            {/* Property Score (Rating out of 10) */}
            <span
              className="inline-flex items-center gap-1.5 font-bold rounded-full px-2.5 py-0.5 text-xs text-white shadow-xs"
              style={{ backgroundColor: "#1a1209" }}
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>{score.overall}/10</span>
              <span className="text-[11px] font-normal text-white/80">({score.label} Rating)</span>
            </span>

            {property.avg_rating && (
              <span className="flex items-center gap-1 font-semibold" style={{ color: "#1a1209" }}>
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {Number(property.avg_rating).toFixed(1)}
                <span className="font-normal" style={{ color: "#a08858" }}>
                  ({property.review_count} review{property.review_count !== 1 ? "s" : ""})
                </span>
              </span>
            )}
            {property.listing_type === "short_term" && (
              <span
                className="inline-flex items-center gap-1 font-bold rounded-full px-3 py-0.5 text-xs text-white shadow-xs"
                style={{ backgroundColor: "#7C3AED" }}
              >
                ⏱️ Short-Term Property
              </span>
            )}
            {Boolean(property.verified) ? (
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 font-medium text-amber-700 bg-amber-50 border border-amber-300/80 rounded-full px-2 py-0.5 text-xs">
                <Clock className="h-3 w-3 text-amber-600" /> Not verified yet
              </span>
            )}
            {property.locality && <span>·</span>}
            {[property.locality, property.city, property.state].filter(Boolean).join(", ")}
          </div>
        </div>

        {/* ── Photo gallery ─────────────────────────────────────── */}
        <div style={{ position: "relative" }}>
          <PhotoGallery
            images={images}
            title={property.title}
            hasTour={hasPanorama}
            onView360={() => {
              setShowTour(v => !v);
              setTimeout(() => {
                tourSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 80);
            }}
          />
        </div>

        {/* ── 360° / 3D Virtual Tour — inline below gallery ──────── */}
        {hasPanorama && (
          <div ref={tourSectionRef} className="mt-4" id="property-3d-tour">

            {/* Toggle bar */}
            <button
              type="button"
              onClick={() => setShowTour(v => !v)}
              className="w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition hover:opacity-90"
              style={{
                borderColor: showTour ? "#C9921A" : "#e8d9c0",
                backgroundColor: showTour ? "#fef8eb" : "#fff",
              }}
            >
              <span className="flex items-center gap-2.5 text-sm font-bold" style={{ color: "#1a1209" }}>
                <span className="text-lg leading-none">
                  {(property.tour_type === "link")         ? "🌐"
                  : (property.tour_type === "model")       ? "📦"
                  : "✨"}
                </span>
                {(property.tour_type === "link")        ? "Virtual 3D Tour"
                : (property.tour_type === "model")      ? "Interactive 3D Model"
                : "360° Property View"}
                <span
                  className="text-[11px] font-bold rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: "#C9921A", color: "#fff" }}
                >
                  {(property.tour_type === "link")        ? "Immersive Tour"
                  : (property.tour_type === "model")      ? "Drag to rotate"
                  : "Drag to look around"}
                </span>
              </span>
              <span className="text-xs font-semibold" style={{ color: "#C9921A" }}>
                {showTour ? "Hide ▲" : "View 360° ▼"}
              </span>
            </button>

            {/* Viewer */}
            {showTour && (
              <div className="mt-3">
                {/* If property has a real tour from DB, use it; else use photos as panorama */}
                {property.tour_type === "link" && property.tour_url ? (
                  <ThreeDViewer
                    tourType="link"
                    tourUrl={property.tour_url}
                    title={property.title}
                    height="480px"
                  />
                ) : property.tour_type === "model" && property.tour_model_url ? (
                  <ThreeDViewer
                    tourType="model"
                    tourModelUrl={property.tour_model_url}
                    title={property.title}
                    height="480px"
                  />
                ) : (
                  /* Render the real stitched equirectangular panorama stored
                     in tour_ai_panorama_url. Fall back to a separately-fetched
                     URL for properties posted before the panorama save fix. */
                  activePanoramaUrl ? (
                    <ThreeDViewer
                      tourType="ai_generated"
                      tourPanoramaUrl={activePanoramaUrl}
                      title={property.title}
                      height="480px"
                    />
                  ) : autoStitching ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl py-12"
                      style={{ backgroundColor: "#1a1209" }}>
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20"
                        style={{ borderTopColor: "#C9921A" }} />
                      <p className="text-sm text-white/60">Generating 360° panorama from property photos…</p>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Main 2-column layout ──────────────────────────────── */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">

          {/* ── LEFT: content ──────────────────────────────────── */}
          <div className="min-w-0">

            {/* Quick stats row */}
            <div className="flex flex-wrap gap-2 mb-5">
              {property.bedrooms != null && property.bedrooms > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-2.5" style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}>
                  <BedDouble className="h-4 w-4" style={{ color: "#836737" }} />
                  <span className="text-sm font-medium" style={{ color: "#1a1209" }}>{property.bedrooms} Bedroom{property.bedrooms > 1 ? "s" : ""}</span>
                </div>
              )}
              {property.bathrooms != null && property.bathrooms > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-2.5" style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}>
                  <Bath className="h-4 w-4" style={{ color: "#836737" }} />
                  <span className="text-sm font-medium" style={{ color: "#1a1209" }}>{property.bathrooms} Bathroom{property.bathrooms > 1 ? "s" : ""}</span>
                </div>
              )}
              {property.area_sqft != null && property.area_sqft > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-2.5" style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}>
                  <Maximize2 className="h-4 w-4" style={{ color: "#836737" }} />
                  <span className="text-sm font-medium" style={{ color: "#1a1209" }}>{property.area_sqft} sq.ft</span>
                </div>
              )}
              {property.furnished && (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-2.5" style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: "#836737" }} />
                  <span className="text-sm font-medium" style={{ color: "#1a1209" }}>{property.furnished}</span>
                </div>
              )}
            </div>

            {/* Owner strip */}
            {property.owner_name && (
              <div className="flex items-center gap-3 p-4 rounded-2xl mb-5" style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
                <div className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                  style={{ backgroundColor: GOLD }}>
                  {property.owner_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#1a1209" }}>Listed by {property.owner_name}</p>
                  <p className="text-xs" style={{ color: "#a08858" }}>
                    {property.owner_verified ? "✓ Verified owner" : "Property owner"} · Listed {new Date(property.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </p>
                </div>
                {property.owner_phone && (
                  <a href={`tel:${property.owner_phone}`}
                    className="shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:bg-[#fef3d4]"
                    style={{ borderColor: "#e8d9c0", color: "#836737" }}>
                    <Phone className="h-3.5 w-3.5" style={{ color: GOLD }} /> Call
                  </a>
                )}
              </div>
            )}

            <hr style={{ borderColor: "#e8d9c0" }} />

            {/* ── Nivaas Property Quality Rating Card (Out of 100 & 5 Stars) ──────────── */}
            <div
              className="mt-6 rounded-2xl p-5 sm:p-6 border shadow-xs"
              style={{
                backgroundColor: "#fff",
                borderColor: "#e8d9c0",
                background: "linear-gradient(135deg, #ffffff 0%, #fdfbf7 100%)",
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    </span>
                    <h2 className="text-base sm:text-lg font-bold" style={{ color: "#1a1209", fontFamily: "'Sora',sans-serif" }}>
                      Nivaas Property Quality Rating
                    </h2>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#a08858" }}>
                    Automated smart quality evaluated on configuration, location, photos, condition and listing completeness.
                  </p>
                </div>

                <div
                  className="flex flex-col items-center justify-center rounded-xl px-4 py-2 text-center shrink-0 border"
                  style={{
                    backgroundColor: score.badgeBg,
                    borderColor: score.badgeBorder,
                  }}
                >
                  <div className="flex items-baseline gap-0.5">
                    <Star className="h-3.5 w-3.5 fill-[#C9921A] text-[#C9921A] mr-1 inline self-center" />
                    <span className="text-2xl font-black leading-none" style={{ color: score.badgeText }}>
                      {score.overall}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">/ 5.0</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: score.badgeText }}>
                    {score.label} ({score.totalScore}/100)
                  </span>
                </div>
              </div>

              {/* 5 Categories Progress Bars */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                {/* Configuration */}
                <div className="rounded-xl p-3 bg-muted/20 border border-border/50">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                      🛋️ {score.breakdown.configuration.label}
                    </span>
                    <span style={{ color: GOLD }} className="font-bold font-mono">
                      {score.breakdown.configuration.score} / {score.breakdown.configuration.max}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.breakdown.configuration.percentage}%`,
                        backgroundColor: GOLD,
                      }}
                    />
                  </div>
                </div>

                {/* Location */}
                <div className="rounded-xl p-3 bg-muted/20 border border-border/50">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                      📍 {score.breakdown.location.label}
                    </span>
                    <span style={{ color: "#0284c7" }} className="font-bold font-mono">
                      {score.breakdown.location.score} / {score.breakdown.location.max}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.breakdown.location.percentage}%`,
                        backgroundColor: "#0284c7",
                      }}
                    />
                  </div>
                </div>

                {/* Photos */}
                <div className="rounded-xl p-3 bg-muted/20 border border-border/50">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                      📸 {score.breakdown.photos.label}
                    </span>
                    <span style={{ color: "#16a34a" }} className="font-bold font-mono">
                      {score.breakdown.photos.score} / {score.breakdown.photos.max}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.breakdown.photos.percentage}%`,
                        backgroundColor: "#16a34a",
                      }}
                    />
                  </div>
                </div>

                {/* Condition */}
                <div className="rounded-xl p-3 bg-muted/20 border border-border/50">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                      ✨ {score.breakdown.condition.label}
                    </span>
                    <span style={{ color: "#d97706" }} className="font-bold font-mono">
                      {score.breakdown.condition.score} / {score.breakdown.condition.max}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.breakdown.condition.percentage}%`,
                        backgroundColor: "#d97706",
                      }}
                    />
                  </div>
                </div>

                {/* Completeness */}
                <div className="rounded-xl p-3 bg-muted/20 border border-border/50 sm:col-span-2 lg:col-span-2">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                      📝 {score.breakdown.listingCompleteness.label}
                    </span>
                    <span style={{ color: "#C9921A" }} className="font-bold font-mono">
                      {score.breakdown.listingCompleteness.score} / {score.breakdown.listingCompleteness.max}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.breakdown.listingCompleteness.percentage}%`,
                        backgroundColor: "#C9921A",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Highlights tags */}
              {score.highlights.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1">Highlights:</span>
                  {score.highlights.map(h => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/70"
                    >
                      ✓ {h}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <hr className="mt-6" style={{ borderColor: "#e8d9c0" }} />

            {/* About */}
            {property.description && (
              <div className="mt-6">
                <h2 className="text-lg font-bold mb-3" style={{ color: "#1a1209" }}>About This Property</h2>
                <p className="text-sm leading-relaxed" style={{ color: "#4a3818" }}>{property.description}</p>
                <hr className="mt-6" style={{ borderColor: "#e8d9c0" }} />
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: "#1a1209" }}>What This Place Offers</h2>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {visible.map((a: any) => {
                    const name = a.name || a;
                    return (
                      <div key={name} className="flex items-center gap-3 py-1">
                        <div className="shrink-0">
                          {AMENITY_ICONS[name] ?? <CheckCircle2 className="h-4 w-4" style={{ color: GOLD }} />}
                        </div>
                        <span className="text-sm" style={{ color: "#1a1209" }}>{name}</span>
                      </div>
                    );
                  })}
                </div>
                {amenities.length > 8 && (
                  <button
                    onClick={() => setShowAll(s => !s)}
                    className="mt-5 rounded-xl border px-5 py-2.5 text-sm font-semibold transition hover:border-amber-600"
                    style={{ borderColor: "#1a1209", color: "#1a1209", backgroundColor: "#fff" }}
                  >
                    {showAll ? "Show less" : `Show all ${amenities.length} amenities`}
                  </button>
                )}
                <hr className="mt-6" style={{ borderColor: "#e8d9c0" }} />
              </div>
            )}

            {/* Property details grid */}
            <div className="mt-6">
              <h2 className="text-lg font-bold mb-4" style={{ color: "#1a1209" }}>Property Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  ["Property type",    property.property_type],
                  ["Listing type",     property.listing_type === "short_term" ? "Short-Term" : property.listing_type?.toUpperCase()],
                  ...(property.listing_type === "short_term" ? [
                    ["Availability from", property.short_term_from || null],
                    ["Availability to",   property.short_term_to   || null],
                    ["Price / week",      property.short_term_price ? `₹${Number(property.short_term_price).toLocaleString("en-IN")}` : null],
                  ] : []),
                  ["Carpet area",    property.carpet_area ? `${property.carpet_area} sq.ft` : null],
                  ["Floor",          property.floor_number && property.total_floors ? `${property.floor_number} of ${property.total_floors}` : null],
                  ["Facing",         property.facing],
                  ["Furnishing",     property.furnished],
                  ["Available from", property.listing_type !== "short_term" ? property.available_from : null],
                  ["Property age",   property.age_years],
                  ["RERA ID",        property.rera_id],
                  ["Parking",        property.parking_slots ? `${property.parking_slots} slot${property.parking_slots > 1 ? "s" : ""}` : null],
                  ["Preferred",      property.preferred_tenants],
                  ["Min lease",      property.min_lease_months ? `${property.min_lease_months} months` : null],
                ].filter(([, v]) => !!v).map(([k, v]) => (
                  <div key={k as string} className="rounded-2xl p-3.5" style={{ backgroundColor: "#fff", border: "1px solid #e8d9c0" }}>
                    <p className="text-[11px] mb-1" style={{ color: "#a08858" }}>{k}</p>
                    <p className="text-sm font-semibold" style={{ color: "#1a1209" }}>{v}</p>
                  </div>
                ))}
              </div>
              <hr className="mt-6" style={{ borderColor: "#e8d9c0" }} />
            </div>

            {/* ── Location + Map ─────────────────────────────── */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "#1a1209" }}>Location & Surroundings</h2>
                  {[property.locality, property.city, property.state, property.pincode].filter(Boolean).length > 0 && (
                    <p className="flex items-center gap-1.5 text-sm mt-1" style={{ color: "#836737" }}>
                      <MapPin className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                      {[property.locality, property.city, property.state, property.pincode].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* Full Width Map */}
              <div className="w-full">
                <MapSection
                  property={property}
                  onCoordsResolved={setResolvedCoords}
                  nearbyPOIs={activeNearbyPOIs}
                  activeCategory={activeCategoryLabel}
                  focusedPOI={focusedNearbyPOI}
                />
              </div>

              {/* Nearby Places Section underneath the full map */}
              <div className="mt-6">
                {(() => {
                  // Helper: treat 0, "0", null, NaN, "" all as invalid
                  const isValidLatLng = (v: number | null) =>
                    v !== null && !isNaN(v) && v !== 0;

                  // Priority 1: exact coords stored in DB
                  const dbLat = property.latitude  != null ? Number(property.latitude)  : null;
                  const dbLng = property.longitude != null ? Number(property.longitude) : null;
                  const dbValid = isValidLatLng(dbLat) && isValidLatLng(dbLng);

                  // Priority 2: coords resolved asynchronously by MapSection
                  const nearbyLat = dbValid ? dbLat! : (resolvedCoords?.lat ?? null);
                  const nearbyLng = dbValid ? dbLng! : (resolvedCoords?.lng ?? null);
                  const hasCoords = isValidLatLng(nearbyLat) && isValidLatLng(nearbyLng);

                  return hasCoords ? (
                    <NearbyPlaces
                      lat={nearbyLat!}
                      lng={nearbyLng!}
                      city={property.city}
                      locality={property.locality || undefined}
                      onActiveCategoryChange={(items, label) => {
                        setActiveNearbyPOIs(items);
                        setActiveCategoryLabel(label);
                      }}
                      onItemSelect={(item) => {
                        setFocusedNearbyPOI(item);
                      }}
                    />
                  ) : (
                    <div className="rounded-2xl p-5 text-center"
                      style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#a08858" }}>NEARBY PLACES</p>
                      <p className="text-xs" style={{ color: "#c8b08a" }}>
                        {resolvedCoords === null ? "Resolving nearby places…" : "Location not available"}
                      </p>
                    </div>
                  );
                })()}
              </div>

              <hr className="mt-8" style={{ borderColor: "#e8d9c0" }} />
            </div>

            {/* ── Frequently Asked Questions ─────────────────── */}
            <div className="mt-6">
              <h2 className="text-lg font-bold mb-4" style={{ color: "#1a1209" }}>
                Frequently Asked Questions
              </h2>
              <PropertyFAQ property={property} />
              <hr className="mt-6" style={{ borderColor: "#e8d9c0" }} />
            </div>

            {/* Similar properties — powered by recommendation engine */}
            <div className="mt-6">
              <SimilarProperties propertyId={property.id} limit={6} showHeader={true} />
            </div>
          </div>

          {/* ── RIGHT: sticky sidebar ──────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">

            {/* Price card */}
            <div id="booking-card" className="rounded-2xl p-5 shadow-md scroll-mt-20" style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
              {/* Price */}
              {property.listing_type === "short_term" ? (
                <div className="mb-2">
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-3xl font-extrabold" style={{ color: "#7C3AED" }}>
                      {property.short_term_price ? formatINR(property.short_term_price) : formatINR(property.price)}
                    </span>
                    <span className="text-base font-medium" style={{ color: "#836737" }}>/week</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: "#ede9fe", color: "#7C3AED" }}>Short-Term</span>
                  </div>
                  {property.short_term_from && property.short_term_to && (
                    <p className="text-xs font-semibold" style={{ color: "#7C3AED" }}>
                      📅 {property.short_term_from} → {property.short_term_to}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-3xl font-extrabold" style={{ color: "#1a1209" }}>
                    {formatINR(property.price)}
                  </span>
                  {property.listing_type !== "sale" && (
                    <span className="text-base font-medium" style={{ color: "#836737" }}>/month</span>
                  )}
                </div>
              )}
              {property.listing_type !== "short_term" && property.deposit != null && (
                <p className="text-xs mb-1" style={{ color: "#a08858" }}>
                  Deposit: {formatINR(property.deposit)}
                </p>
              )}
              {property.maintenance_fee > 0 && property.listing_type !== "short_term" && (
                <p className="text-xs mb-3" style={{ color: "#a08858" }}>
                  + ₹{property.maintenance_fee.toLocaleString("en-IN")}/mo maintenance
                </p>
              )}
              {property.price_negotiable === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold mb-3"
                  style={{ backgroundColor: "#e8f5e9", color: "#22c55e" }}>
                  ✓ Price negotiable
                </span>
              )}

              <hr className="mb-4" style={{ borderColor: "#e8d9c0" }} />

              {/* Action buttons */}
              <div className="space-y-2.5">
                {/* Book a visit */}
                {!showVisitForm ? (
                  <button
                    onClick={() => { if (!profile) navigate({ to: "/auth" }); else setShowVisitForm(true); }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition hover:opacity-90"
                    style={{ backgroundColor: GOLD, boxShadow: "0 4px 14px rgba(201,146,26,0.35)" }}
                  >
                    <Calendar className="h-4 w-4" /> Book a visit
                  </button>
                ) : (
                  <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: "#e8d9c0", backgroundColor: "#fef9f0" }}>
                    <p className="text-sm font-semibold" style={{ color: "#1a1209" }}>Schedule your visit</p>

                    {/* Visit type toggle */}
                    <div className="flex gap-2">
                      {(["in_person", "video_call"] as VisitType[]).map(vt => (
                        <button key={vt} type="button"
                          onClick={() => setVisitType(vt)}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition"
                          style={{
                            backgroundColor: visitType === vt ? "#1a1209" : "#fff",
                            color: visitType === vt ? "#fff" : "#836737",
                            border: `1px solid ${visitType === vt ? "#1a1209" : "#e8d9c0"}`,
                          }}
                        >
                          {vt === "in_person" ? <MapPinned className="h-3.5 w-3.5" /> : <Navigation className="h-3.5 w-3.5" />}
                          {vt === "in_person" ? "In person" : "Video call"}
                        </button>
                      ))}
                    </div>

                    {/* Date picker — themed Nivaas calendar */}
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "#836737" }}>Select date</p>
                      <div
                        className="rounded-2xl border overflow-hidden"
                        style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}
                      >
                        <NivaasCalendar
                          mode="single"
                          selected={visitDate ? new Date(visitDate + "T00:00:00") : undefined}
                          onSelect={(d) => setVisitDate(d ? d.toISOString().split("T")[0] : "")}
                          disabled={{ before: new Date() }}
                          showOutsideDays={false}
                          className="w-full p-3"
                          classNames={{
                            months: "flex flex-col w-full",
                            month: "w-full",
                            month_caption: "flex items-center justify-center px-8 h-8 mb-1",
                            caption_label: "text-sm font-bold text-[#1a1209]",
                            nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1",
                            button_previous:
                              "h-8 w-8 flex items-center justify-center rounded-full hover:bg-[#fef3d4] text-[#836737] transition-colors",
                            button_next:
                              "h-8 w-8 flex items-center justify-center rounded-full hover:bg-[#fef3d4] text-[#836737] transition-colors",
                            weekdays: "flex mb-1",
                            weekday:
                              "flex-1 text-center text-[11px] font-bold uppercase text-[#a08858] py-1",
                            week: "flex w-full",
                            day: "flex-1 aspect-square flex items-center justify-center p-0",
                            today:
                              "rounded-full ring-2 ring-[#C9921A] ring-offset-1 font-bold text-[#C9921A] bg-transparent",
                            outside: "opacity-25 pointer-events-none",
                            disabled: "opacity-25 pointer-events-none",
                            hidden: "invisible",
                          }}
                          components={{
                            DayButton: ({ day, modifiers, ...btnProps }) => {
                              const isSelected =
                                modifiers.selected &&
                                !modifiers.range_start &&
                                !modifiers.range_end &&
                                !modifiers.range_middle;
                              const isToday = modifiers.today;
                              const isDisabled = modifiers.disabled;
                              return (
                                <button
                                  {...(btnProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                                  className={[
                                    "w-full aspect-square rounded-full text-xs font-semibold transition-all duration-150 leading-none",
                                    isSelected
                                      ? "text-white shadow-md"
                                      : isToday
                                      ? "text-[#C9921A] font-bold"
                                      : "text-[#1a1209] hover:bg-[#fef3d4] hover:text-[#C9921A]",
                                    isDisabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  style={
                                    isSelected
                                      ? { backgroundColor: "#C9921A", boxShadow: "0 2px 8px rgba(201,146,26,0.35)" }
                                      : undefined
                                  }
                                />
                              );
                            },
                          }}
                        />
                      </div>
                    </div>

                    {/* 12-hour time slot grid */}
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "#836737" }}>Select time</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {VISIT_TIME_SLOTS.map(slot => (
                          <button
                            key={slot.value}
                            type="button"
                            onClick={() => setVisitTime(slot.value)}
                            className="rounded-lg py-1.5 text-xs font-semibold transition"
                            style={{
                              backgroundColor: visitTime === slot.value ? GOLD : "#fff",
                              color: visitTime === slot.value ? "#fff" : "#836737",
                              border: `1px solid ${visitTime === slot.value ? GOLD : "#e8d9c0"}`,
                            }}
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    {visitDate && (
                      <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "#fff5e0", color: "#836737" }}>
                        📅 {new Date(visitDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {VISIT_TIME_SLOTS.find(s => s.value === visitTime)?.label}
                        {" · "}
                        {visitType === "in_person" ? "In person" : "Video call"}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => { setShowVisitForm(false); setVisitDate(""); }}
                        className="flex-1 rounded-xl border py-2 text-sm font-medium transition hover:bg-[#fef3d4]"
                        style={{ borderColor: "#e8d9c0", color: "#836737" }}>
                        Cancel
                      </button>
                      <button onClick={bookVisit} disabled={bookingVisit || !visitDate}
                        className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: GOLD }}>
                        {bookingVisit ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Contact owner */}
                {property.owner_phone && (
                  <a href={`tel:${property.owner_phone}`}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition hover:bg-[#fef9f0]"
                    style={{ borderColor: "#e8d9c0", color: "#1a1209" }}>
                    <Phone className="h-4 w-4" style={{ color: GOLD }} /> Contact owner
                  </a>
                )}

                {/* Send message */}
                <button
                  onClick={() => { if (!profile) { navigate({ to: "/auth" }); return; } setShowMessageForm(v => !v); }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition hover:bg-[#fef9f0]"
                  style={{ borderColor: "#e8d9c0", color: "#1a1209" }}>
                  <MessageSquare className="h-4 w-4" style={{ color: GOLD }} /> Send message
                </button>
                {showMessageForm && (
                  <div className="rounded-2xl border p-4 space-y-2.5" style={{ borderColor: "#e8d9c0", backgroundColor: "#fef9f0" }}>
                    <textarea rows={3} value={messageText} onChange={e => setMessageText(e.target.value)}
                      placeholder="Hi, I'm interested in this property…"
                      className="w-full rounded-xl border px-3 py-2 text-sm resize-none outline-none"
                      style={{ borderColor: "#e8d9c0", backgroundColor: "#fff", color: "#1a1209" }} />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowMessageForm(false); setMessageText(""); }}
                        className="flex-1 rounded-xl border py-2 text-sm font-medium" style={{ borderColor: "#e8d9c0", color: "#836737" }}>
                        Cancel
                      </button>
                      <button onClick={sendDirectMessage} disabled={sendingMessage || !messageText.trim()}
                        className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                        style={{ backgroundColor: GOLD }}>
                        {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <hr className="my-4" style={{ borderColor: "#e8d9c0" }} />

              {/* Send inquiry */}
              <p className="text-sm font-semibold mb-2" style={{ color: "#1a1209" }}>Send an inquiry</p>
              <textarea rows={3} value={inquiryMsg} onChange={e => setInquiry(e.target.value)}
                placeholder="Hi, I'm interested in this property…"
                className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none outline-none"
                style={{ borderColor: "#e8d9c0", backgroundColor: "#faf6ee", color: "#1a1209" }} />
              <button onClick={sendInquiry} disabled={sending}
                className="mt-2 w-full rounded-2xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                style={{ backgroundColor: GOLD }}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send inquiry"}
              </button>
            </div>

            {/* Verified badge card */}
            {!!property.verified && (
              <div className="rounded-2xl p-4" style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck className="h-5 w-5" style={{ color: "#22c55e" }} />
                  <span className="text-sm font-semibold" style={{ color: "#1a1209" }}>Verified property</span>
                </div>
                <p className="text-xs mb-3" style={{ color: "#836737" }}>This property is verified by Nivaas.</p>
                <hr style={{ borderColor: "#e8d9c0" }} />
                <div className="mt-3 space-y-1 text-xs" style={{ color: "#836737" }}>
                  <p>ID: {property.rera_id || "NV" + property.id.slice(0, 6).toUpperCase()}</p>
                  <p>Listed: {new Date(property.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  <p>Updated: {new Date(property.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              </div>
            )}

            {/* Need help card */}
            <div className="rounded-2xl p-4" style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: "#1a1209" }}>Need help?</p>
              <p className="text-xs mb-3" style={{ color: "#836737" }}>Our support team is here to help.</p>
              <button className="w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-[#fef9f0]"
                style={{ borderColor: "#e8d9c0", color: "#1a1209" }}>
                <MessageSquare className="h-4 w-4" style={{ color: GOLD }} /> Chat with us
              </button>
            </div>
          </div>

        </div>{/* end 2-col grid */}
      </div>

      {/* ── Mobile Sticky Bottom Action Bar ────────────────────────── */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-2.5 flex items-center justify-between border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ backgroundColor: "#FAF6EE", borderColor: "#e8d9c0" }}
      >
        <div className="min-w-0 pr-2">
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-extrabold" style={{ color: property.listing_type === "short_term" ? "#7C3AED" : "#1a1209" }}>
              {property.listing_type === "short_term" && property.short_term_price ? formatINR(property.short_term_price) : formatINR(property.price)}
            </span>
            <span className="text-xs font-medium" style={{ color: "#836737" }}>
              {property.listing_type === "short_term" ? "/wk" : property.listing_type !== "sale" ? "/mo" : ""}
            </span>
          </div>
          <p className="text-[11px] font-semibold truncate" style={{ color: "#a08858" }}>
            {property.bedrooms ? `${property.bedrooms} BHK ` : ""}{property.property_type}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {property.owner_phone && (
            <a
              href={`tel:${property.owner_phone}`}
              className="flex items-center justify-center h-10 w-10 rounded-full border transition hover:bg-[#fef3d4]"
              style={{ borderColor: "#e8d9c0", color: GOLD, backgroundColor: "#fff" }}
              aria-label="Call owner"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("booking-card");
              if (el) {
                el.scrollIntoView({ behavior: "smooth" });
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer"
            style={{ backgroundColor: GOLD }}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Book Visit</span>
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
