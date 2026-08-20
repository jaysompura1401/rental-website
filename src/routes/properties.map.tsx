/**
 * /properties/map — Map search page
 *
 * FIXED:
 *  - No more bounds-triggered auto-fetch loop on initial load
 *  - Properties load immediately on open (no "Search this area" required)
 *  - "Search this area" only shows after the user manually pans/zooms
 *  - City from URL param used for initial fetch + map center
 *  - Map auto-fits to all loaded property markers
 *  - Filters fully synchronized with map markers and property cards
 *  - No navbar/filter bar overlap (navbar=60px, filterbar=48px, accounted in layout)
 *  - Z-index: navbar(40) > filterbar(30) > map-controls(901) > popup(1200)
 *  - Single loading cycle, no duplicate API calls
 *  - Property cards properly displayed, no cut/crop
 *  - Responsive at all screen sizes
 */
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from "react";
import { Navbar } from "@/components/site/Navbar";
import {
  PropertyMap,
  type MapBounds,
  type PropertyMapHandle,
} from "@/components/site/PropertyMap";
import {
  properties as propertiesApi,
  type ApiProperty,
  type PropertyFilters,
} from "@/lib/api";
import { formatINR, cities as CITY_LIST, cityCoords, isCoordsPlausibleForCity } from "@/lib/mock-properties";
import {
  Heart, Maximize2, SlidersHorizontal, X, Search,
  MapPin, Loader2, RotateCcw, BedDouble, Bath, Star,
} from "lucide-react";

// ─── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/properties/map")({
  head: () => ({ meta: [{ title: "Map Search — Nivaas" }] }),
  component: MapSearchPage,
});

// ─── Constants ─────────────────────────────────────────────────────────────────

const GOLD      = "#C9921A";
const BG        = "#FAF6EE";
const NAVBAR_H  = 60;   // px — matches Navbar h-[60px]
const FILTER_H  = 48;   // px — filter bar height
const PAGE_SIZE = 50;   // fetch up to 50 properties at once for map

const LISTING_TYPES = [
  { value: "rent", label: "Rent" },
  { value: "sale", label: "Buy"  },
  { value: "pg",   label: "PG"   },
];

const PROPERTY_TYPES = ["Apartment", "Villa", "PG", "Office Space", "Plot"];

// ─── Filter state ───────────────────────────────────────────────────────────────

interface FilterState {
  q:             string;
  city:          string;
  listing_type:  string;
  property_type: string;
  min_price:     number;
  max_price:     number;
  furnished:     boolean;
}

const DEFAULT_FILTERS: FilterState = {
  q: "", city: "", listing_type: "all", property_type: "All",
  min_price: 0, max_price: 50_000_000, furnished: false,
};

function parseFilters(raw: string): FilterState {
  const p = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return {
    q:             p.get("q")             ?? "",
    city:          p.get("city")          ?? "",
    listing_type:  p.get("listing_type")  ?? "all",
    property_type: p.get("property_type") ?? "All",
    min_price:     p.has("min_price")  ? Number(p.get("min_price"))  : 0,
    max_price:     p.has("max_price")  ? Number(p.get("max_price"))  : 50_000_000,
    furnished:     p.get("furnished")  === "true",
  };
}

