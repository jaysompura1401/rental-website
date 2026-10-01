/**
 * useRecentlyViewed.ts
 *
 * React hook that reads recently-viewed properties from localStorage and stays
 * in sync when new views are recorded (listens for the nivaas_property_viewed
 * custom event fired by recordPropertyView in view-history.ts).
 *
 * It also validates that viewed properties still exist on the server, pruning
 * any that have been deleted (e.g. by the property owner).
 */

import { useEffect, useState, useRef } from "react";
import {
  getRecentlyViewed,
  removePropertiesFromHistory,
  type ViewedProperty,
} from "@/lib/view-history";
import { properties as propertiesApi } from "@/lib/api";

/**
 * Returns an array of recently-viewed properties (newest first).
 * Re-renders automatically when a new property is viewed in the same tab.
 * Validates that each property still exists on the server and prunes deleted ones.
 *
 * @param withinHours  Only include views within this many hours (default 72).
 * @param limit        Cap the result at this many items (default 12).
 */
export function useRecentlyViewed(withinHours = 72, limit = 12): ViewedProperty[] {
  const [items, setItems] = useState<ViewedProperty[]>(() =>
    getRecentlyViewed(withinHours).slice(0, limit)
  );
  const validatedRef = useRef(false);

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

  // Validate viewed properties still exist on the server (once per mount)
  useEffect(() => {
    if (validatedRef.current || items.length === 0) return;
    validatedRef.current = true;

    const validate = async () => {
      const staleIds = new Set<string>();

      // Check each property against the server; if it 404s, it's deleted
      await Promise.allSettled(
        items.map(async (v) => {
          try {
            await propertiesApi.get(v.id);
          } catch {
            // Property no longer exists on server — mark for removal
            staleIds.add(v.id);
          }
        })
      );

      if (staleIds.size > 0) {
        removePropertiesFromHistory(staleIds);
        // removePropertiesFromHistory dispatches nivaas_property_viewed event,
        // which triggers the refresh listener above
      }
    };

    validate();
  }, [items]);

  return items;
}
