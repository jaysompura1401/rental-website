/**
 * recommendation-popup.ts
 *
 * Shows a rich Sonner toast popup for returning customers.
 *
 * WHEN it shows:
 *   • User is logged in as "customer"
 *   • User has ANY saved properties OR recently viewed properties
 *   • At most once every 24 hours (localStorage key, not sessionStorage)
 *
 * WHAT it shows:
 *   • Personalised headline with user's first name
 *   • Count of saved properties
 *   • Count of recently viewed properties (from client-side view-history)
 *   • Action → /dashboard (where all recommendation panels live)
 */

import { toast } from "sonner";
import { recommendationsApi }   from "./recommendations-api";
import { getRecentlyViewed }    from "./view-history";
import { getToken }             from "./api";

// ─── Throttle: once per 24 hours per user ─────────────────────────────────────
const SHOWN_KEY_PREFIX = "nivaas_rec_popup_";

function shownKey(userId: string): string {
  return `${SHOWN_KEY_PREFIX}${userId}`;
}

function canShow(userId: string): boolean {
  try {
    const raw = localStorage.getItem(shownKey(userId));
    if (!raw) return true;
    const ts = parseInt(raw, 10);
    // Allow again after 24 hours
    return Date.now() - ts > 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

function markShown(userId: string): void {
  try { localStorage.setItem(shownKey(userId), String(Date.now())); } catch { /* ignore */ }
}

export function clearPopupThrottle(userId: string): void {
  try { localStorage.removeItem(shownKey(userId)); } catch { /* ignore */ }
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

/**
 * Trigger the recommendation popup.
 * Called: (1) right after login, (2) on first page-load for already-logged-in customers.
 */
export async function triggerRecommendationPopup(
  userId:   string,
  userName: string | null,
): Promise<void> {
  // Must be logged in
  if (!getToken()) return;

  // Throttle: once per 24h per user
  if (!canShow(userId)) return;

  // Fetch personalised data from backend
  let savedCount   = 0;
  let visitCount   = 0;
  let inquiryCount = 0;
  let preferredCities: string[] = [];
  let daysSince: number | null  = null;
  let backendOk = false;

  try {
    const data    = await recommendationsApi.returning();
    savedCount    = data.activity_summary.saved_count;
    visitCount    = data.activity_summary.visit_count;
    inquiryCount  = data.activity_summary.inquiry_count;
    daysSince     = data.days_since_activity;
    backendOk     = true;

    // Try to get preferred cities from forYou endpoint
    try {
      const rec = await recommendationsApi.forYou(1);
      preferredCities = rec.meta?.preferred_cities ?? [];
    } catch { /* non-critical */ }
  } catch {
    // Backend down — still show toast based on client-side data only
  }

  // Client-side recently viewed
  const recentViewed = getRecentlyViewed(72); // last 72 hours

  // Must have SOME activity to show the popup
  const totalActivity = savedCount + visitCount + inquiryCount + recentViewed.length;
  if (totalActivity === 0) return;

  // Mark shown BEFORE firing toast to prevent double-fire on slow networks
  markShown(userId);

  const name = userName?.split(" ")[0]?.trim() || null;

  // ── Build headline ──────────────────────────────────────────────────────────
  let headline: string;
  if (daysSince !== null && daysSince >= 7) {
    headline = name ? `🏠 Welcome back, ${name}!` : "🏠 Welcome back!";
  } else if (daysSince !== null && daysSince >= 2) {
    headline = name ? `✨ Hey ${name}, new matches for you!` : "✨ New matches for you!";
  } else {
    headline = name ? `👋 Hi ${name}, here's what's waiting` : "👋 Your property activity";
  }

  // ── Build description lines ─────────────────────────────────────────────────
  const lines: string[] = [];

  if (savedCount > 0) {
    lines.push(`❤️ ${savedCount} saved propert${savedCount > 1 ? "ies" : "y"}`);
  }
  if (recentViewed.length > 0) {
    lines.push(`👁️ ${recentViewed.length} recently viewed`);
  }
  if (visitCount > 0) {
    lines.push(`📅 ${visitCount} visit${visitCount > 1 ? "s" : ""} booked`);
  }
  if (inquiryCount > 0) {
    lines.push(`💬 ${inquiryCount} inquir${inquiryCount > 1 ? "ies" : "y"} sent`);
  }
  if (preferredCities.length > 0) {
    lines.push(`📍 Matches in ${preferredCities.slice(0, 2).join(", ")}`);
  }

  const description = lines.join("  ·  ");

  // ── Fire toast ──────────────────────────────────────────────────────────────
  toast(headline, {
    description,
    duration: 9000,          // 9 seconds
    action: {
      label: "View All →",
      onClick: () => {
        window.location.href = "/dashboard";
      },
    },
    cancel: {
      label: "✕",
      onClick: () => {},
    },
    style: {
      background:   "#fff",
      border:       "1px solid #C9921A",
      borderRadius: "16px",
      padding:      "16px",
      maxWidth:     "380px",
      boxShadow:    "0 8px 32px -4px rgba(201,146,26,0.25)",
    },
    classNames: {
      title:       "font-display font-bold text-sm text-[#1a1209]",
      description: "text-xs text-[#836737] mt-1 leading-relaxed",
      actionButton:"!bg-[#C9921A] !text-white !rounded-lg !text-xs !font-semibold !px-3 !py-1.5",
      cancelButton:"!bg-transparent !text-[#a08858] !text-xs",
    },
  });
}
