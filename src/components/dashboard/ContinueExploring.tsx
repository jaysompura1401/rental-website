/**
 * ContinueExploring.tsx
 *
 * "Continue Exploring" — horizontal scroll list of properties
 * the user showed interest in but never completed:
 *   • Saved but never booked a visit
 *   • Inquired but never visited
 *   • Visited but never signed an agreement
 *
 * Each card shows a contextual "reason" label from the backend
 * (e.g. "You saved this but haven't visited yet").
 *
 * Layout:
 *   - Mobile:  horizontal scroll strip (snap)
 *   - Desktop: 2–3 col grid capped at 6 cards
 */

import { Link } from "@tanstack/react-router";
import {
  MapPin, ArrowUpRight, Clock, Eye, MessageSquare,
  AlertCircle, Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/mock-properties";
import type { ContinueExploringResponse, RecommendedProperty } from "@/lib/recommendations-api";

interface Props {
  loading: boolean;
  error:   string | null;
  data:    ContinueExploringResponse | null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonStrip() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-56 sm:w-64 rounded-2xl border border-border/60 bg-white overflow-hidden animate-pulse"
        >
          <div className="h-32 bg-muted/60 w-full" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-20 bg-muted/60 rounded-full" />
            <div className="h-4 w-full bg-muted/60 rounded-full" />
            <div className="h-3 w-16 bg-muted/40 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Interaction icon ─────────────────────────────────────────────────────────
function InteractionIcon({ type }: { type: RecommendedProperty["interaction_type"] }) {
  switch (type) {
    case "saved_not_visited":   return <Clock       className="h-3 w-3" />;
    case "inquired_not_visited":return <MessageSquare className="h-3 w-3" />;
    case "visited_not_rented":  return <Eye         className="h-3 w-3" />;
    default:                    return <Clock       className="h-3 w-3" />;
  }
}

function interactionBadgeCls(type: RecommendedProperty["interaction_type"]) {
  switch (type) {
    case "saved_not_visited":    return "bg-pink-50 text-pink-700 border-pink-200";
    case "inquired_not_visited": return "bg-blue-50 text-blue-700 border-blue-200";
    case "visited_not_rented":   return "bg-amber-50 text-amber-700 border-amber-200";
    default:                     return "bg-muted text-muted-foreground border-border/60";
  }
}

// ─── Single continue card ─────────────────────────────────────────────────────
function ContinueCard({ p }: { p: RecommendedProperty }) {
  const coverImage =
    (p.images && p.images.length > 0 ? p.images[0] : null) ?? p.cover_image_url ?? null;

  return (
    <Link
      to="/properties/$id"
      params={{ id: p.id }}
      className="group block shrink-0 w-56 sm:w-64 rounded-2xl border border-[#e8d9c0] hover:border-[#C9921A] bg-white overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Image */}
      <div className="relative h-32 w-full bg-[#fcebd1]/40 overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage}
            alt={p.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#fef3d4]/50">
            <svg className="h-8 w-8 text-[#C9921A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z" />
            </svg>
          </div>
        )}

        {/* Reason badge */}
        {p.interaction_type && (
          <div className="absolute bottom-2 left-2 right-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border backdrop-blur-sm bg-white/90 ${interactionBadgeCls(p.interaction_type)}`}
            >
              <InteractionIcon type={p.interaction_type} />
              <span className="truncate">{p.reason_label ?? "Continue exploring"}</span>
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-1 text-[10px] text-[#a08858] mb-1">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{p.locality || p.city}</span>
        </div>
        <p className="text-xs sm:text-sm font-bold leading-snug line-clamp-2 group-hover:text-[#C9921A] transition-colors">
          {p.title}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-extrabold text-[#C9921A]">
            {formatINR(p.price)}
            {p.listing_type !== "sale" && (
              <span className="text-[10px] font-normal text-[#a08858]">/mo</span>
            )}
          </span>
          {p.bedrooms && p.bedrooms > 0 && (
            <span className="text-[10px] text-muted-foreground">{p.bedrooms} BHK</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ContinueExploring({ loading, error, data }: Props) {
  if (loading) {
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Compass className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="h-5 w-36 bg-muted/60 rounded-full animate-pulse" />
            <div className="h-3 w-48 bg-muted/40 rounded-full animate-pulse mt-1" />
          </div>
        </div>
        <SkeletonStrip />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-destructive/60 shrink-0" />
        <p className="text-sm text-destructive">Could not load continue exploring</p>
      </div>
    );
  }

  if (!data || data.data.length === 0) return null; // Don't render section if no items

  const items = data.data.slice(0, 8);

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Compass className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg">
              Continue Exploring
            </h2>
            <p className="text-xs text-muted-foreground">
              Pick up where you left off
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Count chips */}
          {data.meta.counts.visited_not_rented > 0 && (
            <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 hidden sm:inline-flex">
              {data.meta.counts.visited_not_rented} visited
            </Badge>
          )}
          {data.meta.counts.saved_not_visited > 0 && (
            <Badge className="text-[10px] bg-pink-50 text-pink-700 border-pink-200 hidden sm:inline-flex">
              {data.meta.counts.saved_not_visited} saved
            </Badge>
          )}
          <Button asChild variant="ghost" size="sm" className="text-xs h-7 px-2">
            <Link to="/properties">
              All listings <ArrowUpRight className="h-3 w-3 ml-0.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Horizontal scroll on mobile, grid on larger screens */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory
                   lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map(p => (
          <div key={p.id} className="snap-start">
            <ContinueCard p={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
