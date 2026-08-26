import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { PropertyCard } from "@/components/site/PropertyCard";
import { properties as propertiesApi, type ApiProperty } from "@/lib/api";
import { cities } from "@/lib/mock-properties";
import {
  Search, MapPin, Building2, Wallet, BedDouble, ChevronDown,
  ChevronLeft, ChevronRight, ArrowRight, ShieldCheck, UserCheck,
  Settings2, Users, Home as HomeIcon, Sparkles, Clock3, Eye,
  HandCoins, BadgeIndianRupee,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nivaas — Rent, Buy & Manage Homes across Gujarat" },
      { name: "description", content: "Discover verified rentals, homes for sale, PGs and commercial spaces across Gujarat." },
    ],
  }),
  component: Home,
});

// ── Brand tokens ──────────────────────────────────────────────────────────
const GOLD      = "#C9921A";
const GOLD_SOFT = "#fef3d4";
const BG        = "#FAF6EE";
const BG_ALT    = "#F3ECDC";
const DARK      = "#15110C";
const TEXT      = "#1a1209";
const MUTED     = "#a08858";
const LINE      = "#e8d9c0";

// ── Static content ──────────────────────────────────────────────────────
const TABS = ["Buy", "Rent", "PG / Co-living", "Commercial"] as const;
type Tab = (typeof TABS)[number];

const PROPERTY_TYPES = ["All Type", "Apartment", "Villa", "Independent House", "Plot", "Studio"];
const BEDROOMS = ["Any", "1 BHK", "2 BHK", "3 BHK", "4 BHK", "5+ BHK"];

const RENT_BUDGETS = [
  { label: "Any Budget",    max: null as number | null },
  { label: "Under ₹10,000", max: 10_000 },
  { label: "₹10k – ₹20k",   max: 20_000 },
  { label: "₹20k – ₹35k",   max: 35_000 },
  { label: "₹35k – ₹60k",   max: 60_000 },
  { label: "Above ₹60k",    max: 9_999_999 },
];

const BUY_BUDGETS = [
  { label: "Any Budget",     max: null as number | null },
  { label: "Under ₹50 Lakh", max: 5_000_000 },
  { label: "₹50L – ₹1 Cr",   max: 10_000_000 },
  { label: "₹1 Cr – ₹2 Cr",  max: 20_000_000 },
  { label: "Above ₹2 Cr",    max: 999_999_999 },
];

const POPULAR_SEARCHES = [
  { label: "3 BHK in GIFT City", city: "Gandhinagar", q: "3 BHK GIFT City" },
  { label: "4 BHK in Bodakdev",  city: "Ahmedabad",   q: "4 BHK Bodakdev" },
  { label: "2 BHK in Thaltej",   city: "Ahmedabad",   q: "2 BHK Thaltej" },
  { label: "PG in Gota",         city: "Ahmedabad",   q: "PG Gota" },
];

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "100% Verified",  sub: "Listings" },
  { icon: UserCheck,   label: "Direct Contact",  sub: "with Owners" },
  { icon: Settings2,   label: "Zero Brokerage",  sub: "Options" },
];

const CITY_TILES = [
  { name: "Ahmedabad",   count: "12,450+ Properties", image: "/images/cities/ahmedabad.jpg" },
  { name: "Gandhinagar", count: "4,850+ Properties",  image: "/images/cities/gandhinagar.jpg" },
  { name: "Vadodara",    count: "3,210+ Properties",  image: "/images/cities/vadodara.jpg" },
  { name: "Surat",       count: "2,890+ Properties",  image: "/images/cities/surat.jpg" },
  { name: "Rajkot",      count: "1,540+ Properties",  image: "/images/cities/rajkot.jpg" },
  { name: "Bhavnagar",   count: "980+ Properties",    image: "/images/cities/bhavnagar.jpg" },
];

const WHY_CHOOSE_STATS = [
  { icon: Users,       label: "Trusted by 10,000+", sub: "Happy Customers" },
  { icon: ShieldCheck, label: "50,000+ Verified",   sub: "Properties" },
  { icon: HomeIcon,    label: "Wide Range of",      sub: "Options" },
  { icon: Sparkles,    label: "Hassle-free",        sub: "Experience" },
];

const POPULAR_LOCALITIES = [
  "GIFT City", "Bodakdev", "Prahladnagar", "Thaltej",
  "Gota", "Sargaasan", "Shilaj", "Shela",
  "Chandkheda", "Vaishnodevi Circle", "South Bopal", "SP Ring Road",
];