function filtersToQs(f: FilterState): string {
  const p = new URLSearchParams();
  if (f.q)                         p.set("q",             f.q);
  if (f.city)                      p.set("city",          f.city);
  if (f.listing_type  !== "all")   p.set("listing_type",  f.listing_type);
  if (f.property_type !== "All")   p.set("property_type", f.property_type);
  if (f.min_price > 0)             p.set("min_price",     String(f.min_price));
  if (f.max_price < 50_000_000)    p.set("max_price",     String(f.max_price));
  if (f.furnished)                 p.set("furnished",     "true");
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function hasActiveFilters(f: FilterState): boolean {
  return f.listing_type !== "all" || f.property_type !== "All" || f.furnished
    || !!f.q || !!f.city || f.min_price > 0 || f.max_price < 50_000_000;
}

// ─── Pill helper ───────────────────────────────────────────────────────────────

function pill(active: boolean, gold = false): React.CSSProperties {
  return {
    borderRadius: 999, padding: "5px 13px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const,
    transition: "all 0.15s",
    border: `1px solid ${active ? (gold ? GOLD : "#1a1209") : "#d4c4a0"}`,
    background: active ? (gold ? "#fef3d4" : "#1a1209") : "#fff",
    color: active ? (gold ? GOLD : "#fff") : "#5a3e1b",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
  };
}

// ─── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters, onChange, onReset, totalCount, loading,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  totalCount: number;
  loading: boolean;
}) {
  const [showCityDrop, setShowCityDrop] = useState(false);
  const [cityQ,        setCityQ]        = useState("");
  const hasActive = hasActiveFilters(filters);

  const filteredCities = cityQ.trim()
    ? CITY_LIST.filter((c) => c.toLowerCase().includes(cityQ.toLowerCase()))
    : CITY_LIST;

  return (
    <div
      style={{
        position: "sticky",
        top: NAVBAR_H,
        zIndex: 30,
        background: BG,
        borderBottom: "1px solid #e8d9c0",
        height: FILTER_H,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="filterbar-scroll"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          overflowX: "auto", scrollbarWidth: "none",
          width: "100%",
        }}
      >
        {/* City */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowCityDrop((v) => !v)}
            style={{ ...pill(!!filters.city, true), display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}
          >
            <MapPin style={{ width: 12, height: 12, color: GOLD, flexShrink: 0 }} />
            {filters.city || "City"}
            {filters.city && (
              <span
                onClick={(e) => { e.stopPropagation(); onChange({ city: "" }); }}
                style={{ display: "flex", alignItems: "center", marginLeft: 1 }}
              >
                <X style={{ width: 10, height: 10 }} />
              </span>
            )}
          </button>

          {showCityDrop && (
            <>
              <div
                onClick={() => { setShowCityDrop(false); setCityQ(""); }}
                style={{ position: "fixed", inset: 0, zIndex: 99 }}
              />
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
                background: "#fff", border: "1px solid #e8d9c0", borderRadius: 14,
                boxShadow: "0 8px 24px rgba(0,0,0,0.13)", width: 210, overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid #f0e8d8" }}>
                  <Search style={{ width: 12, height: 12, color: "#a08858", flexShrink: 0 }} />
                  <input
                    autoFocus value={cityQ}
                    onChange={(e) => setCityQ(e.target.value)}
                    placeholder="Search city…"
                    style={{ border: "none", outline: "none", fontSize: 12, color: "#1a1209", background: "transparent", width: "100%" }}
                  />
                  {cityQ && (
                    <button onClick={() => setCityQ("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                      <X style={{ width: 10, height: 10, color: "#a08858" }} />
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 210, overflowY: "auto", padding: "4px 0" }}>
                  <button
                    onClick={() => { onChange({ city: "" }); setShowCityDrop(false); setCityQ(""); }}
                    style={{ width: "100%", textAlign: "left", padding: "7px 13px", background: !filters.city ? "#fef3d4" : "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: !filters.city ? 700 : 400, color: !filters.city ? GOLD : "#1a1209" }}
                  >
                    All cities
                  </button>
                  {filteredCities.map((c) => (
                    <button
                      key={c}
                      onClick={() => { onChange({ city: c }); setShowCityDrop(false); setCityQ(""); }}
                      style={{ width: "100%", textAlign: "left", padding: "7px 13px", background: filters.city === c ? "#fef3d4" : "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: filters.city === c ? 700 : 400, color: filters.city === c ? GOLD : "#1a1209" }}
                    >
                      {c}
                    </button>
                  ))}
                  {filteredCities.length === 0 && (
                    <p style={{ padding: "10px 13px", fontSize: 12, color: "#a08858", margin: 0 }}>No cities found</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Count */}
        <span style={{ fontSize: 12, color: "#836737", whiteSpace: "nowrap", flexShrink: 0 }}>
          {loading ? "…" : `${totalCount} home${totalCount !== 1 ? "s" : ""}`}
        </span>

        <div style={{ width: 1, height: 18, background: "#e8d9c0", flexShrink: 0 }} />

        {/* Keyword search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: filters.q ? "#fef3d4" : "#fff",
          border: `1px solid ${filters.q ? GOLD : "#d4c4a0"}`,
          borderRadius: 999, padding: "5px 12px",
          flexShrink: 0, width: 160,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}>
          <Search style={{ width: 11, height: 11, color: GOLD, flexShrink: 0 }} />
          <input
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#1a1209", width: "100%", minWidth: 0 }}
          />
          {filters.q && (
            <button onClick={() => onChange({ q: "" })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
              <X style={{ width: 10, height: 10, color: "#a08858" }} />
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: "#e8d9c0", flexShrink: 0 }} />

        {/* Listing type */}
        {LISTING_TYPES.map((lt) => (
          <button
            key={lt.value}
            onClick={() => onChange({ listing_type: filters.listing_type === lt.value ? "all" : lt.value })}
            style={pill(filters.listing_type === lt.value)}
          >
            {lt.label}
          </button>
        ))}

        {/* Property type */}
        {PROPERTY_TYPES.map((pt) => (
          <button
            key={pt}
            onClick={() => onChange({ property_type: filters.property_type === pt ? "All" : pt })}
            style={pill(filters.property_type === pt)}
          >
            {pt}
          </button>
        ))}

        {/* Furnished */}
        <button onClick={() => onChange({ furnished: !filters.furnished })} style={pill(filters.furnished, true)}>
          Furnished
        </button>

        {/* Price presets */}
        {[
          { label: "< ₹20k", val: 20_000   },
          { label: "< ₹50k", val: 50_000   },
          { label: "< ₹1L",  val: 100_000  },
        ].map((b) => (
          <button
            key={b.val}
            onClick={() => onChange({ max_price: filters.max_price === b.val ? 50_000_000 : b.val })}
            style={pill(filters.max_price === b.val, true)}
          >
            {b.label}
          </button>
        ))}

        {/* Reset */}
        {hasActive && (
          <button
            onClick={onReset}
            style={{ ...pill(false), display: "flex", alignItems: "center", gap: 4, color: "#a08858" }}
          >
            <RotateCcw style={{ width: 10, height: 10 }} /> Reset
          </button>
        )}
      </div>

      <style>{`.filterbar-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

// ─── Property Card ──────────────────────────────────────────────────────────────

function MapPropertyCard({
  p, isHighlighted, onMouseEnter, onMouseLeave, onClick,
}: {
  p: ApiProperty;
  isHighlighted: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const img = (p.images && p.images[0]) ?? p.cover_image_url ?? null;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        borderRadius: 14,
        overflow: "hidden",
        border: `1.5px solid ${isHighlighted ? GOLD : "#e8d9c0"}`,
        background: "#fff",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isHighlighted
          ? "0 4px 18px rgba(201,146,26,0.18)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <Link
        to="/properties/$id"
        params={{ id: p.id }}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div style={{ position: "relative", height: 150, background: "#f0e4cc", overflow: "hidden" }}>
          {img ? (
            <img
              src={img} alt={p.title}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 28, opacity: 0.25 }}>🏠</span>
              <span style={{ fontSize: 10, color: "#a08858" }}>No photo</span>
            </div>
          )}
          <span style={{
            position: "absolute", top: 8, left: 8,
            background: p.listing_type === "rent" ? "#1a1209" : p.listing_type === "sale" ? GOLD : "#6b4f2a",
            color: "#fff", borderRadius: 999, padding: "2px 8px",
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          }}>
            {p.listing_type === "sale" ? "Buy" : p.listing_type === "pg" ? "PG" : "Rent"}
          </span>
          <button
            onClick={(e) => e.preventDefault()}
            style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(255,255,255,0.85)", border: "none",
              borderRadius: "50%", width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Heart style={{ width: 13, height: 13, color: "#836737" }} />
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: "10px 12px 12px" }}>
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#1a1209", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.title}
          </p>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#a08858", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <MapPin style={{ display: "inline", width: 10, height: 10, marginRight: 2 }} />
            {[p.locality, p.city].filter(Boolean).join(", ")}
          </p>
          <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#836737", marginBottom: 6, flexWrap: "wrap" }}>
            {(p.bedrooms ?? 0) > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <BedDouble style={{ width: 10, height: 10 }} />{p.bedrooms} bd
              </span>
            )}
            {(p.bathrooms ?? 0) > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Bath style={{ width: 10, height: 10 }} />{p.bathrooms} ba
              </span>
            )}
            {(p.area_sqft ?? 0) > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Maximize2 style={{ width: 10, height: 10 }} />{p.area_sqft} ft²
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1a1209" }}>
              {formatINR(p.price)}
              {p.listing_type !== "sale" && (
                <span style={{ fontSize: 10, fontWeight: 400, color: "#a08858" }}>/mo</span>
              )}
            </span>
            {p.avg_rating != null && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#1a1209", fontWeight: 600 }}>
                <Star style={{ width: 11, height: 11, fill: GOLD, color: GOLD }} />
                {Number(p.avg_rating).toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function MapSearchPage() {
  const routerState = useRouterState();
  const rawSearch =
    (routerState.location.searchStr as string | undefined) ??
    (typeof window !== "undefined" ? window.location.search : "");

  // Parse initial filters from URL (picks up city= from "View all" link)
  const [filters, setFilters]       = useState<FilterState>(() => parseFilters(rawSearch));
  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // "Search this area" is only shown after the user manually pans/zooms
  // It is NEVER shown on initial load
  const [showSearchArea, setShowSearchArea] = useState(false);

  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Carousel arrows
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const mapRef      = useRef<PropertyMapHandle>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const cardRefs    = useRef<Map<string, HTMLDivElement>>(new Map());

  // Refs to hold latest values for use in async callbacks / timers
  const filtersRef         = useRef(filters);
  const boundsRef          = useRef<MapBounds | null>(null);
  // True once the map has finished its initial load + we've fitted it
  const initialFitDoneRef  = useRef(false);
  // Tracks whether the initial data fetch has completed (so map can fit)
  const firstFetchDoneRef  = useRef(false);
  // Timer for debouncing "Search this area" after manual pan
  const searchAreaTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce timer for fetch
  const fetchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch (no bounds – always fetches by filters only) ─────────────────────
  const fetchProperties = useCallback((f: FilterState, isRefresh = false) => {
    if (fetchDebounceTimer.current) clearTimeout(fetchDebounceTimer.current);

    fetchDebounceTimer.current = setTimeout(async () => {
      setLoading(true);
      if (!isRefresh) setError(null);

      try {
        const api: PropertyFilters = {
          limit: PAGE_SIZE,
          offset: 0,
          sort: "newest",
          has_coords: "true",
        };
        if (f.q)                       api.q             = f.q;
        if (f.city)                    api.city          = f.city;
        if (f.listing_type !== "all")  api.listing_type  = f.listing_type;
        if (f.property_type !== "All") api.property_type = f.property_type;
        if (f.min_price > 0)           api.min_price     = f.min_price;
        if (f.max_price < 50_000_000)  api.max_price     = f.max_price;
        if (f.furnished)               api.furnished     = "Fully Furnished";

        const res = await propertiesApi.list(api);
        setProperties(res.data);
        setTotalCount(res.count);
        firstFetchDoneRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load properties");
        setProperties([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  // ── Search this area (bounds-filtered re-fetch) ────────────────────────────
  const fetchByBounds = useCallback((b: MapBounds) => {
    if (fetchDebounceTimer.current) clearTimeout(fetchDebounceTimer.current);
    setLoading(true);
    setError(null);
    setShowSearchArea(false);

    const f = filtersRef.current;
    const api: PropertyFilters = {
      limit: PAGE_SIZE,
      offset: 0,
      sort: "newest",
      has_coords: "true",
      lat_min: b.lat_min,
      lat_max: b.lat_max,
      lng_min: b.lng_min,
      lng_max: b.lng_max,
    };
    if (f.q)                       api.q             = f.q;
    if (f.city)                    api.city          = f.city;
    if (f.listing_type !== "all")  api.listing_type  = f.listing_type;
    if (f.property_type !== "All") api.property_type = f.property_type;
    if (f.min_price > 0)           api.min_price     = f.min_price;
    if (f.max_price < 50_000_000)  api.max_price     = f.max_price;
    if (f.furnished)               api.furnished     = "Fully Furnished";

    propertiesApi.list(api)
      .then((res) => {
        setProperties(res.data);
        setTotalCount(res.count);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setProperties([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Initial fetch on mount (and when filters change) ──────────────────────
  useEffect(() => {
    filtersRef.current = filters;
    initialFitDoneRef.current = false; // allow re-fit when filters change
    setShowSearchArea(false);          // hide search-area button on filter change
    fetchProperties(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ── Auto-fit map after first load ─────────────────────────────────────────
  // When properties finish loading and we haven't fitted yet, fit the map
  useEffect(() => {
    if (loading) return;
    if (initialFitDoneRef.current) return;
    if (properties.length === 0) return;

    // Trigger the fit — but mark initialFitDone only AFTER the map animation
    // settles (2 s) so handleBoundsChange cannot fire "Search this area" during
    // the programmatic fitBounds animation.
    setTimeout(() => {
      mapRef.current?.fitAll();
    }, 100);

    setTimeout(() => {
      initialFitDoneRef.current = true;
    }, 2200);
  }, [loading, properties]);

  // ── Bounds change (map pan/zoom by user) ──────────────────────────────────
  // Called every time the map moves. We set a debounce: if the user is still
  // panning, keep pushing back. After they stop we show "Search this area".
  // We do NOT auto-fetch — user must click the button.
  const handleBoundsChange = useCallback((b: MapBounds) => {
    boundsRef.current = b;

    // Don't show "Search this area" during initial load / auto-fit
    if (!initialFitDoneRef.current) return;

    if (searchAreaTimer.current) clearTimeout(searchAreaTimer.current);
    searchAreaTimer.current = setTimeout(() => {
      setShowSearchArea(true);
    }, 800);
  }, []);

  const handleSearchArea = useCallback(() => {
    if (searchAreaTimer.current) clearTimeout(searchAreaTimer.current);
    const b = boundsRef.current;
    if (!b) return;
    fetchByBounds(b);
  }, [fetchByBounds]);

  // ── Filter helpers ────────────────────────────────────────────────────────
  const updateFilter = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      filtersRef.current = next;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/properties/map${filtersToQs(next)}`);
      }
      // When city changes, pan the map immediately to the new city
      if ("city" in patch && patch.city && patch.city !== prev.city) {
        const coords = cityCoords[patch.city];
        if (coords) {
          setTimeout(() => mapRef.current?.panToCity(coords.lat, coords.lng, coords.zoom), 50);
        }
      }
      // When city is cleared, reset fit flag so the map will re-fit on next load
      if ("city" in patch && !patch.city) {
        initialFitDoneRef.current = false;
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    filtersRef.current = DEFAULT_FILTERS;
    initialFitDoneRef.current = false;
    setFilters(DEFAULT_FILTERS);
    setShowSearchArea(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/properties/map");
    }
  }, []);

  // ── Hover sync ────────────────────────────────────────────────────────────
  const handleCardEnter = useCallback((p: ApiProperty) => {
    setHoveredId(p.id);
    if (p.latitude != null && p.longitude != null &&
        isCoordsPlausibleForCity(p.latitude, p.longitude, p.city)) {
      mapRef.current?.panTo(p.id);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      cardRefs.current.get(selectedId)?.scrollIntoView({
        behavior: "smooth", block: "nearest", inline: "nearest",
      });
    }
  }, [selectedId]);

  // ── Carousel arrows ───────────────────────────────────────────────────────
  const updateArrows = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    setTimeout(updateArrows, 150);
  }, [properties, updateArrows]);

  const scrollCarousel = useCallback((dir: "left" | "right") => {
    listRef.current?.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  }, []);

  // ── Determine initial map center ──────────────────────────────────────────
  const initCity   = filters.city;
  const initCoords = initCity && cityCoords[initCity] ? cityCoords[initCity] : null;
  const initCenter: [number, number] = initCoords
    ? [initCoords.lat, initCoords.lng]
    : [23.02, 72.57];
  const initZoom = initCoords ? initCoords.zoom : 11;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: BG,
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}
    >
      {/* Navbar — sticky top-0, z-40, 60px tall */}
      <Navbar />

      {/* Filter bar — sticky below navbar, z-30, 48px tall */}
      <FilterBar
        filters={filters}
        onChange={updateFilter}
        onReset={resetFilters}
        totalCount={totalCount}
        loading={loading}
      />

      {/* Map area */}
      <div
        style={{
          position: "relative",
          zIndex: 0,
          isolation: "isolate",
          /* Take as much viewport height as possible minus navbar + filter */
          height: `calc(100vh - ${NAVBAR_H + FILTER_H}px - 340px)`,
          minHeight: 280,
          maxHeight: 520,
          flexShrink: 0,
          width: "100%",
        }}
      >
        <PropertyMap
          ref={mapRef}
          properties={properties}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onMarkerClick={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onMarkerHover={(id) => setHoveredId(id)}
          onBoundsChange={handleBoundsChange}
          defaultCenter={initCenter}
          defaultZoom={initZoom}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Search this area button — only shown after user manually pans */}
        {showSearchArea && (
          <button
            onClick={handleSearchArea}
            style={{
              position: "absolute", top: 14, left: "50%",
              transform: "translateX(-50%)",
              zIndex: 901,
              background: "#1a1209", color: "#fff",
              border: "none", borderRadius: 999,
              padding: "9px 20px", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
              whiteSpace: "nowrap",
            }}
          >
            <RotateCcw style={{ width: 13, height: 13 }} /> Search this area
          </button>
        )}

        {/* Loading indicator (top-right, non-blocking) */}
        {loading && (
          <div style={{
            position: "absolute", top: 12, right: 12, zIndex: 901,
            background: "rgba(255,255,255,0.92)", borderRadius: 999,
            padding: "6px 14px",
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 12, color: "#836737", fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            <Loader2 style={{ width: 13, height: 13, color: GOLD, animation: "spin 1s linear infinite" }} />
            Loading…
          </div>
        )}

        {/* Property count badge (bottom-left) */}
        {!loading && totalCount > 0 && (
          <div style={{
            position: "absolute", bottom: 14, left: 12, zIndex: 901,
            background: "rgba(255,255,255,0.95)", border: "1px solid #e8d9c0",
            borderRadius: 999, padding: "6px 14px",
            fontSize: 12, fontWeight: 700, color: "#1a1209",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            {totalCount} home{totalCount !== 1 ? "s" : ""} in this area
          </div>
        )}
      </div>

      {/* Properties section below map */}
      <div
        style={{
          padding: "20px 16px 40px",
          maxWidth: 1400,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Section header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: 8,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a1209" }}>
            {loading && properties.length === 0
              ? "Loading…"
              : `${totalCount} propert${totalCount !== 1 ? "ies" : "y"} in this area`}
          </h2>
          {hasActiveFilters(filters) && (
            <button
              onClick={resetFilters}
              style={{
                background: "none", border: "1px solid #e8d9c0", borderRadius: 999,
                padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#836737",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <RotateCcw style={{ width: 10, height: 10 }} /> Clear filters
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#fff1f0", border: "1px solid #ffa39e", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#cf1322",
          }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && properties.length === 0 && (
          <div style={{ display: "flex", gap: 16, overflowX: "hidden" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                flexShrink: 0, width: 240, borderRadius: 14,
                overflow: "hidden", border: "1px solid #f0e4cc", background: "#fff",
              }}>
                <div style={{
                  height: 150,
                  background: "linear-gradient(90deg,#f0e4cc 25%,#faf6ee 50%,#f0e4cc 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s infinite",
                }} />
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ height: 13, background: "#f0e4cc", borderRadius: 6, marginBottom: 8, width: "70%" }} />
                  <div style={{ height: 11, background: "#f0e4cc", borderRadius: 6, width: "50%" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && properties.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            border: "1px dashed #e8d9c0", borderRadius: 20, background: "#fff",
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏙️</div>
            <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#1a1209" }}>
              No properties found
            </p>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#836737" }}>
              Try adjusting filters or pan the map.
            </p>
            <button
              onClick={resetFilters}
              style={{
                background: GOLD, color: "#fff", border: "none",
                borderRadius: 999, padding: "9px 22px",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Property cards — responsive grid */}
        {properties.length > 0 && (
          <div style={{ position: "relative" }}>
            {/* Left arrow */}
            {canLeft && (
              <button
                onClick={() => scrollCarousel("left")}
                aria-label="Scroll left"
                style={{
                  position: "absolute", top: "50%", left: -16,
                  transform: "translateY(-50%)", zIndex: 10,
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#fff", border: "1px solid #e8d9c0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#1a1209",
                }}
              >
                ‹
              </button>
            )}

            <div
              ref={listRef}
              onScroll={updateArrows}
              className="map-carousel"
              style={{
                display: "flex", gap: 14,
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                scrollBehavior: "smooth",
                paddingBottom: 8,
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              {properties.map((p) => (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(p.id, el);
                    else cardRefs.current.delete(p.id);
                  }}
                  style={{
                    flexShrink: 0,
                    width: "clamp(200px, 22vw, 280px)",
                    scrollSnapAlign: "start",
                  }}
                  onMouseEnter={() => handleCardEnter(p)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    setSelectedId((prev) => (prev === p.id ? null : p.id));
                    if (p.latitude != null && p.longitude != null &&
                        isCoordsPlausibleForCity(p.latitude, p.longitude, p.city)) {
                      mapRef.current?.panTo(p.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                >
                  <MapPropertyCard
                    p={p}
                    isHighlighted={hoveredId === p.id || selectedId === p.id}
                    onMouseEnter={() => handleCardEnter(p)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {}}
                  />
                </div>
              ))}
            </div>

            {/* Right arrow */}
            {canRight && (
              <button
                onClick={() => scrollCarousel("right")}
                aria-label="Scroll right"
                style={{
                  position: "absolute", top: "50%", right: -16,
                  transform: "translateY(-50%)", zIndex: 10,
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#fff", border: "1px solid #e8d9c0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#1a1209",
                }}
              >
                ›
              </button>
            )}
          </div>
        )}

        {/* Total count at end */}
        {!loading && properties.length > 0 && (
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#a08858" }}>
            Showing {properties.length} of {totalCount} propert{totalCount !== 1 ? "ies" : "y"}
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .filterbar-scroll::-webkit-scrollbar { display: none; }
        .map-carousel::-webkit-scrollbar     { display: none; }
        .leaflet-container { font-family: system-ui,-apple-system,sans-serif; }
        /* Ensure leaflet z-indexes don't go above our UI */
        .leaflet-pane           { z-index: 400 !important; }
        .leaflet-top,
        .leaflet-bottom         { z-index: 900 !important; }
        .leaflet-control        { z-index: 900 !important; }
      `}</style>
    </div>
  );
}
