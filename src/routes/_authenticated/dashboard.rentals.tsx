import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  rentals as rentalsApi, rentalsExt, dummyPayNow,
  agreements as agreementsApi,
  type ApiPayment, type RentalStats, type ApiAgreement,
} from "@/lib/api";
import { formatINR } from "@/lib/mock-properties";
import {
  CheckCircle2, Clock, AlertTriangle, Download, Send, Loader2,
  Receipt, Home, TrendingUp, CreditCard, CalendarDays, BadgeCheck,
  Banknote, ShieldCheck, Hash,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchProfile } from "@/lib/auth-cache";

export const Route = createFileRoute("/_authenticated/dashboard/rentals")({
  head: () => ({ meta: [{ title: "Rental Management — Nivaas" }] }),
  component: Rentals,
});

// ─── Status helpers ───────────────────────────────────────────────────────────

/**
 * Derive the display status from a payment record.
 * "pending" rows whose due_date has already passed are treated as "overdue"
 * on the client so the UI immediately reflects reality without waiting for a
 * backend cron job.
 */
function resolveStatus(r: ApiPayment): "paid" | "overdue" | "due" | "upcoming" | "waived" {
  if (r.status === "paid")   return "paid";
  if (r.status === "waived") return "waived";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(r.due_date);
  due.setHours(0, 0, 0, 0);

  if (r.status === "overdue" || due < today) return "overdue";

  // Within 7 days → "Due" (urgent), otherwise "Upcoming"
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return diffDays <= 7 ? "due" : "upcoming";
}

const STATUS_META: Record<
  "paid" | "overdue" | "due" | "upcoming" | "waived",
  { label: string; Icon: React.ElementType; cls: string }
