import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { PropertyCard } from "@/components/site/PropertyCard";
import { SimilarProperties } from "@/components/dashboard/SimilarProperties";
import { RequirementWizard } from "@/components/site/RequirementWizard";
import { properties as propertiesApi, type ApiProperty } from "@/lib/api";
import { cities } from "@/lib/mock-properties";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import type { ViewedProperty } from "@/lib/view-history";
import {
  hasExistingChoice,
  saveRequirements,
  type CustomerRequirements,
} from "@/lib/requirement-match";
import {
  Search, CalendarDays, Wallet, Home as HomeIcon, ArrowRight,
  ChevronDown, X, ShieldCheck, UserCheck, Key, MapPin, Building2, Bed,
  Users, Layers, Sparkles, Clock, Eye, Award, Building, Sparkle,
  Navigation, Loader2, ChevronRight, ChevronLeft, Phone, ExternalLink, History, LayoutGrid,
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

const GOLD = "#C9921A";
const BG   = "#FAF6EE";

const ROTATING_HERO_TEXTS = [
  "call home.",
  "rent out.",
  "buy today.",
  "work in.",
  "stay in PG.",
];

// ── Budget preset options ────────────────────────────────────────────────────
const BUDGET_PRESETS = [
  { label: "Under ₹10,000",    max: 10_000  },
  { label: "₹10k – ₹20k",     max: 20_000  },
  { label: "₹20k – ₹35k",     max: 35_000  },
  { label: "₹35k – ₹60k",     max: 60_000  },
  { label: "₹60k – ₹1 Lakh",  max: 100_000 },
  { label: "Above ₹1 Lakh",   max: 9_999_999 },
];

// Popular search chips are built dynamically from the most-viewed properties
// (top 6 by views_count). Label = "X BHK in Locality" or "PropertyType in City".
function buildPopularChips(props: ApiProperty[]): Array<{ label: string; city: string; q: string }> {
  const sorted = [...props]
    .filter(p => p.city)
    .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0));

  // Deduplicate by locality+city so chips look varied
  const seen = new Set<string>();
  const chips: Array<{ label: string; city: string; q: string }> = [];

  for (const p of sorted) {
    const locality = p.locality?.trim() || p.city;
    const key = `${locality}|${p.city}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bhk = p.bedrooms && p.bedrooms > 0 ? `${p.bedrooms} BHK` : p.property_type;
    const label = `${bhk} in ${locality}`;
    chips.push({ label, city: p.city, q: locality });
    if (chips.length >= 6) break;
  }
  return chips;
}

const POPULAR_LOCALITY_CHIPS = [
  "GIFT City", "Bodakdev", "Prahladnagar", "Thaltej",
  "Gota", "Sargasasan", "Shilaj", "Shela",
  "Chandkheda", "Vaishnodevi Circle", "South Bopal", "SP Ring Road"
];

const DEFAULT_CITY_IMAGES: Record<string, string> = {
  "Ahmedabad": "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80",
  "Gandhinagar": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80",
  "Vadodara": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
  "Surat": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
  "Rajkot": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80",
  "Bhavnagar": "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=600&q=80",
};

// ── Landmark Cities List matching reference screenshot ──────────────────────
const POPULAR_CITIES_LIST = [
  "Ahmedabad", "Gandhinagar", "Vadodara", "Surat", "Rajkot", "Bhavnagar", "Jamnagar", "Anand",
  "Mumbai", "Delhi-NCR", "Bengaluru", "Hyderabad", "Chandigarh", "Pune", "Chennai", "Kolkata", "Kochi"
];

// ── Line-art Landmark SVG Icons ──────────────────────────────────────────────
function CityLandmarkIcon({ city, className = "h-10 w-10 text-[#C9921A]" }: { city: string; className?: string }) {
  const c = city.toLowerCase();

  if (c.includes("ahmedabad")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Siddi Saiyyed Mosque / Minarets */}
        <path d="M10 40V16M38 40V16" />
        <path d="M7 16l3-6 3 6M35 16l3-6 3 6" />
        <path d="M18 40V24a6 6 0 0 1 12 0v16" />
        <path d="M10 30h28M6 40h36" />
        <circle cx="24" cy="18" r="3" />
      </svg>
    );
  }
  if (c.includes("gandhinagar")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Akshardham Temple */}
        <path d="M24 8a12 12 0 0 0-12 12v20h24V20A12 12 0 0 0 24 8z" />
        <path d="M24 4v4M12 24h24M18 40V28a6 6 0 0 1 12 0v12M6 40h36" />
      </svg>
    );
  }
  if (c.includes("vadodara")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Laxmi Vilas Palace */}
        <path d="M8 40V20l6-4 6 4v20M28 40V20l6-4 6 4v20M6 40h36" />
        <path d="M20 40V26a4 4 0 0 1 8 0v14" />
        <circle cx="24" cy="14" r="3" />
      </svg>
    );
  }
  if (c.includes("surat")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Diamond & Heritage Tower */}
        <path d="M24 6l14 10-14 26L10 16 24 6z" />
        <path d="M10 16h28M24 6v36M17 11l7 25M31 11l-7 25" />
      </svg>
    );
  }
  if (c.includes("mumbai")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Gateway of India */}
        <path d="M8 40V16l4-4h24l4 4v24M6 40h36" />
        <path d="M18 40V22a6 6 0 0 1 12 0v18" />
        <path d="M12 20h24M14 28h4M30 28h4" />
      </svg>
    );
  }
  if (c.includes("delhi")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* India Gate */}
        <path d="M10 40V18l4-6h20l4 6v22M6 40h36" />
        <path d="M17 40V24a7 7 0 0 1 14 0v16" />
        <path d="M12 18h24M14 12h20" />
      </svg>
    );
  }
  if (c.includes("bengaluru") || c.includes("bangalore")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Vidhana Soudha */}
        <path d="M6 40V20h36v20M6 40h36" />
        <path d="M24 8a8 8 0 0 0-8 8v4h16v-4a8 8 0 0 0-8-8z" />
        <path d="M18 40V28a6 6 0 0 1 12 0v12" />
      </svg>
    );
  }
  if (c.includes("hyderabad")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Charminar */}
        <path d="M10 40V12m28 28V12M6 12h8m20 0h8" />
        <path d="M10 8l4-4 4 4M30 8l4-4 4 4" />
        <path d="M16 40V24a8 8 0 0 1 16 0v16M6 40h36" />
        <path d="M10 20h28" />
      </svg>
    );
  }
  if (c.includes("chandigarh")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Open Hand Monument */}
        <path d="M18 40V24l-4-4v-8a2 2 0 0 1 4 0v6M22 40V20a2 2 0 0 1 4 0v20M26 40V22a2 2 0 0 1 4 0v18M30 40V26a2 2 0 0 1 4 0v14M6 40h36" />
      </svg>
    );
  }
  if (c.includes("pune")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Shaniwar Wada Fort */}
        <path d="M8 40V18h32v22M6 40h36" />
        <path d="M16 40V26a4 4 0 0 1 8 0v14" />
        <path d="M12 18l4-6h16l4 6" />
      </svg>
    );
  }
  if (c.includes("chennai")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Temple Gopuram */}
        <path d="M20 6h8l2 6H18l2-6zM17 12h14l2 8H15l2-8zM14 20h20l2 8H12l2-8zM10 28h28l2 12H8l2-12zM6 40h36" />
        <path d="M20 40V34a4 4 0 0 1 8 0v6" />
      </svg>
    );
  }
  if (c.includes("kolkata")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Victoria Memorial */}
        <path d="M24 6a10 10 0 0 0-10 10v4h20v-4A10 10 0 0 0 24 6z" />
        <path d="M6 40V20h36v20M6 40h36" />
        <path d="M18 40V28a6 6 0 0 1 12 0v12" />
      </svg>
    );
  }
  if (c.includes("kochi") || c.includes("cochin")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Houseboat & Palms */}
        <path d="M6 34c6 4 12 4 18 0s12-4 18 0" />
        <path d="M10 30l4-12h20l4 12H10z" />
        <path d="M6 14c4-4 10-4 12 0M30 14c4-4 10-4 12 0" />
      </svg>
    );
  }
  if (c.includes("rajkot")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Jubilee Arch */}
        <path d="M8 40V16M40 40V16M6 16c6-8 30-8 36 0" />
        <path d="M18 40V26a6 6 0 0 1 12 0v14M6 40h36" />
      </svg>
    );
  }
  if (c.includes("bhavnagar")) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Heritage Palace */}
        <path d="M12 40V18l12-10 12 10v22M6 40h36" />
        <path d="M20 40V28a4 4 0 0 1 8 0v12" />
        <circle cx="24" cy="20" r="3" />
      </svg>
    );
  }
  // Generic City Icon Fallback
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 40V12h14v28M26 40V20h10v20M6 40h36" />
      <path d="M16 18h4M16 24h4M16 30h4M30 26h2M30 32h2" />
    </svg>
  );
}

// ─── Invite card component ───────────────────────────────────────────────────
function HomeInviteCard({ onGetMatches }: { onGetMatches: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 mt-2 sm:-mt-6 mb-6 sm:mb-10">
      <div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border p-3.5 sm:px-8 sm:py-7 shadow-xs"
        style={{ backgroundColor: "#fef9f0", borderColor: "#e8d9c0" }}
      >
        {/* Top-right close button */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 h-6 w-6 rounded-full flex items-center justify-center text-[#a08858] hover:text-[#1a1209] hover:bg-black/5 transition-all z-10"
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>

        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 sm:h-44 sm:w-44 rounded-full opacity-15" style={{ backgroundColor: "#C9921A" }} />
        <div className="pointer-events-none absolute -right-4 bottom-0 h-20 w-20 sm:h-28 sm:w-28 rounded-full opacity-[0.08]" style={{ backgroundColor: "#C9921A" }} />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          {/* Left: Icon + Copy in horizontal flex on mobile */}
          <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0 pr-6 sm:pr-0">
            {/* Icon */}
            <div
              className="flex h-9 w-9 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl shadow-xs"
              style={{ backgroundColor: "#C9921A" }}
            >
              <Sparkles className="h-4.5 w-4.5 sm:h-7 sm:w-7 text-white" />
            </div>

            {/* Copy */}
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm sm:text-xl leading-tight text-[#1a1209]" style={{ fontFamily: "'Sora',sans-serif" }}>
                Find properties made for you
              </p>
              <p className="mt-0.5 sm:mt-1.5 text-xs sm:text-sm leading-relaxed text-[#836737]">
                <span className="sm:hidden">Answer 5 quick questions to get personalized matches ranked for you.</span>
                <span className="hidden sm:inline">Answer 5 quick questions — budget, location, BHK, furnishing — and we'll rank every property by how well it matches your needs.</span>
              </p>
            </div>
          </div>

          {/* CTA Button */}
          <div className="shrink-0 flex items-center justify-between sm:justify-end gap-2 pt-0.5 sm:pt-0">
            <button
              onClick={onGetMatches}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#C9921A", boxShadow: "0 4px 16px rgba(201,146,26,0.3)" }}
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Get my matches</span>
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="sm:hidden text-xs font-medium text-[#a08858] hover:text-[#1a1209] transition-colors whitespace-nowrap px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Home component ────────────────────────────────────────────────────────────
function Home() {
  const [heroTab, setHeroTab]                 = useState<"Buy" | "Rent" | "PG / Co-living" | "Short-Term" | "Commercial">("Rent");
  const [locationInput, setLocationInput]     = useState("");
  const [showCitySuggest, setShowCitySuggest] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  const [propertyType, setPropertyType]       = useState("All Type");
  const [showPropType, setShowPropType]       = useState(false);
  const propTypeRef = useRef<HTMLDivElement>(null);

  const [bedrooms, setBedrooms]               = useState("Any");
  const [showBedrooms, setShowBedrooms]       = useState(false);
  const bedroomRef = useRef<HTMLDivElement>(null);

  const [budgetLabel, setBudgetLabel]         = useState("Any Budget");
  const [budgetMax,   setBudgetMax]           = useState<number | null>(null);
  const [showBudget,  setShowBudget]          = useState(false);
  const budgetRef = useRef<HTMLDivElement>(null);

  const [moveInDate, setMoveInDate]           = useState("");
  const [pincodeInput, setPincodeInput]       = useState("");

  // Featured properties data
  const [featuredProps, setFeaturedProps]     = useState<ApiProperty[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const featuredScrollRef = useRef<HTMLDivElement>(null);

  // Short-term properties data
  const [shortTermProps, setShortTermProps]     = useState<ApiProperty[]>([]);
  const [shortTermLoading, setShortTermLoading] = useState(true);
  const shortTermScrollRef = useRef<HTMLDivElement>(null);

  // Trending properties data
  const [trendingProps, setTrendingProps]     = useState<ApiProperty[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const trendingScrollRef = useRef<HTMLDivElement>(null);

  // Dynamic popular search chips (top views_count properties)
  const [popularChips, setPopularChips] = useState<Array<{ label: string; city: string; q: string }>>([]);

  // Real Dynamic City Cards & Real Property Count Data
  const [cityCards, setCityCards]             = useState<Array<{ name: string; count: string; img: string }>>([]);
  const [cityCountsMap, setCityCountsMap]     = useState<Record<string, number>>({});
  const [cityCardsLoading, setCityCardsLoading] = useState(true);
  const [totalCount, setTotalCount]           = useState<number>(0);
  // All cities that have at least one property (for CitySection rows)
  const [activeCities, setActiveCities]       = useState<string[]>([]);

  // View All Cities Modal state
  const [showCitiesModal, setShowCitiesModal] = useState(false);

  // ── Requirement wizard — show 3.5s after page load, for ALL users, once per session ──
  const [showWizard, setShowWizard] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already shown this session or user already made a choice — skip
    if (sessionStorage.getItem("nivaas_wizard_shown")) return;
    if (hasExistingChoice()) return;

    // Show for everyone (guests + logged-in) after 3.5s
    const t = setTimeout(() => {
      setShowWizard(true);
      sessionStorage.setItem("nivaas_wizard_shown", "1");
    }, 3500);

    return () => clearTimeout(t);
  }, []);

  // ── Rotating Hero Headline Typewriter Effect ────────────────────────────────
  const [displayText, setDisplayText] = useState("");
  const [textIndex, setTextIndex]     = useState(0);
  const [subIndex, setSubIndex]       = useState(0);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [isPaused, setIsPaused]       = useState(false);

  useEffect(() => {
    if (isPaused) {
      const pauseTimer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 1800);
      return () => clearTimeout(pauseTimer);
    }

    if (isDeleting) {
      if (subIndex === 0) {
        // Small pause at empty state before typing next word to eliminate jump effect
        const nextWordTimer = setTimeout(() => {
          setIsDeleting(false);
          setTextIndex(prev => (prev + 1) % ROTATING_HERO_TEXTS.length);
        }, 220);
        return () => clearTimeout(nextWordTimer);
      }
      const deleteTimer = setTimeout(() => {
        setSubIndex(prev => prev - 1);
        setDisplayText(ROTATING_HERO_TEXTS[textIndex].substring(0, subIndex - 1));
      }, 35);
      return () => clearTimeout(deleteTimer);
    }

    // Typing mode
    const targetWord = ROTATING_HERO_TEXTS[textIndex];
    if (subIndex === targetWord.length) {
      setIsPaused(true);
      return;
    }

    const typeTimer = setTimeout(() => {
      setSubIndex(prev => prev + 1);
      setDisplayText(targetWord.substring(0, subIndex + 1));
    }, 90);

    return () => clearTimeout(typeTimer);
  }, [subIndex, isDeleting, isPaused, textIndex]);

  // Fetch real properties & aggregate real counts by city
  useEffect(() => {
    propertiesApi.list({ limit: 1000 })
      .then(res => {
        const allProps = res.data ?? [];
        setTotalCount(res.count ?? allProps.length);
        setFeaturedProps(allProps.slice(0, 6));
        setTrendingProps(allProps.slice(0, 4));

        const st = allProps.filter(p => p.listing_type === "short_term");
        if (st.length > 0) setShortTermProps(st);

        // Group properties by city to calculate exact real counts
        const map = new Map<string, { count: number; img: string }>();
        const countsObj: Record<string, number> = {};

        allProps.forEach(p => {
          if (!p.city) return;
          const cityName = p.city.trim();
          if (!cityName) return;

          countsObj[cityName] = (countsObj[cityName] || 0) + 1;

          const cover = (p.images && p.images.length > 0 ? p.images[0] : p.cover_image_url) ||
            DEFAULT_CITY_IMAGES[cityName] ||
            "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80";

          const existing = map.get(cityName);
          if (existing) {
            existing.count += 1;
            if (!existing.img && cover) existing.img = cover;
          } else {
            map.set(cityName, { count: 1, img: cover });
          }
        });

        setCityCountsMap(countsObj);

        if (map.size > 0) {
          const cards = Array.from(map.entries()).map(([name, info]) => ({
            name,
            count: `${info.count} ${info.count === 1 ? "Property" : "Properties"}`,
            img: info.img,
          }));
          setCityCards(cards);
          // All cities that have properties, ordered by count descending
          setActiveCities(
            Array.from(map.entries())
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name]) => name)
          );
        } else {
          // Fallback list of cities showing 0 Properties if database is empty
          setCityCards([
            { name: "Ahmedabad",   count: "0 Properties", img: DEFAULT_CITY_IMAGES["Ahmedabad"] },
            { name: "Gandhinagar", count: "0 Properties", img: DEFAULT_CITY_IMAGES["Gandhinagar"] },
            { name: "Vadodara",    count: "0 Properties", img: DEFAULT_CITY_IMAGES["Vadodara"] },
            { name: "Surat",       count: "0 Properties", img: DEFAULT_CITY_IMAGES["Surat"] },
          ]);
          setActiveCities(["Ahmedabad", "Gandhinagar", "Vadodara", "Surat"]);
        }

        // Build dynamic popular chips from most-viewed properties
        setPopularChips(buildPopularChips(allProps));
      })
      .catch(() => {
        setFeaturedProps([]);
        setTrendingProps([]);
        setCityCards([
          { name: "Ahmedabad",   count: "0 Properties", img: DEFAULT_CITY_IMAGES["Ahmedabad"] },
          { name: "Gandhinagar", count: "0 Properties", img: DEFAULT_CITY_IMAGES["Gandhinagar"] },
          { name: "Vadodara",    count: "0 Properties", img: DEFAULT_CITY_IMAGES["Vadodara"] },
          { name: "Surat",       count: "0 Properties", img: DEFAULT_CITY_IMAGES["Surat"] },
        ]);
      })
      .finally(() => {
        setFeaturedLoading(false);
        setTrendingLoading(false);
        setCityCardsLoading(false);
      });

    propertiesApi.list({ listing_type: "short_term", limit: 50 })
      .then(res => {
        if (res.data && res.data.length > 0) {
          setShortTermProps(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setShortTermLoading(false);
      });
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) setShowCitySuggest(false);
      if (propTypeRef.current && !propTypeRef.current.contains(e.target as Node)) setShowPropType(false);
      if (budgetRef.current && !budgetRef.current.contains(e.target as Node)) setShowBudget(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Show cities that have actual properties first, then the full list — all filtered by input
  const allCitiesMerged = Array.from(new Set([...activeCities, ...cities]));
  const citySuggestions = locationInput.trim()
    ? allCitiesMerged.filter(c => c.toLowerCase().includes(locationInput.toLowerCase()))
    : allCitiesMerged;

  const clearBudget = () => { setBudgetLabel("Any Budget"); setBudgetMax(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const trimmedLoc = locationInput.trim();
    if (trimmedLoc) {
      const isCity = cities.some(c => c.toLowerCase() === trimmedLoc.toLowerCase());
      if (isCity) params.set("city", trimmedLoc);
      else        params.set("q", trimmedLoc);
    }
    if (heroTab === "Buy") params.set("listing_type", "sale");
    else if (heroTab === "Rent") params.set("listing_type", "rent");
    else if (heroTab === "PG / Co-living") params.set("listing_type", "pg");
    else if (heroTab === "Short-Term") params.set("listing_type", "short_term");
    else if (heroTab === "Commercial") params.set("property_type", "Office Space");

    if (propertyType && propertyType !== "All Type") params.set("property_type", propertyType);
    if (bedrooms && bedrooms !== "Any") params.set("bedrooms", bedrooms.replace(" BHK", "").trim());
    if (budgetMax !== null) params.set("max_price", String(budgetMax));
    if (moveInDate) params.set("available_from", moveInDate);
    if (pincodeInput.trim()) params.set("pincode", pincodeInput.trim());

    const qs = params.toString();
    window.location.href = `/properties${qs ? `?${qs}` : ""}`;
  };

  const scrollFeatured = (dir: "left" | "right") => {
    const amount = typeof window !== "undefined" && window.innerWidth < 640 ? 280 : 340;
    featuredScrollRef.current?.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const scrollShortTerm = (dir: "left" | "right") => {
    const amount = typeof window !== "undefined" && window.innerWidth < 640 ? 280 : 340;
    shortTermScrollRef.current?.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const scrollTrending = (dir: "left" | "right") => {
    trendingScrollRef.current?.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  // Combine DB cities + popular landmark cities list
  const modalCitiesList = Array.from(
    new Set([...Object.keys(cityCountsMap), ...POPULAR_CITIES_LIST])
  );

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: BG }}>
      <Navbar />

      {/* ── Requirement wizard — fires 3.5s after load on first visit ─────── */}
      {showWizard && (
        <RequirementWizard
          onComplete={(req: CustomerRequirements) => {
            saveRequirements(req);
            setShowWizard(false);
            window.location.href = "/properties";
          }}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* ── 1. HERO SECTION (Theme Background matching Website) ─────────────────── */}
      <section className="relative overflow-hidden min-h-0 sm:min-h-[calc(100vh-64px)] flex flex-col justify-start sm:justify-center pt-2 pb-4 sm:pt-16 sm:pb-28 lg:pt-20 lg:pb-32 bg-[#FAF6EE] text-[#1a1209]">
        {/* Building Sketch Background — Full width */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "url('/hero-sketch.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center center",
            opacity: 0.45,
          }}
        />


        <div className="relative z-10 max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 lg:gap-8 items-center">
          
          {/* Left Column: Heading + Subtitle + 3 Feature Badges */}
          <div className="lg:col-span-6 flex flex-col items-start gap-1.5 sm:gap-4">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.15] sm:leading-tight tracking-tight text-[#1a1209] font-display" style={{ fontFamily: "'Sora', sans-serif" }}>
              Find a place<br />
              you'll love to<br />
              <span className="text-[#C9921A] inline-inline relative min-h-[1.2em]">
                <span>{displayText || "\u00A0"}</span>
                <span className="inline-block w-[3px] h-[0.75em] bg-[#C9921A] ml-1 align-baseline animate-pulse" />
              </span>
            </h1>

            {/* Subtitle text - compact single line on mobile */}
            <p className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-base text-[#4a351a] font-medium max-w-lg mt-0.5 sm:mt-1 tracking-tight">
              <span className="text-[#1a1209] font-semibold">Verified Listings</span>
              <span className="text-[#C9921A] font-bold text-[10px] sm:text-xs select-none">•</span>
              <span className="text-[#1a1209] font-semibold">Genuine Owners</span>
              <span className="text-[#C9921A] font-bold text-[10px] sm:text-xs select-none">•</span>
              <span className="text-[#1a1209] font-semibold">Hassle-free Living</span>
            </p>

            {/* Feature Points Row - streamlined single horizontal row on mobile, wrapping without scrollbar on desktop */}
            <div
              className="flex items-center gap-1.5 sm:gap-3 mt-0.5 sm:mt-3 pt-1 sm:pt-3 border-t border-[#e8d9c0]/60 sm:border-[#e8d9c0]/80 overflow-x-auto sm:overflow-visible sm:flex-wrap scrollbar-hide no-scrollbar w-full py-0.5"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <div className="inline-flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3.5 sm:py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#e2d2b8] shadow-[0_2px_8px_-2px_rgba(26,18,9,0.06)] hover:border-[#C9921A] hover:bg-white transition-all shrink-0">
                <div className="flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#FFF3D6] to-[#FDE199] text-[#9E6D08] border border-[#E9CE8A]/60 shadow-2xs">
                  <ShieldCheck className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-[#9E6D08]" />
                </div>
                <span className="text-[11px] sm:text-[13px] font-bold text-[#1a1209] tracking-tight whitespace-nowrap">
                  <span className="sm:hidden">100% Verified</span>
                  <span className="hidden sm:inline">100% Verified Listings</span>
                </span>
              </div>
              <div className="inline-flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3.5 sm:py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#e2d2b8] shadow-[0_2px_8px_-2px_rgba(26,18,9,0.06)] hover:border-[#C9921A] hover:bg-white transition-all shrink-0">
                <div className="flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#FFF3D6] to-[#FDE199] text-[#9E6D08] border border-[#E9CE8A]/60 shadow-2xs">
                  <UserCheck className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-[#9E6D08]" />
                </div>
                <span className="text-[11px] sm:text-[13px] font-bold text-[#1a1209] tracking-tight whitespace-nowrap">
                  <span className="sm:hidden">Direct Owners</span>
                  <span className="hidden sm:inline">Direct Contact with Owners</span>
                </span>
              </div>
              <div className="inline-flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3.5 sm:py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#e2d2b8] shadow-[0_2px_8px_-2px_rgba(26,18,9,0.06)] hover:border-[#C9921A] hover:bg-white transition-all shrink-0">
                <div className="flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#FFF3D6] to-[#FDE199] text-[#9E6D08] border border-[#E9CE8A]/60 shadow-2xs">
                  <Key className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-[#9E6D08]" />
                </div>
                <span className="text-[11px] sm:text-[13px] font-bold text-[#1a1209] tracking-tight whitespace-nowrap">
                  <span className="sm:hidden">Zero Brokerage</span>
                  <span className="hidden sm:inline">Zero Brokerage Options</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Floating Luxury Golden Search Card */}
          <div className="lg:col-span-6 w-full">
            <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#BC8415] via-[#AB740E] to-[#916007] p-3 sm:p-6 shadow-[0_20px_50px_-10px_rgba(171,116,14,0.45),0_10px_25px_-5px_rgba(0,0,0,0.15)] border border-[#C9921A]/60">
              
              {/* Category Tabs inside Card */}
              <div className="flex items-center gap-3 sm:gap-6 border-b border-white/25 pb-2 mb-3 sm:pb-3 sm:mb-5 overflow-x-auto scrollbar-hide">
                {(["Buy", "Rent", "PG / Co-living", "Short-Term", "Commercial"] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setHeroTab(tab)}
                    className={`relative pb-1.5 sm:pb-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                      heroTab === tab ? "text-white font-extrabold drop-shadow-xs" : "text-white/80 hover:text-white"
                    }`}
                  >
                    {tab}
                    {heroTab === tab && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-white shadow-xs" />
                    )}
                  </button>
                ))}
              </div>

              {/* Form inputs grid - 2 columns on mobile so all 4 fit in 2 rows */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:gap-3">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  
                  {/* Location Field */}
                  <div ref={locationRef} className="relative rounded-xl sm:rounded-2xl bg-white p-2 sm:p-3 border border-[#e8d9c0] shadow-2xs hover:border-[#C9921A] transition-colors">
                    <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#a08858] block">Location</label>
                    <div className="flex items-center justify-between mt-0.5 sm:mt-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 w-full">
                        <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
                        <input
                          type="text"
                          value={locationInput}
                          onChange={e => { setLocationInput(e.target.value); setShowCitySuggest(true); }}
                          onFocus={() => setShowCitySuggest(true)}
                          placeholder="All cities"
                          className="bg-transparent text-xs sm:text-sm font-bold text-[#1a1209] outline-none w-full truncate placeholder:font-normal placeholder:text-[#a08858]"
                        />
                        {locationInput && (
                          <button type="button" onClick={() => { setLocationInput(""); setShowCitySuggest(true); }}
                            className="shrink-0 text-[#a08858] hover:text-[#1a1209] text-xs leading-none">✕</button>
                        )}
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#a08858] shrink-0 ml-1" onClick={() => setShowCitySuggest(o => !o)} style={{ cursor: "pointer" }} />
                    </div>

                    {showCitySuggest && citySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 w-[calc(200%+0.5rem)] sm:w-full mt-1.5 sm:mt-2 rounded-xl sm:rounded-2xl bg-white py-1 z-50 shadow-2xl max-h-56 overflow-y-auto border border-[#e8d9c0]">
                        {/* "All cities" option */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-left hover:bg-[#fef9f0] text-[#a08858] border-b border-[#f0e4cc]"
                          onClick={() => { setLocationInput(""); setShowCitySuggest(false); }}
                        >
                          <span className="h-6 w-6 rounded-md bg-[#fef3d4] text-[#C9921A] flex items-center justify-center font-bold text-xs">🌐</span>
                          <span>All Cities</span>
                        </button>
                        {citySuggestions.map(city => (
                          <button
                            key={city}
                            type="button"
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-left hover:bg-[#fef9f0] text-[#1a1209]"
                            onClick={() => { setLocationInput(city); setShowCitySuggest(false); }}
                          >
                            <span className="h-6 w-6 rounded-md bg-[#fef3d4] text-[#C9921A] flex items-center justify-center font-bold text-xs">{city[0]}</span>
                            <span>{city}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Property Type Field */}
                  <div ref={propTypeRef} className="relative rounded-xl sm:rounded-2xl bg-white p-2 sm:p-3 border border-[#e8d9c0] shadow-2xs hover:border-[#C9921A] transition-colors">
                    <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#a08858] block">Property Type</label>
                    <div className="flex items-center justify-between mt-0.5 sm:mt-1 cursor-pointer" onClick={() => setShowPropType(o => !o)}>
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
                        <span className="text-xs sm:text-sm font-bold text-[#1a1209] truncate">{propertyType}</span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#a08858] shrink-0" />
                    </div>

                    {showPropType && (
                      <div className="absolute top-full right-0 sm:left-0 w-[calc(200%+0.5rem)] sm:w-full mt-1.5 sm:mt-2 rounded-xl sm:rounded-2xl bg-white py-1 z-50 shadow-2xl border border-[#e8d9c0]">
                        {["All Type", "Apartment", "Villa", "PG", "Office Space", "Plot"].map(type => (
                          <button
                            key={type}
                            type="button"
                            className="w-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-left hover:bg-[#fef9f0] text-[#1a1209]"
                            onClick={() => { setPropertyType(type); setShowPropType(false); }}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Budget Field */}
                  <div ref={budgetRef} className="relative rounded-xl sm:rounded-2xl bg-white p-2 sm:p-3 border border-[#e8d9c0] shadow-2xs hover:border-[#C9921A] transition-colors">
                    <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#a08858] block">Budget</label>
                    <div className="flex items-center justify-between mt-0.5 sm:mt-1 cursor-pointer" onClick={() => setShowBudget(o => !o)}>
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
                        <span className="text-xs sm:text-sm font-bold text-[#1a1209] truncate">{budgetLabel}</span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#a08858] shrink-0" />
                    </div>

                    {showBudget && (
                      <div className="absolute top-full left-0 w-[calc(200%+0.5rem)] sm:w-full mt-1.5 sm:mt-2 rounded-xl sm:rounded-2xl bg-white py-1 z-50 shadow-2xl border border-[#e8d9c0]">
                        {BUDGET_PRESETS.map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            className="w-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-left hover:bg-[#fef9f0] text-[#1a1209]"
                            onClick={() => { setBudgetLabel(preset.label); setBudgetMax(preset.max); setShowBudget(false); }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pincode Field */}
                  <div className="rounded-xl sm:rounded-2xl bg-white p-2 sm:p-3 border border-[#e8d9c0] shadow-2xs hover:border-[#C9921A] transition-colors">
                    <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#a08858] block">Pincode</label>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                      <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={pincodeInput}
                        onChange={e => setPincodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="e.g. 380015"
                        className="bg-transparent text-xs sm:text-sm font-bold text-[#1a1209] outline-none w-full placeholder:font-normal placeholder:text-[#a08858]"
                      />
                      {pincodeInput && (
                        <button type="button" onClick={() => setPincodeInput("")}
                          className="shrink-0 text-[#a08858] hover:text-[#1a1209] text-xs leading-none">✕</button>
                      )}
                    </div>
                  </div>

                </div>

                {/* Submit Search Button */}
                <button
                  type="submit"
                  className="mt-1.5 sm:mt-2 w-full min-h-[42px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-[#1a1209] hover:bg-black text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] border border-black/20"
                >
                  <Search className="h-4 w-4 text-[#C9921A]" />
                  <span>Search</span>
                </button>
              </form>
            </div>

            {/* Popular Searches Chips below card — dynamic, based on most-viewed properties */}
            <div
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap scrollbar-hide no-scrollbar mt-2 sm:mt-4 py-0.5 w-full"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <span className="text-[11px] sm:text-xs text-[#7c6840] font-bold shrink-0">Popular:</span>
              {popularChips.length === 0 ? (
                // Skeleton placeholders while loading
                Array.from({ length: 4 }).map((_, i) => (
                  <span key={i} className="rounded-full bg-white/60 border border-[#e8d9c0] px-6 py-0.5 text-xs animate-pulse shrink-0" style={{ minWidth: 80, display: "inline-block" }}>&nbsp;</span>
                ))
              ) : (
                popularChips.map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setLocationInput(chip.city);
                      window.location.href = `/properties?city=${encodeURIComponent(chip.city)}&q=${encodeURIComponent(chip.q)}`;
                    }}
                    className="rounded-full bg-white hover:bg-[#fef9f0] border border-[#e8d9c0] hover:border-[#C9921A] px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-semibold text-[#1a1209] transition-colors shadow-xs shrink-0 whitespace-nowrap"
                  >
                    {chip.label}
                  </button>
                ))
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── Personalised match invite card ─────────────────────────────────── */}
      <HomeInviteCard onGetMatches={() => setShowWizard(true)} />

      {/* ── SHORT-TERM PROPERTIES SECTION (MIRRORED LAYOUT) ────────────────── */}
      <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-14 max-w-[1536px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-start">
          
          {/* Left Column (Desktop): Carousel of Property Cards */}
          <div className="order-2 lg:order-1 lg:col-span-8 relative">
            {shortTermLoading ? (
              <div className="flex gap-4 overflow-x-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-72 h-80 rounded-2xl bg-[#ede9fe]/40 animate-pulse" />
                ))}
              </div>
            ) : shortTermProps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#7C3AED]/30 p-8 text-center bg-[#faf5ff] flex flex-col items-center justify-center min-h-[220px]">
                <span className="text-3xl mb-2">⏱️</span>
                <p className="font-bold text-sm text-[#1a1209]">Short-Term Properties Coming Soon</p>
                <p className="text-xs text-[#836737] mt-1 max-w-sm">Stay flexible with weekly bookings and fully furnished homes across Gujarat and beyond.</p>
                <Link to="/properties" search={{ listing_type: "short_term" } as any} className="mt-4 px-5 py-2.5 rounded-full text-xs font-bold text-white bg-[#7C3AED] hover:bg-[#6d28d9] transition shadow-xs">
                  Browse Short-Term Stays →
                </Link>
              </div>
            ) : (
              <div className="relative group">
                {/* Navigation Arrows — on left and right sides of cards */}
                <button
                  type="button"
                  onClick={() => scrollShortTerm("left")}
                  className="flex absolute left-0.5 sm:-left-3 lg:-left-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] hover:bg-[#ede9fe] hover:text-[#7C3AED] hover:border-[#7C3AED] transition-all shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label="Previous short-term property"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollShortTerm("right")}
                  className="flex absolute right-0.5 sm:-right-3 lg:-right-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] hover:bg-[#ede9fe] hover:text-[#7C3AED] hover:border-[#7C3AED] transition-all shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label="Next short-term property"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Cards Scroll Track with touch snap on mobile */}
                <div
                  ref={shortTermScrollRef}
                  className="flex gap-3 sm:gap-5 overflow-x-auto pb-3 pt-1 px-4 -mx-4 sm:px-1 sm:mx-0 scrollbar-hide scroll-smooth snap-x snap-mandatory"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {shortTermProps.map(p => (
                    <div key={p.id} className="shrink-0 w-[66vw] min-w-[220px] max-w-[245px] sm:w-[245px] snap-start">
                      <PropertyCard p={p} fluid />
                    </div>
                  ))}
                  {/* Trailing spacer for clean mobile edge padding */}
                  <div className="w-4 sm:hidden shrink-0" aria-hidden="true" />
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Desktop): Heading + Subtitle + Button */}
          <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col items-start justify-between h-full lg:min-h-[200px]">
            <div className="w-full">
              <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#7C3AED] bg-[#ede9fe] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                    <span>⏱️</span> SHORT-TERM
                  </span>
                  <span className="h-0.5 w-6 sm:w-8 bg-[#7C3AED]" />
                </div>

                {/* Mobile View All Link */}
                <Link
                  to="/properties"
                  search={{ listing_type: "short_term" } as any}
                  className="lg:hidden inline-flex items-center gap-1 text-xs font-bold text-[#7C3AED] hover:underline"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <h2 className="text-xl sm:text-3xl font-extrabold text-[#1a1209] tracking-tight font-display leading-tight sm:leading-snug" style={{ fontFamily: "'Sora', sans-serif" }}>
                Flexible short-term<br className="hidden sm:inline" /> stays for you
              </h2>
              <p className="text-xs sm:text-sm text-[#836737] font-medium mt-1 sm:mt-2 max-w-sm">
                Fully furnished homes and apartments available for flexible stays from 1 week to 6 months.
              </p>
            </div>

            {/* Desktop View All Button */}
            <div className="hidden lg:flex mt-6 flex-col gap-4">
              <Link
                to="/properties"
                search={{ listing_type: "short_term" } as any}
                className="inline-flex items-center gap-2 rounded-full border border-[#7C3AED]/40 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-[#7C3AED] transition-all hover:border-[#7C3AED] hover:bg-[#ede9fe] shadow-xs"
              >
                <span>View All Short-Term</span>
                <ArrowRight className="h-4 w-4 text-[#7C3AED]" />
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ── 2. FEATURED PROPERTIES SECTION ─────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-14 max-w-[1536px] mx-auto w-full border-t border-[#e8d9c0]/60">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-start">
          
          {/* Left Column: Heading + Button + Nav arrows */}
          <div className="lg:col-span-4 flex flex-col items-start justify-between h-full lg:min-h-[220px]">
            <div className="w-full">
              <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#a08858]">
                    FEATURED PROPERTIES
                  </span>
                  <span className="h-0.5 w-6 sm:w-8 bg-[#C9921A]" />
                </div>

                {/* Mobile View All Link */}
                <Link
                  to="/properties"
                  className="lg:hidden inline-flex items-center gap-1 text-xs font-bold text-[#C9921A] hover:underline"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <h2 className="text-xl sm:text-3xl font-extrabold text-[#1a1209] tracking-tight font-display leading-tight sm:leading-snug" style={{ fontFamily: "'Sora', sans-serif" }}>
                Handpicked homes<br className="hidden sm:inline" /> for you
              </h2>
              <p className="text-xs sm:text-sm text-[#a08858] font-medium mt-1 sm:mt-2 max-w-sm">
                Explore premium properties that match your lifestyle and preferences.
              </p>
            </div>

            {/* Desktop Actions & Control Arrows */}
            <div className="hidden lg:flex mt-6 flex-col gap-4">
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 rounded-full border border-[#C9921A]/40 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-[#1a1209] transition-all hover:border-[#C9921A] hover:bg-[#fef9f0] shadow-xs"
              >
                <span>View All Properties</span>
                <ArrowRight className="h-4 w-4 text-[#C9921A]" />
              </Link>

              {/* Carousel Control Arrows */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => scrollFeatured("left")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-[#e8d9c0] text-[#1a1209] hover:bg-[#fef9f0] transition-colors shadow-xs cursor-pointer"
                  aria-label="Previous property"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => scrollFeatured("right")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-[#e8d9c0] text-[#1a1209] hover:bg-[#fef9f0] transition-colors shadow-xs cursor-pointer"
                  aria-label="Next property"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Carousel of Property Cards */}
          <div className="lg:col-span-8 overflow-visible">
            {featuredLoading ? (
              <div className="flex gap-4 overflow-x-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-72 h-80 rounded-2xl bg-[#f0e4cc] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="relative group">
                {/* Navigation Arrows — on left and right sides of cards */}
                <button
                  type="button"
                  onClick={() => scrollFeatured("left")}
                  className="flex absolute left-0.5 sm:-left-3 lg:-left-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] hover:bg-[#fef9f0] hover:text-[#C9921A] hover:border-[#C9921A] transition-all shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label="Previous featured property"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollFeatured("right")}
                  className="flex absolute right-0.5 sm:-right-3 lg:-right-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] hover:bg-[#fef9f0] hover:text-[#C9921A] hover:border-[#C9921A] transition-all shadow-[0_4px_16px_rgba(0,0,0,0.14)] hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label="Next featured property"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div
                  ref={featuredScrollRef}
                  className="flex gap-3 sm:gap-5 overflow-x-auto pb-3 pt-1 px-4 -mx-4 sm:px-0 sm:mx-0 scrollbar-hide scroll-smooth snap-x snap-mandatory"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {featuredProps.map(p => (
                    <div key={p.id} className="shrink-0 w-[66vw] min-w-[220px] max-w-[245px] sm:w-[245px] snap-start">
                      <PropertyCard p={p} fluid />
                    </div>
                  ))}
                  {/* Trailing spacer for clean mobile edge padding */}
                  <div className="w-4 sm:hidden shrink-0" aria-hidden="true" />
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* ── 3. EXPLORE BY CITY SECTION (Dynamic Real Available Properties Count) ── */}
      <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-14 max-w-[1536px] mx-auto w-full border-t border-[#e8d9c0]/60">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-center">
          
          {/* Left Column */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#a08858]">
                  EXPLORE BY CITY
                </span>
                <span className="h-0.5 w-6 sm:w-8 bg-[#C9921A]" />
              </div>

              {/* Mobile View All Link */}
              <button
                type="button"
                onClick={() => setShowCitiesModal(true)}
                className="lg:hidden inline-flex items-center gap-1 text-xs font-bold text-[#C9921A] hover:underline cursor-pointer"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <h2 className="text-xl sm:text-3xl font-extrabold text-[#1a1209] tracking-tight font-display leading-tight sm:leading-snug" style={{ fontFamily: "'Sora', sans-serif" }}>
              Find properties in<br className="hidden sm:inline" /> top cities
            </h2>

            {/* Desktop View All Button */}
            <button
              onClick={() => setShowCitiesModal(true)}
              className="hidden lg:inline-flex mt-5 items-center gap-2 rounded-full border border-[#C9921A]/40 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-[#1a1209] transition-all hover:border-[#C9921A] hover:bg-[#fef9f0] shadow-xs cursor-pointer"
            >
              <span>View All Cities</span>
              <ArrowRight className="h-4 w-4 text-[#C9921A]" />
            </button>
          </div>

          {/* Right Column: Dynamic Real City Cards */}
          <div
            className="lg:col-span-9 flex gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 px-4 -mx-4 sm:px-0 sm:mx-0 scrollbar-hide snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {cityCardsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 w-38 sm:w-52 h-38 sm:h-48 rounded-2xl bg-[#f0e4cc] animate-pulse" />
              ))
            ) : (
              cityCards.map(c => (
                <Link
                  key={c.name}
                  to="/properties/map"
                  search={{ city: c.name }}
                  className="group relative shrink-0 w-38 sm:w-52 h-38 sm:h-48 rounded-2xl overflow-hidden shadow-md transition-transform duration-300 hover:scale-105 snap-start"
                >
                  <img src={c.img} alt={c.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="absolute bottom-2.5 sm:bottom-3 left-3 sm:left-3.5 right-3 text-white">
                    <h3 className="text-sm sm:text-base font-extrabold tracking-tight font-display">{c.name}</h3>
                    <p className="text-[10px] sm:text-xs text-amber-300 font-bold">{c.count}</p>
                  </div>
                </Link>
              ))
            )}
          </div>

        </div>
      </section>

      {/* ── POPULAR CITIES MODAL OVERLAY (Reference Screenshot Design) ───────── */}
      {showCitiesModal && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 transition-opacity duration-300 animate-in fade-in"
          onClick={() => setShowCitiesModal(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-3xl bg-[#FAF6EE] p-6 sm:p-8 border border-[#e8d9c0] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#e8d9c0] shrink-0">
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-[#C9921A]" />
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#1a1209] font-display" style={{ fontFamily: "'Sora', sans-serif" }}>
                  Popular Cities
                </h3>
              </div>
              <button
                onClick={() => setShowCitiesModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-[#e8d9c0] text-[#836737] hover:text-[#1a1209] hover:bg-[#fef3d4] transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Subtitle */}
            <p className="text-xs sm:text-sm text-[#836737] font-semibold mt-3 shrink-0">
              Select a city to view all real available properties in that location:
            </p>

            {/* Grid of Cities with Landmark Line Art Icons */}
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5 sm:gap-4 py-5 overflow-y-auto flex-1 pr-1">
              {modalCitiesList.map(cityName => {
                const count = cityCountsMap[cityName] || 0;
                return (
                  <button
                    key={cityName}
                    type="button"
                    onClick={() => {
                      setShowCitiesModal(false);
                      window.location.href = `/properties/map?city=${encodeURIComponent(cityName)}`;
                    }}
                    className="group flex flex-col items-center justify-between p-2.5 sm:p-4 rounded-2xl bg-white border border-[#e8d9c0] hover:border-[#C9921A] hover:bg-[#fef3d4] transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md text-center min-h-[110px]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#faf6ee] group-hover:bg-white transition-colors">
                      <CityLandmarkIcon city={cityName} className="h-9 w-9 text-[#1a1209] group-hover:text-[#C9921A] transition-colors" />
                    </div>
                    <div className="mt-2.5">
                      <span className="block text-xs sm:text-sm font-bold text-[#1a1209] group-hover:text-[#C9921A] transition-colors leading-tight">
                        {cityName}
                      </span>
                      <span className={`block text-[10px] font-extrabold mt-1 px-2 py-0.5 rounded-full ${
                        count > 0 ? "bg-[#C9921A]/15 text-[#C9921A]" : "text-gray-400 bg-gray-100"
                      }`}>
                        {count > 0 ? `${count} ${count === 1 ? 'Property' : 'Properties'}` : "0 Properties"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-[#e8d9c0] flex items-center justify-between shrink-0 text-xs text-[#836737] font-semibold">
              <span>Showing real properties from backend database</span>
              <button
                type="button"
                onClick={() => setShowCitiesModal(false)}
                className="text-[#C9921A] font-bold hover:underline"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. THREE-COLUMN SECTION (WHY US / TRENDING / LOCALITIES) ────── */}
      <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-10 sm:py-14 max-w-[1536px] mx-auto w-full border-t border-[#e8d9c0]/60">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Card 1: WHY CHOOSE NIVAAS */}
          <div className="lg:col-span-4 rounded-3xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl bg-[#1a1209]">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#a08858]">WHY CHOOSE NIVAAS</span>
                <span className="h-0.5 w-6 bg-[#C9921A]" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight text-white font-display" style={{ fontFamily: "'Sora', sans-serif" }}>
                Real people.<br />Real properties.<br />Real trust.
              </h3>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-[#C9921A]/20 flex items-center justify-center text-[#C9921A]">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Direct Connect with Owners</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-[#C9921A]/20 flex items-center justify-center text-[#C9921A]">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">
                      {totalCount > 0 ? `${totalCount} Verified Properties Available` : "Verified Properties Available"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-[#C9921A]/20 flex items-center justify-center text-[#C9921A]">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Wide Range of Options</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-[#C9921A]/20 flex items-center justify-center text-[#C9921A]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Hassle-free Experience</p>
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/auth"
              className="mt-8 inline-flex items-center justify-between rounded-full border border-[#C9921A]/40 bg-white/5 px-5 py-3 text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
              <span>Know More About Us</span>
              <ArrowRight className="h-4 w-4 text-[#C9921A]" />
            </Link>
          </div>

          {/* Card 2: TRENDING PROPERTIES */}
          <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl bg-white p-3.5 sm:p-6 border border-[#e8d9c0] shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#a08858]">TRENDING PROPERTIES</span>
                <Link to="/properties" className="text-xs font-bold text-[#C9921A] hover:underline">View All</Link>
              </div>

              {trendingLoading ? (
                <div className="flex sm:grid sm:grid-cols-2 gap-3 overflow-x-auto pb-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-40 w-52 sm:w-auto shrink-0 sm:shrink rounded-xl bg-[#f0e4cc] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="relative group">
                  {/* Mobile Left & Right Arrows on the cards */}
                  <button
                    type="button"
                    onClick={() => scrollTrending("left")}
                    className="flex sm:hidden absolute left-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] shadow-md hover:text-[#C9921A] active:scale-90 cursor-pointer"
                    aria-label="Previous trending property"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollTrending("right")}
                    className="flex sm:hidden absolute right-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-[#e8d9c0] text-[#1a1209] shadow-md hover:text-[#C9921A] active:scale-90 cursor-pointer"
                    aria-label="Next trending property"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>

                  <div
                    ref={trendingScrollRef}
                    className="flex sm:grid sm:grid-cols-2 gap-3 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 px-3.5 -mx-3.5 sm:px-0 sm:mx-0 scrollbar-hide scroll-smooth snap-x snap-mandatory"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {trendingProps.map(p => (
                      <div key={p.id} className="w-[62vw] min-w-[200px] max-w-[230px] sm:w-auto shrink-0 sm:shrink snap-start">
                        <PropertyCard p={p} compact fluid />
                      </div>
                    ))}
                    <div className="w-2 sm:hidden shrink-0" aria-hidden="true" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: POPULAR LOCALITIES */}
          <div className="lg:col-span-3 rounded-2xl sm:rounded-3xl bg-white p-3.5 sm:p-6 border border-[#e8d9c0] shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a08858] block mb-3 sm:mb-4">
                POPULAR LOCALITIES
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {POPULAR_LOCALITY_CHIPS.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => { window.location.href = `/properties?q=${encodeURIComponent(loc)}`; }}
                    className="rounded-xl bg-[#faf6ee] hover:bg-[#fef3d4] border border-[#e8d9c0] px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-[#1a1209] transition-colors cursor-pointer"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            <Link
              to="/properties"
              className="mt-4 sm:mt-6 inline-flex items-center justify-between rounded-xl sm:rounded-2xl border border-[#e8d9c0] p-2.5 sm:p-3 text-xs font-bold text-[#1a1209] hover:bg-[#fef9f0] transition-colors"
            >
              <span>Explore All Localities</span>
              <ArrowRight className="h-4 w-4 text-[#C9921A]" />
            </Link>
          </div>

        </div>
      </section>

      {/* ── 5. CTA BANNER ────── */}
      <section className="mx-auto max-w-[1536px] w-full px-4 sm:px-6 lg:px-10 xl:px-12 my-5 sm:my-8">
        <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-white flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 sm:gap-6 shadow-xl bg-[#1a1209]">
          
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border border-[#C9921A]/40 bg-[#C9921A]/20 text-[#C9921A]">
              <HomeIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-extrabold text-white font-display">Have a property to sell or rent?</h3>
              <p className="text-xs sm:text-sm text-gray-300 mt-0.5">List your property and reach thousands of genuine buyers and tenants.</p>
            </div>
          </div>

          <button
            onClick={() => { window.location.href = "/dashboard/properties/new"; }}
            className="w-full lg:w-auto shrink-0 min-h-[44px] sm:min-h-[48px] rounded-xl px-5 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-extrabold text-white transition-all shadow-md hover:opacity-90 active:scale-95 cursor-pointer text-center"
            style={{ backgroundColor: GOLD }}
          >
            Post Your Property &rarr;
          </button>

          {/* Benefit icons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 pt-3 sm:pt-4 lg:pt-0 border-t lg:border-t-0 border-white/10 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-200">Quick Listing in 5 Mins</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-200">Maximum Visibility</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-200">Connect Directly</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C9921A] shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-200">Best Price Assistance</span>
            </div>
          </div>

        </div>
      </section>

      {/* ── 5b. RECENTLY VIEWED ─────────────────────────────────── */}
      <RecentlyViewedSection />

      {/* ── 5c. SIMILAR TO WHAT YOU VIEWED ──────────────────────── */}
      <SimilarToViewedSection />

      {/* ── 6. NEARBY EXPLORER ─────────────────────────────────── */}
      <NearbyExplorer />

      {/* ── 7. CITY-WISE PROPERTY ROWS — all cities with at least one property ── */}
      {activeCities.map(city => <CitySection key={city} city={city} />)}

      <Footer />
    </div>
  );
}

// ── Nearby Explorer — geolocation-based nearby places on home page ───────────

// Shared category definitions (mirrors the ones in properties.$id.tsx)
const HOME_NEARBY_CATS = [
  { label: "School / College",  icon: "🏫", amenity: ["school","college","university","kindergarten"] },
  { label: "Hospital / Clinic", icon: "🏥", amenity: ["hospital","clinic","doctors","pharmacy","dentist"] },
  { label: "Police Station",    icon: "🚓", amenity: ["police"] },
  { label: "Metro / Bus Stop",  icon: "🚌", amenity: ["bus_station"], extra: [{ k:"highway", v:"bus_stop" },{ k:"railway", v:"station" }] },
  { label: "Restaurant / Food", icon: "🍽️", amenity: ["restaurant","fast_food","cafe"] },
  { label: "ATM / Bank",        icon: "🏦", amenity: ["atm","bank"] },
];

function haversineKmHome(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const R=6371, dLat=((lat2-lat1)*Math.PI)/180, dLng=((lng2-lng1)*Math.PI)/180;
  const a=Math.sin(dLat/2)**2+Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function walkMins(km:number):string { const m=Math.round((km/5)*60); return m<2?"< 1 min":`${m} min`; }
function fmtDist(km:number):string { return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`; }

