/**
 * view-history.ts
 *
 * Client-side "recently viewed properties" tracker.
 * Stores the last 20 viewed property IDs + basic metadata in localStorage.
 * No database table needed — works entirely client-side.
 *
 * Called from properties.$id.tsx when a property page loads.
 */

import type { ApiProperty } from "./api";

const STORAGE_KEY = "nivaas_viewed_properties";
const MAX_ITEMS   = 20;

export interface ViewedProperty {
  id:             string;
  title:          string;
  city:           string;
  locality:       string | null;
  price:          number;
  listing_type:   string;
  property_type:  string;
  bedrooms:       number | null;
  cover_image_url:string | null;
  images:         string[];
  viewed_at:      string; // ISO timestamp
}

/** Read the full viewed list from localStorage */
export function getViewedProperties(): ViewedProperty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ViewedProperty[];
  } catch {
    return [];
  }
}

/** Record a property view (call when property detail page loads) */
export function recordPropertyView(p: ApiProperty): void {
  try {
    const existing = getViewedProperties().filter(v => v.id !== p.id);
    const entry: ViewedProperty = {
      id:              p.id,
      title:           p.title,
      city:            p.city,
      locality:        p.locality ?? null,
      price:           p.price,
      listing_type:    p.listing_type,
      property_type:   p.property_type,
      bedrooms:        p.bedrooms ?? null,
      cover_image_url: p.cover_image_url ?? null,
      images:          p.images ?? [],
      viewed_at:       new Date().toISOString(),
    };
    // Prepend + cap at MAX_ITEMS
    const updated = [entry, ...existing].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Dispatch event so any listener (e.g. popup hook) can react
    window.dispatchEvent(new CustomEvent("nivaas_property_viewed", { detail: entry }));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/** Get properties viewed in the last N hours */
export function getRecentlyViewed(withinHours = 72): ViewedProperty[] {
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return getViewedProperties().filter(v => new Date(v.viewed_at).getTime() > cutoff);
}

/** Remove a single property from view history (e.g. after owner deletes it) */
export function removePropertyFromHistory(propertyId: string): void {
  try {
    const updated = getViewedProperties().filter(v => v.id !== propertyId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Notify listeners so RecentlyViewedSection re-renders immediately
    window.dispatchEvent(new CustomEvent("nivaas_property_viewed"));
  } catch { /* ignore */ }
}

/** Remove multiple properties from view history at once */
export function removePropertiesFromHistory(ids: Set<string>): void {
  try {
    const updated = getViewedProperties().filter(v => !ids.has(v.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("nivaas_property_viewed"));
  } catch { /* ignore */ }
}

/** Clear all view history (e.g. on sign-out) */
export function clearViewHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