> = {
  paid:     { label: "Paid",     Icon: CheckCircle2,  cls: "bg-primary/10 text-primary border-primary/20" },
  overdue:  { label: "Overdue",  Icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/20" },
  due:      { label: "Due",      Icon: Clock,         cls: "bg-amber-100 text-amber-700 border-amber-200" },
  upcoming: { label: "Upcoming", Icon: CalendarDays,  cls: "bg-secondary text-secondary-foreground border-border/40" },
  waived:   { label: "Waived",   Icon: CheckCircle2,  cls: "bg-muted text-muted-foreground border-border/40" },
};

// ─── Receipt Modal ────────────────────────────────────────────────────────────

function ReceiptModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rentalsExt.receipt(paymentId)
      .then(setData)
      .catch(() => toast.error("Could not load receipt"))
      .finally(() => setLoading(false));
  }, [paymentId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Rent Receipt
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4 text-sm">
            <div className="bg-gradient-primary text-white rounded-xl p-5">
              <p className="text-xs text-white/70">Receipt No.</p>
              <p className="text-lg font-bold">{data.receipt_number}</p>
              <p className="text-xs text-white/70 mt-1">
                {data.generated_at ? new Date(data.generated_at).toLocaleString("en-IN") : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Property</p>
                <p className="font-medium">{data.property_title}</p>
                <p className="text-muted-foreground text-xs">{data.address}</p>
                <p className="text-muted-foreground text-xs">{data.city}, {data.state} – {data.pincode}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Tenant</p>
                <p className="font-medium">{data.tenant_name}</p>
                <p className="text-muted-foreground text-xs">{data.tenant_email}</p>
                <p className="text-muted-foreground text-xs">{data.tenant_phone}</p>
              </div>
            </div>
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rent Due</span>
                <span className="font-medium">{data.due_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid On</span>
                <span className="font-medium text-primary">{data.paid_date ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium capitalize">{data.payment_method ?? "—"}</span>
              </div>
              {data.transaction_id && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Transaction ID
                  </span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{data.transaction_id}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span>Amount Paid</span>
                <span className="text-primary">{formatINR(data.amount)}</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="h-4 w-4 mr-1" /> Print / PDF
              </Button>
              <Button variant="hero" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Receipt unavailable.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Dummy Payment Modal ──────────────────────────────────────────────────────

interface DummyPaymentModalProps {
  payment: ApiPayment;
  onClose: () => void;
  /** Called after the backend status is updated to "paid" */
  onSuccess: (txnId: string, paidDate: string) => void;
}

type PayStep = "confirm" | "processing" | "success";

function DummyPaymentModal({ payment, onClose, onSuccess }: DummyPaymentModalProps) {
  const [step, setStep]           = useState<PayStep>("confirm");
  const [txnId, setTxnId]         = useState("");
  const [paidDate, setPaidDate]   = useState("");
  const displayStatus             = resolveStatus(payment);
  const StatusIcon                = STATUS_META[displayStatus].Icon;

  const handlePay = async () => {
    setStep("processing");
    try {
      // 1. Simulated gateway call (replace with real gateway SDK here)
      const result = await dummyPayNow(payment.amount);

      // 2. Persist to backend
      await rentalsApi.updateStatus(payment.id, {
        status:         "paid",
        paid_date:      result.paid_date,
        payment_method: result.payment_method,
        transaction_id: result.transaction_id,
      });

      setTxnId(result.transaction_id);
      setPaidDate(result.paid_date);
      setStep("success");
      onSuccess(result.transaction_id, result.paid_date);
    } catch (err: any) {
      toast.error(err.message ?? "Payment failed. Please try again.");
      setStep("confirm");
    }
  };

  return (
    <Dialog open onOpenChange={step !== "processing" ? onClose : undefined}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {step === "success" ? "Payment Successful" : "Pay Rent"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Confirm step ── */}
        {step === "confirm" && (
          <div className="space-y-5">
            {/* Amount card */}
            <div className="rounded-xl bg-gradient-primary text-white p-5 space-y-1">
              <p className="text-xs text-white/75">Amount Due</p>
              <p className="text-3xl font-bold">{formatINR(payment.amount)}</p>
              <p className="text-xs text-white/75">
                {payment.property_title}
                {payment.locality || payment.city ? ` · ${payment.locality || payment.city}` : ""}
              </p>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date</span>
                <span className="font-medium">{payment.due_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className={STATUS_META[displayStatus].cls}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {STATUS_META[displayStatus].label}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment via</span>
                <span className="font-medium flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure Demo Gateway
                </span>
              </div>
            </div>

            {/* Demo notice */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
              <Banknote className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Demo mode:</strong> This is a simulated payment — no real money is charged.
                A dummy transaction ID will be generated for tracking.
              </span>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="hero" onClick={handlePay}>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay {formatINR(payment.amount)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Processing step ── */}
        {step === "processing" && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Processing Payment…</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait, do not close this window</p>
            </div>
          </div>
        )}

        {/* ── Success step ── */}
        {step === "success" && (
          <div className="space-y-5">
            {/* Success icon */}
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <BadgeCheck className="h-9 w-9 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">Payment Successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your rent has been paid and recorded.
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-bold text-primary">{formatINR(payment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Date</span>
                <span className="font-medium">{paidDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium capitalize">Online (Demo)</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Transaction ID
                </span>
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{txnId}</span>
              </div>
            </div>

            <Button variant="hero" className="w-full" onClick={onClose}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Owner: Payment Row ───────────────────────────────────────────────────────

function OwnerPaymentRow({ r, showReceipt }: { r: ApiPayment; showReceipt: (id: string) => void }) {
  const display = resolveStatus(r);
  const meta    = STATUS_META[display];
  const [updating, setUpdating] = useState(false);

  const markPaid = async () => {
    setUpdating(true);
    try {
      await rentalsApi.updateStatus(r.id, {
        status:         "paid",
        paid_date:      new Date().toISOString().slice(0, 10),
        payment_method: "manual",
      });
      toast.success("Marked as paid");
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 items-center gap-3 p-5">
      <div className="col-span-2">
        <p className="font-semibold">{r.tenant_name || "Tenant"}</p>
        <p className="text-xs text-muted-foreground">
          {r.property_title} · {r.locality || r.city}
        </p>
      </div>
      <p className="text-sm">Due {r.due_date}</p>
      <p className="font-semibold">{formatINR(r.amount)}</p>
      <Badge className={meta.cls}>
        <meta.Icon className="h-3 w-3 mr-1" />{meta.label}
      </Badge>
      <div className="flex items-center gap-1.5 justify-end flex-wrap">
        {r.status === "paid" && (
          <Button size="sm" variant="ghost" onClick={() => showReceipt(r.id)}>
            <Receipt className="h-3 w-3 mr-1" /> Receipt
          </Button>
        )}
        {display !== "paid" && display !== "waived" && (
          <>
            <Button size="sm" variant="outline" disabled={updating} onClick={markPaid}>
              {updating
                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Mark Paid
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast.info("Reminder sent")}>
              <Send className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tenant: Payment Row ──────────────────────────────────────────────────────

function TenantPaymentRow({
  r,
  showReceipt,
  onPayNow,
}: {
  r: ApiPayment;
  showReceipt: (id: string) => void;
  onPayNow: (r: ApiPayment) => void;
}) {
  const display = resolveStatus(r);
  const meta    = STATUS_META[display];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 items-center gap-3 p-5">
      {/* Property info */}
      <div className="col-span-2">
        <p className="font-semibold">{r.property_title}</p>
        <p className="text-xs text-muted-foreground">{r.locality || r.city}</p>
      </div>

      {/* Due date */}
      <p className="text-sm text-muted-foreground">Due {r.due_date}</p>

      {/* Amount */}
      <p className="font-semibold">{formatINR(r.amount)}</p>

      {/* Status badge */}
      <Badge className={meta.cls}>
        <meta.Icon className="h-3 w-3 mr-1" />{meta.label}
      </Badge>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end flex-wrap">
        {display === "paid" && (
          <Button size="sm" variant="ghost" onClick={() => showReceipt(r.id)}>
            <Receipt className="h-3 w-3 mr-1" /> Receipt
          </Button>
        )}
        {(display === "due" || display === "overdue" || display === "upcoming") && (
          <Button
            size="sm"
            variant={display === "overdue" ? "destructive" : "hero"}
            onClick={() => onPayNow(r)}
          >
            <CreditCard className="h-3 w-3 mr-1" />
            {display === "overdue" ? "Pay Now" : "Pay Rent"}
          </Button>
        )}
        {/* Show transaction ID if available */}
        {display === "paid" && r.transaction_id && (
          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden md:inline">
            {r.transaction_id.slice(0, 18)}…
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Owner View ───────────────────────────────────────────────────────────────

function OwnerView() {
  const [rows, setRows]           = useState<ApiPayment[]>([]);
  const [stats, setStats]         = useState<RentalStats>({ collected: null, pending: null, overdue: null });
  const [loading, setLoading]     = useState(true);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [agreements, setAgreements]   = useState<ApiAgreement[]>([]);
  const [generating, setGenerating]   = useState(false);
  const [seeding, setSeeding]         = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([rentalsApi.list(), rentalsApi.stats(), agreementsApi.list()])
      .then(([list, s, ag]) => { setRows(list); setStats(s); setAgreements(ag); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, []);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const result = await rentalsExt.seedDemo();
      toast.success(`Demo payments added for "${result.property_title}"!`);
      loadAll();
    } catch (err: any) {
      toast.error(err.message ?? "Could not seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  const generateForAgreement = async (agId: string) => {
    setGenerating(true);
    try {
      const result = await rentalsExt.generatePayments(agId);
      toast.success(`${result.created} new payment rows generated`);
      const list = await rentalsApi.list();
      setRows(list);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const signedAgreements = agreements.filter(a => a.status === "signed");

  return (
    <>
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 bg-gradient-primary text-white border-0 shadow-elegant">
          <p className="text-xs uppercase tracking-wide text-white/80">Collected this month</p>
          <p className="mt-2 text-3xl font-bold">{formatINR(Number(stats.collected) || 0)}</p>
        </Card>
        <Card className="p-5 border-border/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
          <p className="mt-2 text-3xl font-bold">{formatINR(Number(stats.pending) || 0)}</p>
        </Card>
        <Card className="p-5 border-border/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-destructive">{formatINR(Number(stats.overdue) || 0)}</p>
        </Card>
      </div>

      {/* Generate payments for signed agreements */}
      {signedAgreements.length > 0 && (
        <Card className="mt-6 p-5 border-border/60">
          <p className="font-display font-bold mb-3">Generate Monthly Payment Schedule</p>
          <div className="space-y-2">
            {signedAgreements.map(ag => (
              <div key={ag.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{ag.property_title}</p>
                  <p className="text-xs text-muted-foreground">
                    Tenant: {ag.tenant_name} · {formatINR(ag.monthly_rent)}/mo · {ag.start_date} → {ag.end_date}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={generating}
                  onClick={() => generateForAgreement(ag.id)}>
                  {generating
                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    : <TrendingUp className="h-3 w-3 mr-1" />}
                  Generate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Payments table */}
      <Card className="mt-6 border-border/60 overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold">Rent Collections</h2>
            <p className="text-xs text-muted-foreground">
              Auto-reminders sent 7 / 3 / 1 day before due date
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={seeding} onClick={handleSeedDemo}>
              {seeding
                ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Adding…</>
                : <><CreditCard className="h-3 w-3 mr-1" /> Demo Data</>}
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center border-t border-border/60 space-y-4">
            <p className="text-sm text-muted-foreground">
              No rent records yet. Sign agreements and generate payment schedules to begin.
            </p>
            <Button variant="outline" size="sm" disabled={seeding} onClick={handleSeedDemo}>
              {seeding
                ? <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Adding demo data…</>
                : <><CreditCard className="h-3 w-3 mr-2" /> Load Demo Payments</>}
            </Button>
          </div>
        ) : (
          <div className="border-t border-border/60 divide-y divide-border/60">
            {rows.map(r => (
              <OwnerPaymentRow key={r.id} r={r} showReceipt={setReceiptId} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Tenant View ──────────────────────────────────────────────────────────────

function TenantView() {
  const [rows, setRows]           = useState<ApiPayment[]>([]);
  const [stats, setStats]         = useState<RentalStats>({ collected: null, pending: null, overdue: null });
  const [loading, setLoading]     = useState(true);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [payingRow, setPayingRow] = useState<ApiPayment | null>(null);
  const [seeding, setSeeding]     = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([rentalsExt.listTenant(), rentalsExt.statsTenant()])
      .then(([list, s]) => { setRows(list); setStats(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const result = await rentalsExt.seedDemo();
      toast.success(`Demo payments added for "${result.property_title}"!`);
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "Could not seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  // After a successful payment: update row in local state immediately so the
  // UI reflects "Paid" without a full page reload, then refresh stats.
  const handlePaySuccess = (paymentId: string, txnId: string, paidDate: string) => {
    setRows(prev =>
      prev.map(r =>
        r.id === paymentId
          ? { ...r, status: "paid", paid_date: paidDate, transaction_id: txnId, payment_method: "online" }
          : r
      )
    );
    setPayingRow(null);
    toast.success("Payment recorded successfully!");
    // Re-fetch stats in background so the stat cards update
    rentalsExt.statsTenant().then(s => setStats(s)).catch(() => {});
  };

  // Categorise rows for the stat cards
  const overdueRows  = rows.filter(r => resolveStatus(r) === "overdue");
  const nextDueRow   = rows.find(r => resolveStatus(r) === "due" || resolveStatus(r) === "upcoming");
  const overdueTotal = overdueRows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}
      {payingRow && (
        <DummyPaymentModal
          payment={payingRow}
          onClose={() => setPayingRow(null)}
          onSuccess={(txnId, paidDate) => handlePaySuccess(payingRow.id, txnId, paidDate)}
        />
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 bg-gradient-primary text-white border-0 shadow-elegant">
          <p className="text-xs uppercase tracking-wide text-white/80">Paid this month</p>
          <p className="mt-2 text-3xl font-bold">{formatINR(Number(stats.collected) || 0)}</p>
        </Card>

        <Card className={`p-5 border-border/60 ${overdueTotal > 0 ? "border-destructive/40 bg-destructive/5" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Overdue</p>
          <p className={`mt-2 text-3xl font-bold ${overdueTotal > 0 ? "text-destructive" : ""}`}>
            {formatINR(overdueTotal || 0)}
          </p>
          {overdueRows.length > 0 && (
            <p className="text-xs text-destructive/80 mt-1">{overdueRows.length} payment{overdueRows.length > 1 ? "s" : ""} overdue</p>
          )}
        </Card>

        <Card className="p-5 border-border/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Next Due</p>
          {nextDueRow ? (
            <>
              <p className="mt-2 text-3xl font-bold">{formatINR(nextDueRow.amount)}</p>
              <p className="text-xs text-muted-foreground mt-1">Due {nextDueRow.due_date}</p>
            </>
          ) : (
            <p className="mt-2 text-xl text-muted-foreground">No upcoming</p>
          )}
        </Card>
      </div>

      {/* Overdue alert banner */}
      {overdueRows.length > 0 && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive">
                {overdueRows.length} overdue payment{overdueRows.length > 1 ? "s" : ""}
              </p>
              <p className="text-sm text-destructive/80">
                Total overdue: {formatINR(overdueTotal)}. Pay now to avoid further penalties.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPayingRow(overdueRows[0])}
          >
            <CreditCard className="h-4 w-4 mr-1" /> Pay Now
          </Button>
        </div>
      )}

      {/* Payment history table */}
      <Card className="mt-6 border-border/60 overflow-hidden">
        <div className="p-5 border-b border-border/60">
          <h2 className="font-display font-bold">My Rent History</h2>
          <p className="text-xs text-muted-foreground">
            Pay upcoming rent, download receipts for paid months
          </p>
        </div>

        {/* Table header */}
        <div className="hidden md:grid grid-cols-6 gap-3 px-5 py-3 bg-muted/40 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="col-span-2">Property</div>
          <div>Due Date</div>
          <div>Amount</div>
          <div>Status</div>
          <div className="text-right">Action</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              No rent payments found. Your payment history will appear here once an agreement is active.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={seeding}
              onClick={handleSeedDemo}
            >
              {seeding
                ? <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Adding demo data…</>
                : <><CreditCard className="h-3 w-3 mr-2" /> Load Demo Payments</>}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map(r => (
              <TenantPaymentRow
                key={r.id}
                r={r}
                showReceipt={setReceiptId}
                onPayNow={setPayingRow}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

function Rentals() {
  const [role, setRole]               = useState<"owner" | "tenant">("owner");
  const [profileRole, setProfileRole] = useState<string>("");

  useEffect(() => {
    fetchProfile().then(p => {
      const r = p?.role ?? "customer";
      setProfileRole(r);
      if (r === "customer") setRole("tenant");
    }).catch(() => {});
  }, []);

  return (
    <DashboardShell
      title="Rental Management"
      subtitle="Track rent collections, receipts and payment schedules"
    >
      {profileRole !== "customer" && (
        <Tabs value={role} onValueChange={v => setRole(v as "owner" | "tenant")} className="mb-6">
          <TabsList>
            <TabsTrigger value="owner"><Home className="h-4 w-4 mr-1" /> Owner View</TabsTrigger>
            <TabsTrigger value="tenant"><Receipt className="h-4 w-4 mr-1" /> Tenant View</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {role === "owner" ? <OwnerView /> : <TenantView />}
    </DashboardShell>
  );
}