const CTA_FEATURES = [
  { icon: Clock3,           label: "Quick Listing",    sub: "in 5 Minutes" },
  { icon: Eye,              label: "Maximum",          sub: "Visibility" },
  { icon: HandCoins,        label: "Connect Directly", sub: "with Buyers" },
  { icon: BadgeIndianRupee, label: "Best Price",       sub: "Assistance" },
];

// ── Home ──────────────────────────────────────────────────────────────────
function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      <Navbar />
      <Hero />
      <FeaturedProperties />
      <ExploreByCity />
      <InfoRow />
      <BottomCta />
      <Footer />
    </div>
  );
}

// ── HERO ── split layout: text left, floating tabbed search card right ────
function Hero() {
  const [tab, setTab] = useState<Tab>("Buy");

  const [location, setLocation] = useState("Ahmedabad");
  const [showCitySuggest, setShowCitySuggest] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0]);
  const [bedrooms, setBedrooms] = useState(BEDROOMS[0]);

  const budgetOptions = tab === "Buy" ? BUY_BUDGETS : RENT_BUDGETS;
  const [budgetLabel, setBudgetLabel] = useState(budgetOptions[0].label);

  useEffect(() => {
    setBudgetLabel((tab === "Buy" ? BUY_BUDGETS : RENT_BUDGETS)[0].label);
  }, [tab]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowCitySuggest(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const citySuggestions = location.trim()
    ? cities.filter(c => c.toLowerCase().includes(location.toLowerCase()))
    : cities;

  const runSearch = (overrides?: { q?: string; city?: string }) => {
    const params = new URLSearchParams();
    params.set("type", tab.toLowerCase().replace(/\s*\/\s*/g, "-"));

    const city = overrides?.city ?? location.trim();
    if (city) params.set("city", city);
    if (overrides?.q) params.set("q", overrides.q);
    if (propertyType !== "All Type") params.set("property_type", propertyType);
    if (bedrooms !== "Any") params.set("bedrooms", bedrooms.replace(" BHK", "").replace("+", ""));

    const budget = budgetOptions.find(b => b.label === budgetLabel);
    if (budget?.max) params.set("max_price", String(budget.max));

    window.location.href = `/properties?${params.toString()}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  return (
    <section className="relative overflow-hidden">
      <img
        src="/images/hero-living-room.jpg"
        alt="A warmly lit living room opening onto a balcony overlooking a city skyline at dusk"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(100deg, rgba(9,7,4,0.88) 0%, rgba(9,7,4,0.65) 30%, rgba(9,7,4,0.18) 55%, rgba(9,7,4,0.05) 75%)" }}
      />

      <div className="relative px-4 sm:px-6 lg:px-10 py-12 lg:py-16 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] items-center gap-10 lg:gap-8 lg:min-h-[520px]">

        {/* Left — headline, subhead, trust badges */}
        <div>
          <h1
            className="text-white font-bold leading-[1.08] text-4xl sm:text-5xl"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Find a place<br />
            you'll love to<br />
            <span style={{ color: GOLD }}>call home.</span>
          </h1>

          <p className="mt-5 text-sm sm:text-base text-white/80 max-w-sm">
            Verified Listings. Genuine Owners. Hassle-free Living.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-7 gap-y-4">
            {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ border: `1px solid ${GOLD}55` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
                </span>
                <span className="text-xs text-white/90 leading-snug">
                  {label}<br /> {sub}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — floating tabbed search card, contained fully within the hero */}
        <div className="w-full lg:max-w-xl lg:ml-auto">
          <div
            className="rounded-2xl overflow-visible"
            style={{ boxShadow: "0 16px 40px rgba(10,7,3,0.35)" }}
          >
            {/* Tab strip */}
            <div className="flex gap-1 px-2 pt-2 rounded-t-2xl" style={{ backgroundColor: BG_ALT }}>
              {TABS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className="rounded-t-lg px-3.5 py-2 text-xs sm:text-[13px] font-semibold transition-colors"
                  style={{
                    color: tab === t ? TEXT : MUTED,
                    backgroundColor: tab === t ? "#fff" : "transparent",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Fields row */}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row bg-white rounded-b-2xl overflow-hidden">
              <div ref={locationRef} className="relative flex flex-1 items-center gap-2 px-4 py-3 sm:border-r border-b sm:border-b-0" style={{ borderColor: LINE }}>
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                <div className="flex flex-col min-w-0 flex-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => { setLocation(e.target.value); setShowCitySuggest(true); }}
                    onFocus={() => setShowCitySuggest(true)}
                    placeholder="Search city"
                    className="mt-0.5 w-full bg-transparent text-xs outline-none placeholder:text-[#c8b08a]"
                    style={{ color: TEXT }}
                    autoComplete="off"
                  />
                </div>

                {showCitySuggest && citySuggestions.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-white py-1 z-50"
                    style={{ border: `1px solid ${LINE}`, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}
                  >
                    {citySuggestions.map(city => (
                      <button
                        key={city}
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[#fef9f0]"
                        style={{ color: TEXT }}
                        onClick={() => { setLocation(city); setShowCitySuggest(false); }}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ backgroundColor: GOLD_SOFT, color: GOLD }}>
                          {city.slice(0, 1)}
                        </span>
                        <span>{city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <SelectField
                icon={<Building2 className="h-3.5 w-3.5" style={{ color: GOLD }} />}
                label="Property Type"
                value={propertyType}
                onChange={setPropertyType}
                options={PROPERTY_TYPES}
              />
              <SelectField
                icon={<Wallet className="h-3.5 w-3.5" style={{ color: GOLD }} />}
                label="Budget"
                value={budgetLabel}
                onChange={setBudgetLabel}
                options={budgetOptions.map(b => b.label)}
              />
              <SelectField
                icon={<BedDouble className="h-3.5 w-3.5" style={{ color: GOLD }} />}
                label="Bedrooms"
                value={bedrooms}
                onChange={setBedrooms}
                options={BEDROOMS}
                noBorder
              />

              <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full sm:w-14 h-11 sm:h-auto transition hover:opacity-90 active:scale-[0.98] shrink-0"
                style={{ backgroundColor: DARK }}
              >
                <Search className="h-4 w-4" style={{ color: GOLD }} />
                <span className="text-xs font-semibold text-white sm:hidden">Search</span>
              </button>
            </form>
          </div>

          {/* Popular searches — still inside the hero band, under the card */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white/90">Popular Searches:</span>
            {POPULAR_SEARCHES.map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => runSearch({ city: s.city, q: s.q })}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium transition hover:opacity-80"
                style={{ backgroundColor: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SelectField({
  icon, label, value, onChange, options, noBorder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  noBorder?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-1 items-center gap-2 px-4 py-3 ${noBorder ? "" : "sm:border-r"} border-b sm:border-b-0`}
      style={{ borderColor: LINE }}
    >
      {icon}
      <div className="flex flex-col min-w-0 flex-1">
        <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="mt-0.5 w-full appearance-none bg-transparent text-xs outline-none cursor-pointer"
          style={{ color: TEXT }}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <ChevronDown className="h-3 w-3 shrink-0 pointer-events-none" style={{ color: "#c8b08a" }} />
    </div>
  );
}

