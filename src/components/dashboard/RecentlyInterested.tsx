/**
 * RecentlyInterested.tsx
 *
 * "Recently Interested Properties" — compact 2-col list.
 * Merges TWO sources:
 *   1. Backend data: saved / visited / inquired (from /returning endpoint)
 *   2. Client-side view history (localStorage — recordPropertyView)
 *
 * This means it shows up even before the user has visited/saved/inquired
 * through the full flow — just browsing property detail pages is enough.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Heart, Calendar, MessageSquare, MapPin, ArrowUpRight, History, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/mock-properties";
import { getRecentlyViewed, type ViewedProperty } from "@/lib/view-history";
import type { RecentlyInterestedProperty } from "@/lib/recommendations-api";

interface Props {
  /** Items from /api/recommendations/returning */
  backendItems?: RecentlyInterestedProperty[];
}

// ─── Time-since helper ────────────────────────────────────────────────────────
function timeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (mins < 60)  return mins <= 1 ? "Just now" : `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Unified display item ─────────────────────────────────────────────────────
interface DisplayItem {
  id:              string;
  title:           string;
  city:            string;
  locality:        string | null;
  price:           number;
  listing_type:    string;
  property_type:   string;
  bedrooms:        number | null;
  cover_image_url: string | null;
  images:          string[];
  interaction_type:"saved" | "visited" | "inquired" | "viewed";
  interaction_date:string;
}

// ─── Badge config ─────────────────────────────────────────────────────────────
const BADGE = {
  saved:    { Icon: Heart,          cls: "text-pink-600 bg-pink-50 border-pink-200",    label: "Saved"    },
  visited:  { Icon: Calendar,       cls: "text-amber-700 bg-amber-50 border-amber-200", label: "Visited"  },
  inquired: { Icon: MessageSquare,  cls: "text-blue-700 bg-blue-50 border-blue-200",    label: "Inquired" },
  viewed:   { Icon: Eye,            cls: "text-slate-600 bg-slate-50 border-slate-200", label: "Viewed"   },
} as const;

// ─── Single card ──────────────────────────────────────────────────────────────
function RecentCard({ item }: { item: DisplayItem }) {
  const coverImage =
    (item.images && item.images.length > 0 ? item.images[0] : null) ??
    item.cover_image_url ?? null;

  const badge = BADGE[item.interaction_type] ?? BADGE.viewed;

  return (
    <Link
      to="/properties/$id"
      params={{ id: item.id }}
      className="group flex items-center gap-3 rounded-xl border border-[#e8d9c0] hover:border-[#C9921A] bg-white p-3 transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Thumbnail */}
      <div className="relative shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-[#fcebd1]/40">
        {coverImage ? (
          <img
            src={coverImage}
            alt={item.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="h-6 w-6 text-[#C9921A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs sm:text-sm font-semibold leading-snug line-clamp-1 group-hover:text-[#C9921A] transition-colors">
            {item.title}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1 whitespace-nowrap">
            {timeSince(item.interaction_date)}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[#a08858]">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.locality || item.city}</span>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs font-bold text-[#C9921A]">
            {formatINR(item.price)}
            {item.listing_type !== "sale" && (
              <span className="text-[10px] font-normal text-[#a08858]">/mo</span>
            )}
          </span>
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold border ${badge.cls}`}
          >
            <badge.Icon className="h-2 w-2 shrink-0" />
            {badge.label}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RecentlyInterested({ backendItems = [] }: Props) {
  // Merge backend items + client-side view history
  const merged = useMemo<DisplayItem[]>(() => {
    const seen = new Set<string>();
    const result: DisplayItem[] = [];

    // Backend items first (higher confidence signals)
    for (const item of backendItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push({
          id:              item.id,
          title:           item.title,
          city:            item.city,
          locality:        item.locality ?? null,
          price:           item.price,
          listing_type:    item.listing_type,
          property_type:   item.property_type,
          bedrooms:        item.bedrooms ?? null,
          cover_image_url: item.cover_image_url ?? null,
          images:          item.images ?? [],
          interaction_type: item.interaction_type as any,
          interaction_date: item.interaction_date,
        });
      }
    }

    // Client-side viewed properties (from localStorage)
    const clientViewed = getRecentlyViewed(72);
    for (const v of clientViewed) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        result.push({
          id:              v.id,
          title:           v.title,
          city:            v.city,
          locality:        v.locality,
          price:           v.price,
          listing_type:    v.listing_type,
          property_type:   v.property_type,
          bedrooms:        v.bedrooms,
          cover_image_url: v.cover_image_url,
          images:          v.images,
          interaction_type:"viewed",
          interaction_date: v.viewed_at,
        });
      }
    }

    // Sort by most recent interaction first
    return result
      .sort((a, b) => new Date(b.interaction_date).getTime() - new Date(a.interaction_date).getTime())
      .slice(0, 6);
  }, [backendItems]);

  if (merged.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <History className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg">
              Recently Interested
            </h2>
            <p className="text-xs text-muted-foreground">
              Properties you've viewed & engaged with
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs h-7 px-2 shrink-0">
          <Link to="/dashboard/saved">
            Saved <ArrowUpRight className="h-3 w-3 ml-0.5" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {merged.map(item => (
          <RecentCard key={`${item.id}-${item.interaction_type}`} item={item} />
        ))}
      </div>
    </div>
  );
}
