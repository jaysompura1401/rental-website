/**
 * PropertyMap.tsx — Leaflet-based map (no API key required)
 *
 * FIXED:
 *  - fitAll() correctly fits all currently-loaded markers
 *  - onBoundsChange is NOT fired during programmatic fitBounds / panTo / setView
 *    so those operations don't trigger "Search this area"
 *  - Markers update correctly on property list changes (add/remove diff)
 *  - Price pins use DivIcon with proper CSS, no broken images
 *  - Z-index: leaflet panels 400, controls 900, popup 1200
 *  - Graceful handling of properties with null coordinates
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
import { formatINR, formatMarkerPrice, isCoordsPlausibleForCity } from "@/lib/mock-properties";
import "leaflet/dist/leaflet.css";

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
  properties:       ApiProperty[];
  selectedId?:      string | null;
  hoveredId?:       string | null;
  onMarkerClick?:   (id: string | null) => void;
  onMarkerHover?:   (id: string | null) => void;
  onBoundsChange?:  (bounds: MapBounds) => void;
  defaultCenter?:   [number, number];
  defaultZoom?:     number;
  className?:       string;
  style?:           CSSProperties;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GOLD = "#C9921A";
const DARK = "#1a1209";
const DEFAULT_CENTER: [number, number] = [23.02, 72.57];
const DEFAULT_ZOOM = 11;

// ─── Leaflet singleton loader ──────────────────────────────────────────────────

let leafletPromise: Promise<typeof import("leaflet")> | null = null;

function loadLeaflet(): Promise<typeof import("leaflet")> {
  if (!leafletPromise) {
    leafletPromise = import("leaflet").then((mod) => {
      const L = mod.default;
      // Fix default icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      return L;
    });
  }
  return leafletPromise;
}

// ─── Price pin HTML builder ───────────────────────────────────────────────────

type PinState = "default" | "hovered" | "selected";

function buildPinHtml(state: PinState, price: number, listingType: string): string {
  const label  = formatMarkerPrice(price);
  const suffix = listingType !== "sale" ? "/mo" : "";

  const bg =
    state === "selected" ? "#b5800e" :
    state === "hovered"  ? DARK      : GOLD;

  const scale  = state === "selected" ? 1.15 : state === "hovered" ? 1.08 : 1;
  const shadow = state !== "default"
    ? "0 4px 14px rgba(0,0,0,0.35)"
    : "0 2px 6px rgba(0,0,0,0.2)";

  return `
    <div style="
      display:inline-flex;align-items:center;justify-content:center;
      background:${bg};color:#fff;
      border-radius:999px;padding:4px 10px;
      font-size:11px;font-weight:800;font-family:system-ui,sans-serif;
      white-space:nowrap;
      box-shadow:${shadow};
      transform:scale(${scale});transform-origin:bottom center;
      transition:transform 0.15s,background 0.15s;
      cursor:pointer;
      position:relative;
      border:1.5px solid rgba(0,0,0,0.15);
      user-select:none;
    ">
      ${label}${suffix}
      <span style="
        position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
        border-left:5px solid transparent;border-right:5px solid transparent;
        border-top:6px solid ${bg};
        pointer-events:none;
      "></span>
    </div>
  `;
}

// ─── Popup card ────────────────────────────────────────────────────────────────

interface PopupState {
  property: ApiProperty;
  x: number;
  y: number;
}

function PropertyPopupCard({
  popup,
  containerWidth,
  containerHeight,
  onClose,
  onCancelClose,
}: {
  popup: PopupState;
  containerWidth: number;
  containerHeight: number;
  onClose: () => void;
  onCancelClose: () => void;
}) {
  const CARD_W       = 290;
  const CARD_H_APPROX = 370;
  const GAP          = 14;

  let left = popup.x - CARD_W / 2;
  let top  =
    popup.y - CARD_H_APPROX - GAP < 8
      ? popup.y + GAP + 28
      : popup.y - CARD_H_APPROX - GAP;

  left = Math.max(8, Math.min(left, containerWidth  - CARD_W       - 8));
  top  = Math.max(8, Math.min(top,  containerHeight - CARD_H_APPROX - 8));

  const { property: p } = popup;
  const img = (p.images?.[0]) ?? p.cover_image_url ?? null;

  const badgeBg =
    p.listing_type === "sale" ? GOLD :
    p.listing_type === "pg"   ? "#6b4f2a" : DARK;
  const badgeLabel =
    p.listing_type === "sale" ? "Buy" :
    p.listing_type === "pg"   ? "PG"  : "Rent";

  const amenityNames: string[] =
    (p.amenities ?? []).map((a) =>
      typeof a === "string" ? a : (a as { name: string }).name ?? ""
    );
  const hasSecurity = amenityNames.some((a) => /security|24.?7/i.test(a));
  const hasWifi     = amenityNames.some((a) => /wifi|wi.?fi/i.test(a));
  const hasParking  = amenityNames.some((a) => /parking/i.test(a));

  return (
    <div
      style={{
        position: "absolute", left, top,
        zIndex: 1200, width: CARD_W,
        background: "#fff", borderRadius: 18,
        boxShadow: "0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)",
        border: "1px solid #e8d9c0",
        overflow: "hidden", pointerEvents: "all",
        animation: "pmCardIn 0.18s cubic-bezier(.34,1.56,.64,1) both",
      }}
      onMouseEnter={onCancelClose}
      onMouseLeave={onClose}
    >
      {/* Image */}
      <div style={{ height: 140, overflow: "hidden", position: "relative", background: "#f0e4cc" }}>
        {img ? (
          <img
            src={img} alt={p.title}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>🏠</span>
            <span style={{ fontSize: 10, color: "#a08858" }}>No photo</span>
          </div>
        )}
        <span style={{
          position: "absolute", top: 8, left: 8,
          background: badgeBg, color: "#fff",
          borderRadius: 999, padding: "2px 8px",
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase",
        }}>
          {badgeLabel}
        </span>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 7, right: 7,
            width: 24, height: 24, borderRadius: "50%",
            background: "rgba(255,255,255,0.88)", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 14, color: DARK,
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px 12px" }}>
        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.title}
        </p>
        {(p.locality || p.city) && (
          <p style={{ margin: "0 0 7px", fontSize: 11, color: "#a08858", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📍 {[p.locality, p.city].filter(Boolean).join(", ")}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: DARK }}>
            {formatINR(p.price)}
            {p.listing_type !== "sale" && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "#a08858" }}>/mo</span>
            )}
          </span>
          {p.area_sqft != null && p.area_sqft > 0 && (
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
            {hasWifi     && <Chip label="Wi-Fi"         />}
            {hasParking  && <Chip label="Parking"       />}
          </div>
        )}

        <Link
          to="/properties/$id"
          params={{ id: p.id }}
          style={{
            display: "block", width: "100%", textAlign: "center",
            background: GOLD, color: "#fff", borderRadius: 999,
            padding: "8px 0", fontSize: 12, fontWeight: 700,
            textDecoration: "none", marginBottom: 7,
            boxShadow: "0 2px 8px rgba(201,146,26,0.35)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          View Property →
        </Link>

        <div style={{ display: "flex", gap: 7 }}>
          {p.owner_phone ? (
            <a href={`tel:${p.owner_phone}`} style={btnStyle("outline")} onClick={(e) => e.stopPropagation()}>
              📞 Call Owner
            </a>
          ) : (
            <Link to="/properties/$id" params={{ id: p.id }} style={btnStyle("outline")} onClick={(e) => e.stopPropagation()}>
              📞 Contact
            </Link>
          )}
          <Link to="/properties/$id" params={{ id: p.id }} style={btnStyle("dark")} onClick={(e) => e.stopPropagation()}>
            💬 Message
          </Link>
        </div>
      </div>

      <style>{`@keyframes pmCardIn{from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      background: "#fef3d4", color: GOLD,
      borderRadius: 999, padding: "2px 7px",
      border: `1px solid ${GOLD}44`,
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

// ─── Core Leaflet map ──────────────────────────────────────────────────────────

function LeafletMapCore({
  properties,
  selectedId,
  hoveredId,
  onMarkerClick,
  onMarkerHover,
  onBoundsChange,
  defaultCenter,
  defaultZoom,
  mapHandleRef,
  onPopupOpen,
  onPopupClick,
  closeTimerRef,
  containerRef,
  L,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any;
}) {
  const mapDivRef  = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());

  // When true, we suppress the bounds-change event (used during programmatic moves)
  const suppressBoundsRef = useRef(false);

  const propsRef         = useRef(properties);
  const selectedIdRef    = useRef(selectedId);
  const hoveredIdRef     = useRef(hoveredId);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMarkerHoverRef = useRef(onMarkerHover);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onPopupOpenRef   = useRef(onPopupOpen);
  const onPopupClickRef  = useRef(onPopupClick);

  useEffect(() => { propsRef.current = properties; }, [properties]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);
  useEffect(() => { onMarkerHoverRef.current = onMarkerHover; }, [onMarkerHover]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  useEffect(() => { onPopupOpenRef.current = onPopupOpen; }, [onPopupOpen]);
  useEffect(() => { onPopupClickRef.current = onPopupClick; }, [onPopupClick]);

  // Convert lat/lng to pixel coords relative to container
  const getPixel = useCallback((lat: number, lng: number): { x: number; y: number } | null => {
    const map       = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return null;
    try {
      const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: pt.x, y: pt.y };
    } catch { return null; }
  }, [L, containerRef]);

  const updateMarkerIcon = useCallback((id: string) => {
    const marker = markersRef.current.get(id);
    if (!marker) return;
    const prop = propsRef.current.find((p) => p.id === id);
    if (!prop) return;
    const state: PinState =
      id === selectedIdRef.current ? "selected" :
      id === hoveredIdRef.current  ? "hovered"  : "default";
    const icon = L.divIcon({
      html: buildPinHtml(state, prop.price, prop.listing_type),
      className: "",
      iconSize: [1, 1],
      iconAnchor: [0, 6],
    });
    marker.setIcon(icon);
    marker.setZIndexOffset(state === "selected" ? 1000 : state === "hovered" ? 500 : 0);
  }, [L]);

  // Re-render affected markers on hover/selection change
  const prevHovRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    const prev = prevHovRef.current;
    if (prev) updateMarkerIcon(prev);
    if (hoveredId) updateMarkerIcon(hoveredId);
    prevHovRef.current = hoveredId;
  }, [hoveredId, updateMarkerIcon]);

  const prevSelRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    const prev = prevSelRef.current;
    if (prev) updateMarkerIcon(prev);
    if (selectedId) updateMarkerIcon(selectedId);
    prevSelRef.current = selectedId;
  }, [selectedId, updateMarkerIcon]);

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    });

    // CartoDB light tiles — no API key needed
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    ).addTo(map);

    // Only fire onBoundsChange when NOT suppressed (i.e. only on user pans)
    map.on("moveend zoomend", () => {
      if (suppressBoundsRef.current) return;
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        lat_min: b.getSouth(), lat_max: b.getNorth(),
        lng_min: b.getWest(),  lng_max: b.getEast(),
      });
    });

    map.on("click", () => {
      onMarkerClickRef.current?.(null);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers when properties list changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const validProps = properties.filter(
      (p) => p.latitude != null && p.longitude != null &&
             isCoordsPlausibleForCity(p.latitude, p.longitude, p.city)
    );
    const validIds = new Set(validProps.map((p) => p.id));

    // Remove stale markers
    markersRef.current.forEach((m, id) => {
      if (!validIds.has(id)) {
        map.removeLayer(m);
        markersRef.current.delete(id);
      }
    });

    // Add new markers
    for (const prop of validProps) {
      if (markersRef.current.has(prop.id)) continue;

      const id = prop.id;
      const icon = L.divIcon({
        html: buildPinHtml("default", prop.price, prop.listing_type),
        className: "",
        iconSize: [1, 1],
        iconAnchor: [0, 6],
      });

      const marker = L.marker([prop.latitude!, prop.longitude!], { icon }).addTo(map);

      marker.on("mouseover", () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        hoveredIdRef.current = id;
        updateMarkerIcon(id);
        onMarkerHoverRef.current?.(id);
        const p = propsRef.current.find((x) => x.id === id);
        if (!p || p.latitude == null || p.longitude == null) return;
        const pt = getPixel(p.latitude, p.longitude);
        if (pt) onPopupOpenRef.current({ property: p, x: pt.x, y: pt.y });
      });

      marker.on("mouseout", () => {
        hoveredIdRef.current = null;
        updateMarkerIcon(id);
        onMarkerHoverRef.current?.(null);
        if (selectedIdRef.current !== id) {
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            onPopupOpenRef.current(null);
          }, 180);
        }
      });

      marker.on("click", (e: Event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).originalEvent?.stopPropagation();
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        const p = propsRef.current.find((x) => x.id === id);
        if (!p || p.latitude == null || p.longitude == null) return;
        const pt = getPixel(p.latitude, p.longitude);
        if (pt) onPopupClickRef.current({ property: p, x: pt.x, y: pt.y });
        onMarkerClickRef.current?.(id);
      });

      markersRef.current.set(id, marker);
    }

    // Refresh all icon states
    markersRef.current.forEach((_, id) => updateMarkerIcon(id));
  }, [properties, L, updateMarkerIcon, getPixel]);

  // Expose imperative handle
  useEffect(() => {
    mapHandleRef.current = {
      fitAll() {
        const map = mapRef.current;
        if (!map) return;
        const valid = propsRef.current.filter(
          (p) => p.latitude != null && p.longitude != null &&
                 isCoordsPlausibleForCity(p.latitude, p.longitude, p.city)
        );
        if (!valid.length) return;
        // Suppress bounds event so fitAll doesn't trigger "Search this area"
        suppressBoundsRef.current = true;
        const bounds = L.latLngBounds(valid.map((p) => [p.latitude!, p.longitude!]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        // Re-enable after the animation settles (2 s gives extra margin)
        setTimeout(() => { suppressBoundsRef.current = false; }, 2000);
      },
      panTo(id: string) {
        const map = mapRef.current;
        if (!map) return;
        const p = propsRef.current.find((x) => x.id === id);
        if (p?.latitude != null && p?.longitude != null) {
          suppressBoundsRef.current = true;
          map.panTo([p.latitude, p.longitude]);
          setTimeout(() => { suppressBoundsRef.current = false; }, 2000);
        }
      },
      panToCity(lat: number, lng: number, zoom = 12) {
        const map = mapRef.current;
        if (!map) return;
        suppressBoundsRef.current = true;
        map.setView([lat, lng], zoom);
        setTimeout(() => { suppressBoundsRef.current = false; }, 2000);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [L, setL]             = useState<any>(null);
    const [loadError, setError] = useState<string | null>(null);
    const [popup, setPopup]     = useState<PopupState | null>(null);

    const containerRef     = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
    const internalHandleRef = useRef<PropertyMapHandle | null>(null);
    const closeTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      fitAll:    () => internalHandleRef.current?.fitAll(),
      panTo:     (id) => internalHandleRef.current?.panTo(id),
      panToCity: (lat, lng, zoom) => internalHandleRef.current?.panToCity(lat, lng, zoom),
    }));

    // Load Leaflet once
    useEffect(() => {
      loadLeaflet()
        .then((mod) => setL(mod))
        .catch((err: Error) => {
          console.error("[PropertyMap]", err);
          setError("Failed to load map library.");
        });
    }, []);

    // Track container size for popup positioning
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
      });
      ro.observe(el);
      setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
      return () => ro.disconnect();
    }, []);

    const handlePopupOpen     = useCallback((s: PopupState | null) => setPopup(s), []);
    const handlePopupClick    = useCallback((s: PopupState | null) => {
      setPopup((prev) => (prev?.property.id === s?.property.id ? null : s));
    }, []);
    const handleCancelClose   = useCallback(() => {
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);
    const handleClose         = useCallback(() => {
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      setPopup(null);
      onMarkerClick?.(null);
    }, [onMarkerClick]);

    const containerStyle: CSSProperties = {
      width: "100%", height: "100%",
      position: "relative",
      background: "#e8e0d5",
      // Contain Leaflet's internal z-indexes (400, 600, 900…) inside this
      // stacking context so they never bleed above the sticky Navbar (z-40).
      zIndex: 0,
      isolation: "isolate",
      ...style,
    };

    if (loadError) {
      return (
        <div
          className={className}
          style={{
            ...containerStyle,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          <span style={{ fontSize: 36 }}>🗺️</span>
          <p style={{ color: "#a08858", fontSize: 13, textAlign: "center", padding: "0 24px", maxWidth: 320 }}>
            {loadError}
          </p>
        </div>
      );
    }

    if (!L) {
      return (
        <div
          className={className}
          style={{
            ...containerStyle,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <div style={{
            width: 36, height: 36,
            border: `3px solid ${GOLD}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "pmSpin 0.8s linear infinite",
          }} />
          <p style={{ color: "#a08858", fontSize: 12 }}>Loading map…</p>
          <style>{`@keyframes pmSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={className} style={containerStyle}>
        <LeafletMapCore
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
          L={L}
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
