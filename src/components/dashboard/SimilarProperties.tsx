/**
 * SimilarProperties.tsx
 *
 * "Similar Properties" — shown on the property detail page and optionally
 * inline in the dashboard.  Fetches /api/recommendations/similar/:propertyId.
 *
 * Usage:
 *   <SimilarProperties propertyId={id} />
 *
 * Fully self-contained: manages its own data fetch lifecycle.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, LayoutGrid, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/site/PropertyCard";
import { recommendationsApi, type SimilarPropertiesResponse } from "@/lib/recommendations-api";

interface Props {
  propertyId: string;
  /** Max items to render (default 6) */
  limit?: number;
  /** Show the section title (default true) */
  showHeader?: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#e8d9c0] bg-white overflow-hidden animate-pulse">
      <div className="w-full bg-muted/60" style={{ aspectRatio: "4/3" }} />
      <div className="p-3 sm:p-3.5 space-y-2">
        <div className="h-3 w-24 bg-muted/60 rounded-full" />
        <div className="h-4 w-full bg-muted/60 rounded-full" />
        <div className="flex justify-between pt-1">
          <div className="h-4 w-20 bg-muted/60 rounded-full" />
          <div className="h-4 w-16 bg-muted/40 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SimilarProperties({ propertyId, limit = 6, showHeader = true }: Props) {
  const [state, setState] = useState<{
    data: SimilarPropertiesResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    setState({ data: null, loading: true, error: null });
    recommendationsApi
      .similar(propertyId, limit)
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err.message ?? "Failed" });
      });

    return () => { cancelled = true; };
  }, [propertyId, limit]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.loading) {
    return (
      <div>
        {showHeader && (
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="h-5 w-36 bg-muted/60 rounded-full animate-pulse" />
              <div className="h-3 w-48 bg-muted/40 rounded-full animate-pulse mt-1" />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state.error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-destructive/60 shrink-0" />
        <p className="text-sm text-destructive">Could not load similar properties</p>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!state.data || state.data.data.length === 0) return null;

  const items = state.data.data.slice(0, limit);
  const seed  = state.data.seed;

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg">
                Similar Properties
              </h2>
              <p className="text-xs text-muted-foreground">
                {seed.city} · {seed.listing_type} · Similar price range
              </p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs h-7 px-2 shrink-0">
            <Link
              to="/properties"
              search={{ city: seed.city, listing_type: seed.listing_type } as any}
            >
              See all <ArrowUpRight className="h-3 w-3 ml-0.5" />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {items.map(p => (
          <PropertyCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
