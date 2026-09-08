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

interface PropertyCardProps {
  p: ApiProperty;
  compact?: boolean;
  initialSaved?: boolean;
  onSaveChange?: (id: string, saved: boolean) => void;
  /** When provided, renders a match score badge and reasons on the card */
  matchResult?: MatchResult;
}

export function PropertyCard({ p, compact = false, initialSaved, onSaveChange, matchResult }: PropertyCardProps) {
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
      className="group flex flex-col h-full overflow-hidden rounded-2xl bg-white transition-all duration-300 hover:shadow-[0_12px_28px_-6px_rgba(201,146,26,0.22)] hover:-translate-y-1 border border-[#e8d9c0] hover:border-[#C9921A] focus-within:ring-2 focus-within:ring-[#C9921A]"
    >
      {/* Image — uses aspect-ratio so it scales with card width */}
      <div className="relative overflow-hidden w-full bg-[#fcebd1]/40" style={{ aspectRatio: "4/3" }}>
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
            <svg className="h-8 w-8 text-[#C9921A]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9zM8.25 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm9.19 4.5l-3.44-3.44a.75.75 0 00-1.06 0l-2.5 2.5-1.19-1.19a.75.75 0 00-1.06 0L6 15" />
            </svg>
            <span className="text-[10px] text-[#C9921A]/80 font-medium">No photo</span>
          </div>
        )}

        {/* Badges top-left */}
        <div className="absolute top-2 left-2 max-w-[calc(100%-3.5rem)] flex flex-col items-start gap-1 z-10">
          <span
            className="block max-w-full rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold leading-tight truncate shadow-2xs border border-[#C9921A]/25"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#1a1209", backdropFilter: "blur(4px)" }}
          >
            {typeLabel}
          </span>
          {isVerified ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-bold leading-none shadow-2xs text-emerald-700 bg-emerald-50/95 border border-emerald-300/80"
              style={{ backdropFilter: "blur(4px)" }}
            >
              <ShieldCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-600 shrink-0" />
              Verified
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none shadow-2xs text-amber-800 bg-amber-50/95 border border-amber-300/80"
              style={{ backdropFilter: "blur(4px)" }}
            >
              <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-600 shrink-0" />
              Not verified
            </span>
          )}
        </div>

        {/* Property Rating 5-star badge bottom-right of image */}
        <div className="absolute bottom-2 right-2 z-10">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-md text-white backdrop-blur-md"
            style={{ backgroundColor: "rgba(26, 18, 9, 0.85)", border: "1px solid rgba(201,146,26,0.4)" }}
          >
            <Star className="h-2.5 w-2.5 fill-[#C9921A] text-[#C9921A] shrink-0" />
            <span>{score.overall}</span>
          </span>
        </div>

      {/* Match Score Badge — top of image when personalised search is active */}
      {matchResult && matchResult.score > 0 && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-lg border border-white/60 backdrop-blur-sm"
          style={{
            backgroundColor:
              matchResult.score >= 80 ? "#15803d"   // green
              : matchResult.score >= 65 ? "#C9921A"  // gold
              : matchResult.score >= 45 ? "#92400e"  // amber
              : "#6b7280",                           // grey
            color: "#fff",
          }}
        >
          <Sparkles className="h-2.5 w-2.5 shrink-0" />
          {matchResult.score}% Match
        </div>
      )}

        {/* Heart button top-right */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="absolute top-2 right-2 z-10 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 border border-[#e8d9c0]/80 hover:border-[#C9921A]"
          style={{ backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)" }}
          aria-label={isSaved ? "Remove from saved" : "Save property"}
        >
          <Heart
            className="h-4 w-4 transition-colors duration-200"
            style={{ color: isSaved ? "#ef4444" : "#836737", fill: isSaved ? "#ef4444" : "none" }}
          />
        </button>
      </div>

      {/* Info */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1 min-w-0 justify-between gap-1.5">
        <div>
          {/* Locality + Rating Tier */}
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs">
            <p className="truncate font-medium" style={{ color: "#a08858" }}>
              {p.property_type} in {p.locality || p.city}
            </p>
            <span
              className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none"
              style={{ backgroundColor: score.badgeBg, color: score.badgeText, border: `1px solid ${score.badgeBorder}` }}
            >
              {score.label}
            </span>
          </div>

          {/* Title */}
          <p className="mt-1 text-xs sm:text-sm font-bold leading-snug line-clamp-1 group-hover:text-[#C9921A] transition-colors" style={{ color: "#1a1209" }}>
            {p.title}
          </p>
        </div>

        {/* Price + area — always one line, never wraps */}
        <div className="pt-2 flex items-center justify-between gap-1.5 min-w-0 overflow-hidden border-t border-[#e8d9c0]/80 mt-auto">
          {/* Price — shrinks if needed but never wraps */}
          <span className="text-xs sm:text-sm font-extrabold shrink-0" style={{ color: GOLD }}>
            {formatINR(p.price)}
            {p.listing_type !== "sale" && (
              <span className="text-[10px] font-normal ml-0.5" style={{ color: "#a08858" }}>/mo</span>
            )}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {p.area_sqft && p.area_sqft > 0 && (
              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold" style={{ color: "#a08858" }}>
                <Maximize2 className="h-3 w-3 shrink-0 text-[#C9921A]" />
                <span className="truncate">{p.area_sqft} sq.ft</span>
              </span>
            )}
          </div>
        </div>

        {/* Match reasons — shown only when personalised search is active */}
        {matchResult && matchResult.score > 0 && (matchResult.hits.length > 0 || matchResult.misses.length > 0) && (
          <div className="mt-2 pt-2 border-t space-y-1" style={{ borderColor: "#e8d9c0" }}>
            {matchResult.hits.slice(0, 2).map(h => (
              <div key={h} className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: "#15803d" }}>
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{h}</span>
              </div>
            ))}
            {matchResult.misses.slice(0, 1).map(m => (
              <div key={m} className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: "#92400e" }}>
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate">{m}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

