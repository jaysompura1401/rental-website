/**
 * RecommendationsDashboard.tsx
 *
 * Master orchestrator component.  Renders all recommendation panels:
 *
 *   1. ReEngagementBanner       — returning-user welcome banner
 *   2. RecentlyInterested       — properties user recently interacted with
 *   3. ContinueExploring        — incomplete interactions (saved/inquired/visited)
 *   4. RecommendationSection    — "Recommended For You" personalised grid
 *
 * Driven entirely by useRecommendations() hook (single parallel fetch).
 *
 * Props:
 *   onRefresh  — optional callback from parent to trigger a sibling refresh
 *                (e.g. after a save event).  The hook's own refresh() is also
 *                wired to the global `nivaas_saved_changed` window event so
 *                recommendations update when the user saves from a PropertyCard.
 */

import { useEffect } from "react";
import { useRecommendations } from "@/hooks/useRecommendations";
import { ReEngagementBanner }   from "./ReEngagementBanner";
import { RecentlyInterested }   from "./RecentlyInterested";
import { ContinueExploring }    from "./ContinueExploring";
import { RecommendationSection } from "./RecommendationSection";

interface Props {
  /** Called whenever the recommendation data refreshes */
  onRefresh?: () => void;
}

export function RecommendationsDashboard({ onRefresh }: Props) {
  const { forYou, continueExploring, returning, refresh } = useRecommendations();

  // Refresh recommendations when a property is saved/unsaved from a PropertyCard
  useEffect(() => {
    function handleSaveChange() {
      refresh();
      onRefresh?.();
    }
    window.addEventListener("nivaas_saved_changed", handleSaveChange);
    return () => window.removeEventListener("nivaas_saved_changed", handleSaveChange);
  }, [refresh, onRefresh]);

  // ── Decide what to render based on returning-user state ───────────────────
  const returningData     = returning.data;
  const showBanner = !returning.loading && returningData !== null;

  return (
    <div className="mt-5">
      {/* 1. Re-engagement welcome banner */}
      {showBanner && returningData && (
        <ReEngagementBanner data={returningData} />
      )}

      {/* 2. Recently interested (merges backend + client-side viewed) */}
      <RecentlyInterested backendItems={returningData?.recently_interested ?? []} />

      {/* 3. Continue exploring (incomplete interactions) */}
      <ContinueExploring
        loading={continueExploring.loading}
        error={continueExploring.error}
        data={continueExploring.data}
      />

      {/* 4. Recommended For You (personalised / popular fallback) */}
      <RecommendationSection
        loading={forYou.loading}
        error={forYou.error}
        data={forYou.data}
      />
    </div>
  );
}
