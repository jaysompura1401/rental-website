/**
 * PropertyMap.tsx — Leaflet-based interactive map (no API key required)
 *
 * Drop-in replacement for the previous Google Maps version.
 * Same public interface: PropertyMapHandle, MapBounds, PropertyMapProps.
 * Uses CartoDB light tiles (free, no key) + Leaflet DivIcon price pills.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "@tanstack/react-router";
import type { ApiProperty } from "@/lib/api";
import { formatINR, formatMarkerPrice, isCoordsPlausibleForCity, cityCoords } from "@/lib/mock-properties";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface MapBounds {
  lat_min: number;
  lat_max: number;
  lng_min: number;
  lng_max: number;
}

export interface PropertyMapHandle {
  fitAll: () => void;
  panTo: (id: string) => void;
  panToCity: (lat: number, lng: number, zoom?: number) => void;
}

interface PropertyMapProps {
  properties:      ApiProperty[];
  selectedId?:     string | null;
  hoveredId?:      string | null;
  onMarkerClick?:  (id: string | null) => void;
  onMarkerHover?:  (id: string | null) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  defaultCenter?:  [number, number];
  defaultZoom?:    number;
  className?:      string;
  style?:          CSSProperties;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GOLD           = "#C9921A";
const DARK           = "#1a1209";
// Short-term listings get a distinct teal-purple accent that stays on-brand with Nivaas
const SHORT_TERM     = "#7C3AED"; // violet — distinct from gold/green/dark
const DEFAULT_CENTER: [number, number] = [23.02, 72.57];
const DEFAULT_ZOOM   = 12;

// ─── Nominatim geocoder cache (locality + city → lat/lng) ────────────────────
const _geocodeCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeLocality(locality: string | null | undefined, city: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const q = [locality, city, "India"].filter(Boolean).join(", ");
  if (!q.trim()) return null;
  if (_geocodeCache.has(q)) return _geocodeCache.get(q)!;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=in&addressdetails=1`;
    const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) { _geocodeCache.set(q, null); return null; }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { _geocodeCache.set(q, null); return null; }
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    _geocodeCache.set(q, result);
    return result;
  } catch {
    _geocodeCache.set(q, null);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any;
let leafletPromise: Promise<L> | null = null;

function loadLeaflet(): Promise<L> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    await import("leaflet/dist/leaflet.css");
    const mod = await import("leaflet");
    const L   = mod.default ?? mod;
    // Fix default icon paths broken by bundlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
    return L;
  })();
  return leafletPromise;
}

// ─── Pin HTML builder ──────────────────────────────────────────────────────────

export function isPropertyNew(prop: ApiProperty): boolean {
  if ((prop as unknown as { is_new?: boolean }).is_new) return true;
  if (!prop.created_at) return false;
  const d = new Date(prop.created_at).getTime();
  if (isNaN(d)) return false;
  return (Date.now() - d) / 86_400_000 <= 1;
}

type PinState = "default" | "hovered" | "selected";

function buildPinHtml(state: PinState, prop: ApiProperty): string {
  const isShortTerm = prop.listing_type === "short_term";
  // Short-term properties must always display as short-term pins with weekly rates, never overridden as "New"
  const isNew = !isShortTerm && isPropertyNew(prop);
  const priceVal = Number(isShortTerm && prop.short_term_price ? prop.short_term_price : (prop.price || 0));
  const label = isNew ? "New" : (priceVal > 0 ? formatMarkerPrice(priceVal) : (isShortTerm ? "Short-Term" : "₹0"));
  const suffix = isNew || priceVal <= 0 ? "" : (isShortTerm ? "/wk" : (prop.listing_type !== "sale" ? "/mo" : ""));
  const defaultBg = isNew ? "#10b981" : isShortTerm ? SHORT_TERM : GOLD;
  const bg =
    state === "selected" ? (isShortTerm ? "#5b21b6" : "#b5800e") :
    state === "hovered"  ? DARK      : defaultBg;
  const scale  = state === "selected" ? 1.18 : state === "hovered" ? 1.1 : 1;
  const shadow = state !== "default"
    ? "0 4px 14px rgba(0,0,0,0.4)"
    : (isNew ? "0 2px 8px rgba(16,185,129,0.4)" : isShortTerm ? "0 2px 8px rgba(124,58,237,0.45)" : "0 2px 6px rgba(0,0,0,0.22)");

  return `<div style="
      display:inline-flex;align-items:center;justify-content:center;
      background:${bg};color:#fff;
      border-radius:999px;padding:4px 10px;
      font-size:11px;font-weight:800;font-family:system-ui,sans-serif;
      white-space:nowrap;cursor:pointer;user-select:none;
      box-shadow:${shadow};
      transform:scale(${scale});transform-origin:bottom center;
      transition:transform 0.12s,background 0.12s;
      border:1.5px solid rgba(255,255,255,0.4);
      position:relative;
    ">
    ${isNew ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;margin-right:4px;"></span>' : ""}
    ${label}${suffix}
    <span style="
      position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-top:6px solid ${bg};pointer-events:none;
    "></span>
  </div>`;
}

// ─── Popup card ────────────────────────────────────────────────────────────────

interface PopupState {
  property: ApiProperty;
  x: number; // px from left of container
  y: number; // px from top of container
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      background: "#fef3d4", color: GOLD,
      borderRadius: 999, padding: "2px 7px",
      border: `1px solid ${GOLD}44`, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function btnStyle(variant: "outline" | "dark"): CSSProperties {
  const base: CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    gap: 4, borderRadius: 999, padding: "6px 8px",
    fontSize: 11, fontWeight: 700, cursor: "pointer",
    textDecoration: "none", whiteSpace: "nowrap",
    transition: "opacity 0.15s", border: "none",
  };
  if (variant === "dark") return { ...base, background: DARK, color: "#fff" };
  return { ...base, background: "#fff", border: `1.5px solid ${DARK}`, color: DARK };
}

function PropertyPopupCard({
  popup, containerWidth, containerHeight, onClose, onCancelClose,
}: {
  popup: PopupState;
  containerWidth: number;
  containerHeight: number;
  onClose: () => void;
  onCancelClose: () => void;
}) {
  const CARD_W = Math.min(290, Math.max(240, containerWidth - 16)), CARD_H = 360, GAP = 14;
  let left = popup.x - CARD_W / 2;
  let top  = popup.y - CARD_H - GAP < 8 ? popup.y + GAP + 28 : popup.y - CARD_H - GAP;
  left = Math.max(8, Math.min(left, containerWidth  - CARD_W - 8));
  top  = Math.max(8, Math.min(top,  containerHeight - CARD_H - 8));

  const { property: p } = popup;
  const img = p.images?.[0] ?? p.cover_image_url ?? null;
  const badgeBg    = p.listing_type === "sale" ? GOLD : p.listing_type === "pg" ? "#6b4f2a" : p.listing_type === "short_term" ? SHORT_TERM : DARK;
  const badgeLabel = p.listing_type === "sale" ? "Buy" : p.listing_type === "pg" ? "PG" : p.listing_type === "short_term" ? "Short-Term" : "Rent";
  const amenityNames: string[] = (p.amenities ?? []).map((a) =>
    typeof a === "string" ? a : (a as { name: string }).name ?? "");
  const hasSecurity = amenityNames.some(a => /security|24.?7/i.test(a));
  const hasWifi     = amenityNames.some(a => /wifi|wi.?fi/i.test(a));
  const hasParking  = amenityNames.some(a => /parking/i.test(a));

  return (
    <div
      style={{
        position: "absolute", left, top, zIndex: 500, width: CARD_W,
        background: "#fff", borderRadius: 18,
        boxShadow: "0 12px 40px rgba(0,0,0,0.22),0 2px 8px rgba(0,0,0,0.10)",
        border: "1px solid #e8d9c0", overflow: "hidden", pointerEvents: "all",
        animation: "pmCardIn 0.18s cubic-bezier(.34,1.56,.64,1) both",
      }}
      onMouseEnter={onCancelClose}
      onMouseLeave={onClose}
    >
      {/* Image */}
      <div style={{ height: 140, overflow: "hidden", position: "relative", background: "#f0e4cc" }}>
        {img ? (
          <img src={img} alt={p.title}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
            justifyContent: "center", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>🏠</span>
            <span style={{ fontSize: 10, color: "#a08858" }}>No photo</span>
          </div>
        )}
        <span style={{
          position: "absolute", top: 8, left: 8,
          background: badgeBg, color: "#fff", borderRadius: 999,
          padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        }}>{badgeLabel}</span>
        <button onClick={onClose} style={{
          position: "absolute", top: 7, right: 7, width: 24, height: 24,
          borderRadius: "50%", background: "rgba(255,255,255,0.88)", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 14, color: DARK,
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px 12px" }}>
        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: DARK,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
        {(p.locality || p.city) && (
          <p style={{ margin: "0 0 7px", fontSize: 11, color: "#a08858",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📍 {[p.locality, p.city].filter(Boolean).join(", ")}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "baseline",
          justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: DARK }}>
            {p.listing_type === "short_term" && p.short_term_price
              ? formatINR(p.short_term_price)
              : formatINR(p.price)}
            {p.listing_type === "short_term"
              ? <span style={{ fontSize: 11, fontWeight: 400, color: "#a08858" }}>/wk</span>
              : p.listing_type !== "sale" && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "#a08858" }}>/mo</span>
              )}
          </span>
          {(p.area_sqft ?? 0) > 0 && (
            <span style={{ fontSize: 11, color: "#836737" }}>{p.area_sqft} ft²</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#836737", marginBottom: 8 }}>
          {(p.bedrooms  ?? 0) > 0 && <span>🛏 <strong style={{ color: DARK }}>{p.bedrooms}</strong> bed</span>}
          {(p.bathrooms ?? 0) > 0 && <span>🚿 <strong style={{ color: DARK }}>{p.bathrooms}</strong> bath</span>}
          {(p.deposit   ?? 0) > 0 && <span>🔒 {formatINR(p.deposit!)} dep</span>}
        </div>
        {(hasSecurity || hasWifi || hasParking) && (
          <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
            {hasSecurity && <Chip label="24×7 Security" />}
            {hasWifi     && <Chip label="Wi-Fi" />}
            {hasParking  && <Chip label="Parking" />}
          </div>
        )}
        <Link to="/properties/$id" params={{ id: p.id }}
          style={{
            display: "block", width: "100%", textAlign: "center",
            background: GOLD, color: "#fff", borderRadius: 999,
            padding: "8px 0", fontSize: 12, fontWeight: 700,
            textDecoration: "none", marginBottom: 7,
            boxShadow: "0 2px 8px rgba(201,146,26,0.35)",
          }}
          onClick={e => e.stopPropagation()}>
          View Property →
        </Link>
        <div style={{ display: "flex", gap: 7 }}>
          {p.owner_phone ? (
            <a href={`tel:${p.owner_phone}`} style={btnStyle("outline")}
              onClick={e => e.stopPropagation()}>📞 Call Owner</a>
          ) : (
            <Link to="/properties/$id" params={{ id: p.id }} style={btnStyle("outline")}
              onClick={e => e.stopPropagation()}>📞 Contact</Link>
          )}
          <Link to="/properties/$id" params={{ id: p.id }} style={btnStyle("dark")}
            onClick={e => e.stopPropagation()}>💬 Message</Link>
        </div>
      </div>
      <style>{`@keyframes pmCardIn{from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}

// ─── Leaflet core map ──────────────────────────────────────────────────────────

function LeafletCore({
  properties, selectedId, hoveredId,
  onMarkerClick, onMarkerHover, onBoundsChange,
  defaultCenter, defaultZoom,
  mapHandleRef, onPopupOpen, onPopupClick,
  closeTimerRef, containerRef,
}: {
  properties:     ApiProperty[];
  selectedId?:    string | null;
  hoveredId?:     string | null;
  onMarkerClick?: (id: string | null) => void;
  onMarkerHover?: (id: string | null) => void;
  onBoundsChange?: (b: MapBounds) => void;
  defaultCenter:  [number, number];
  defaultZoom:    number;
  mapHandleRef:   React.MutableRefObject<PropertyMapHandle | null>;
  onPopupOpen:    (s: PopupState | null) => void;
  onPopupClick:   (s: PopupState | null) => void;
  closeTimerRef:  React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  containerRef:   React.RefObject<HTMLDivElement | null>;
}) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<L | null>(null);
  const lRef        = useRef<L | null>(null);
  // marker entries: { marker: L.Marker, el: HTMLElement }
  const markersRef  = useRef<Map<string, { marker: L; el: HTMLElement }>>(new Map());
  const suppressRef = useRef(false);

  // Keep latest values accessible in event handlers without re-running effects
  const propsRef         = useRef(properties);
  const selectedIdRef    = useRef(selectedId);
  const hoveredIdRef     = useRef(hoveredId);
  const onClickRef       = useRef(onMarkerClick);
  const onHoverRef       = useRef(onMarkerHover);
  const onBoundsRef      = useRef(onBoundsChange);
  const onPopupOpenRef   = useRef(onPopupOpen);
  const onPopupClickRef  = useRef(onPopupClick);

  useEffect(() => { propsRef.current = properties; },       [properties]);
  useEffect(() => { selectedIdRef.current = selectedId; },  [selectedId]);
  useEffect(() => { hoveredIdRef.current  = hoveredId; },   [hoveredId]);
  useEffect(() => { onClickRef.current    = onMarkerClick; },[onMarkerClick]);
  useEffect(() => { onHoverRef.current    = onMarkerHover; },[onMarkerHover]);
  useEffect(() => { onBoundsRef.current   = onBoundsChange; },[onBoundsChange]);
  useEffect(() => { onPopupOpenRef.current  = onPopupOpen; }, [onPopupOpen]);
  useEffect(() => { onPopupClickRef.current = onPopupClick; },[onPopupClick]);

  // Get pixel coords of a DOM element relative to the map container
  const getPixel = useCallback((el: HTMLElement): { x: number; y: number } | null => {
    const c = containerRef.current;
    if (!c) return null;
    const cr = c.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      x: er.left - cr.left + er.width  / 2,
      y: er.top  - cr.top,
    };
  }, [containerRef]);

  const updatePin = useCallback((id: string) => {
    const entry = markersRef.current.get(id);
    if (!entry) return;
    const prop = propsRef.current.find(p => p.id === id);
    if (!prop) return;
    const state: PinState =
      id === selectedIdRef.current ? "selected" :
      id === hoveredIdRef.current  ? "hovered"  : "default";
    entry.el.innerHTML = buildPinHtml(state, prop);
  }, []);

  // Re-render affected pins on hover/selection change
  const prevHovRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (prevHovRef.current) updatePin(prevHovRef.current);
    if (hoveredId)          updatePin(hoveredId);
    prevHovRef.current = hoveredId;
  }, [hoveredId, updatePin]);

  const prevSelRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (prevSelRef.current) updatePin(prevSelRef.current);
    if (selectedId)         updatePin(selectedId);
    prevSelRef.current = selectedId;
  }, [selectedId, updatePin]);

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current) return;
    let destroyed = false;

    loadLeaflet().then(L => {
      if (destroyed || !mapDivRef.current) return;
      if (mapRef.current) return; // already initialised

      lRef.current = L;
      const map = L.map(mapDivRef.current, {
        center: defaultCenter,
        zoom:   defaultZoom,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,
      });

      // Google Maps road tiles — authentic Google Maps visual style
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        {
          subdomains: "0123",
          maxZoom: 20,
          attribution: '© <a href="https://maps.google.com">Google Maps</a>',
        }
      ).addTo(map);

      // Bounds change on moveend
      map.on("moveend", () => {
        if (suppressRef.current) return;
        const b = map.getBounds();
        onBoundsRef.current?.({
          lat_min: b.getSouth(), lat_max: b.getNorth(),
          lng_min: b.getWest(),  lng_max: b.getEast(),
        });
      });

      // Click on map background → deselect
      map.on("click", () => { onClickRef.current?.(null); });

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        markersRef.current.forEach(({ marker }) => marker.remove());
        markersRef.current.clear();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers whenever properties list changes
  useEffect(() => {
    const map = mapRef.current;
    const L   = lRef.current;
    if (!map || !L) return;
    let cancelled = false;

    (async () => {
    const validProps = properties.filter(p =>
      // Include if has exact coords OR has locality/city we can geocode
      (p.latitude != null && p.longitude != null) ||
      p.locality || p.city
    );
    const validIds = new Set(validProps.map(p => p.id));

    // Remove stale markers
    markersRef.current.forEach(({ marker }, id) => {
      if (!validIds.has(id)) { marker.remove(); markersRef.current.delete(id); }
    });

    // Add new markers — resolve coordinates for each property
    for (const prop of validProps) {
      if (markersRef.current.has(prop.id)) continue;
      const id = prop.id;

      // Step 1: Use stored exact coords if plausible
      let lat = prop.latitude  != null ? Number(prop.latitude)  : null;
      let lng = prop.longitude != null ? Number(prop.longitude) : null;

      if (lat != null && lng != null && isCoordsPlausibleForCity(lat, lng, prop.city)) {
        // Exact coords — use as-is
      } else {
        // Step 2: Geocode locality + city via Nominatim for accurate placement
        const geocoded = await geocodeLocality(prop.locality, prop.city);
        if (cancelled) return;
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
        } else {
          // Step 3: Fall back to city centre as last resort
          const cc = prop.city ? cityCoords[prop.city] : null;
          if (!cc) continue;
          lat = cc.lat + (Math.random() - 0.5) * 0.008;
          lng = cc.lng + (Math.random() - 0.5) * 0.008;
        }
      }

      const el = document.createElement("div");
      el.innerHTML = buildPinHtml("default", prop);

      const icon = L.divIcon({ html: el, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
      const marker = L.marker([lat, lng], { icon, zIndexOffset: 0 }).addTo(map);

      // Hover
      el.addEventListener("mouseenter", () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        hoveredIdRef.current = id;
        updatePin(id);
        onHoverRef.current?.(id);
        const p = propsRef.current.find(x => x.id === id);
        if (!p) return;
        const pt = getPixel(el);
        if (pt) onPopupOpenRef.current({ property: p, x: pt.x, y: pt.y });
      });
      el.addEventListener("mouseleave", () => {
        hoveredIdRef.current = null;
        updatePin(id);
        onHoverRef.current?.(null);
        if (selectedIdRef.current !== id) {
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            onPopupOpenRef.current(null);
          }, 180);
        }
      });

      // Click
      el.addEventListener("click", e => {
        e.stopPropagation();
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        const p = propsRef.current.find(x => x.id === id);
        if (!p) return;
        const pt = getPixel(el);
        if (pt) onPopupClickRef.current({ property: p, x: pt.x, y: pt.y });
        onClickRef.current?.(id);
      });

      markersRef.current.set(id, { marker, el });
    }

    // Refresh all pin visuals
    if (!cancelled) markersRef.current.forEach((_, id) => updatePin(id));
    })(); // end async IIFE

    return () => { cancelled = true; };
  }, [properties, updatePin, getPixel, closeTimerRef]);

  // Expose imperative handle
  useEffect(() => {
    mapHandleRef.current = {
      fitAll() {
        const map = mapRef.current;
        const L   = lRef.current;
        if (!map || !L) return;
        const points: [number, number][] = [];
        for (const p of propsRef.current) {
          const lat = p.latitude  != null ? Number(p.latitude)  : null;
          const lng = p.longitude != null ? Number(p.longitude) : null;
          if (lat != null && lng != null && isCoordsPlausibleForCity(lat, lng, p.city)) {
            points.push([lat, lng]);
          } else if (p.city && cityCoords[p.city]) {
            points.push([cityCoords[p.city].lat, cityCoords[p.city].lng]);
          }
        }
        if (!points.length) return;
        suppressRef.current = true;
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        setTimeout(() => { suppressRef.current = false; }, 2000);
      },      panTo(id: string) {
        const map = mapRef.current;
        if (!map) return;
        const p = propsRef.current.find(x => x.id === id);
        if (p?.latitude != null && p?.longitude != null) {
          suppressRef.current = true;
          map.panTo([p.latitude, p.longitude]);
          setTimeout(() => { suppressRef.current = false; }, 2000);
        }
      },
      panToCity(lat: number, lng: number, zoom = 12) {
        const map = mapRef.current;
        if (!map) return;
        suppressRef.current = true;
        map.setView([lat, lng], zoom);
        setTimeout(() => { suppressRef.current = false; }, 2000);
      },
    };
    return () => { mapHandleRef.current = null; };
  });

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}

// ─── Public component ──────────────────────────────────────────────────────────

export const PropertyMap = forwardRef<PropertyMapHandle, PropertyMapProps>(
  function PropertyMap(props, ref) {
    const {
      properties,
      selectedId   = null,
      hoveredId    = null,
      onMarkerClick,
      onMarkerHover,
      onBoundsChange,
      defaultCenter = DEFAULT_CENTER,
      defaultZoom   = DEFAULT_ZOOM,
      className     = "",
      style,
    } = props;

    const [ready, setReady]   = useState(false);
    const [popup, setPopup]   = useState<PopupState | null>(null);

    const containerRef      = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
    const internalHandleRef = useRef<PropertyMapHandle | null>(null);
    const closeTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      fitAll:    () => internalHandleRef.current?.fitAll(),
      panTo:     (id) => internalHandleRef.current?.panTo(id),
      panToCity: (lat, lng, zoom) => internalHandleRef.current?.panToCity(lat, lng, zoom),
    }));

    // Pre-load Leaflet so the map renders without a flash
    useEffect(() => {
      loadLeaflet().then(() => setReady(true)).catch(() => setReady(true));
    }, []);

    // Track container size for popup clamping
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
      ro.observe(el);
      setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
      return () => ro.disconnect();
    }, []);

    const handlePopupOpen  = useCallback((s: PopupState | null) => setPopup(s), []);
    const handlePopupClick = useCallback((s: PopupState | null) => {
      setPopup(prev => (prev?.property.id === s?.property.id ? null : s));
    }, []);
    const handleCancelClose = useCallback(() => {
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);
    const handleClose = useCallback(() => {
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      setPopup(null);
      onMarkerClick?.(null);
    }, [onMarkerClick]);

    const containerStyle: CSSProperties = {
      width: "100%", height: "100%",
      position: "relative",
      background: "#e8e8e8",
      zIndex: 0,
      isolation: "isolate",
      overflow: "hidden",
      ...style,
    };

    // Show spinner while Leaflet CSS/JS loads (usually < 300 ms)
    if (!ready) {
      return (
        <div className={className} style={{
          ...containerStyle,
          display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 8,
        }}>
          <div style={{
            width: 36, height: 36,
            border: `3px solid ${GOLD}`, borderTopColor: "transparent",
            borderRadius: "50%", animation: "pmSpin 0.8s linear infinite",
          }} />
          <p style={{ color: "#a08858", fontSize: 12 }}>Loading map…</p>
          <style>{`@keyframes pmSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={className} style={containerStyle}>
        <LeafletCore
          properties={properties}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
          onBoundsChange={onBoundsChange}
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
          mapHandleRef={internalHandleRef}
          onPopupOpen={handlePopupOpen}
          onPopupClick={handlePopupClick}
          closeTimerRef={closeTimerRef}
          containerRef={containerRef}
        />

        {popup && (
          <PropertyPopupCard
            popup={popup}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
            onClose={handleClose}
            onCancelClose={handleCancelClose}
          />
        )}
      </div>
    );
  }
);