interface HomeNearbyItem { name:string; distKm:number; lat:number; lng:number; phone?:string; address?:string; }
interface HomeNearbyGroup { label:string; icon:string; items:HomeNearbyItem[]; }

async function fetchHomeNearby(lat:number,lng:number):Promise<HomeNearbyGroup[]> {
  const lines:string[]=[];
  for(const c of HOME_NEARBY_CATS){
    if(c.amenity.length) lines.push(`  nwr(around:3000,${lat},${lng})["amenity"~"^(${c.amenity.join("|")})$"]["name"];`);
    for(const e of (c.extra??[])) lines.push(`  nwr(around:3000,${lat},${lng})["${e.k}"="${e.v}"]["name"];`);
  }
  const q=`[out:json][timeout:25];\n(\n${lines.join("\n")}\n);\nout center qt;`;

  const endpoints=[
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  let data: { elements: any[] } | null = null;

  // 1. Try backend proxy first (avoids CORS + ISP blocks)
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 22000);
    const r = await fetch("/api/maps/overpass", {
      method: "POST", body: q,
      headers: { "Content-Type": "text/plain" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (r.ok) data = await r.json();
  } catch { /* fall through */ }

  // 2. Race direct mirrors as fallback
  if (!data) {
    const controllers = endpoints.map(() => new AbortController());
    const cleanup = (winner: number) =>
      controllers.forEach((c, i) => { if (i !== winner) c.abort(); });
    data = await Promise.any(
      endpoints.map((url, i) =>
        fetch(url, {
          method: "POST", body: q,
          headers: { "Content-Type": "text/plain" },
          signal: controllers[i].signal,
        }).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          cleanup(i);
          return r.json() as Promise<{ elements: any[] }>;
        })
      )
    );
  }

  const els: any[] = data?.elements ?? [];

  return HOME_NEARBY_CATS.map(cat=>{
    const matching=els.filter((el:any)=>{
      if(!el.tags) return false;
      const hasName = !!(el.tags.name || el.tags["name:en"] || el.tags["name:hi"]);
      if(!hasName) return false;
      if(cat.amenity.includes(el.tags.amenity??"")) return true;
      return (cat.extra??[]).some((e:any)=>el.tags[e.k]===e.v);
    });
    const items:HomeNearbyItem[]=matching.map((el:any)=>{
      const lat2=el.lat??el.center?.lat; const lng2=el.lon??el.center?.lon;
      if(lat2==null||lng2==null) return null;
      const addrParts=[el.tags["addr:housenumber"],el.tags["addr:street"],el.tags["addr:suburb"]||el.tags["addr:city"]].filter(Boolean);
      return {
        name: el.tags["name:en"]||el.tags.name||el.tags["name:hi"],
        distKm: haversineKmHome(lat,lng,lat2,lng2),
        lat:lat2, lng:lng2,
        phone: el.tags.phone||el.tags["contact:phone"]||el.tags["contact:mobile"]||undefined,
        address: addrParts.length?addrParts.join(", "):undefined,
      };
    }).filter(Boolean) as HomeNearbyItem[];
    const seen=new Set<string>();
    const deduped=items.filter(i=>{if(seen.has(i.name))return false;seen.add(i.name);return true;});
    deduped.sort((a,b)=>a.distKm-b.distKm);
    return { label:cat.label, icon:cat.icon, items:deduped.slice(0,5) };
  });
}

