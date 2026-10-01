import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  agentVerification as agentApi,
  type PendingProperty,
  type AgentVerificationRecord,
} from "@/lib/api";
import { formatINR } from "@/lib/mock-properties";
import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { fetchProfile } from "@/lib/auth-cache";
import {
  ShieldCheck, UserCheck, Phone, FileText, Camera, Building2,
  CheckCircle2, Clock, Upload, Loader2, RefreshCw,
  Search, ArrowRight, X, Sparkles, AlertCircle, Eye,
  Check, Lock, Smartphone, ExternalLink, Image as ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/agent-verification")({
  head: () => ({ meta: [{ title: "Agent Verification Panel — Nivaas" }] }),
  beforeLoad: async () => {
    const p = await fetchProfile();
    if (p && !["agent", "admin", "verification_team"].includes(p.role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AgentVerificationPanel,
});

function AgentVerificationPanel() {
  const [properties, setProperties] = useState<PendingProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<PendingProperty | null>(null);
  const [verificationRecord, setVerificationRecord] = useState<AgentVerificationRecord | null>(null);
  const [activeModalOpen, setActiveModalOpen] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  // Verification Form State
  const [phoneToVerify, setPhoneToVerify] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);

  const [aadhaarUrl, setAadhaarUrl] = useState<string | null>(null);
  const [utilityBillUrl, setUtilityBillUrl] = useState<string | null>(null);
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);
  const [propertyPhotos, setPropertyPhotos] = useState<string[]>([]);
  const [agentNotes, setAgentNotes] = useState("");

  const [uploadingAadhaar, setUploadingAadhaar] = useState(false);
  const [uploadingUtility, setUploadingUtility] = useState(false);
  const [uploadingOwnerPhoto, setUploadingOwnerPhoto] = useState(false);
  const [uploadingPropertyPhotos, setUploadingPropertyPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hidden File Inputs
  const aadhaarInputRef = useRef<HTMLInputElement>(null);
  const utilityInputRef = useRef<HTMLInputElement>(null);
  const ownerPhotoInputRef = useRef<HTMLInputElement>(null);
  const propertyPhotosInputRef = useRef<HTMLInputElement>(null);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agentApi.pendingProperties();
      setProperties(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load pending properties");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const openVerificationModal = async (property: PendingProperty) => {
    setSelectedProperty(property);
    setActiveModalOpen(true);
    setFetchingDetails(true);

    // Initial default state
    setPhoneToVerify(property.owner_phone || "");
    setOtpCode("");
    setOtpSent(false);
    setMobileVerified(false);
    setAadhaarUrl(null);
    setUtilityBillUrl(null);
    setOwnerPhotoUrl(null);
    setPropertyPhotos([]);
    setAgentNotes("");

    try {
      const res = await agentApi.getVerification(property.id);
      if (res.verification) {
        setVerificationRecord(res.verification);
        setMobileVerified(!!res.verification.mobile_verified);
        setPhoneToVerify(res.verification.verified_phone || property.owner_phone || "");
        setAadhaarUrl(res.verification.aadhaar_card_url);
        setUtilityBillUrl(res.verification.utility_bill_url);
        setOwnerPhotoUrl(res.verification.owner_photo_url);
        setPropertyPhotos(res.verification.property_photo_urls || []);
        setAgentNotes(res.verification.agent_notes || "");
      } else {
        setVerificationRecord(null);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to load verification details");
    } finally {
      setFetchingDetails(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phoneToVerify || !selectedProperty) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setSendingOtp(true);
    try {
      await agentApi.sendOtp(phoneToVerify, selectedProperty.id);
      setOtpSent(true);
      toast.success("OTP sent to owner mobile number (Use 123456 in demo mode)");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || !phoneToVerify || !selectedProperty) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }
    setVerifyingOtp(true);
    try {
      await agentApi.verifyOtp(phoneToVerify, otpCode, selectedProperty.id);
      setMobileVerified(true);
      toast.success("Mobile number verified successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid OTP code");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: "aadhaar_card" | "utility_bill" | "owner_photo"
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProperty) return;

    if (docType === "aadhaar_card") setUploadingAadhaar(true);
    else if (docType === "utility_bill") setUploadingUtility(true);
    else if (docType === "owner_photo") setUploadingOwnerPhoto(true);

    try {
      const res = await agentApi.uploadDoc(selectedProperty.id, file, docType);
      if (docType === "aadhaar_card") setAadhaarUrl(res.url);
      else if (docType === "utility_bill") setUtilityBillUrl(res.url);
      else if (docType === "owner_photo") setOwnerPhotoUrl(res.url);

      toast.success(`${docType.replace("_", " ")} uploaded successfully`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (docType === "aadhaar_card") setUploadingAadhaar(false);
      else if (docType === "utility_bill") setUploadingUtility(false);
      else if (docType === "owner_photo") setUploadingOwnerPhoto(false);
      if (e.target) e.target.value = "";
    }
  };

  const handlePropertyPhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedProperty) return;

    setUploadingPropertyPhotos(true);
    try {
      const res = await agentApi.uploadPropertyPhotos(selectedProperty.id, files);
      setPropertyPhotos(prev => [...prev, ...res.urls]);
      toast.success(`${res.count} property photos uploaded successfully`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Photos upload failed");
    } finally {
      setUploadingPropertyPhotos(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSubmitVerification = async () => {
    if (!selectedProperty) return;

    // Validation
    const missing: string[] = [];
    if (!mobileVerified) missing.push("Mobile OTP Verification");
    if (!aadhaarUrl) missing.push("Owner Aadhaar Card");
    if (!utilityBillUrl) missing.push("Electricity / Utility Bill");
    if (!ownerPhotoUrl) missing.push("Owner Photograph");
    if (propertyPhotos.length === 0) missing.push("Property Verification Photos");

    if (missing.length > 0) {
      missing.forEach(item => toast.error(`(${item}) this field is req.`));
      return;
    }

    setSubmitting(true);
    try {
      await agentApi.submit(selectedProperty.id, agentNotes);
      toast.success("Verification complete! Property is now live and listed.");
      setActiveModalOpen(false);
      loadProperties();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = properties.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.owner_name && p.owner_name.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      (p.locality && p.locality.toLowerCase().includes(q))
    );
  });

  const completionCount = [
    mobileVerified,
    !!aadhaarUrl,
    !!utilityBillUrl,
    !!ownerPhotoUrl,
    propertyPhotos.length > 0,
  ].filter(Boolean).length;

  return (
    <DashboardShell
      title="Agent Verification Panel"
      subtitle="Verify owner identities, utility bills, and property on-site details"
      action={
        <Button variant="outline" size="sm" onClick={loadProperties} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {/* ── Top Summary Banner ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-border/60 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pending Verifications</p>
            <h3 className="text-2xl font-bold mt-0.5">{properties.length}</h3>
          </div>
        </Card>

        <Card className="p-4 border-border/60 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Field Verification</p>
            <h3 className="text-sm font-semibold text-emerald-700 mt-0.5">Physical & KYC Check</h3>
          </div>
        </Card>

        <Card className="p-4 border-border/60 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Instant Go-Live</p>
            <h3 className="text-sm font-semibold text-purple-700 mt-0.5">Automated Listing Activation</h3>
          </div>
        </Card>
      </div>

      {/* ── Search & Filter ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by property, owner name, or location..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <p className="text-xs text-muted-foreground self-start sm:self-center">
          Showing <strong>{filtered.length}</strong> of {properties.length} properties
        </p>
      </div>

      {/* ── Pending Properties List ───────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading pending verifications...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 py-20 text-center px-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-500/50 mb-3" />
          <h3 className="font-semibold text-lg">All caught up!</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            There are currently no properties pending verification. Newly submitted owner listings will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => {
            const cover = (p.images && p.images[0]) ?? p.cover_image_url;
            return (
              <Card
                key={p.id}
                className="overflow-hidden border border-border/70 hover:shadow-md transition duration-200 flex flex-col bg-white"
              >
                {/* Property Cover Image & Badges */}
                <div className="relative h-44 w-full bg-muted overflow-hidden">
                  {cover ? (
                    <img
                      src={cover}
                      alt={p.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40 bg-muted/60">
                      <Building2 className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs shadow-sm">
                      Pending Verification
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white px-2.5 py-1 rounded-md text-xs font-semibold">
                    {formatINR(p.price)}/mo
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-base line-clamp-1">{p.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {[p.locality, p.city].filter(Boolean).join(", ")}
                    </p>

                    {/* Owner Details Card */}
                    <div className="mt-3.5 p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{p.owner_name || "Owner"}</span>
                      </div>
                      {p.owner_phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{p.owner_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      Added {new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </div>
                    <Button
                      size="sm"
                      variant="hero"
                      onClick={() => openVerificationModal(p)}
                      className="text-xs gap-1.5"
                    >
                      Verify Now
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Verification Workspace Modal ───────────────────────────────── */}
      <Dialog open={activeModalOpen} onOpenChange={setActiveModalOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 border-0 shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-primary text-white p-6 sticky top-0 z-20 shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="border-white/40 text-white bg-white/10 text-xs uppercase font-semibold">
                    Agent Verification
                  </Badge>
                  <span className="text-xs text-white/80">Step-by-step physical check</span>
                </div>
                <DialogTitle className="text-xl font-bold text-white leading-tight">
                  {selectedProperty?.title}
                </DialogTitle>
                <DialogDescription className="text-white/80 text-xs mt-1">
                  {[selectedProperty?.locality, selectedProperty?.city].filter(Boolean).join(", ")}
                </DialogDescription>
              </div>

              {/* Progress badge */}
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-2.5 text-center shrink-0 border border-white/20 min-w-24">
                <div className="text-lg font-black text-white">{completionCount}/5</div>
                <div className="text-[10px] text-white/90 uppercase tracking-wider font-semibold">Completed</div>
              </div>
            </div>
          </div>

          {fetchingDetails ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading verification records...</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">

              {/* ── Step 1: Mobile Verification ─────────────────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      mobileVerified ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {mobileVerified ? <Check className="h-4 w-4" /> : "1"}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Owner Mobile Verification (OTP)</h4>
                      <p className="text-xs text-muted-foreground">Verify the owner's active contact number on-site</p>
                    </div>
                  </div>
                  {mobileVerified && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Verified
                    </Badge>
                  )}
                </div>

                {!mobileVerified ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Owner Phone Number"
                        value={phoneToVerify}
                        onChange={e => setPhoneToVerify(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={handleSendOtp}
                        disabled={sendingOtp || !phoneToVerify}
                        className="shrink-0 text-xs"
                      >
                        {sendingOtp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : otpSent ? "Resend" : "Send OTP"}
                      </Button>
                    </div>

                    {otpSent && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter 6-digit OTP (123456)"
                          value={otpCode}
                          onChange={e => setOtpCode(e.target.value)}
                          maxLength={6}
                          className="text-sm"
                        />
                        <Button
                          variant="hero"
                          onClick={handleVerifyOtp}
                          disabled={verifyingOtp || otpCode.length < 4}
                          className="shrink-0 text-xs gap-1"
                        >
                          {verifyingOtp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-emerald-600" />
                      Mobile <strong>{phoneToVerify}</strong> verified successfully.
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMobileVerified(false)}
                      className="h-6 text-[11px] text-emerald-800 hover:text-emerald-950"
                    >
                      Change
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Step 2: Aadhaar Card Upload ─────────────────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      aadhaarUrl ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {aadhaarUrl ? <Check className="h-4 w-4" /> : "2"}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Owner Aadhaar Card</h4>
                      <p className="text-xs text-muted-foreground">Upload government ID proof (JPG, PNG, PDF)</p>
                    </div>
                  </div>
                  {aadhaarUrl && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Uploaded
                    </Badge>
                  )}
                </div>

                <input
                  type="file"
                  ref={aadhaarInputRef}
                  onChange={e => handleFileUpload(e, "aadhaar_card")}
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {aadhaarUrl ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-primary" />
                      <div>
                        <p className="text-xs font-semibold">Aadhaar Document Uploaded</p>
                        <a
                          href={aadhaarUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-0.5"
                        >
                          View Document <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => aadhaarInputRef.current?.click()}
                      disabled={uploadingAadhaar}
                      className="text-xs"
                    >
                      {uploadingAadhaar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => aadhaarInputRef.current?.click()}
                    className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition bg-muted/10 hover:bg-muted/30"
                  >
                    {uploadingAadhaar ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    ) : (
                      <>
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                        <p className="text-xs font-semibold text-foreground">Click to upload Aadhaar Card</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">JPG, PNG or PDF up to 10MB</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Step 3: Utility Bill Upload ─────────────────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      utilityBillUrl ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {utilityBillUrl ? <Check className="h-4 w-4" /> : "3"}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Utility Bill (Electricity / Water / Gas)</h4>
                      <p className="text-xs text-muted-foreground">Proof of property ownership / address verification</p>
                    </div>
                  </div>
                  {utilityBillUrl && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Uploaded
                    </Badge>
                  )}
                </div>

                <input
                  type="file"
                  ref={utilityInputRef}
                  onChange={e => handleFileUpload(e, "utility_bill")}
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {utilityBillUrl ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-primary" />
                      <div>
                        <p className="text-xs font-semibold">Utility Bill Uploaded</p>
                        <a
                          href={utilityBillUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-0.5"
                        >
                          View Document <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => utilityInputRef.current?.click()}
                      disabled={uploadingUtility}
                      className="text-xs"
                    >
                      {uploadingUtility ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => utilityInputRef.current?.click()}
                    className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition bg-muted/10 hover:bg-muted/30"
                  >
                    {uploadingUtility ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    ) : (
                      <>
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                        <p className="text-xs font-semibold text-foreground">Click to upload Electricity / Utility Bill</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">JPG, PNG or PDF up to 10MB</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Step 4: Owner Photograph ────────────────────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      ownerPhotoUrl ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {ownerPhotoUrl ? <Check className="h-4 w-4" /> : "4"}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Owner Photograph</h4>
                      <p className="text-xs text-muted-foreground">Capture or upload owner's live photo on-site</p>
                    </div>
                  </div>
                  {ownerPhotoUrl && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Uploaded
                    </Badge>
                  )}
                </div>

                <input
                  type="file"
                  ref={ownerPhotoInputRef}
                  onChange={e => handleFileUpload(e, "owner_photo")}
                  accept="image/*"
                  className="hidden"
                />

                {ownerPhotoUrl ? (
                  <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
                    <img
                      src={ownerPhotoUrl}
                      alt="Owner verification"
                      className="h-16 w-16 rounded-lg object-cover border border-border shadow-sm"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold">Owner Photo Verified</p>
                      <p className="text-[11px] text-muted-foreground">Captured during agent visit</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ownerPhotoInputRef.current?.click()}
                      disabled={uploadingOwnerPhoto}
                      className="text-xs"
                    >
                      {uploadingOwnerPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retake"}
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => ownerPhotoInputRef.current?.click()}
                    className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition bg-muted/10 hover:bg-muted/30"
                  >
                    {uploadingOwnerPhoto ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                        <p className="text-xs font-semibold text-foreground">Click to capture / upload Owner Photo</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">High clarity face photograph</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Step 5: Property Photos ─────────────────────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      propertyPhotos.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {propertyPhotos.length > 0 ? <Check className="h-4 w-4" /> : "5"}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Property Verification Photos</h4>
                      <p className="text-xs text-muted-foreground">Field inspection photos (living room, exterior, entrance, etc.)</p>
                    </div>
                  </div>
                  {propertyPhotos.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {propertyPhotos.length} Photo{propertyPhotos.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                <input
                  type="file"
                  ref={propertyPhotosInputRef}
                  onChange={handlePropertyPhotosUpload}
                  accept="image/*"
                  multiple
                  className="hidden"
                />

                {propertyPhotos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                    {propertyPhotos.map((url, i) => (
                      <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-border group bg-muted">
                        <img src={url} alt={`Property photo ${i + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onClick={() => propertyPhotosInputRef.current?.click()}
                  className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-5 text-center cursor-pointer transition bg-muted/10 hover:bg-muted/30"
                >
                  {uploadingPropertyPhotos ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  ) : (
                    <>
                      <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                      <p className="text-xs font-semibold text-foreground">
                        {propertyPhotos.length > 0 ? "Add more inspection photos" : "Upload property verification photos"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Select multiple photos</p>
                    </>
                  )}
                </div>
              </div>

              {/* ── Step 6: Agent Remarks & Inspection Notes ────────────── */}
              <div className="rounded-xl border border-border/80 p-5 bg-card shadow-sm space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Agent Verification Notes
                </h4>
                <Textarea
                  placeholder="Enter remarks regarding on-site inspection, property condition, neighborhood, and physical checks..."
                  value={agentNotes}
                  onChange={e => setAgentNotes(e.target.value)}
                  rows={3}
                  className="text-xs"
                />
              </div>

            </div>
          )}

          {/* Footer CTA */}
          <div className="p-5 bg-muted/40 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 z-20 backdrop-blur-md">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              {completionCount === 5 ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Ready for submission
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  {5 - completionCount} requirement{5 - completionCount > 1 ? "s" : ""} remaining
                </span>
              )}
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveModalOpen(false)}
                disabled={submitting}
                className="flex-1 sm:flex-initial"
              >
                Cancel
              </Button>
              <Button
                variant="hero"
                size="sm"
                onClick={handleSubmitVerification}
                disabled={submitting || completionCount < 5}
                className="flex-1 sm:flex-initial gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Submit & List Property
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
