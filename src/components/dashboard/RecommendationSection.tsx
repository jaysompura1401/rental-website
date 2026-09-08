/**
 * RecommendationSection.tsx
 *
 * "Recommended For You" — personalised property grid.
 *
 * Features:
 * - Horizontal scroll carousel on mobile, 2-3 col grid on desktop
 * - Shows recommendation reason badge (personalised vs popular fallback)
 * - Preferred city/type chips when available
 * - Loading skeleton grid (matches PropertyCard aspect ratio)
 * - Empty state with CTA
 * - Error state
 * - "Show more" toggle (shows 6 initially, up to 12)
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ChevronDown, ChevronUp, ArrowUpRight, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PropertyCard } from "@/components/site/PropertyCard";
import type { RecommendedForYouResponse } from "@/lib/recommendations-api";

interface Props {
  loading: boolean;
  error:   string | null;
  data:    RecommendedForYouResponse | null;
}

// ─── Skeleton card — matches PropertyCard dimensions ─────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#e8d9c0] bg-white overflow-hidden animate-pulse">
      <div className="w-full bg-muted/60" style={{ aspectRatio: "4/3" }} />
      <div className="p-3 sm:p-3.5 space-y-2">
        <div className="h-3 w-24 bg-muted/60 rounded-full" />
        <div className="h-4 w-full bg-muted/60 rounded-full" />
        <div className="h-4 w-3/4 bg-muted/40 rounded-full" />
        <div className="flex justify-between pt-1">
          <div className="h-4 w-20 bg-muted/60 rounded-full" />
          <div className="h-4 w-16 bg-muted/40 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function RecommendationSection({ loading, error, data }: Props) {
  const [expanded, setExpanded] = useState(false);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="h-5 w-40 bg-muted/60 rounded-full animate-pulse" />
            <div className="h-3 w-56 bg-muted/40 rounded-full animate-pulse mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive/60 mx-auto mb-2" />
        <p className="text-sm font-medium text-destructive">Could not load recommendations</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  // ── Empty / null state ────────────────────────────────────────────────────
  if (!data || data.data.length === 0) {
    return (
      <div className="mt-6">
        <SectionHeader meta={data?.meta ?? null} />
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 sm:p-10 text-center">
          <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-semibold">No personalised recommendations yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Save some properties or book visits — we'll personalise your feed.
          </p>
          <Button asChild variant="hero" className="mt-4">
            <Link to="/properties">Browse Properties</Link>
          </Button>
        </div>
      </div>
    );
  }

  const items      = data.data;
  const visible    = expanded ? items : items.slice(0, 6);
  const hasMore    = items.length > 6;

  return (
    <div className="mt-6">
      <SectionHeader meta={data.meta} itemCount={items.length} />

      {/* Grid — 2 cols on mobile / 3 on xl */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {visible.map(p => (
          <PropertyCard key={p.id} p={p} />
        ))}
      </div>

      {/* Show more / less toggle */}
      {hasMore && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs sm:text-sm"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show less</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show {items.length - 6} more</>
            )}
          </Button>
        </div>
      )}

      {/* Browse all CTA */}
      <div className="mt-4 flex justify-end">
        <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
          <Link to="/properties">
            Browse all listings <ArrowUpRight className="h-3 w-3 ml-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Section header with meta chips ──────────────────────────────────────────
function SectionHeader({
  meta,
  itemCount,
}: {
  meta: RecommendedForYouResponse["meta"] | null;
  itemCount?: number;
}) {
  const isPersonalised = meta?.type === "personalised";

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-bold text-base sm:text-lg">
              Recommended For You
            </h2>
            {!isPersonalised && meta && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                Popular picks
              </Badge>
            )}
            {itemCount && itemCount > 0 && (
              <span className="text-xs text-muted-foreground">({itemCount})</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {meta?.reason ?? "Curated based on your activity"}
          </p>
          {/* Preferred city/type chips */}
          {isPersonalised && meta && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {meta.preferred_cities.slice(0, 2).map(city => (
                <span key={city} className="text-[10px] font-medium rounded-full bg-primary/8 text-primary px-2 py-0.5 border border-primary/20">
                  {city}
                </span>
              ))}
              {meta.preferred_types.slice(0, 1).map(type => (
                <span key={type} className="text-[10px] font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5 border border-border/60">
                  {type}
                </span>
              ))}
              {meta.price_range.min !== null && meta.price_range.max !== null && (
                <span className="text-[10px] font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5 border border-border/60">
                  ₹{(meta.price_range.min / 1000).toFixed(0)}k–{(meta.price_range.max / 1000).toFixed(0)}k
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
