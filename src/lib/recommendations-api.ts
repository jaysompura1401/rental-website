/**
 * recommendations-api.ts
 * Typed client for all /api/recommendations endpoints.
 * Follows the exact same pattern as src/lib/api.ts.
 */

import { API_BASE, getToken, type ApiProperty } from "./api";

// ─── Shared fetch helper (mirrors the one in api.ts) ─────────────────────────
async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { message?: string; error?: string }).message ??
        (body as { error?: string }).error ??
        res.statusText
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecommendedProperty extends ApiProperty {
  /** Only present on /continue results — describes why we're showing this */
  interaction_type?: "saved_not_visited" | "inquired_not_visited" | "visited_not_rented";
  /** ISO timestamp of the most recent interaction */
  interaction_date?: string;
  /** Human-readable reason label */
  reason_label?: string;
}

export interface RecommendationMeta {
  type: "personalised" | "popular_fallback";
  reason: string;
  activity_count: number;
  preferred_cities: string[];
  preferred_types: string[];
  price_range: { min: number | null; max: number | null };
  preference_vector: null | object;
}

export interface RecommendedForYouResponse {
  data: RecommendedProperty[];
  meta: RecommendationMeta;
}

export interface ContinueExploringMeta {
  counts: {
    saved_not_visited: number;
    inquired_not_visited: number;
    visited_not_rented: number;
  };
}

export interface ContinueExploringResponse {
  data: RecommendedProperty[];
  meta: ContinueExploringMeta;
}

export interface SimilarPropertiesResponse {
  data: RecommendedProperty[];
  seed: {
    id: string;
    city: string;
    property_type: string;
    listing_type: string;
    price: number;
    bedrooms: number | null;
  };
}

export type ReEngagementType =
  | "new_user"
  | "long_absent"
  | "returning"
  | "recent_return"
  | "active";

export interface RecentlyInterestedProperty {
  id: string;
  title: string;
  city: string;
  locality: string | null;
  price: number;
  listing_type: string;
  property_type: string;
  bedrooms: number | null;
  cover_image_url: string | null;
  status: string;
  verified: boolean | number;
  saves_count: number;
  views_count: number;
  interaction_type: "saved" | "visited" | "inquired";
  interaction_date: string;
  images: string[];
  amenities: Array<{ name: string; icon: string; category: string }>;
}

export interface ReturningUserResponse {
  is_returning: boolean;
  days_since_activity: number | null;
  last_activity: string | null;
  re_engagement_type: ReEngagementType;
  re_engagement_message: string | null;
  activity_summary: {
    saved_count: number;
    visit_count: number;
    inquiry_count: number;
    total: number;
  };
  recently_interested: RecentlyInterestedProperty[];
  notification_triggered: boolean;
}

// ─── API namespace ────────────────────────────────────────────────────────────

export const recommendationsApi = {
  /**
   * "Recommended For You" — fully personalised list scored against the
   * user's saved / visit / inquiry history. Falls back to popular
   * properties for brand-new users.
   */
  forYou: (limit = 12) =>
    req<RecommendedForYouResponse>(`/recommendations?limit=${limit}`),

  /**
   * "Continue Exploring" — properties the user interacted with but
   * never completed (saved but not visited, inquired but not visited,
   * visited but not rented).
   */
  continueExploring: () =>
    req<ContinueExploringResponse>("/recommendations/continue"),

  /**
   * "Similar Properties" — properties similar to a given seed property
   * based on city, type, price band, and amenity overlap.
   */
  similar: (propertyId: string, limit = 8) =>
    req<SimilarPropertiesResponse>(
      `/recommendations/similar/${propertyId}?limit=${limit}`
    ),

  /**
   * Returning-user detection + smart re-engagement.
   * Also triggers a single idempotent notification if the user has
   * been absent ≥7 days (at most once per 7-day window).
   */
  returning: () => req<ReturningUserResponse>("/recommendations/returning"),
};
