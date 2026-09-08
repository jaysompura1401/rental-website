/**
 * PropertyPublishConfirmation
 *
 * Shown immediately after an owner successfully publishes a property.
 * Displays a success icon, a thank-you heading, three informational steps
 * (Verification → Personal Visit → Go Live) and a CTA that navigates the
 * owner to their My Properties page.
 *
 * Design: matches the reference card the user shared —
 *   • white card on a semi-transparent overlay
 *   • large green check circle at the top
 *   • three step icons in a horizontal row with connecting lines
 *   • single "Go to My Properties →" button
 *
 * Props:
 *   open      — whether the dialog is visible
 *   onClose   — called when the backdrop or X is clicked (optional dismiss)
 */

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  CalendarCheck2,
  Rocket,
  ArrowRight,
} from "lucide-react";

interface PropertyPublishConfirmationProps {
  open: boolean;
  onClose?: () => void;
}

const STEPS = [
  {
    Icon: ClipboardCheck,
    title: "Verification",
    description: "Our team will verify your property details.",
  },
  {
    Icon: CalendarCheck2,
    title: "Personal Visit",
    description: "We'll schedule a visit at your convenience.",
  },
  {
    Icon: Rocket,
    title: "Go Live",
    description: "Your property will be live after verification.",
  },
];

export function PropertyPublishConfirmation({
  open,
  onClose,
}: PropertyPublishConfirmationProps) {
  const navigate = useNavigate();

  const handleGoToProperties = () => {
    onClose?.();
    navigate({ to: "/dashboard/properties" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/*
       * No DialogHeader / DialogTitle here — the card is self-contained.
       * We add the visually-hidden title via aria-label on the content so
       * screen-readers still announce context when the dialog opens.
       */}
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-0 shadow-2xl"
        aria-label="Property submitted successfully"
      >
        {/* ── Top gradient band ─────────────────────────────────────────── */}
        <div className="bg-gradient-primary px-8 pt-10 pb-16 flex flex-col items-center text-center text-white">
          {/* Success circle */}
          <div className="relative mb-5">
            {/* Outer pulse ring */}
            <div className="absolute inset-0 rounded-full bg-white/20 scale-125" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30">
              <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={1.75} />
            </div>
          </div>

          <h2 className="text-xl font-bold leading-snug">
            Thank you for submitting<br />your application!
          </h2>
          <p className="mt-2 text-sm text-white/80 max-w-xs">
            Our team will come soon to verify your property.
          </p>
        </div>

        {/* ── Steps card (overlaps gradient band) ──────────────────────── */}
        <div className="relative -mt-8 mx-5 mb-6 rounded-2xl bg-white dark:bg-card shadow-lg border border-border/40 px-6 py-6">
          {/* Step row */}
          <div className="relative flex items-start justify-between gap-2">
            {/* Connecting line — sits behind the icons */}
            <div
              className="absolute top-5 left-0 right-0 h-px bg-border/60 mx-[2.25rem]"
              aria-hidden="true"
            />

            {STEPS.map(({ Icon, title, description }) => (
              <div key={title} className="relative flex flex-col items-center text-center flex-1 gap-2">
                {/* Icon bubble */}
                <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-4 ring-white dark:ring-card">
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                </div>
                <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <div className="px-5 pb-7 flex flex-col items-center gap-3">
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={handleGoToProperties}
          >
            Go to My Properties
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Optional subtle dismiss link */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition underline underline-offset-2"
            >
              Post another property
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
