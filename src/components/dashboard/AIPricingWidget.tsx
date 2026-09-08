/**
 * AIPricingWidget — shows suggested price range based on market comparables.
 * Drop anywhere a property form exists.
 */
import { pricing as pricingApi, type PricingSuggestion } from "@/lib/api";
import { formatINR } from "@/lib/mock-properties";
import { Sparkles, Loader2, TrendingUp, Info } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  city: string;
  property_type: string;
  listing_type: string;
  bedrooms?: number;
  area_sqft?: number;
  locality?: string;
  property_id?: string;
  onApply?: (price: number) => void;
}

export function AIPricingWidget({
  city, property_type, listing_type, bedrooms, area_sqft, locality, property_id, onApply,
}: Props) {
  const [data, setData]     = useState<PricingSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const ready = !!(city && property_type && listing_type);

  const fetchSuggestion = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const result = await pricingApi.suggest({
        city, property_type, listing_type,
        bedrooms: bedrooms || undefined,
        area_sqft: area_sqft || undefined,
        locality: locality || undefined,
        property_id: property_id || undefined,
      });
      setData(result);
    } catch (e: any) {
      setError(e.message ?? "Could not fetch pricing suggestion");
    } finally {
      setLoading(false);
    }
  }, [city, property_type, listing_type, bedrooms, area_sqft, locality, property_id]);

  // Auto-fetch when inputs change (debounced via useEffect)
  useEffect(() => {
    if (!ready) { setData(null); return; }
    const timer = setTimeout(fetchSuggestion, 600);
    return () => clearTimeout(timer);
  }, [fetchSuggestion, ready]);

  if (!ready) return null;

  return (
    <div className="rounded-2xl border border-[#f0e4d2] bg-[#fdfbf7] p-4 space-y-3.5 mt-3 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#C9921A]">
          <Sparkles className="h-5 w-5 fill-[#C9921A]/20" />
          <span className="text-sm font-bold text-[#1a1209]">AI Price Suggestion</span>
        </div>
        {data && (
          <span className="text-xs font-semibold text-[#C9921A] bg-[#fef8eb] px-3 py-0.5 rounded-full border border-[#f4deb4]">
            {data.comparables_count} Comparables
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#C9921A]" />
          <span className="text-xs text-[#836737] font-medium">Analyzing live market data…</span>
        </div>
      ) : error ? (
        <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-xl">{error}</p>
      ) : data ? (
        <div className="space-y-3.5">
          {/* Range bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#836737]">
              <span>Min</span>
              <span className="text-[#C9921A] font-bold">Market Range</span>
              <span>Max</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#f0e4d2]/70 overflow-hidden relative p-0.5">
              <div className="mx-auto w-3/5 h-full bg-gradient-to-r from-[#dcb059] via-[#C9921A] to-[#dcb059] rounded-full shadow-xs" />
            </div>
          </div>

          {/* 3 Values: Min / Optimal / Max */}
          <div className="grid grid-cols-3 gap-2 text-center items-center pt-1">
            {/* Minimum */}
            <div className="bg-white rounded-2xl py-2.5 px-1.5 border border-[#f0e4d2] flex flex-col justify-center items-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase tracking-wider">Minimum</p>
              <p className="text-xs sm:text-sm font-extrabold text-[#1a1209] mt-0.5 whitespace-nowrap">{formatINR(data.suggested_min)}</p>
            </div>

            {/* Optimal (Featured Pill) */}
            <div className="bg-gradient-to-b from-[#dcb059] via-[#C9921A] to-[#b38014] text-white rounded-2xl py-2.5 px-1.5 shadow-sm flex flex-col justify-center items-center border border-[#9b6f12]">
              <p className="text-[10px] font-black text-white/95 uppercase tracking-wider flex items-center justify-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> Optimal
              </p>
              <p className="text-xs sm:text-sm font-black text-white mt-0.5 whitespace-nowrap tracking-tight">{formatINR(data.suggested_optimal)}</p>
            </div>

            {/* Maximum */}
            <div className="bg-white rounded-2xl py-2.5 px-1.5 border border-[#f0e4d2] flex flex-col justify-center items-center shadow-2xs">
              <p className="text-[10px] font-bold text-[#836737] uppercase tracking-wider">Maximum</p>
              <p className="text-xs sm:text-sm font-extrabold text-[#1a1209] mt-0.5 whitespace-nowrap">{formatINR(data.suggested_max)}</p>
            </div>
          </div>

          {/* Breakdown metadata */}
          {data.breakdown && (
            <div className="flex items-center justify-between text-[11px] text-[#836737] pt-0.5">
              <div className="flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-[#C9921A] shrink-0" />
                <span>
                  {data.breakdown.area_multiplier !== 1
                    ? `Area adj. x${data.breakdown.area_multiplier.toFixed(2)}`
                    : "Standard area"}
                </span>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#836737]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9921A]" />
                {data.basis === "market_data" ? "Live market data" : "Market defaults"}
              </span>
            </div>
          )}

          {/* Apply button */}
          {onApply && (
            <Button
              type="button"
              size="default"
              variant="hero"
              className="w-full h-10 text-xs sm:text-sm font-extrabold shadow-sm hover:shadow-md cursor-pointer mt-1 rounded-xl bg-gradient-to-r from-[#C9921A] via-[#dcb059] to-[#b38014] text-white"
              onClick={() => {
                onApply(data.suggested_optimal);
              }}
            >
              ✨ Apply Optimal Price ({formatINR(data.suggested_optimal)})
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
