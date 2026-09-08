/**
 * AI360Generator.tsx — 3D / 360° tour setup for the property add form.
 *
 * Three modes:
 *   A) Tour Link  — paste Matterport / Kuula / any iframe URL
 *   B) 3D Model   — upload GLB / GLTF file
 *   C) AI 360°    — upload room photos → instant panorama preview
 *
 * When propertyId is null (property not yet saved):
 *   • Tour data is kept in local state and applied on publish.
 *   • AI mode: first source-image blob URL is shown immediately as a
 *     360° preview using the PanoramaViewer — no server call needed.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Link2, Upload, Sparkles, Check, Loader2, X, ImagePlus,
  Globe, Box, RotateCcw, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tourApi } from "@/lib/api";
import { ThreeDViewer, type TourType } from "@/components/property/ThreeDViewer";

const GOLD = "#C9921A";
const MAX_AI_IMAGES = 20;

interface SrcImage { file: File; previewUrl: string; }

export interface TourFormState {
  tourType: TourType;
  tourUrl: string;
  modelFile: File | null;
  tourModelUrl: string;
  tourPanoramaUrl: string;
  aiSourceFiles: File[];
}

export interface AI360GeneratorProps {
  propertyId: string | null;
  initialTourType?: TourType;
  initialTourUrl?: string | null;
  initialModelUrl?: string | null;
  initialPanoUrl?: string | null;
  onSaved?: (state: TourFormState) => void;
  onLocalChange?: (state: TourFormState) => void;
}

export function AI360Generator({
  propertyId,
  initialTourType  = "none",
  initialTourUrl   = null,
  initialModelUrl  = null,
  initialPanoUrl   = null,
  onSaved,
  onLocalChange,
}: AI360GeneratorProps) {

  // ── Active mode tab ───────────────────────────────────────────────────────
  const [mode, setMode] = useState<"link" | "model" | "ai">(
    initialTourType === "link"          ? "link"
    : initialTourType === "model"       ? "model"
    : initialTourType === "ai_generated"? "ai"
    : "link"
  );

  // ── Link state ────────────────────────────────────────────────────────────
  const [tourUrl,   setTourUrl]   = useState(initialTourUrl  ?? "");
  const [linkSaved, setLinkSaved] = useState(!!initialTourUrl);

  // ── Model state ───────────────────────────────────────────────────────────
  const [modelFile,      setModelFile]      = useState<File | null>(null);
  const [modelUrl,       setModelUrl]       = useState(initialModelUrl ?? "");
  const [modelUploading, setModelUploading] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // ── AI state ──────────────────────────────────────────────────────────────
  const [srcImages,  setSrcImages]  = useState<SrcImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // ── SINGLE preview state — directly controlled, NOT derived ──────────────
  // previewUrl: the URL to pass to ThreeDViewer (blob: or https:)
  // previewType: which ThreeDViewer renderer to use
  const [previewUrl,  setPreviewUrl]  = useState<string>(initialPanoUrl ?? "");
  const [previewType, setPreviewType] = useState<TourType>(
    initialTourType !== "none" ? initialTourType : "none"
  );
  const [showPreview, setShowPreview] = useState(
    !!initialPanoUrl || !!initialTourUrl || !!initialModelUrl
  );

  // ── Helper: notify parent ─────────────────────────────────────────────────
  const notify = (state: TourFormState) => onLocalChange?.(state);

  // ─────────────────────────────────────────────────────────────────────────
  // Mode A — External link
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveLink = async () => {
    const url = tourUrl.trim();
    if (!url) { toast.error("Please enter a tour URL"); return; }
    try { new URL(url); } catch { toast.error("Enter a valid URL starting with https://"); return; }

    if (propertyId) {
      try {
        await tourApi.setLink(propertyId, url);
        toast.success("Tour link saved!");
      } catch (e: any) { toast.error(e.message); return; }
    }
    setLinkSaved(true);
    setPreviewUrl(url);
    setPreviewType("link");
    setShowPreview(true);
    const state: TourFormState = {
      tourType: "link", tourUrl: url, modelFile: null,
      tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [],
    };
    onSaved?.(state);
    notify(state);
    if (!propertyId) toast.success("Tour link saved — will be stored when you publish");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Mode B — GLB / GLTF upload
  // ─────────────────────────────────────────────────────────────────────────
  const handleModelSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "glb" && ext !== "gltf") { toast.error("Only .glb or .gltf files supported"); return; }
    if (f.size > 150 * 1024 * 1024) { toast.error("File must be under 150 MB"); return; }
    setModelFile(f);
    setModelUrl("");
    setPreviewUrl(""); setPreviewType("none"); setShowPreview(false);
    notify({ tourType: "none", tourUrl: "", modelFile: f, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [] });
  };

  const handleUploadModel = async () => {
    if (!modelFile) return;
    if (propertyId) {
      setModelUploading(true);
      try {
        const res = await tourApi.uploadModel(propertyId, modelFile);
        setModelUrl(res.tour_model_url);
        setPreviewUrl(res.tour_model_url);
        setPreviewType("model");
        setShowPreview(true);
        const state: TourFormState = {
          tourType: "model", tourUrl: "", modelFile,
          tourModelUrl: res.tour_model_url, tourPanoramaUrl: "", aiSourceFiles: [],
        };
        onSaved?.(state); notify(state);
        toast.success("3D model uploaded!");
      } catch (e: any) { toast.error(e.message); }
      finally { setModelUploading(false); }
    } else {
      setModelUrl("pending");
      setPreviewUrl(""); setPreviewType("none"); setShowPreview(false);
      notify({ tourType: "model", tourUrl: "", modelFile, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [] });
      toast.success("Model selected — will be uploaded when you publish");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Mode C — AI 360° generation
  // ─────────────────────────────────────────────────────────────────────────
  const handleAiImages = (fileList: FileList | null) => {
    if (!fileList) return;
    const valid = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const remaining = MAX_AI_IMAGES - srcImages.length;
    if (remaining <= 0) { toast.warning(`Max ${MAX_AI_IMAGES} images`); return; }
    const toAdd: SrcImage[] = [];
    for (const f of Array.from(fileList).slice(0, remaining)) {
      if (!valid.includes(f.type)) { toast.error(`${f.name}: unsupported format`); continue; }
      if (f.size > 15 * 1024 * 1024) { toast.error(`${f.name}: exceeds 15 MB`); continue; }
      toAdd.push({ file: f, previewUrl: URL.createObjectURL(f) });
    }
    if (fileList.length > remaining) toast.info(`Only ${remaining} more image${remaining !== 1 ? "s" : ""} added`);
    setSrcImages(prev => {
      const next = [...prev, ...toAdd];
      notify({ tourType: "ai_generated", tourUrl: "", modelFile: null, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: next.map(i => i.file) });
      return next;
    });
  };

  const removeAiImage = (idx: number) => {
    setSrcImages(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      const next = prev.filter((_, i) => i !== idx);
      notify({ tourType: "ai_generated", tourUrl: "", modelFile: null, tourModelUrl: "", tourPanoramaUrl: previewUrl, aiSourceFiles: next.map(i => i.file) });
      return next;
    });
  };

  const handleGenerate360 = async () => {
    if (srcImages.length === 0) { toast.error("Upload at least 1 room photo"); return; }
    setGenerating(true);
    try {
      if (propertyId) {
        // Property exists → call server
        const res = await tourApi.generate360(propertyId, srcImages.map(i => i.file));
        const url = res.tour_ai_panorama_url;
        // Set preview BEFORE state so render gets it immediately
        setPreviewUrl(url);
        setPreviewType("ai_generated");
        setShowPreview(true);
        const state: TourFormState = {
          tourType: "ai_generated", tourUrl: "", modelFile: null,
          tourModelUrl: "", tourPanoramaUrl: url, aiSourceFiles: srcImages.map(i => i.file),
        };
        onSaved?.(state); notify(state);
        toast.success("✨ AI 360° view generated!");
      } else {
        // No property yet → use first image blob as immediate local preview
        const blobUrl = srcImages[0].previewUrl;
        // Set all three together so the very next render shows the preview
        setPreviewUrl(blobUrl);
        setPreviewType("ai_generated");
        setShowPreview(true);
        notify({
          tourType: "ai_generated", tourUrl: "", modelFile: null,
          tourModelUrl: "", tourPanoramaUrl: blobUrl,
          aiSourceFiles: srcImages.map(i => i.file),
        });
        toast.success("✨ 360° preview ready! Full panorama generated on publish.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────────────────────────────────
  const reset = () => {
    setTourUrl(""); setLinkSaved(false);
    setModelFile(null); setModelUrl("");
    setSrcImages(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; });
    setPreviewUrl(""); setPreviewType("none"); setShowPreview(false);
    notify({ tourType: "none", tourUrl: "", modelFile: null, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [] });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Derived helpers for status badges
  // ─────────────────────────────────────────────────────────────────────────
  const hasTour =
    (mode === "link"  && linkSaved) ||
    (mode === "model" && !!modelUrl) ||
    (mode === "ai"    && !!previewUrl);

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ── Mode tabs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {([
          { key: "link",  Icon: Globe,     label: "Tour Link",    sub: "Matterport · Kuula" },
          { key: "model", Icon: Box,       label: "3D Model",     sub: "GLB / GLTF file"    },
          { key: "ai",    Icon: Sparkles,  label: "AI Generate",  sub: "From your photos"   },
        ] as const).map(({ key, Icon, label, sub }) => (
          <button key={key} type="button"
            onClick={() => { setMode(key); }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-3.5 text-center transition-all cursor-pointer",
              mode === key
                ? "border-[#C9921A] bg-[#fef8eb] text-[#1a1209]"
                : "border-[#e8d9c0] bg-white text-[#836737] hover:border-[#C9921A]/50 hover:bg-[#fef8eb]/50"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" style={{ color: mode === key ? GOLD : "#a08858" }} />
            <span className="text-xs font-bold leading-tight">{label}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{sub}</span>
          </button>
        ))}
      </div>

      {/* ── Mode A: External link ─────────────────────────────────────────── */}
      {mode === "link" && (
        <div className="space-y-3 rounded-2xl border border-[#e8d9c0] bg-white p-4 sm:p-5">
          <p className="text-sm font-bold" style={{ color: "#1a1209" }}>Paste your 3D tour link</p>
          <p className="text-xs text-muted-foreground -mt-1">
            Works with Matterport, Kuula, RoundMe, 3DVista, Pano2VR, and any embeddable iframe URL.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input type="url" value={tourUrl}
                onChange={e => { setTourUrl(e.target.value); setLinkSaved(false); }}
                placeholder="https://my.matterport.com/show/?m=..."
                className="w-full rounded-xl border border-[#e8d9c0] pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#C9921A] bg-[#fafaf8]"
              />
            </div>
            <button type="button" onClick={handleSaveLink} disabled={!tourUrl.trim()}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: GOLD }}>
              {linkSaved ? <><Check className="h-4 w-4" /> Saved</> : "Save"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { name: "Matterport", hint: "my.matterport.com/show/?m=…" },
              { name: "Kuula",      hint: "kuula.co/share/…"            },
              { name: "RoundMe",    hint: "roundme.com/tour/…"          },
            ].map(({ name, hint }) => (
              <button key={name} type="button"
                onClick={() => { setTourUrl(`https://${hint}`); setLinkSaved(false); }}
                className="rounded-full border border-[#e8d9c0] px-2.5 py-1 text-[11px] font-medium text-[#836737] hover:border-[#C9921A] hover:text-[#C9921A] transition">
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Mode B: 3D Model upload ───────────────────────────────────────── */}
      {mode === "model" && (
        <div className="space-y-3 rounded-2xl border border-[#e8d9c0] bg-white p-4 sm:p-5">
          <p className="text-sm font-bold" style={{ color: "#1a1209" }}>Upload a 3D Model</p>
          <p className="text-xs text-muted-foreground -mt-1">
            Accepts .glb or .gltf files up to 150 MB.
          </p>
          <button type="button" onClick={() => modelInputRef.current?.click()}
            className={cn(
              "w-full rounded-2xl border-2 border-dashed px-4 py-8 text-center transition cursor-pointer",
              modelFile ? "border-[#C9921A] bg-[#fef8eb]" : "border-[#e8d9c0] bg-[#fafaf8] hover:border-[#C9921A]/60"
            )}>
            {modelFile ? (
              <div className="flex flex-col items-center gap-1.5">
                <Box className="h-8 w-8" style={{ color: GOLD }} />
                <p className="text-sm font-bold text-[#1a1209] break-all">{modelFile.name}</p>
                <p className="text-xs text-muted-foreground">{(modelFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-[#1a1209]">Click to select .glb / .gltf</p>
                <p className="text-xs text-muted-foreground">or drag &amp; drop here</p>
              </div>
            )}
          </button>
          <input ref={modelInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={handleModelSelect} />

          {modelFile && !modelUrl && (
            <button type="button" onClick={handleUploadModel} disabled={modelUploading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-60"
              style={{ backgroundColor: GOLD }}>
              {modelUploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><Upload className="h-4 w-4" /> Upload 3D Model</>}
            </button>
          )}
          {modelUrl && modelUrl !== "pending" && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold text-emerald-700 flex-1">3D model uploaded — preview below ↓</p>
              <button type="button" onClick={() => { setModelFile(null); setModelUrl(""); setPreviewUrl(""); setPreviewType("none"); }}>
                <X className="h-4 w-4 text-emerald-600 hover:text-red-500" />
              </button>
            </div>
          )}
          {modelUrl === "pending" && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <Check className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-700">Model selected — uploaded when you publish</p>
            </div>
          )}
        </div>
      )}

      {/* ── Mode C: AI 360° ───────────────────────────────────────────────── */}
      {mode === "ai" && (
        <div className="space-y-4 rounded-2xl border border-[#e8d9c0] bg-white p-4 sm:p-5">
          <div>
            <p className="text-sm font-bold" style={{ color: "#1a1209" }}>AI-Generated 360° View</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload room photos — AI stitches them into an interactive 360° panorama.
            </p>
          </div>

          {/* Drop zone */}
          <button type="button" onClick={() => aiInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-[#e8d9c0] bg-[#fafaf8] px-4 py-6 text-center transition cursor-pointer hover:border-[#C9921A]/60 hover:bg-[#fef8eb]/40">
            <div className="flex flex-col items-center gap-1.5">
              <ImagePlus className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold text-[#1a1209]">Add room photos ({srcImages.length}/{MAX_AI_IMAGES})</p>
              <p className="text-xs text-muted-foreground">JPG · PNG · WEBP · up to 15 MB each</p>
            </div>
          </button>
          <input ref={aiInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            multiple className="hidden" onChange={e => handleAiImages(e.target.files)} />

          {/* Thumbnails */}
          {srcImages.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {srcImages.map((img, i) => (
                <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-[#e8d9c0]">
                  <img src={img.previewUrl} alt={`Room ${i + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeAiImage(i)}
                    className="absolute top-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] text-center py-0.5 font-medium">
                    Room {i + 1}
                  </div>
                </div>
              ))}
              {srcImages.length < MAX_AI_IMAGES && (
                <button type="button" onClick={() => aiInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-[#e8d9c0] flex items-center justify-center text-muted-foreground hover:border-[#C9921A] cursor-pointer">
                  <ImagePlus className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="rounded-xl bg-[#fef8eb] border border-[#f4deb4] p-3 text-xs space-y-1" style={{ color: "#836737" }}>
            <p className="font-bold text-[#1a1209]">📸 Tips for best results</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Upload photos from different angles of each room</li>
              <li>Include Living Room, Bedroom, Kitchen &amp; Bathroom</li>
              <li>Use natural daylight — avoid dark or blurry shots</li>
              <li>4–12 photos gives the best panorama quality</li>
            </ul>
          </div>

          {/* Generate button */}
          <button type="button" onClick={handleGenerate360}
            disabled={generating || srcImages.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: GOLD, boxShadow: "0 4px 14px rgba(201,146,26,0.30)" }}>
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating AI 360° View…</>
              : <><Sparkles className="h-4 w-4" /> Generate AI 360° View</>}
          </button>

          {/* Status after generation */}
          {previewUrl && mode === "ai" && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold text-emerald-700 flex-1">
                {previewUrl.startsWith("blob:")
                  ? "✨ 360° preview ready below ↓ — full panorama saved on publish"
                  : "✨ AI 360° view generated — preview below ↓"}
              </p>
              <button type="button" onClick={() => setShowPreview(v => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
                <Eye className="h-3.5 w-3.5" />
                {showPreview ? "Hide" : "Show"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Live preview — driven by previewUrl + previewType directly ─────── */}
      {previewUrl && previewType !== "none" && showPreview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: "#1a1209" }}>
              {previewType === "link"         && "🌐 Virtual Tour Preview"}
              {previewType === "model"        && "📦 3D Model Preview"}
              {previewType === "ai_generated" && "✨ 360° View Preview"}
            </p>
            <button type="button" onClick={() => setShowPreview(false)}
              className="text-xs font-medium text-muted-foreground hover:text-[#C9921A]">
              Hide ▲
            </button>
          </div>
          <ThreeDViewer
            tourType={previewType}
            tourUrl={previewType === "link"         ? previewUrl : undefined}
            tourModelUrl={previewType === "model"   ? previewUrl : undefined}
            tourPanoramaUrl={previewType === "ai_generated" ? previewUrl : undefined}
            height="380px"
          />
        </div>
      )}

      {/* Show preview button when hidden */}
      {previewUrl && previewType !== "none" && !showPreview && (
        <button type="button" onClick={() => setShowPreview(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e8d9c0] py-3 text-sm font-semibold text-[#836737] hover:border-[#C9921A] hover:text-[#C9921A] transition">
          <Eye className="h-4 w-4" /> Show Preview
        </button>
      )}

      {/* Reset */}
      {hasTour && (
        <button type="button" onClick={reset}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition">
          <RotateCcw className="h-3.5 w-3.5" /> Remove 3D / 360° tour
        </button>
      )}
    </div>
  );
}
