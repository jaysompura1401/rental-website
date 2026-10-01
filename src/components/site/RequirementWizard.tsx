/**
 * RequirementWizard.tsx — Multi-step requirement collection modal
 * Step 0: Intent (Rent/Buy/PG) + Property type
 * Step 1: Configuration (BHK / beds / cabins)
 * Step 2: Location + Budget
 * Step 3: Furnishing + Amenities
 * Step 4 (NEW): Name + Phone → Save to DB + Show matches
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  X, ArrowRight, ArrowLeft, Sparkles,
  MapPin, Building2, Check, BedDouble,
  Wallet, Star, User, Phone, Loader2,
} from "lucide-react";
import {
  type CustomerRequirements,
  saveRequirements,
} from "@/lib/requirement-match";
import { cities } from "@/lib/mock-properties";
import { API_BASE } from "@/lib/api";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD        = "#C9921A";
const GOLD_LIGHT  = "#fef3d4";
const GOLD_BORDER = "#e8d9c0";
const DARK        = "#1a1209";
const MUTED       = "#836737";
const BG          = "#FAF6EE";
const TOTAL_STEPS = 5;

// ─── Step dot indicator ────────────────────────────────────────────────────────
function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className="transition-all duration-300 rounded-full"
          style={{
            width:           i === step ? 20 : 6,
            height:          6,
            backgroundColor: i <= step ? GOLD : GOLD_BORDER,
            opacity:         i < step ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Tile card ────────────────────────────────────────────────────────────────
function TileCard({
  emoji, label, sub, selected, onClick, wide = false,
}: {
  emoji: string; label: string; sub?: string;
  selected: boolean; onClick: () => void; wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-5 px-3 transition-all duration-200 ${wide ? "col-span-2" : ""}`}
      style={{
        borderColor:     selected ? GOLD : GOLD_BORDER,
        backgroundColor: selected ? GOLD_LIGHT : "#fff",
        boxShadow:       selected ? "0 4px 16px rgba(201,146,26,0.18)" : "0 1px 4px rgba(26,18,9,0.04)",
        transform:       selected ? "translateY(-2px)" : undefined,
      }}
    >
      {selected && (
        <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: GOLD }}>
          <Check className="h-3 w-3 text-white" />
        </span>
      )}
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="text-xs font-bold text-center leading-tight" style={{ color: DARK }}>{label}</span>
      {sub && <span className="text-[10px] text-center leading-tight" style={{ color: MUTED }}>{sub}</span>}
    </button>
  );
}

// ─── Budget chip ──────────────────────────────────────────────────────────────
function BudgetChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3.5 py-2 text-xs font-semibold transition-all duration-150"
      style={{
        borderColor:     selected ? GOLD : GOLD_BORDER,
        backgroundColor: selected ? GOLD : "#fff",
        color:           selected ? "#fff" : MUTED,
        boxShadow:       selected ? "0 2px 8px rgba(201,146,26,0.25)" : undefined,
        transform:       selected ? "scale(1.04)" : undefined,
      }}
    >
      {label}
    </button>
  );
}

// ─── Amenity chip ─────────────────────────────────────────────────────────────
function AmenityChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all duration-150"
      style={{
        borderColor:     selected ? GOLD : GOLD_BORDER,
        backgroundColor: selected ? GOLD_LIGHT : "#fff",
        color:           selected ? DARK : MUTED,
      }}
    >
      {selected && <Check className="h-3 w-3 shrink-0" style={{ color: GOLD }} />}
      {label}
    </button>
  );
}

// ─── Budget presets ────────────────────────────────────────────────────────────
const BUDGET_PRESETS_RENT = [
  { label: "Under ₹10k",  min: 0,       max: 10_000  },
  { label: "₹10k–₹20k",  min: 10_000,  max: 20_000  },
  { label: "₹20k–₹35k",  min: 20_000,  max: 35_000  },
  { label: "₹35k–₹60k",  min: 35_000,  max: 60_000  },
  { label: "₹60k–₹1L",   min: 60_000,  max: 100_000 },
  { label: "Above ₹1L",   min: 100_000, max: 0       },
];
const BUDGET_PRESETS_BUY = [
  { label: "Under ₹25L",  min: 0,           max: 2_500_000   },
  { label: "₹25L–₹50L",  min: 2_500_000,   max: 5_000_000   },
  { label: "₹50L–₹1Cr",  min: 5_000_000,   max: 10_000_000  },
  { label: "₹1Cr–₹2Cr",  min: 10_000_000,  max: 20_000_000  },
  { label: "Above ₹2Cr",  min: 20_000_000,  max: 0           },
];
const BUDGET_PRESETS_SHORT_TERM = [
  { label: "Under ₹5k/wk",  min: 0,      max: 5_000  },
  { label: "₹5k–₹10k/wk",   min: 5_000,  max: 10_000 },
  { label: "₹10k–₹20k/wk",  min: 10_000, max: 20_000 },
  { label: "₹20k–₹35k/wk",  min: 20_000, max: 35_000 },
  { label: "Above ₹35k/wk", min: 35_000, max: 0      },
];

const AMENITY_OPTIONS = [
  "Parking", "Gym", "Swimming Pool", "Lift / Elevator",
  "Power Backup", "Security / CCTV", "Club House",
  "Garden / Park", "Wi-Fi / Broadband", "Gas Pipeline",
];

const EMPTY_REQ: CustomerRequirements = {
  listing_type: "", property_type: "", bedrooms: null,
  beds: null, cabins: null, hasPool: false,
  location: "", budget: [0, 0], furnished: "", amenities: [], notes: "",
};

// ─── Step meta ─────────────────────────────────────────────────────────────────
const STEP_META = [
  { label: "What are you looking for?", sub: "Pick the type of property you need.",    icon: <Sparkles className="h-5 w-5" /> },
  { label: "Configuration",             sub: "Tell us what you need inside.",           icon: <BedDouble className="h-5 w-5" /> },
  { label: "Location & budget",         sub: "Where and how much?",                    icon: <Wallet className="h-5 w-5" /> },
  { label: "Final preferences",         sub: "Almost done — just a few more.",         icon: <Star className="h-5 w-5" /> },
  { label: "Almost there!",             sub: "Enter your details to see your matches.", icon: <User className="h-5 w-5" /> },
];

// ─── Main component ────────────────────────────────────────────────────────────
interface RequirementWizardProps {
  onComplete: (req: CustomerRequirements) => void;
  onClose:    () => void;
}

export function RequirementWizard({ onComplete, onClose }: RequirementWizardProps) {
  const [step,     setStep]     = useState(0);
  const [req,      setReq]      = useState<CustomerRequirements>(EMPTY_REQ);
  const [locInput, setLocInput] = useState("");
  const [name,     setName]     = useState("");
  const [phone,    setPhone]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const update = <K extends keyof CustomerRequirements>(key: K, val: CustomerRequirements[K]) =>
    setReq(prev => ({ ...prev, [key]: val }));

  const toggleAmenity = (a: string) =>
    setReq(prev => ({
      ...prev,
      amenities: prev.amenities.includes(a)
        ? prev.amenities.filter(x => x !== a)
        : [...prev.amenities, a],
    }));

  // Step 0 requires listing_type + property_type
  // Step 4 requires name + phone
  const canAdvance = () => {
    if (step === 0) return !!req.listing_type && !!req.property_type;
    if (step === 4) return name.trim().length > 0 && phone.trim().length >= 7;
    return true;
  };

  const handleFinish = async () => {
    setSaving(true);
    setApiError("");
    const finalReq = { ...req, location: locInput.trim() };

    // Save lead to DB
    try {
      await fetch(`${API_BASE}/leads`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          full_name:    name.trim(),
          phone:        phone.trim(),
          listing_type: req.listing_type || null,
        }),
      });
    } catch {
      // Non-critical — continue even if network fails
    }

    saveRequirements(finalReq);
    setSaving(false);
    onComplete(finalReq);
  };

  const goNext = () => {
    if (step === 0) {
      if (!req.listing_type) {
        toast.error("(Listing Type) this field is req.");
        return;
      }
      if (!req.property_type) {
        toast.error("(Property Type) this field is req.");
        return;
      }
    }
    if (step === 4) {
      if (!name.trim()) {
        toast.error("(Full Name) this field is req.");
        return;
      }
      if (!phone.trim() || phone.trim().length < 7) {
        toast.error("(Phone Number) this field is req.");
        return;
      }
    }
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else handleFinish();
  };

  const goBack = () => setStep(s => s - 1);

  const budgetPresets =
    req.listing_type === "sale" ? BUDGET_PRESETS_BUY :
    req.listing_type === "short_term" ? BUDGET_PRESETS_SHORT_TERM :
    BUDGET_PRESETS_RENT;

  // ── Step bodies ──────────────────────────────────────────────────────────────
  const body = () => {
    switch (step) {

      // ── Step 0: Intent + Property type (no Commercial) ───────────────────
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
                Looking to
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { value: "rent",       label: "Rent",                emoji: "🔑" },
                  { value: "sale",       label: "Buy",                 emoji: "🏡" },
                  { value: "pg",         label: "PG / Co-living",      emoji: "🛏️" },
                  { value: "short_term", label: "Short-Term Property", emoji: "⏱️" },
                ].map(o => {
                  const sel = req.listing_type === o.value;
                  const isSt = o.value === "short_term";
                  const activeColor = isSt ? "#7C3AED" : GOLD;
                  const activeLight = isSt ? "#ede9fe" : GOLD_LIGHT;
                  return (
                    <button key={o.value} type="button"
                      onClick={() => {
                        update("listing_type", o.value);
                        if (o.value === "pg") update("property_type", "PG");
                        else if (req.property_type === "PG") update("property_type", "");
                      }}
                      className="flex flex-col items-center gap-2 rounded-2xl border-2 px-2.5 py-4 text-center transition-all duration-200"
                      style={{
                        borderColor:     sel ? activeColor : GOLD_BORDER,
                        backgroundColor: sel ? activeLight : "#fff",
                        boxShadow:       sel ? `0 4px 14px ${isSt ? "rgba(124,58,237,0.22)" : "rgba(201,146,26,0.18)"}` : undefined,
                        transform:       sel ? "translateY(-1px)" : undefined,
                      }}
                    >
                      <span className="text-2xl">{o.emoji}</span>
                      <span className="font-bold text-xs" style={{ color: DARK }}>{o.label}</span>
                      {sel && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: activeColor }}>
                          <Check className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Property type — hidden when PG */}
            {req.listing_type !== "pg" && req.listing_type && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
                  Property type
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { value: "Apartment",    label: "Apartment",     emoji: "🏢" },
                    { value: "Villa",        label: "House / Villa",  emoji: "🏡" },
                    { value: "Office Space", label: "Office",         emoji: "💼" },
                    { value: "Shop",         label: "Shop",           emoji: "🏪" },
                    { value: "Farm House",   label: "Farm House",     emoji: "🌿" },
                    { value: "Other",        label: "Other",          emoji: "📋", wide: true },
                  ].map(o => (
                    <TileCard key={o.value} {...o}
                      selected={req.property_type === o.value}
                      onClick={() => update("property_type", o.value)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // ── Step 1: Configuration ─────────────────────────────────────────────
      case 1: {
        const pt       = req.property_type;
        const isPG     = pt === "PG";
        const isOffice = pt === "Office Space" || pt === "Shop";
        const isVilla  = pt === "Villa" || pt === "Farm House";

        if (isPG) return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: GOLD_LIGHT }}>
              <span className="text-2xl">🛏️</span>
              <div>
                <p className="text-sm font-bold" style={{ color: DARK }}>PG / Co-living</p>
                <p className="text-xs" style={{ color: MUTED }}>How many beds do you need in your room?</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 1,    label: "Single",  sub: "1 bed",        emoji: "🛏️" },
                { value: 2,    label: "Double",  sub: "2 beds",       emoji: "🛏️" },
                { value: 3,    label: "Triple",  sub: "3 beds",       emoji: "🛏️" },
                { value: 4,    label: "4-Bed",   sub: "4+ beds",      emoji: "🛏️" },
                { value: 0,    label: "Sharing", sub: "Open sharing", emoji: "👥" },
                { value: null, label: "Any",     sub: "No pref.",     emoji: "✨" },
              ].map(o => (
                <TileCard key={String(o.value)} emoji={o.emoji} label={o.label} sub={o.sub}
                  selected={req.beds === o.value} onClick={() => update("beds", o.value)} />
              ))}
            </div>
          </div>
        );

        if (isOffice) return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: GOLD_LIGHT }}>
              <span className="text-2xl">{pt === "Shop" ? "🏪" : "💼"}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: DARK }}>{pt}</p>
                <p className="text-xs" style={{ color: MUTED }}>How many cabins / private rooms do you need?</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 1,    label: "1 Cabin",  sub: "Small",      emoji: "🗂️" },
                { value: 2,    label: "2 Cabins", sub: "Small team", emoji: "🗂️" },
                { value: 3,    label: "3 Cabins", sub: "Medium",     emoji: "🗂️" },
                { value: 5,    label: "5 Cabins", sub: "Large",      emoji: "🏢" },
                { value: 10,   label: "10+",       sub: "Enterprise", emoji: "🏢" },
                { value: null, label: "Any",       sub: "Open plan",  emoji: "✨" },
              ].map(o => (
                <TileCard key={String(o.value)} emoji={o.emoji} label={o.label} sub={o.sub}
                  selected={req.cabins === o.value} onClick={() => update("cabins", o.value)} />
              ))}
            </div>
          </div>
        );

        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: GOLD_LIGHT }}>
              <span className="text-2xl">{isVilla ? "🏡" : "🏢"}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: DARK }}>{pt || "Property"}</p>
                <p className="text-xs" style={{ color: MUTED }}>How many bedrooms do you need?</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 0,    label: "Studio", sub: "No bedroom", emoji: "🛋️" },
                { value: 1,    label: "1 BHK",  sub: "1 bed",      emoji: "🛏️" },
                { value: 2,    label: "2 BHK",  sub: "2 beds",     emoji: "🛏️" },
                { value: 3,    label: "3 BHK",  sub: "3 beds",     emoji: "🛏️" },
                { value: 4,    label: "4+ BHK", sub: "4 or more",  emoji: "🛏️" },
                { value: null, label: "Any",    sub: "All sizes",   emoji: "✨" },
              ].map(o => (
                <TileCard key={String(o.value)} emoji={o.emoji} label={o.label} sub={o.sub}
                  selected={req.bedrooms === o.value} onClick={() => update("bedrooms", o.value)} />
              ))}
            </div>
            {isVilla && (
              <button type="button" onClick={() => update("hasPool", !req.hasPool)}
                className="w-full flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-all duration-200"
                style={{
                  borderColor: req.hasPool ? GOLD : GOLD_BORDER,
                  backgroundColor: req.hasPool ? GOLD_LIGHT : "#fff",
                  boxShadow: req.hasPool ? "0 4px 14px rgba(201,146,26,0.18)" : undefined,
                }}
              >
                <span className="text-2xl">🏊</span>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: DARK }}>Swimming Pool</p>
                  <p className="text-xs" style={{ color: MUTED }}>Must have a private or shared pool</p>
                </div>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200"
                  style={{ backgroundColor: req.hasPool ? GOLD : "transparent", border: req.hasPool ? "none" : `2px solid ${GOLD_BORDER}` }}>
                  {req.hasPool && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
              </button>
            )}
          </div>
        );
      }

      // ── Step 2: Location + Budget ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: MUTED }}>
                Preferred area or city
              </label>
              <div className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors"
                style={{ borderColor: locInput ? GOLD : GOLD_BORDER, backgroundColor: "#fff" }}>
                <MapPin className="h-4 w-4 shrink-0" style={{ color: locInput ? GOLD : MUTED }} />
                <input type="text" value={locInput} onChange={e => setLocInput(e.target.value)}
                  placeholder="e.g. Ahmedabad, Bodakdev…"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal"
                  style={{ color: DARK }} list="wizard-cities" />
                {locInput && (
                  <button type="button" onClick={() => setLocInput("")} style={{ color: MUTED }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <datalist id="wizard-cities">
                {cities.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2.5 block" style={{ color: MUTED }}>
                {req.listing_type === "sale" ? "Budget" : req.listing_type === "short_term" ? "Weekly budget" : "Monthly rent"}
              </label>
              <div className="flex flex-wrap gap-2">
                {budgetPresets.map(bp => (
                  <BudgetChip key={bp.label} label={bp.label}
                    selected={req.budget[0] === bp.min && req.budget[1] === bp.max}
                    onClick={() => update("budget", [bp.min, bp.max])} />
                ))}
                {(req.budget[0] > 0 || req.budget[1] > 0) && (
                  <button type="button" onClick={() => update("budget", [0, 0])}
                    className="rounded-full border px-3.5 py-2 text-xs font-semibold"
                    style={{ borderColor: GOLD_BORDER, color: "#ef4444", backgroundColor: "#fff" }}>
                    Clear
                  </button>
                )}
              </div>
              {(req.budget[0] > 0 || req.budget[1] > 0) && (
                <p className="mt-2 text-xs font-semibold" style={{ color: GOLD }}>
                  ₹{req.budget[0].toLocaleString("en-IN")}
                  {req.budget[1] > 0 ? ` – ₹${req.budget[1].toLocaleString("en-IN")}` : "+"}
                </p>
              )}
            </div>
          </div>
        );

      // ── Step 3: Furnishing + Amenities ────────────────────────────────────
      case 3:
        return (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2.5 block" style={{ color: MUTED }}>
                Furnishing preference
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: "Fully Furnished", emoji: "🛋️", label: "Fully Furnished" },
                  { val: "Semi-Furnished",  emoji: "🪑", label: "Semi-Furnished"  },
                  { val: "Unfurnished",     emoji: "🏗️", label: "Unfurnished"     },
                  { val: "",                emoji: "✨", label: "Any / No pref."  },
                ].map(f => {
                  const sel = req.furnished === f.val;
                  return (
                    <button key={f.label} type="button" onClick={() => update("furnished", f.val)}
                      className="flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all duration-150"
                      style={{
                        borderColor: sel ? GOLD : GOLD_BORDER,
                        backgroundColor: sel ? GOLD_LIGHT : "#fff",
                        boxShadow: sel ? "0 2px 10px rgba(201,146,26,0.15)" : undefined,
                      }}
                    >
                      <span className="text-lg">{f.emoji}</span>
                      <span className="text-xs font-bold" style={{ color: sel ? DARK : MUTED }}>{f.label}</span>
                      {sel && <Check className="h-3.5 w-3.5 ml-auto shrink-0" style={{ color: GOLD }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2.5 block" style={{ color: MUTED }}>
                Must-have amenities
                <span className="ml-1.5 font-normal normal-case text-[10px]" style={{ color: "#a08858" }}>optional</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {AMENITY_OPTIONS.map(a => (
                  <AmenityChip key={a} label={a}
                    selected={req.amenities.includes(a)}
                    onClick={() => toggleAmenity(a)} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: MUTED }}>
                Anything else?
                <span className="ml-1.5 font-normal normal-case text-[10px]" style={{ color: "#a08858" }}>optional</span>
              </label>
              <textarea value={req.notes} onChange={e => update("notes", e.target.value)}
                rows={2} placeholder="Ground floor only, pet-friendly, near metro…"
                className="w-full rounded-xl border-2 px-3.5 py-2.5 text-sm resize-none outline-none transition-colors"
                style={{ borderColor: req.notes ? GOLD : GOLD_BORDER, backgroundColor: "#fff", color: DARK }} />
            </div>
          </div>
        );

      // ── Step 4 (NEW): Name + Phone ────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            {/* Hero message */}
            <div
              className="flex items-center gap-4 rounded-2xl px-4 py-4"
              style={{ backgroundColor: GOLD_LIGHT }}
            >
              <span className="text-3xl">🎯</span>
              <div>
                <p className="text-sm font-bold" style={{ color: DARK }}>
                  You're almost done!
                </p>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: MUTED }}>
                  Enter your details so we can send you personalised property matches.
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: MUTED }}>
                Your Name
              </label>
              <div
                className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 transition-colors"
                style={{ borderColor: name ? GOLD : GOLD_BORDER, backgroundColor: "#fff" }}
              >
                <User className="h-4 w-4 shrink-0" style={{ color: name ? GOLD : MUTED }} />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal"
                  style={{ color: DARK }}
                  autoFocus
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block" style={{ color: MUTED }}>
                Phone Number
              </label>
              <div
                className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 transition-colors"
                style={{ borderColor: phone ? GOLD : GOLD_BORDER, backgroundColor: "#fff" }}
              >
                <Phone className="h-4 w-4 shrink-0" style={{ color: phone ? GOLD : MUTED }} />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d+\- ]/g, ""))}
                  placeholder="e.g. 98765 43210"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal"
                  style={{ color: DARK }}
                />
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>
                We'll reach out with the best matching properties for you.
              </p>
            </div>

            {/* API error */}
            {apiError && (
              <p className="text-xs font-semibold text-red-500">{apiError}</p>
            )}
          </div>
        );

      default: return null;
    }
  };

  // ── Dynamic step label ────────────────────────────────────────────────────────
  const meta = STEP_META[step];
  const stepLabel = step === 1
    ? req.property_type === "PG"
      ? { label: "Bed preference",    sub: "How many beds in your room?",          icon: <BedDouble className="h-5 w-5" /> }
      : req.property_type === "Office Space" || req.property_type === "Shop"
      ? { label: "Cabin / room count", sub: "How many private rooms do you need?", icon: <Building2 className="h-5 w-5" /> }
      : { label: "Bedrooms",           sub: "Pick the configuration that fits.",   icon: <BedDouble className="h-5 w-5" /> }
    : meta;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "rgba(26,18,9,0.65)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-[500px] rounded-[28px] overflow-hidden flex flex-col shadow-2xl"
        style={{ backgroundColor: BG, maxHeight: "90dvh" }}
      >
        {/* ── Progress bar ── */}
        <div
          className="h-1 w-full transition-all duration-500"
          style={{ background: `linear-gradient(90deg, ${GOLD} ${((step + 1) / TOTAL_STEPS) * 100}%, ${GOLD_BORDER} 0%)` }}
        />

        {/* ── Header ── */}
        <div className="shrink-0 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <StepDots step={step} />
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: GOLD_LIGHT, color: GOLD }}
                >
                  {stepLabel.icon}
                </span>
                <div>
                  <h2
                    className="text-lg sm:text-xl font-extrabold leading-tight"
                    style={{ color: DARK, fontFamily: "'Sora',sans-serif" }}
                  >
                    {stepLabel.label}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>{stepLabel.sub}</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fef3d4] mt-0.5"
              style={{ color: MUTED }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div
          className="flex-1 overflow-y-auto px-6 pb-2"
          style={{ scrollbarWidth: "thin", scrollbarColor: `${GOLD_BORDER} transparent` }}
        >
          {body()}
        </div>

        {/* ── Footer ── */}
        <div
          className="shrink-0 px-6 py-4 border-t flex items-center gap-3"
          style={{ borderColor: GOLD_BORDER, backgroundColor: BG }}
        >
          {step > 0 ? (
            <button
              onClick={goBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:bg-[#fef3d4] active:scale-95"
              style={{ borderColor: GOLD_BORDER, color: MUTED }}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 rounded-full border-2 py-3 text-sm font-semibold transition-all hover:bg-[#fef3d4] active:scale-95"
              style={{ borderColor: GOLD_BORDER, color: MUTED, backgroundColor: "#fff" }}
            >
              Skip for now
            </button>
          )}

          {/* Continue / Finish */}
          <button
            onClick={goNext}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: GOLD, boxShadow: "0 4px 16px rgba(201,146,26,0.38)" }}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : step === TOTAL_STEPS - 1 ? (
              <><Sparkles className="h-4 w-4" /> Show my matches</>
            ) : (
              <>{step < 2 ? "Continue" : "Next"} <ArrowRight className="h-4 w-4" /></>
            )}
          </button>

          {/* Skip steps 1, 2, 3 (not step 4 — name/phone required) */}
          {step >= 1 && step < TOTAL_STEPS - 1 && (
            <button
              onClick={() => setStep(s => s + 1)}
              className="text-xs font-semibold shrink-0 transition-colors hover:underline"
              style={{ color: MUTED }}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