// ── FEATURED PROPERTIES ── arrows flank the card row itself ─────────────
function FeaturedProperties() {
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    propertiesApi.list({ limit: 8 })
      .then(res => setProps(res.data))
      .catch(() => setProps([]))
      .finally(() => setLoading(false));
  }, []);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(updateArrows);
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [props]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -420 : 420, behavior: "smooth" });
  };

  return (
    <section className="px-4 sm:px-6 lg:px-10 pt-10 pb-6 max-w-7xl mx-auto w-full">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: GOLD }}>
          Featured Properties
        </p>
        <h2 className="font-bold text-2xl sm:text-3xl" style={{ color: TEXT, fontFamily: "'Sora',sans-serif" }}>
          Handpicked homes for you
        </h2>
        <p className="text-sm mt-1.5 max-w-md" style={{ color: MUTED }}>
          Explore premium properties that match your lifestyle and preferences.
        </p>
        <Link
          to="/properties"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition hover:opacity-80"
          style={{ color: TEXT, border: `1px solid ${LINE}`, backgroundColor: "#fff" }}
        >
          View All Properties <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading && (
        <div className="flex gap-4 overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 h-72 rounded-2xl animate-pulse" style={{ backgroundColor: "#f0e4cc", width: "clamp(220px, 24vw, 280px)" }} />
          ))}
        </div>
      )}

      {!loading && (
        <div className="relative">
          {canLeft && (
            <button
              onClick={() => scroll("left")}
              className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition hover:shadow-lg hover:scale-105"
              style={{ border: `1px solid ${LINE}` }}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" style={{ color: TEXT }} />
            </button>
          )}
          {canRight && (
            <button
              onClick={() => scroll("right")}
              className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition hover:shadow-lg hover:scale-105"
              style={{ border: `1px solid ${LINE}` }}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" style={{ color: TEXT }} />
            </button>
          )}

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
          >
            {props.map(p => (
              <div key={p.id} className="shrink-0" style={{ width: "clamp(220px, 24vw, 280px)" }}>
                <PropertyCard p={p} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── EXPLORE BY CITY ──────────────────────────────────────────────────────
function ExploreByCity() {
  return (
    <section className="px-4 sm:px-6 lg:px-10 py-10" style={{ backgroundColor: BG_ALT }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: GOLD }}>
              Explore by City
            </p>
            <h2 className="font-bold text-2xl sm:text-3xl" style={{ color: TEXT, fontFamily: "'Sora',sans-serif" }}>
              Find properties in top cities
            </h2>
          </div>
          <Link
            to="/properties"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition hover:opacity-80"
            style={{ color: TEXT, border: `1px solid ${LINE}`, backgroundColor: "#fff" }}
          >
            View All Cities <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CITY_TILES.map(city => (
            <Link
              key={city.name}
              to="/properties"
              search={{ city: city.name }}
              className="group relative h-40 rounded-2xl overflow-hidden block"
            >
              <img
                src={city.image}
                alt={city.name}
                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              {/* Uniform dark-navy tint over the whole tile, deepening toward the bottom */}
              <div className="absolute inset-0" style={{ backgroundColor: "rgba(8,10,18,0.35)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,10,18,0.05) 25%, rgba(6,7,12,0.9) 100%)" }} />
              <div className="absolute bottom-0 left-0 right-0 p-3.5">
                <p className="text-white font-bold text-sm leading-tight">{city.name}</p>
                <p className="text-white/70 text-[11px] mt-0.5">{city.count}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── WHY CHOOSE / TRENDING / LOCALITIES ROW ───────────────────────────────
function InfoRow() {
  const [trending, setTrending] = useState<ApiProperty[]>([]);

  useEffect(() => {
    propertiesApi.list({ limit: 4 })
      .then(res => setTrending(res.data))
      .catch(() => setTrending([]));
  }, []);

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-10 max-w-7xl mx-auto w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_320px] gap-5 items-stretch">

        {/* Why choose Nivaas — two columns inside one dark card */}
        <div className="rounded-2xl p-6 flex flex-col" style={{ backgroundColor: DARK }}>
          <div className="flex flex-1 flex-col sm:flex-row lg:flex-row gap-6">
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: GOLD }}>Why Choose Nivaas</p>
              <h3 className="text-white font-bold text-xl leading-snug" style={{ fontFamily: "'Sora',sans-serif" }}>
                Real people.<br />Real properties.<br />Real trust.
              </h3>
            </div>
            <div className="flex flex-col gap-3.5">
              {WHY_CHOOSE_STATS.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(201,146,26,0.15)" }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
                  </span>
                  <span className="text-xs text-white/85 leading-snug">
                    {label}<br /> {sub}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Link
            to="/about"
            className="mt-6 inline-flex w-fit items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
            style={{ backgroundColor: GOLD, color: DARK }}
          >
            Know More About Us <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Trending properties */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>Trending Properties</p>
            <Link to="/properties" className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ color: TEXT, border: `1px solid ${LINE}` }}>
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {trending.map(p => <PropertyCard key={p.id} p={p} compact />)}
          </div>
        </div>

        {/* Popular localities */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: GOLD }}>Popular Localities</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {POPULAR_LOCALITIES.map(loc => (
              <Link
                key={loc}
                to="/properties"
                search={{ q: loc }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                style={{ backgroundColor: GOLD_SOFT, color: TEXT, border: "1px solid #f0e4cc" }}
              >
                {loc}
              </Link>
            ))}
          </div>
          <Link to="/properties" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: GOLD }}>
            Explore All Localities <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── BOTTOM CTA BANNER ────────────────────────────────────────────────────
function BottomCta() {
  return (
    <section className="px-4 sm:px-6 lg:px-10 py-6" style={{ backgroundColor: DARK }}>
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-6 justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(201,146,26,0.15)" }}>
            <HomeIcon className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <div>
            <p className="text-white font-bold text-sm sm:text-base">Have a property to sell or rent?</p>
            <p className="text-white/60 text-xs sm:text-sm mt-0.5">
              List your property and reach thousands of genuine buyers and tenants.
            </p>
          </div>
        </div>

        <Link
          to="/post-property"
          className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: GOLD, color: DARK }}
        >
          Post Your Property
        </Link>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {CTA_FEATURES.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              <span className="text-xs text-white/80 leading-tight">
                {label}<br className="hidden sm:block" /> {sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
