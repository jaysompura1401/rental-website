/**
 * useRecommendations.ts
 * Data-fetching hook that drives all recommendation panels.
 * Fetches all four endpoints in parallel after mount.
 * Provides per-section loading / error states.
 */

import { useEffect, useState, useCallback } from "react";
import {
  recommendationsApi,
  type RecommendedForYouResponse,
  type ContinueExploringResponse,
  type ReturningUserResponse,
} from "@/lib/recommendations-api";

// ─── Individual section state ──────────────────────────────────────────────────

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initialState<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseRecommendationsResult {
  forYou:           AsyncState<RecommendedForYouResponse>;
  continueExploring:AsyncState<ContinueExploringResponse>;
  returning:        AsyncState<ReturningUserResponse>;
  /** Reload everything (e.g. after the user saves a new property) */
  refresh:          () => void;
  /** True while ANY section is still loading */
  anyLoading:       boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecommendations(): UseRecommendationsResult {
  const [forYou,            setForYou]            = useState<AsyncState<RecommendedForYouResponse>>(initialState());
  const [continueExploring, setContinueExploring] = useState<AsyncState<ContinueExploringResponse>>(initialState());
  const [returning,         setReturning]          = useState<AsyncState<ReturningUserResponse>>(initialState());
  const [tick,              setTick]               = useState(0);

  const refresh = useCallback(() => {
    setForYou(initialState());
    setContinueExploring(initialState());
    setReturning(initialState());
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Fire all three requests in parallel — they are independent
    async function fetchAll() {
      await Promise.allSettled([
        recommendationsApi.forYou(12).then(data => {
          if (!cancelled) setForYou({ data, loading: false, error: null });
        }).catch(err => {
          if (!cancelled) setForYou({ data: null, loading: false, error: err.message ?? "Failed to load recommendations" });
        }),

        recommendationsApi.continueExploring().then(data => {
          if (!cancelled) setContinueExploring({ data, loading: false, error: null });
        }).catch(err => {
          if (!cancelled) setContinueExploring({ data: null, loading: false, error: err.message ?? "Failed to load" });
        }),

        recommendationsApi.returning().then(data => {
          if (!cancelled) setReturning({ data, loading: false, error: null });
        }).catch(err => {
          if (!cancelled) setReturning({ data: null, loading: false, error: err.message ?? "Failed to load" });
        }),
      ]);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [tick]);

  const anyLoading = forYou.loading || continueExploring.loading || returning.loading;

  return { forYou, continueExploring, returning, refresh, anyLoading };
}
