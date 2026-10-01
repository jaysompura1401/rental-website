import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { PropertyCard } from "@/components/site/PropertyCard";
import { RequirementWizard } from "@/components/site/RequirementWizard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { properties as propertiesApi, type ApiProperty } from "@/lib/api";
import { cities, propertyTypes } from "@/lib/mock-properties";
import {
  type CustomerRequirements,
  type MatchResult,
  loadRequirements,
  clearRequirements,
  setJustScrolling,
  hasExistingChoice,
  rankProperties,
} from "@/lib/requirement-match";
import {
  Search, SlidersHorizontal, MapPin, Loader2, X, Map,
  Sparkles, Settings2, ArrowUpDown, TrendingUp, ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/properties/")({
  head: () => ({
    meta: [
      { title: "Browse Properties — Nivaas" },
      { name: "description", content: "Search verified rentals, homes for sale and PGs across Gujarat." },
    ],
  }),
  component: PropertiesList,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseSearch(raw: string) {
  const p = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return {
    q:              p.get("q")              ?? "",
    city:           p.get("city")           ?? "All",
    pincode:        p.get("pincode")        ?? "",
    listing_type:   p.get("listing_type")   ?? "all",
    property_type:  p.get("property_type")  ?? "All",
    max_price:      p.has("max_price") ? Number(p.get("max_price")) : 50_000_000,
    furnished:      p.get("furnished")      === "true",
    available_from: p.get("available_from") ?? "",
  };
}

function buildSearch(state: ReturnType<typeof parseSearch>): string {
  const p = new URLSearchParams();
  if (state.q)                           p.set("q",              state.q);
  if (state.city          !== "All")     p.set("city",           state.city);
  if (state.pincode)                     p.set("pincode",        state.pincode);
  if (state.listing_type  !== "all")     p.set("listing_type",   state.listing_type);
  if (state.property_type !== "All")     p.set("property_type",  state.property_type);
  if (state.max_price     < 50_000_000)  p.set("max_price",      String(state.max_price));
  if (state.furnished)                   p.set("furnished",      "true");
  if (state.available_from)              p.set("available_from", state.available_from);
  const s = p.toString();
  return s ? `?${s}` : "";
}

type SortMode = "match" | "newest" | "price_asc" | "price_desc";

const SORT_LABELS: Record<SortMode, string> = {
  match:      "Best Match",
  newest:     "Newest first",
  price_asc:  "Price: Low–High",
  price_desc: "Price: High–Low",
};

// ─── Personalized header banner ───────────────────────────────────────────────
function PersonalisedBanner({
  req,
  onEdit,
  onClear,
}: {
  req: CustomerRequirements;
  onEdit: () => void;
  onClear: () => void;
}) {
  const parts: string[] = [];
  if (req.listing_type)  parts.push(req.listing_type === "sale" ? "Buy" : req.listing_type === "pg" ? "PG" : req.listing_type === "short_term" ? "Short-Term" : "Rent");
  if (req.bedrooms !== null) parts.push(req.bedrooms === 0 ? "Studio" : req.bedrooms === 4 ? "4+ BHK" : `${req.bedrooms} BHK`);
  if (req.property_type && req.property_type !== "Other") parts.push(req.property_type);
  if (req.location)      parts.push(req.location);
  if (req.furnished)     parts.push(req.furnished);

  return (
    <div
      className="mx-4 sm:mx-6 lg:mx-8 mt-4 mb-2 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3"
      style={{ backgroundColor: "#fef9f0", borderColor: "#e8d9c0" }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "#C9921A" }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <p className="text-sm font-bold" style={{ color: "#1a1209" }}>
          Personalised for you
        </p>
      </div>

      {parts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parts.map(part => (
            <span
              key={part}
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: "#fef3d4", color: "#836737" }}
            >
              {part}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 ml-auto shrink-0">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[#fef3d4]"
          style={{ borderColor: "#e8d9c0", color: "#836737" }}
        >
          <Settings2 className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs font-semibold transition-colors hover:underline"
          style={{ color: "#836737" }}
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────
function SortDropdown({
  value,
  onChange,
  hasRequirements,
}: {
  value: SortMode;
  onChange: (v: SortMode) => void;
  hasRequirements: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options: SortMode[] = hasRequirements
    ? ["match", "newest", "price_asc", "price_desc"]
    : ["newest", "price_asc", "price_desc"];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[#fef3d4]"
        style={{ borderColor: "#e8d9c0", color: "#836737", backgroundColor: "#fff" }}
      >
        <ArrowUpDown className="h-3.5 w-3.5" style={{ color: "#C9921A" }} />
        {SORT_LABELS[value]}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-20 rounded-2xl border py-1.5 shadow-xl min-w-[160px]"
            style={{ backgroundColor: "#fff", borderColor: "#e8d9c0" }}
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-[#fef3d4]"
                style={{ color: value === opt ? "#C9921A" : "#1a1209" }}
              >
                {opt === "match" && <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: "#C9921A" }} />}
                {SORT_LABELS[opt]}
                {value === opt && <span className="ml-auto text-[#C9921A]">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function PropertiesList() {
  const routerState = useRouterState();
  const locationSearchStr = routerState.location.searchStr as string | undefined;
  const rawSearch = locationSearchStr ?? (typeof window !== "undefined" ? window.location.search : "");

  // ── Existing filter state (unchanged) ─────────────────────────────────────
  const [filters, setFilters] = useState(() => parseSearch(rawSearch));
  const [allProps, setAllProps] = useState<ApiProperty[]>([]);
  const [loading, setLoading]  = useState(true);

  // ── New: requirement matching state ───────────────────────────────────────
  const [requirements, setRequirements]     = useState<CustomerRequirements | null>(null);
  const [showWizard,   setShowWizard]        = useState(false);
  const [sortMode,     setSortMode]          = useState<SortMode>("newest");

  // On mount — load saved requirements if they exist (no wizard popup here)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = loadRequirements();
    if (saved) {
      setRequirements(saved);
      setSortMode("match");
    }
  }, []);

  // Sync URL changes externally
  useEffect(() => {
    setFilters(parseSearch(rawSearch));
  }, [rawSearch]);

  const updateFilter = useCallback(<K extends keyof ReturnType<typeof parseSearch>>(
    key: K,
    value: ReturnType<typeof parseSearch>[K],
  ) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      const search = buildSearch(next);
      window.history.replaceState(null, "", `/properties${search}`);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(parseSearch(""));
    window.history.replaceState(null, "", "/properties");
  }, []);

  // Fetch properties on filter change (debounced 350 ms) — unchanged
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      propertiesApi.list({
        city:          filters.city          !== "All" ? filters.city          : undefined,
        listing_type:  filters.listing_type  !== "all" ? filters.listing_type  : undefined,
        property_type: filters.property_type !== "All" ? filters.property_type : undefined,
        max_price:     filters.max_price      < 50_000_000 ? filters.max_price : undefined,
        furnished:     filters.furnished      ? "Fully Furnished"               : undefined,
        q:             filters.q              || undefined,
        pincode:       filters.pincode        || undefined,
        limit:         500,
      })
        .then(res => setAllProps(res.data))
        .catch(() => setAllProps([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [filters]);

  // ── Derived: scored + sorted properties ───────────────────────────────────
  const rankedProps = useMemo(() => {
    if (!requirements || sortMode !== "match") {
      // No personalised sort — apply simple sorts
      const copy = [...allProps];
      if (sortMode === "price_asc")  copy.sort((a, b) => a.price - b.price);
      if (sortMode === "price_desc") copy.sort((a, b) => b.price - a.price);
      // "newest" — leave as-is (API returns newest first)
      return copy.map(p => ({ ...p, matchScore: 0, matchResult: null as MatchResult | null }));
    }

    return rankProperties(allProps, requirements).map(p => ({
      ...p,
      matchResult: p.matchResult as MatchResult,
    }));
  }, [allProps, requirements, sortMode]);

  // ── Wizard callbacks ───────────────────────────────────────────────────────
  const handleWizardComplete = (req: CustomerRequirements) => {
    setRequirements(req);
    setSortMode("match");
    setShowWizard(false);
  };

  const handleWizardSkip = () => {
    setShowWizard(false);
    setSortMode("newest");
  };

  const handleClearRequirements = () => {
    clearRequirements();
    setRequirements(null);
    setSortMode("newest");
  };

  const handleEditRequirements = () => {
    setShowWizard(true);
  };

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeChips: { label: string; clear: () => void }[] = [];
  if (filters.property_type !== "All")   activeChips.push({ label: filters.property_type, clear: () => updateFilter("property_type", "All") });
  if (filters.listing_type  !== "all")   activeChips.push({ label: filters.listing_type === "short_term" ? "Short-Term" : filters.listing_type.toUpperCase(), clear: () => updateFilter("listing_type", "all") });
  if (filters.city          !== "All")   activeChips.push({ label: filters.city, clear: () => updateFilter("city", "All") });
  if (filters.pincode)                   activeChips.push({ label: `PIN: ${filters.pincode}`, clear: () => updateFilter("pincode", "") });
  if (filters.furnished)                 activeChips.push({ label: "Furnished", clear: () => updateFilter("furnished", false) });
  if (filters.q)                         activeChips.push({ label: `"${filters.q}"`, clear: () => updateFilter("q", "") });
  if (filters.available_from)            activeChips.push({ label: `From ${filters.available_from}`, clear: () => updateFilter("available_from", "") });

  const isPersonalised = !!requirements && sortMode === "match";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* ── Requirement wizard modal ─────────────────────────────────────── */}
      {showWizard && (
        <RequirementWizard
          onComplete={(newReq) => {
            setRequirements(newReq);
            setSortMode("match");
            setShowWizard(false);
          }}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* ── Hero search bar ──────────────────────────────────────────────── */}
      <section className="bg-gradient-hero text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="font-display text-3xl sm:text-4xl font-bold">
            {isPersonalised ? "Your Personalised Matches" : "Browse Properties"}
          </h1>
          <p className="mt-2 text-white/85">
            {isPersonalised
              ? "Properties ranked by how well they match your requirements."
              : filters.property_type !== "All"
                ? `${filters.property_type}s across Gujarat`
                : "Verified rentals, homes for sale and premium PGs across Gujarat."}
          </p>

          <div className="mt-6 rounded-2xl bg-white/95 backdrop-blur p-2 flex flex-col md:flex-row gap-2 shadow-elegant">
            {/* City + keyword */}
            <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <select
                value={filters.city}
                onChange={e => updateFilter("city", e.target.value)}
                className="bg-transparent text-sm font-medium py-3 outline-none pr-2 text-[#1a1209]"
              >
                <option value="All">All Cities</option>
                {cities.map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="h-6 w-px bg-border" />
              <Search className="h-4 w-4 text-[#836737] shrink-0" />
              <Input
                value={filters.q}
                onChange={e => updateFilter("q", e.target.value)}
                placeholder="Search title, locality…"
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-[#1a1209] placeholder:text-[#a08858] font-medium"
              />
            </div>

            {/* Pincode */}
            <div className="flex items-center gap-2 px-3 border-l border-border/40 shrink-0 md:w-36">
              <span className="text-xs font-semibold text-[#836737] shrink-0">#</span>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={filters.pincode}
                onChange={e => updateFilter("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Pincode"
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm text-[#1a1209] placeholder:text-[#a08858] font-medium"
              />
            </div>

            <div className="flex gap-1 p-1 bg-secondary rounded-lg shrink-0">
              {[["all","All"],["rent","Rent"],["sale","Buy"],["pg","PG"],["short_term","Short-Term"]].map(([v,l]) => (
                <button
                  key={v}
                  onClick={() => updateFilter("listing_type", v)}
                  className={`px-3 py-2 rounded-md text-xs font-medium transition ${
                    filters.listing_type === v
                      ? "bg-white text-primary shadow-sm"
                      : "text-secondary-foreground/70 hover:text-primary"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Personalised banner — shown when requirements are active ─────── */}
      {requirements && (
        <div className="mx-auto w-full max-w-7xl">
          <PersonalisedBanner
            req={requirements}
            onEdit={handleEditRequirements}
            onClear={handleClearRequirements}
          />
        </div>
      )}

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid gap-8 lg:grid-cols-[280px_1fr]">

        {/* ── Sidebar filters (unchanged) ──────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h3 className="font-display font-semibold">Filters</h3>
              </div>
              {activeChips.length > 0 && (
                <button onClick={resetFilters} className="text-xs text-destructive hover:underline">
                  Reset all
                </button>
              )}
            </div>

            {/* Property type */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Property type
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["All", ...propertyTypes].map(t => (
                  <button
                    key={t}
                    onClick={() => updateFilter("property_type", t)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                      filters.property_type === t
                        ? "bg-gradient-primary text-white border-transparent shadow-sm"
                        : "bg-white border-border text-foreground/70 hover:border-primary/50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Price slider */}
            <div className="mt-5">
              <div className="flex justify-between text-xs mb-3">
                <span className="font-medium text-muted-foreground uppercase tracking-wide">Max price</span>
                <span className="font-semibold text-primary">
                  ₹{filters.max_price.toLocaleString("en-IN")}
                </span>
              </div>
              <Slider
                min={5_000}
                max={50_000_000}
                step={5_000}
                value={[filters.max_price]}
                onValueChange={([v]) => updateFilter("max_price", v)}
              />
            </div>

            {/* Furnished toggle */}
            <div className="mt-5 flex items-center gap-2">
              <Checkbox
                id="fur"
                checked={filters.furnished}
                onCheckedChange={v => updateFilter("furnished", !!v)}
              />
              <label htmlFor="fur" className="text-sm cursor-pointer">Fully furnished only</label>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-6"
              onClick={resetFilters}
            >
              Reset filters
            </Button>

            {/* ── My requirements card (in sidebar) ──────────────────────── */}
            {!requirements && (
              <div
                className="mt-5 rounded-xl border p-4 text-center space-y-2"
                style={{ borderColor: "#e8d9c0", backgroundColor: "#fef9f0" }}
              >
                <Sparkles className="h-5 w-5 mx-auto" style={{ color: "#C9921A" }} />
                <p className="text-xs font-bold" style={{ color: "#1a1209" }}>
                  Want personalised results?
                </p>
                <p className="text-[11px]" style={{ color: "#836737" }}>
                  Tell us your preferences and we'll rank properties by how well they match.
                </p>
                <button
                  onClick={() => setShowWizard(true)}
                  className="w-full rounded-full py-2 text-xs font-bold text-white transition hover:opacity-90"
                  style={{ backgroundColor: "#C9921A" }}
                >
                  Get my matches
                </button>
              </div>
            )}

            {requirements && (
              <div
                className="mt-5 rounded-xl border p-4 space-y-2"
                style={{ borderColor: "#e8d9c0", backgroundColor: "#fef9f0" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#1a1209" }}>
                    <Sparkles className="h-3.5 w-3.5" style={{ color: "#C9921A" }} />
                    My Requirements
                  </p>
                  <button
                    onClick={handleEditRequirements}
                    className="text-[11px] font-semibold hover:underline"
                    style={{ color: "#836737" }}
                  >
                    Edit
                  </button>
                </div>
                <button
                  onClick={handleClearRequirements}
                  className="w-full rounded-full border py-1.5 text-[11px] font-semibold transition-colors hover:bg-[#fef3d4]"
                  style={{ borderColor: "#e8d9c0", color: "#836737" }}
                >
                  Clear preferences
                </button>
              </div>
            )}
          </Card>
        </aside>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div>
          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {activeChips.map(chip => (
                <Badge
                  key={chip.label}
                  className="gap-1.5 bg-primary/10 text-primary border border-primary/20 pr-1.5 cursor-pointer"
                  onClick={chip.clear}
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          {/* Result count + sort ──────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-sm text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{rankedProps.length}</span> properties found
                  {filters.property_type !== "All" && (
                    <span className="ml-1 text-muted-foreground">· {filters.property_type}</span>
                  )}
                  {isPersonalised && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: "#fef3d4", color: "#C9921A" }}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      Personalised
                    </span>
                  )}
                </>
              )}
            </p>

            <div className="flex items-center gap-2 shrink-0">
              {/* Map view toggle */}
              <button
                onClick={() => {
                  const qs = buildSearch(filters).replace("?", "");
                  const mapQs = qs
                    .split("&")
                    .filter(s => s && !s.startsWith("available_from"))
                    .join("&");
                  window.location.href = `/properties/map${mapQs ? `?${mapQs}` : ""}`;
                }}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[#fef3d4]"
                style={{ borderColor: "#e8d9c0", color: "#836737", backgroundColor: "#fff" }}
              >
                <Map className="h-3.5 w-3.5" style={{ color: "#C9921A" }} />
                Map view
              </button>

              {/* Sort dropdown */}
              <SortDropdown
                value={sortMode}
                onChange={setSortMode}
                hasRequirements={!!requirements}
              />
            </div>
          </div>

          {/* Grid ─────────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-muted/40 animate-pulse h-64" />
              ))}
            </div>
          ) : rankedProps.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/60">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-display font-semibold">No properties found</p>
              <p className="text-sm text-muted-foreground mt-1">Try widening your filters.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
                Clear filters
              </Button>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {rankedProps.map(p => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  fluid
                  matchResult={isPersonalised && p.matchResult ? p.matchResult : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
