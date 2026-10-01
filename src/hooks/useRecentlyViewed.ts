/**
 * useRecentlyViewed.ts
 *
 * React hook that reads recently-viewed properties from localStorage and stays
 * in sync when new views are recorded (listens for the nivaas_property_viewed
 * custom event fired by recordPropertyView in view-history.ts).
 */

import { useEffect, useState } from "react";
import { getRecentlyViewed, type ViewedProperty } from "@/lib/view-history";

/**
 * Returns an array of recently-viewed properties (newest first).
 * Re-renders automatically when a new property is viewed in the same tab.
 *
 * @param withinHours  Only include views within this many hours (default 72).
 * @param limit        Cap the result at this many items (default 12).
 */
export function useRecentlyViewed(withinHours = 72, limit = 12): ViewedProperty[] {
  const [items, setItems] = useState<ViewedProperty[]>(() =>
    getRecentlyViewed(withinHours).slice(0, limit)
  );

  useEffect(() => {
    const refresh = () =>
      setItems(getRecentlyViewed(withinHours).slice(0, limit));

    // Sync on mount in case localStorage was updated in another tab
    refresh();

    window.addEventListener("nivaas_property_viewed", refresh);
    // Also re-read when the tab regains focus (back-navigation)
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("nivaas_property_viewed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [withinHours, limit]);

  return items;
}
