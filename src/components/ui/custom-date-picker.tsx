import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Calendar as CalendarIcon, X, Check, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomDatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  placeholder?: string;
  disabled?: boolean;
  theme?: "purple" | "gold";
  rangeStart?: string; // YYYY-MM-DD
  rangeEnd?: string; // YYYY-MM-DD
  className?: string;
  id?: string;
  ariaLabel?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseYMD(str?: string): { year: number; month: number; day: number } | null {
  if (!str) return null;
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return null;
  return { year: parts[0], month: parts[1] - 1, day: parts[2] };
}

function toYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function formatHuman(str?: string): string {
  const p = parseYMD(str);
  if (!p) return "";
  try {
    const d = new Date(p.year, p.month, p.day);
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return str || "";
  }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function CustomDatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Select date",
  disabled = false,
  theme = "purple",
  rangeStart,
  rangeEnd,
  className,
  id,
  ariaLabel = "Select date",
}: CustomDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = React.useState(false);
  const [showYearDropdown, setShowYearDropdown] = React.useState(false);

  const monthRef = React.useRef<HTMLDivElement>(null);
  const yearRef = React.useRef<HTMLDivElement>(null);

  // Close custom dropdowns if clicking outside of them
  React.useEffect(() => {
    if (!showMonthDropdown && !showYearDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (monthRef.current && !monthRef.current.contains(target)) {
        setShowMonthDropdown(false);
      }
      if (yearRef.current && !yearRef.current.contains(target)) {
        setShowYearDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMonthDropdown, showYearDropdown]);

  // Close custom dropdowns when main popover closes
  React.useEffect(() => {
    if (!open) {
      setShowMonthDropdown(false);
      setShowYearDropdown(false);
    }
  }, [open]);

  // Determine initial month to view: value > minDate > today
  const today = new Date();
  const todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

  const initialParsed = parseYMD(value) || parseYMD(minDate) || {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  };

  const [viewYear, setViewYear] = React.useState<number>(initialParsed.year);
  const [viewMonth, setViewMonth] = React.useState<number>(initialParsed.month);

  // Sync view when opened with a selected value
  React.useEffect(() => {
    if (open) {
      const p = parseYMD(value) || parseYMD(minDate);
      if (p) {
        setViewYear(p.year);
        setViewMonth(p.month);
      }
    }
  }, [open, value, minDate]);

  // Navigate months
  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMonthDropdown(false);
    setShowYearDropdown(false);
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMonthDropdown(false);
    setShowYearDropdown(false);
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Month navigation bounds check
  const canGoPrev = React.useMemo(() => {
    if (!minDate) return true;
    const minP = parseYMD(minDate);
    if (!minP) return true;
    return viewYear > minP.year || (viewYear === minP.year && viewMonth > minP.month);
  }, [minDate, viewYear, viewMonth]);

  const canGoNext = React.useMemo(() => {
    if (!maxDate) return true;
    const maxP = parseYMD(maxDate);
    if (!maxP) return true;
    return viewYear < maxP.year || (viewYear === maxP.year && viewMonth < maxP.month);
  }, [maxDate, viewYear, viewMonth]);

  // Grid calculation
  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const prevMonthTotalDays = new Date(viewYear, viewMonth, 0).getDate();

  // Color tokens based on theme
  const isPurple = theme === "purple";

  const handleSelectDay = (day: number) => {
    const selected = toYMD(viewYear, viewMonth, day);
    onChange(selected);
    setOpen(false);
  };

  const handlePreset = (daysFromToday: number) => {
    const base = new Date();
    base.setDate(base.getDate() + daysFromToday);
    const targetYMD = toYMD(base.getFullYear(), base.getMonth(), base.getDate());
    onChange(targetYMD);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  // Year options for jump selector (current year - 1 to current year + 7)
  const currentYear = today.getFullYear();
  const yearOptions = Array.from({ length: 9 }, (_, i) => currentYear - 1 + i);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "group relative flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-bold transition-all duration-200 shadow-2xs outline-none",
            isPurple
              ? "bg-[#faf6ff]/70 border-[#c4b5fd] hover:border-[#7C3AED] hover:bg-[#faf6ff]"
              : "bg-white border-[#e8d9c0] hover:border-[#C9921A] hover:bg-[#fdfbf7]",
            open && (isPurple ? "ring-2 ring-[#7C3AED]/25 border-[#7C3AED] bg-white" : "ring-2 ring-[#C9921A]/25 border-[#C9921A] bg-white"),
            disabled && "cursor-not-allowed opacity-50 bg-gray-50 border-gray-200",
            className
          )}
        >
          {/* Left: Icon & Text */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-colors text-xs font-bold",
                isPurple
                  ? value ? "bg-[#7C3AED] text-white" : "bg-[#f3e8ff] text-[#7C3AED] group-hover:bg-[#7C3AED] group-hover:text-white"
                  : value ? "bg-[#C9921A] text-white" : "bg-[#fef3d4] text-[#C9921A] group-hover:bg-[#C9921A] group-hover:text-white"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </span>

            <div className="flex flex-col min-w-0">
              {value ? (
                <span className="truncate font-extrabold text-[#1a1209] text-xs sm:text-sm">
                  {formatHuman(value)}
                </span>
              ) : (
                <span className="truncate text-xs font-normal text-[#a08858]">
                  {placeholder}
                </span>
              )}
            </div>
          </div>

          {/* Right: Clear or Action Badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {value && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                title="Clear date"
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-100 hover:text-destructive transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-colors flex items-center gap-0.5",
                isPurple
                  ? "bg-[#f3e8ff] text-[#7C3AED] border-[#e0ceff]"
                  : "bg-[#fef3d4] text-[#C9921A] border-[#f4deb4]"
              )}
            >
              Pick <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            </span>
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "w-[330px] p-0 rounded-3xl border shadow-2xl overflow-visible z-[100] animate-in fade-in zoom-in-95",
          isPurple ? "border-[#c4b5fd] bg-white ring-1 ring-[#7C3AED]/10" : "border-[#e8d9c0] bg-white ring-1 ring-[#C9921A]/10"
        )}
      >
        {/* ── Top Header Banner ── */}
        <div
          className={cn(
            "relative px-4 py-3 border-b flex items-center justify-between rounded-t-3xl",
            isPurple ? "bg-gradient-to-r from-[#faf6ff] to-[#f3e8ff] border-[#e0ceff]" : "bg-gradient-to-r from-[#fdfbf7] to-[#fef3d4] border-[#f0e4d2]"
          )}
        >
          {/* Custom Month & Year Selector Buttons */}
          <div className="flex items-center gap-2">
            {/* Custom Month Dropdown */}
            <div className="relative" ref={monthRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMonthDropdown(v => !v);
                  setShowYearDropdown(false);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all cursor-pointer shadow-2xs select-none",
                  showMonthDropdown
                    ? isPurple
                      ? "border-[#7C3AED] bg-white text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-sm"
                      : "border-[#C9921A] bg-white text-[#C9921A] ring-2 ring-[#C9921A]/20 shadow-sm"
                    : isPurple
                      ? "border-[#c4b5fd] bg-white/95 text-[#1a1209] hover:border-[#7C3AED] hover:text-[#7C3AED]"
                      : "border-[#e8d9c0] bg-white/95 text-[#1a1209] hover:border-[#C9921A] hover:text-[#C9921A]"
                )}
              >
                <span>{MONTH_NAMES[viewMonth]}</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200 opacity-70",
                    showMonthDropdown && "rotate-180 opacity-100",
                    isPurple ? "text-[#7C3AED]" : "text-[#C9921A]"
                  )}
                />
              </button>

              {/* Custom Month Dropdown Menu */}
              {showMonthDropdown && (
                <div
                  className={cn(
                    "absolute top-full left-0 mt-2 w-44 max-h-60 overflow-y-auto rounded-2xl border bg-white p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95",
                    isPurple
                      ? "border-[#c4b5fd] shadow-[#7C3AED]/20 ring-1 ring-[#7C3AED]/10"
                      : "border-[#e8d9c0] shadow-[#C9921A]/20 ring-1 ring-[#C9921A]/10"
                  )}
                >
                  <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-gray-100 mb-1">
                    Select Month
                  </div>
                  {MONTH_NAMES.map((name, idx) => {
                    const isSelected = viewMonth === idx;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewMonth(idx);
                          setShowMonthDropdown(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-left mb-0.5 last:mb-0",
                          isSelected
                            ? isPurple
                              ? "bg-[#7C3AED] text-white shadow-xs font-black"
                              : "bg-[#C9921A] text-white shadow-xs font-black"
                            : isPurple
                              ? "text-[#1a1209] hover:bg-[#faf6ff] hover:text-[#7C3AED]"
                              : "text-[#1a1209] hover:bg-[#fef8eb] hover:text-[#C9921A]"
                        )}
                      >
                        <span>{name}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom Year Dropdown */}
            <div className="relative" ref={yearRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowYearDropdown(v => !v);
                  setShowMonthDropdown(false);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all cursor-pointer shadow-2xs select-none",
                  showYearDropdown
                    ? isPurple
                      ? "border-[#7C3AED] bg-white text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-sm"
                      : "border-[#C9921A] bg-white text-[#C9921A] ring-2 ring-[#C9921A]/20 shadow-sm"
                    : isPurple
                      ? "border-[#c4b5fd] bg-white/95 text-[#1a1209] hover:border-[#7C3AED] hover:text-[#7C3AED]"
                      : "border-[#e8d9c0] bg-white/95 text-[#1a1209] hover:border-[#C9921A] hover:text-[#C9921A]"
                )}
              >
                <span>{viewYear}</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200 opacity-70",
                    showYearDropdown && "rotate-180 opacity-100",
                    isPurple ? "text-[#7C3AED]" : "text-[#C9921A]"
                  )}
                />
              </button>

              {/* Custom Year Dropdown Menu */}
              {showYearDropdown && (
                <div
                  className={cn(
                    "absolute top-full left-0 mt-2 w-32 max-h-60 overflow-y-auto rounded-2xl border bg-white p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95",
                    isPurple
                      ? "border-[#c4b5fd] shadow-[#7C3AED]/20 ring-1 ring-[#7C3AED]/10"
                      : "border-[#e8d9c0] shadow-[#C9921A]/20 ring-1 ring-[#C9921A]/10"
                  )}
                >
                  <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-gray-100 mb-1">
                    Select Year
                  </div>
                  {yearOptions.map((y) => {
                    const isSelected = viewYear === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewYear(y);
                          setShowYearDropdown(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-left mb-0.5 last:mb-0",
                          isSelected
                            ? isPurple
                              ? "bg-[#7C3AED] text-white shadow-xs font-black"
                              : "bg-[#C9921A] text-white shadow-xs font-black"
                            : isPurple
                              ? "text-[#1a1209] hover:bg-[#faf6ff] hover:text-[#7C3AED]"
                              : "text-[#1a1209] hover:bg-[#fef8eb] hover:text-[#C9921A]"
                        )}
                      >
                        <span>{y}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Prev / Next Month Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevMonth}
              disabled={!canGoPrev}
              title="Previous Month"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl border bg-white text-[#1a1209] transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed",
                isPurple ? "border-[#c4b5fd] hover:text-[#7C3AED]" : "border-[#e8d9c0] hover:text-[#C9921A]"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              disabled={!canGoNext}
              title="Next Month"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl border bg-white text-[#1a1209] transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed",
                isPurple ? "border-[#c4b5fd] hover:text-[#7C3AED]" : "border-[#e8d9c0] hover:text-[#C9921A]"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Days of Week Header ── */}
        <div className="grid grid-cols-7 gap-1 px-3 pt-3 text-center">
          {WEEKDAYS.map(w => (
            <div
              key={w}
              className={cn(
                "text-[10px] font-black uppercase tracking-wider py-1 select-none",
                isPurple ? "text-[#7C3AED]" : "text-[#836737]"
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* ── Calendar Days Grid ── */}
        <div className="grid grid-cols-7 gap-1 px-3 py-2">
          {/* Leading empty days from previous month */}
          {Array.from({ length: firstDay }).map((_, i) => {
            const prevDayNum = prevMonthTotalDays - firstDay + i + 1;
            return (
              <div
                key={`empty-prev-${i}`}
                className="h-8 flex items-center justify-center text-xs font-semibold text-[#cab9a7]/40 select-none"
              >
                {prevDayNum}
              </div>
            );
          })}

          {/* Current month days */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const dayNum = i + 1;
            const dayYMD = toYMD(viewYear, viewMonth, dayNum);

            const isSelected = value === dayYMD;
            const isToday = todayYMD === dayYMD;

            // Bounds check
            const isBeforeMin = minDate ? dayYMD < minDate : false;
            const isAfterMax = maxDate ? dayYMD > maxDate : false;
            const isDisabled = isBeforeMin || isAfterMax;

            // Range calculation (between rangeStart and rangeEnd)
            const isInRange =
              rangeStart && rangeEnd &&
              dayYMD >= rangeStart &&
              dayYMD <= rangeEnd;

            return (
              <button
                key={dayYMD}
                type="button"
                disabled={isDisabled}
                onClick={() => handleSelectDay(dayNum)}
                className={cn(
                  "relative h-8 w-full rounded-xl flex items-center justify-center text-xs font-bold transition-all select-none cursor-pointer outline-none",
                  // Selected State
                  isSelected
                    ? isPurple
                      ? "bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/30 scale-105 z-10 font-black"
                      : "bg-[#C9921A] text-white shadow-md shadow-[#C9921A]/30 scale-105 z-10 font-black"
                    : "",
                  // In-Range State (not selected)
                  !isSelected && isInRange
                    ? isPurple
                      ? "bg-[#f3e8ff] text-[#7C3AED] font-bold"
                      : "bg-[#fef3d4] text-[#C9921A] font-bold"
                    : "",
                  // Today marker (not selected)
                  !isSelected && isToday
                    ? isPurple
                      ? "border-2 border-[#7C3AED] text-[#7C3AED] font-extrabold"
                      : "border-2 border-[#C9921A] text-[#C9921A] font-extrabold"
                    : "",
                  // Normal day hover
                  !isSelected && !isDisabled && !isInRange
                    ? isPurple
                      ? "hover:bg-[#faf6ff] hover:text-[#7C3AED] text-[#1a1209]"
                      : "hover:bg-[#fef8eb] hover:text-[#C9921A] text-[#1a1209]"
                    : "",
                  // Disabled state
                  isDisabled && "opacity-25 cursor-not-allowed text-[#cab9a7] hover:bg-transparent"
                )}
              >
                <span>{dayNum}</span>
                {isToday && !isSelected && (
                  <span
                    className={cn(
                      "absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full",
                      isPurple ? "bg-[#7C3AED]" : "bg-[#C9921A]"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Quick Shortcut Presets ── */}
        <div className="border-t border-[#f0e4d2] bg-[#fdfbf7] p-2.5 space-y-2 rounded-b-3xl">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#836737] px-1">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Quick Presets
            </span>
            {value && (
              <span className="text-[10px] text-green-700 font-extrabold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                ✓ {formatHuman(value)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => handlePreset(0)}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-lg border bg-white transition hover:scale-105 active:scale-95 cursor-pointer shadow-2xs",
                todayYMD === value
                  ? isPurple ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-[#C9921A] text-white border-[#C9921A]"
                  : "border-[#e8d9c0] text-[#1a1209] hover:bg-white"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset(7)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-[#e8d9c0] bg-white text-[#1a1209] hover:bg-white hover:text-[#7C3AED] transition hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              +1 Week
            </button>
            <button
              type="button"
              onClick={() => handlePreset(14)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-[#e8d9c0] bg-white text-[#1a1209] hover:bg-white hover:text-[#7C3AED] transition hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              +2 Weeks
            </button>
            <button
              type="button"
              onClick={() => handlePreset(30)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-[#e8d9c0] bg-white text-[#1a1209] hover:bg-white hover:text-[#7C3AED] transition hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              +1 Month
            </button>

            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-bold px-2 py-1 rounded-lg text-destructive hover:bg-red-50 transition ml-auto cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
