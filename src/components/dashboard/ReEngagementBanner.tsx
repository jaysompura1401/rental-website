/**
 * ReEngagementBanner.tsx
 *
 * Amazon-style returning-customer welcome banner.
 * Shown only when the user has been away ≥ 2 days and
 * has prior activity (saved / visited / inquired).
 *
 * Dismissible via localStorage so it doesn't reappear
 * in the same browser session.
 */

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { X, Sparkles, Clock, TrendingUp, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReturningUserResponse, ReEngagementType } from "@/lib/recommendations-api";

interface Props {
  data: ReturningUserResponse;
}

// ─── Dismiss key — keyed to today's date so it resets daily ──────────────────
function dismissKey() {
  const today = new Date().toISOString().slice(0, 10);
  return `nivaas_reengage_dismissed_${today}`;
}

// ─── Icon + colour per re-engagement type ─────────────────────────────────────
function getBannerConfig(type: ReEngagementType) {
  switch (type) {
    case "long_absent":
      return {
        Icon:      TrendingUp,
        gradient:  "from-amber-50 to-orange-50",
        border:    "border-amber-200",
        iconBg:    "bg-amber-100",
        iconColor: "text-amber-600",
        badgeBg:   "bg-amber-100 text-amber-700",
        badgeText: "We missed you!",
      };
    case "returning":
      return {
        Icon:      Sparkles,
        gradient:  "from-primary/5 to-primary/10",
        border:    "border-primary/30",
        iconBg:    "bg-primary/10",
        iconColor: "text-primary",
        badgeBg:   "bg-primary/10 text-primary",
        badgeText: "Welcome back",
      };
    case "recent_return":
      return {
        Icon:      Home,
        gradient:  "from-blue-50 to-indigo-50",
        border:    "border-blue-200",
        iconBg:    "bg-blue-100",
        iconColor: "text-blue-600",
        badgeBg:   "bg-blue-100 text-blue-700",
        badgeText: "Good to see you",
      };
    default:
      return {
        Icon:      Clock,
        gradient:  "from-muted/40 to-muted/20",
        border:    "border-border/60",
        iconBg:    "bg-muted",
        iconColor: "text-muted-foreground",
        badgeBg:   "bg-muted text-muted-foreground",
        badgeText: "Back again",
      };
  }
}

// ─── Activity summary chips ───────────────────────────────────────────────────
function ActivityChip({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-border/60 px-2.5 py-1 text-xs font-semibold text-foreground/80">
      <span className="font-bold text-primary">{count}</span> {label}
    </span>
  );
}

export function ReEngagementBanner({ data }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // Check if already dismissed today
  useEffect(() => {
    try {
      if (localStorage.getItem(dismissKey()) === "1") setDismissed(true);
    } catch {
      // localStorage unavailable — just show the banner
    }
  }, []);

  // Only show for users who have been away ≥ 2 days and have activity
  const shouldShow =
    !dismissed &&
    data.is_returning &&
    data.re_engagement_message !== null &&
    data.re_engagement_type !== "active" &&
    data.re_engagement_type !== "new_user";

  if (!shouldShow) return null;

  const cfg = getBannerConfig(data.re_engagement_type);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey(), "1"); } catch { /* ignore */ }
  };

  const { saved_count, visit_count, inquiry_count } = data.activity_summary;

  return (
    <div
      role="banner"
      aria-label="Welcome back banner"
      className={`relative rounded-2xl border bg-gradient-to-br ${cfg.gradient} ${cfg.border} p-4 sm:p-5 mb-5`}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-foreground/50 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 sm:gap-4 pr-8">
        {/* Icon */}
        <div
          className={`shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-xl ${cfg.iconBg} flex items-center justify-center`}
        >
          <cfg.Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${cfg.iconColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Badge */}
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide mb-1.5 ${cfg.badgeBg}`}
          >
            {cfg.badgeText}
          </span>

          {/* Main message */}
          <p className="font-display font-bold text-sm sm:text-base leading-snug text-foreground pr-2">
            {data.re_engagement_message}
          </p>

          {/* Activity summary chips */}
          {(saved_count > 0 || visit_count > 0 || inquiry_count > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ActivityChip count={saved_count}   label={saved_count   === 1 ? "saved property"   : "saved properties"} />
              <ActivityChip count={visit_count}   label={visit_count   === 1 ? "visit booked"      : "visits booked"}    />
              <ActivityChip count={inquiry_count} label={inquiry_count === 1 ? "inquiry sent"      : "inquiries sent"}   />
            </div>
          )}

          {/* CTA row */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="hero" size="sm" className="h-8 px-4 text-xs sm:text-sm">
              <Link to="/properties">Explore New Listings</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs sm:text-sm bg-white/60"
            >
              <Link to="/dashboard/saved">View Saved</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
