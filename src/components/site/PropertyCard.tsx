import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, Maximize2, ShieldCheck, Clock, Star, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { type ApiProperty, saved as savedApi } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { formatINR } from "@/lib/mock-properties";
import { calculatePropertyScore } from "@/lib/property-score";
import type { MatchResult } from "@/lib/requirement-match";
import { useEffect, useState } from "react";

const GOLD = "#C9921A";
// No random/stock placeholder — show a neutral grey tile when no image exists
const PLACEHOLDER = null;

/* Fixed standard card dimensions — every standard card is balanced and proportional */
const CARD_W = 240;
const CARD_H = 236;
const IMG_H  = 138;   // standard image height
const INFO_H = CARD_H - IMG_H; // ~98px

interface PropertyCardProps {
  p: ApiProperty;
  compact?: boolean;
  fluid?: boolean;
  className?: string;
  initialSaved?: boolean;
  onSaveChange?: (id: string, saved: boolean) => void;
  /** When provided, renders a match score badge and reasons on the card */
  matchResult?: MatchResult;
}

export function PropertyCard({ p, compact = false, fluid = false, className = "", initialSaved, onSaveChange, matchResult }: PropertyCardProps) {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [isSaved, setIsSaved] = useState(initialSaved ?? false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile || initialSaved !== undefined) return;
    savedApi.check(p.id)
      .then(r => setIsSaved(r.saved))
      .catch(() => {});
  }, [p.id, profile, initialSaved]);

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profile) { navigate({ to: "/auth" }); return; }
    if (loading) return;
    setLoading(true);
    try {
      if (isSaved) {
        await savedApi.unsave(p.id);
        setIsSaved(false);
        onSaveChange?.(p.id, false);
      } else {
        await savedApi.save(p.id);
        setIsSaved(true);
        onSaveChange?.(p.id, true);
      }
      window.dispatchEvent(new Event("nivaas_saved_changed"));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  const coverImage =
    (p.images && p.images.length > 0 ? p.images[0] : null) ??
    p.cover_image_url ??
    null;

  const typeLabel = p.bedrooms && p.bedrooms > 0
    ? `${p.bedrooms} BHK ${p.property_type}`
    : p.property_type;

  const isVerified = Boolean(p.verified);
  const score = calculatePropertyScore(p);

  return (
    <Link
      to="/properties/$id"
      params={{ id: p.id }}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white border border-[#e8d9c0] transition-all duration-200 hover:shadow-[0_12px_28px_-6px_rgba(201,146,26,0.22)] hover:-translate-y-1 hover:border-[#C9921A] focus-within:ring-2 focus-within:ring-[#C9921A] ${
        compact || fluid ? "w-full max-w-full" : ""
      } ${className}`}
      style={
        compact
          ? { height: 185, minHeight: 185, maxHeight: 185 }
          : fluid
          ? { width: "100%", height: CARD_H, minHeight: CARD_H, maxHeight: CARD_H }
          : { width: CARD_W, height: CARD_H, minWidth: CARD_W, maxWidth: CARD_W, minHeight: CARD_H, maxHeight: CARD_H }
      }
    >
      {/* Image area */}
      <div
        className="relative overflow-hidden w-full bg-[#fcebd1]/40 shrink-0"
        style={{ height: compact ? 105 : IMG_H }}
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={p.title}
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          /* No image uploaded — show neutral placeholder tile */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#fef3d4]/50">
            <svg className={compact ? "h-5 w-5 text-[#C9921A]/60" : "h-8 w-8 text-[#C9921A]/60"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9zM8.25 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm9.19 4.5l-3.44-3.44a.75.75 0 00-1.06 0l-2.5 2.5-1.19-1.19a.75.75 0 00-1.06 0L6 15" />
            </svg>
            <span className="text-[9px] text-[#C9921A]/80 font-medium">No photo</span>
          </div>
        )}

        {/* Badges top-left */}
        <div className="absolute top-1.5 left-1.5 max-w-[calc(100%-2.5rem)] flex items-center gap-1 flex-wrap z-10">
          <span
            className="block max-w-full rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-tight truncate shadow-2xs border border-[#C9921A]/25"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#1a1209", backdropFilter: "blur(4px)" }}
          >
            {typeLabel}
          </span>
          {!compact && isVerified && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold leading-none shadow-2xs text-emerald-700 bg-emerald-50/95 border border-emerald-300/80"
              style={{ backdropFilter: "blur(4px)" }}
            >
              <ShieldCheck className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
              Verified
            </span>
          )}
        </div>

        {/* Star badge bottom-right */}
        {!compact && (
          <div className="absolute bottom-2 right-2 z-10">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-md text-white backdrop-blur-md"
              style={{ backgroundColor: "rgba(26, 18, 9, 0.85)", border: "1px solid rgba(201,146,26,0.4)" }}
            >
              <Star className="h-2.5 w-2.5 fill-[#C9921A] text-[#C9921A] shrink-0" />
              <span>{score.overall}</span>
            </span>
          </div>
        )}

        {/* Heart button top-right */}
        <button
          onClick={handleSave}
          disabled={loading}
          className={`absolute top-1.5 right-1.5 z-10 flex items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 border border-[#e8d9c0]/80 hover:border-[#C9921A] ${
            compact ? "h-6 w-6" : "h-8 w-8"
          }`}
          style={{ backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)" }}
          aria-label={isSaved ? "Remove from saved" : "Save property"}
        >
          <Heart
            className={compact ? "h-3 w-3 transition-colors duration-200" : "h-3.5 w-3.5 transition-colors duration-200"}
            style={{ color: isSaved ? "#ef4444" : "#836737", fill: isSaved ? "#ef4444" : "none" }}
          />
        </button>
      </div>

      {/* Info section */}
      <div
        className={`px-2.5 py-1.5 flex flex-col min-w-0 justify-between overflow-hidden ${
          compact ? "h-[80px]" : ""
        }`}
        style={compact ? undefined : { height: INFO_H }}
      >
        <div className="min-w-0">
          {/* Locality */}
          <p className="truncate text-[10px] font-medium" style={{ color: "#a08858" }}>
            {p.locality || p.city}, {p.city}
          </p>

          {/* Title */}
          <p
            className="mt-0.5 text-[11px] sm:text-xs font-bold leading-tight truncate group-hover:text-[#C9921A] transition-colors"
            style={{ color: "#1a1209" }}
            title={p.title}
          >
            {p.title}
          </p>

          {/* Specs / Highlights */}
          {!compact && (
            <p className="mt-0.5 text-[9.5px] font-medium text-[#836737]/90 truncate">
              {[
                p.bedrooms ? `${p.bedrooms} BHK` : null,
                p.bathrooms ? `${p.bathrooms} Bath` : null,
                p.area_sqft ? `${p.area_sqft} sq ft` : (p.furnished ? p.furnished : null),
              ].filter(Boolean).join(" • ") || p.property_type}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="pt-1 flex items-center justify-between gap-1 min-w-0 overflow-hidden border-t border-[#e8d9c0]/80 mt-auto">
          {p.listing_type === "short_term" ? (
            <>
              <div className="flex items-baseline gap-0.5 min-w-0 truncate">
                <span className="text-[11px] sm:text-xs font-extrabold truncate" style={{ color: "#7C3AED" }}>
                  {p.short_term_price ? formatINR(p.short_term_price) : formatINR(p.price)}
                </span>
                <span className="text-[9px] font-normal" style={{ color: "#a08858" }}>/wk</span>
              </div>
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#ede9fe", color: "#7C3AED" }}>
                Short-Term
              </span>
            </>
          ) : (
            <div className="flex items-baseline gap-0.5 min-w-0 truncate">
              <span className="text-[11px] sm:text-xs font-extrabold truncate" style={{ color: GOLD }}>
                {formatINR(p.price)}
              </span>
              {p.listing_type !== "sale" && (
                <span className="text-[9px] font-normal" style={{ color: "#a08858" }}>/mo</span>
              )}
            </div>
          )}
        </div>

        {/* Match reasons — shown only when personalised search is active */}
        {!compact && matchResult && matchResult.score > 0 && (matchResult.hits.length > 0 || matchResult.misses.length > 0) && (
          <div className="mt-1 pt-1 border-t space-y-0.5" style={{ borderColor: "#e8d9c0" }}>
            {matchResult.hits.slice(0, 1).map(h => (
              <div key={h} className="flex items-center gap-1 text-[9px] font-medium" style={{ color: "#15803d" }}>
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{h}</span>
              </div>
            ))}
            {matchResult.misses.slice(0, 1).map(m => (
              <div key={m} className="flex items-center gap-1 text-[9px] font-medium" style={{ color: "#92400e" }}>
                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{m}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