function NearbyExplorer() {
  type Status = "idle"|"requesting"|"loading"|"done"|"error"|"denied";
  const [status, setStatus]       = useState<Status>("idle");
  const [groups, setGroups]       = useState<HomeNearbyGroup[]>([]);
  const [nearbyProps, setNearbyProps] = useState<ApiProperty[]>([]);
  const [openLabel, setOpenLabel] = useState("");
  const [locationName, setLocationName] = useState("");
  const [errorDetail, setErrorDetail]   = useState("");

  const handleAllow = () => {
    if(!navigator.geolocation){ setStatus("error"); setErrorDetail("Geolocation not supported by your browser."); return; }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      async pos => {
        setStatus("loading");
        const { latitude: lat, longitude: lng } = pos.coords;

        // Reverse geocode for location name
        try {
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            {headers:{"Accept-Language":"en"}});
          const d=await r.json();
          setLocationName(d.address?.suburb||d.address?.neighbourhood||d.address?.city_district||d.address?.city||"your location");
        } catch { setLocationName("your location"); }

        // Check sessionStorage cache keyed by rounded coords
        const cacheKey = `home_nearby:${lat.toFixed(3)},${lng.toFixed(3)}`;
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const { amenityResult, props } = JSON.parse(cached);
            setGroups(amenityResult);
            setNearbyProps(props);
            setStatus("done");
            const first = amenityResult.find((g: HomeNearbyGroup) => g.items.length > 0);
            if (first) setOpenLabel(first.label);
            return;
          }
        } catch { /* ignore cache errors */ }

        // ~5 km bounding box (1° lat ≈ 111 km)
        const R = 0.045;
        const bboxFilters = {
          lat_min: lat - R, lat_max: lat + R,
          lng_min: lng - R, lng_max: lng + R,
          has_coords: "true" as const,
          limit: 12,
        };

        try {
          const [amenityResult, propResult] = await Promise.all([
            fetchHomeNearby(lat, lng),
            propertiesApi.list(bboxFilters).catch(() => ({ data: [], count: 0 })),
          ]);

          const sorted = (propResult.data ?? [])
            .filter(p => p.latitude && p.longitude)
            .map(p => ({
              ...p,
              _dist: haversineKmHome(lat, lng, Number(p.latitude), Number(p.longitude)),
            }))
            .sort((a, b) => a._dist - b._dist)
            .slice(0, 12);

          // Cache for this session
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ amenityResult, props: sorted })); } catch { /* ignore */ }

          setGroups(amenityResult);
          setNearbyProps(sorted);
          setStatus("done");
          const first = amenityResult.find(g => g.items.length > 0);
          if (first) setOpenLabel(first.label);
        } catch(e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setErrorDetail(
            msg.includes("429") ? "Overpass API is rate-limited. Please wait a moment and try again."
            : msg.includes("AggregateError") || msg.includes("All promises") ? "All map data servers are currently unavailable. Please try again shortly."
            : "Could not load nearby places. Please check your connection and try again."
          );
          setStatus("error");
        }
      },
      err => {
        if(err.code === 1) { setStatus("denied"); }
        else { setStatus("error"); setErrorDetail("Location could not be determined. Please try again."); }
      },
      { enableHighAccuracy:false, timeout:10000, maximumAge:300000 }
    );
  };

  const toggle=(label:string)=>setOpenLabel(p=>p===label?"":label);

  return (
    <section style={{ backgroundColor: BG }} className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-12 max-w-[1536px] mx-auto w-full">

      {/* ── Idle / Requesting / Loading / Denied / Error — hero card ── */}
      {status !== "done" && (
        <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs"
          style={{ border: "1.5px solid #e8d9c0", backgroundColor: "#fff" }}>
          <div className="flex flex-col sm:flex-row items-stretch">

            {/* LEFT — compact illustrated panel (full banner width on mobile) */}
            <div className="relative flex items-end justify-center overflow-hidden shrink-0 w-full sm:w-[clamp(140px,28%,220px)] h-28 sm:h-auto min-h-[110px]"
              style={{ backgroundColor: "#fdf0e0" }}>
              <div className="absolute inset-0"
                style={{ background: "linear-gradient(180deg,#fde8c8 0%,#fdf0e0 100%)" }} />
              {/* Clouds */}
              <svg className="absolute top-2 left-3 opacity-60" width="40" height="14" viewBox="0 0 64 22" fill="none">
                <ellipse cx="32" cy="14" rx="30" ry="8" fill="#f5d9a8"/>
                <ellipse cx="20" cy="12" rx="14" ry="7" fill="#f7e0b4"/>
                <ellipse cx="46" cy="10" rx="16" ry="7" fill="#f7e0b4"/>
              </svg>
              {/* Hills */}
              <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 500 160" preserveAspectRatio="none" height="70">
                <ellipse cx="120" cy="160" rx="180" ry="80" fill="#e8c48a"/>
                <ellipse cx="380" cy="160" rx="200" ry="90" fill="#ddb87a"/>
                <ellipse cx="250" cy="180" rx="280" ry="90" fill="#c9a05a"/>
              </svg>
              {/* Pin */}
              <svg className="absolute z-10" style={{ bottom: 26, left: "50%", transform: "translateX(-50%)" }}
                width="36" height="46" viewBox="0 0 72 90">
                <path d="M36 82 C36 82 8 52 8 32 C8 16.5 20.5 4 36 4 C51.5 4 64 16.5 64 32 C64 52 36 82 36 82Z"
                  fill="#b87a2a" stroke="#a06020" strokeWidth="1.5"/>
                <circle cx="36" cy="30" r="12" fill="#fff" opacity="0.95"/>
                <circle cx="36" cy="30" r="6" fill="#b87a2a"/>
              </svg>
              {/* 3 small icon bubbles */}
              <div className="absolute z-10 flex items-center justify-center rounded-full bg-white shadow left-[20%] sm:left-[14%]"
                style={{ bottom: 52, width: 22, height: 22, border: "1.5px solid #e8c48a" }}>
                <span style={{ fontSize: 11 }}>🏫</span>
              </div>
              <div className="absolute z-10 flex items-center justify-center rounded-full bg-white shadow left-[30%] sm:left-[20%]"
                style={{ bottom: 30, width: 20, height: 20, border: "1.5px solid #e8c48a" }}>
                <span style={{ fontSize: 10 }}>🏥</span>
              </div>
              <div className="absolute z-10 flex items-center justify-center rounded-full bg-white shadow left-[42%] sm:left-[38%]"
                style={{ bottom: 16, width: 20, height: 20, border: "1.5px solid #e8c48a" }}>
                <span style={{ fontSize: 10 }}>🚓</span>
              </div>
              <div className="absolute z-10 flex items-center justify-center rounded-full bg-white shadow right-[20%] sm:right-[14%]"
                style={{ bottom: 32, width: 22, height: 22, border: "1.5px solid #e8c48a" }}>
                <span style={{ fontSize: 11 }}>🏦</span>
              </div>
            </div>

            {/* RIGHT — compact text + action */}
            <div className="flex flex-1 flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 sm:px-8 sm:py-4">
              {/* Text block */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-[#a08858]">
                    DISCOVER NEARBY
                  </span>
                  <span className="h-0.5 w-5 shrink-0 bg-[#C9921A]" />
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#1a1209] leading-tight"
                  style={{ fontFamily: "'Sora',sans-serif" }}>
                  What's near you?
                </h2>
                <p className="text-xs text-[#836737] mt-0.5 leading-relaxed max-w-sm">
                  Schools, hospitals, police stations and more — around your current location.
                </p>
              </div>

              {/* Action */}
              <div className="w-full sm:w-auto shrink-0 flex flex-col items-start gap-1.5 pt-1 sm:pt-0">
                {(status === "idle" || status === "denied" || status === "error") && (
                  <>
                    {(status === "denied" || status === "error") && (
                      <p className="text-[10px] text-[#92400e] mb-1">
                        {status === "denied"
                          ? "Location access denied — please allow it in your browser settings."
                          : errorDetail || "Something went wrong. Please try again."}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleAllow}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-95 cursor-pointer whitespace-nowrap"
                      style={{ backgroundColor: GOLD }}
                    >
                      <Navigation className="h-4 w-4" />
                      <span>Use my location</span>
                    </button>
                    <p className="text-[9px] text-[#a08858]">
                      Your location is never stored or shared.
                    </p>
                  </>
                )}
                {(status === "requesting" || status === "loading") && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: GOLD }} />
                    <span className="text-xs font-semibold text-[#1a1209]">
                      {status === "requesting" ? "Waiting for permission…" : "Finding places…"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Results state ── */}
      {status === "done" && (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#a08858" }}>
                  DISCOVER NEARBY
                </span>
                <span className="h-0.5 w-8" style={{ backgroundColor: GOLD }} />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#1a1209]" style={{ fontFamily: "'Sora',sans-serif" }}>
                What's near you?
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {locationName && (
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "#fef3d4", color: GOLD, border: "1px solid #e8d9c0" }}>
                  <MapPin className="h-3 w-3" />
                  {locationName}
                </div>
              )}
              <button type="button" onClick={() => setStatus("idle")}
                className="text-xs font-semibold hover:underline" style={{ color: "#a08858" }}>
                Change location
              </button>
            </div>
          </div>

          {/* ── Nearby Properties ── */}
          {nearbyProps.length > 0 && (
            <div className="mb-7">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "#1a1209" }}>
                    🏠 Properties near you
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "#fef3d4", color: GOLD }}>
                    {nearbyProps.length}
                  </span>
                </div>
                <Link
                  to="/properties/map"
                  className="text-xs font-semibold flex items-center gap-1 hover:underline"
                  style={{ color: GOLD }}
                >
                  View on map <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Horizontal scroll carousel */}
              <div
                className="flex gap-3 overflow-x-auto pb-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
              >
                {nearbyProps.map(p => (
                  <div key={p.id} className="shrink-0 w-[240px]">
                    <PropertyCard p={p} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {nearbyProps.length === 0 && (
            <div className="mb-6 rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ border: "1px solid #e8d9c0", backgroundColor: "#fff" }}>
              <span className="text-xl shrink-0">🏠</span>
              <div>
                <p className="text-sm font-semibold text-[#1a1209]">No properties listed near you yet</p>
                <p className="text-xs mt-0.5" style={{ color: "#a08858" }}>
                  Be the first to list a property in your area.{" "}
                  <a href="/dashboard/properties/new" className="font-bold hover:underline" style={{ color: GOLD }}>
                    Post now →
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* ── Nearby Amenities accordion ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.filter(g => g.items.length > 0).map(group => {
              const isOpen = openLabel === group.label;
              const hasItems = group.items.length > 0;
              const nearest = hasItems ? group.items[0] : null;
              return (
                <div key={group.label} className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    border: `1.5px solid ${isOpen ? GOLD : "#e8d9c0"}`,
                    backgroundColor: "#fff",
                    boxShadow: isOpen ? "0 4px 16px -4px rgba(201,146,26,0.18)" : "none",
                  }}>
                  {/* Header */}
                  <button type="button" onClick={() => toggle(group.label)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3.5 transition-colors"
                    style={{ backgroundColor: isOpen ? "#fef9f0" : "#fff" }}
                    aria-expanded={isOpen}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{group.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1a1209] truncate">{group.label}</p>
                        {nearest && !isOpen && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: "#a08858" }}>
                            Nearest: {fmtDist(nearest.distKm)}
                          </p>
                        )}
                      </div>
                      {hasItems && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: "#fef3d4", color: GOLD }}>
                          {group.items.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!hasItems && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#f5ede0", color: "#a08858" }}>none nearby</span>
                      )}
                      <ChevronRight className="h-4 w-4 transition-transform duration-200"
                        style={{ color: "#a08858", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
                    </div>
                  </button>
                  {/* Body */}
                  {isOpen && (
                    <div className="border-t" style={{ borderColor: "#f0e4cc", backgroundColor: "#faf6ee" }}>
                      {hasItems ? (
                        <ul className="divide-y" style={{ borderColor: "#f0e4cc" }}>
                          {group.items.map((item, idx) => {
                            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}&ll=${item.lat},${item.lng}`;
                            return (
                              <li key={idx}>
                                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center justify-between gap-3 px-4 py-3 no-underline hover:bg-[#fef3d4] transition-colors">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                      style={{ backgroundColor: idx === 0 ? GOLD : "#c8b08a" }}>{idx + 1}</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold truncate text-[#1a1209]">{item.name}</p>
                                      {item.address && (
                                        <p className="text-[10px] truncate mt-0.5" style={{ color: "#a08858" }}>{item.address}</p>
                                      )}
                                      {item.phone && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <Phone className="h-3 w-3" style={{ color: GOLD }} />
                                          <span className="text-[10px] font-semibold" style={{ color: "#1a1209" }}>{item.phone}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-xs font-bold" style={{ color: GOLD }}>{fmtDist(item.distKm)}</p>
                                    <p className="text-[10px]" style={{ color: "#a08858" }}>{walkMins(item.distKm)} walk</p>
                                  </div>
                                </a>
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
        </>
      )}
    </section>
  );
}

// ── Recently Viewed Section ────────────────────────────────────────────────
function RecentlyViewedSection() {
  const items = useRecentlyViewed(72, 12);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => updateArrows());
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items]);

  const scroll = (dir: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: dir === "left" ? -360 : 360, behavior: "smooth" });

  // Only render once the user has at least one viewed property
  if (items.length === 0) return null;

  return (
    <section
      className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10 max-w-[1536px] mx-auto w-full"
      style={{ backgroundColor: BG }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "#fef3d4" }}
          >
            <History className="h-4 w-4" style={{ color: GOLD }} />
          </div>
          <div className="min-w-0">
            <h2
              className="font-extrabold text-lg sm:text-xl md:text-2xl leading-tight tracking-tight text-[#1a1209]"
              style={{ fontFamily: "'Sora',sans-serif" }}
            >
              Recently <span style={{ color: GOLD }}>Viewed</span>
            </h2>
            <p className="text-xs sm:text-sm mt-0.5 font-medium text-[#a08858]">
              Pick up where you left off
            </p>
          </div>
        </div>

        {/* Prev / Next arrows */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 disabled:opacity-30 hover:scale-110 active:scale-95 shadow-xs"
            style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}
            aria-label="Scroll left"
          >
            <svg className="h-4 w-4" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 disabled:opacity-30 hover:scale-110 active:scale-95 shadow-xs"
            style={{ borderColor: "#e8d9c0", backgroundColor: "#fff" }}
            aria-label="Scroll right"
          >
            <svg className="h-4 w-4" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable carousel */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 lg:gap-5 overflow-x-auto pb-4 pt-1 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {items.map(item => (
            <RecentlyViewedCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentlyViewedCard({ item }: { item: ViewedProperty }) {
  const img = item.images?.[0] ?? item.cover_image_url;
  const price = item.price
    ? item.listing_type === "sale"
      ? `₹${(item.price / 100_000).toFixed(0)}L`
      : `₹${item.price.toLocaleString("en-IN")}/mo`
    : null;

  const label = [
    item.bedrooms && item.bedrooms > 0 ? `${item.bedrooms} BHK` : null,
    item.property_type,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      to="/properties/$id"
      params={{ id: item.id }}
      className="shrink-0 group flex flex-col overflow-hidden rounded-2xl bg-white border border-[#e8d9c0] transition-all duration-200 hover:shadow-[0_12px_28px_-6px_rgba(201,146,26,0.22)] hover:-translate-y-1 hover:border-[#C9921A] focus-within:ring-2 focus-within:ring-[#C9921A]"
      style={{ width: 240, height: 274.33, minWidth: 240, maxWidth: 240, minHeight: 274.33, maxHeight: 274.33 }}
    >
      {/* Image area — fixed height 160px */}
      <div className="relative overflow-hidden w-full bg-[#fcebd1]/40 shrink-0" style={{ height: 160 }}>
        {img ? (
          <img
            src={img}
            alt={item.title}
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#fef3d4]/50">
            <svg className="h-8 w-8 text-[#C9921A]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9zM8.25 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm9.19 4.5l-3.44-3.44a.75.75 0 00-1.06 0l-2.5 2.5-1.19-1.19a.75.75 0 00-1.06 0L6 15" />
            </svg>
            <span className="text-[10px] text-[#C9921A]/80 font-medium">No photo</span>
          </div>
        )}

        {/* Type badge top-left */}
        <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)] z-10">
          <span
            className="block max-w-full rounded-full px-2.5 py-0.5 text-[10px] font-semibold leading-tight truncate shadow-2xs border border-[#C9921A]/25"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#1a1209", backdropFilter: "blur(4px)" }}
          >
            {label}
          </span>
        </div>
      </div>

      {/* Info section — fixed remaining space */}
      <div
        className="px-2.5 py-2 flex flex-col min-w-0 justify-between overflow-hidden"
        style={{ height: 114.33 }}
      >
        <div className="min-w-0">
          {/* Locality */}
          <p className="truncate text-[10px] font-medium" style={{ color: "#a08858" }}>
            {item.locality ? `${item.locality}, ` : ""}{item.city}
          </p>

          {/* Title — single line ellipsis so dimensions never change */}
          <p
            className="mt-0.5 text-[11px] font-bold leading-tight truncate group-hover:text-[#C9921A] transition-colors"
            style={{ color: "#1a1209" }}
            title={item.title}
          >
            {item.title}
          </p>
        </div>

        {/* Price */}
        {price && (
          <div className="pt-1 flex items-center gap-1 min-w-0 overflow-hidden border-t border-[#e8d9c0]/80 mt-auto">
            <span className="text-[11px] sm:text-xs font-extrabold shrink-0 truncate" style={{ color: GOLD }}>
              {price}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Similar to What You Viewed ────────────────────────────────────────────────
function SimilarToViewedSection() {
  const recentItems = useRecentlyViewed(72, 1);
  const seedId = recentItems[0]?.id;

  if (!seedId) return null;

  return (
    <section
      className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10 max-w-[1536px] mx-auto w-full"
      style={{ backgroundColor: BG }}
    >
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5 sm:mb-6">
        <div
          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "#fef3d4" }}
        >
          <LayoutGrid className="h-4 w-4" style={{ color: GOLD }} />
        </div>
        <div>
          <h2
            className="font-extrabold text-lg sm:text-xl md:text-2xl leading-tight tracking-tight text-[#1a1209]"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Because you <span style={{ color: GOLD }}>viewed</span>
          </h2>
          <p className="text-xs sm:text-sm mt-0.5 font-medium text-[#a08858]">
            Similar properties you might like
          </p>
        </div>
      </div>

      {/* Reuse the existing SimilarProperties component — it renders a scrollable grid */}
      <SimilarPropertiesCarousel propertyId={seedId} />
    </section>
  );
}

/** Wraps SimilarProperties in a horizontal scroll carousel for the homepage */
function SimilarPropertiesCarousel({ propertyId }: { propertyId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [items, setItems] = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    import("@/lib/recommendations-api").then(({ recommendationsApi }) =>
      recommendationsApi.similar(propertyId, 10)
    ).then(res => {
      if (!cancelled) { setItems(res.data ?? []); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [propertyId]);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => updateArrows());
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items]);

  const scroll = (dir: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: dir === "left" ? -360 : 360, behavior: "smooth" });

  if (loading) {
    return (
      <div className="flex gap-3 sm:gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 w-[200px] sm:w-[220px] md:w-[240px] lg:w-[260px] rounded-2xl animate-pulse"
            style={{ height: 280, backgroundColor: "#f0e4cc" }}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="relative group">
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute -left-2 sm:-left-4 lg:-left-5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 border border-[#e8d9c0]"
          aria-label="Scroll left"
        >
          <svg className="h-5 w-5" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute -right-2 sm:-right-4 lg:-right-5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 border border-[#e8d9c0]"
          aria-label="Scroll right"
        >
          <svg className="h-5 w-5" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 lg:gap-5 overflow-x-auto pb-4 pt-1 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {items.map(p => (
          <div key={p.id} className="shrink-0 w-[240px]">
            <PropertyCard p={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── City Section ──────────────────────────────────────────────────────────────
const CAROUSEL_THRESHOLD = 6;

function CitySection({ city }: { city: string }) {
  const [props, setProps]     = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    propertiesApi.list({ city, limit: 100 })
      .then(res => setProps(res.data))
      .catch(() => setProps([]))
      .finally(() => setLoading(false));
  }, [city]);

  const isCarousel = props.length > CAROUSEL_THRESHOLD;

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => updateArrows());
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [props]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -360 : 360, behavior: "smooth" });
  };

  if (!loading && props.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 lg:py-10 max-w-[1536px] mx-auto w-full" style={{ backgroundColor: BG }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div className="min-w-0">
          <h2 className="font-extrabold text-lg sm:text-xl md:text-2xl leading-tight tracking-tight text-[#1a1209]" style={{ fontFamily: "'Sora',sans-serif" }}>
            Popular stays in <span style={{ color: GOLD }}>{city}</span>
          </h2>
          <p className="text-xs sm:text-sm mt-1 font-medium text-[#a08858]">
            Handpicked homes for your perfect stay
          </p>
        </div>
        <Link
          to="/properties/map"
          search={{ city }}
          className="shrink-0 flex items-center gap-1.5 rounded-full px-4 sm:px-5 py-2 min-h-[44px] text-xs sm:text-sm font-semibold transition-all duration-200 hover:border-[#C9921A] hover:text-[#C9921A] shadow-2xs border border-[#e8d9c0] bg-white text-[#C9921A]"
        >
          <span>View all</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[240px] h-[274.33px] rounded-2xl animate-pulse"
              style={{ backgroundColor: "#f0e4cc" }}
            />
          ))}
        </div>
      )}

      {/* ── All counts → scrollable carousel with arrows (consistent card sizes) ── */}
      {!loading && (
        <div className="relative group">
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute -left-2 sm:-left-4 lg:-left-5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 border border-[#e8d9c0]"
              aria-label="Scroll left"
            >
              <svg className="h-5 w-5" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute -right-2 sm:-right-4 lg:-right-5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 border border-[#e8d9c0]"
              aria-label="Scroll right"
            >
              <svg className="h-5 w-5" fill="none" stroke="#1a1209" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div
            ref={scrollRef}
            className="flex gap-3 sm:gap-4 lg:gap-5 overflow-x-auto pb-4 pt-1 scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
          >
            {props.map(p => (
              <div
                key={p.id}
                className="shrink-0 w-[240px]"
              >
                <PropertyCard p={p} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
