/**
 * AI360Generator.tsx — 3D / 360° tour setup for the property add form.
 *
 * Three modes:
 *   A) Tour Link  — paste Matterport / Kuula / any iframe URL
 *   B) 3D Model   — upload GLB / GLTF file
 *   C) 360° View  — upload directional wall images (Wall 1–4, up to 8 angles)
 *                   Browser stitches them into a 2:1 equirectangular panorama
 *                   using Canvas 2D, then uploads the result as a single JPEG.
 *
 * Directional slot model (Mode C):
 *   - 4 required cardinal slots: Wall 1 (Front / 0°), Wall 2 (Right / 90°),
 *     Wall 3 (Back / 180°), Wall 4 (Left / 270°)
 *   - Up to 4 optional extra angle slots (diagonal corners, ceiling, etc.)
 *   - Images are stitched in angular order → seamless equirectangular panorama
 *
 * When propertyId is null (property not yet saved):
 *   - Panorama is stitched client-side and shown as immediate blob: preview.
 *   - On publish the caller must re-call tourApi.generate360 with the blob.
 */

import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Link2, Upload, Sparkles, Check, Loader2, X, ImagePlus,
  Globe, Box, RotateCcw, Eye, Plus, ArrowUp, ArrowRight,
  ArrowDown, ArrowLeft, Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tourApi } from "@/lib/api";
import { stitchPanorama, type PanoramaSlot } from "@/lib/panorama-stitch";
import { ThreeDViewer, type TourType } from "@/components/property/ThreeDViewer";

const GOLD = "#C9921A";

// ─── Directional slot definitions ─────────────────────────────────────────────
// Each slot maps to an angle (0°=front, 90°=right, 180°=back, 270°=left).
// Slots 0–3 are required; slots 4–7 are optional extras.
const WALL_SLOTS = [
  { id: 0, label: "Wall 1",  sub: "Front",  angle: 0,   Icon: ArrowUp,    required: true  },
  { id: 1, label: "Wall 2",  sub: "Right",  angle: 90,  Icon: ArrowRight, required: true  },
  { id: 2, label: "Wall 3",  sub: "Back",   angle: 180, Icon: ArrowDown,  required: true  },
  { id: 3, label: "Wall 4",  sub: "Left",   angle: 270, Icon: ArrowLeft,  required: true  },
  { id: 4, label: "Angle 5", sub: "Front-Right", angle: 45,  Icon: Compass, required: false },
  { id: 5, label: "Angle 6", sub: "Back-Right",  angle: 135, Icon: Compass, required: false },
  { id: 6, label: "Angle 7", sub: "Back-Left",   angle: 225, Icon: Compass, required: false },
  { id: 7, label: "Angle 8", sub: "Front-Left",  angle: 315, Icon: Compass, required: false },
] as const;

const MIN_WALLS = 4;  // minimum required slots
const MAX_WALLS = 8;  // maximum slots shown

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallSlot {
  slotId: number;
  file:       File;
  previewUrl: string;
  angle:      number;
}

interface SrcImage { file: File; previewUrl: string; }

export interface TourFormState {
  tourType: TourType;
  tourUrl: string;
  modelFile: File | null;
  tourModelUrl: string;
  tourPanoramaUrl: string;
  aiSourceFiles: File[];
  /** The pre-stitched panorama Blob from the browser canvas.
   *  Stored here so the publish handler can send it to the server
   *  without re-stitching.  null for non-ai tour types. */
  panoramaBlob: Blob | null;
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

// stitchPanorama is imported from @/lib/panorama-stitch (shared with detail page)

// ─── Validation ───────────────────────────────────────────────────────────────
function validateSlots(slots: (WallSlot | null)[], visibleCount: number): string | null {
  for (let i = 0; i < Math.min(visibleCount, MIN_WALLS); i++) {
    if (!slots[i]) return `Wall ${i + 1} image is required`;
  }
  const filled = slots.filter(Boolean) as WallSlot[];
  if (filled.length < MIN_WALLS) return `Upload at least ${MIN_WALLS} wall images`;

  // Check for obvious duplicates (same file name + size)
  const seen = new Set<string>();
  for (const s of filled) {
    const key = `${s.file.name}:${s.file.size}`;
    if (seen.has(key)) return `Duplicate image detected (${s.file.name})`;
    seen.add(key);
  }
  // Resolution sanity — skip files too small
  // (actual pixel check happens after Image load in stitchPanorama)
  for (const s of filled) {
    if (s.file.size < 5 * 1024) return `${s.file.name} is too small to be a valid photo`;
  }
  return null;
}

// =============================================================================
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
    initialTourType === "link"           ? "link"
    : initialTourType === "model"        ? "model"
    : initialTourType === "ai_generated" ? "ai"
    : "link"
  );

  // ── Link state ────────────────────────────────────────────────────────────
  const [tourUrl,   setTourUrl]   = useState(initialTourUrl ?? "");
  const [linkSaved, setLinkSaved] = useState(!!initialTourUrl);

  // ── Model state ───────────────────────────────────────────────────────────
  const [modelFile,      setModelFile]      = useState<File | null>(null);
  const [modelUrl,       setModelUrl]       = useState(initialModelUrl ?? "");
  const [modelUploading, setModelUploading] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // ── Mode C: directional wall slots ───────────────────────────────────────
  // wallSlots[i] = WallSlot for WALL_SLOTS[i], or null if not uploaded yet
  const [wallSlots,    setWallSlots]    = useState<(WallSlot | null)[]>(Array(MAX_WALLS).fill(null));
  const [visibleWalls, setVisibleWalls] = useState(MIN_WALLS); // how many slots shown
  const [generating,   setGenerating]   = useState(false);
  const [stitchProgress, setStitchProgress] = useState<string>("");

  // Per-slot hidden file inputs
  const wallInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Preview state ─────────────────────────────────────────────────────────
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
      tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [], panoramaBlob: null,
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
    notify({ tourType: "none", tourUrl: "", modelFile: f, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [], panoramaBlob: null });
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
          tourModelUrl: res.tour_model_url, tourPanoramaUrl: "", aiSourceFiles: [], panoramaBlob: null,
        };
        onSaved?.(state); notify(state);
        toast.success("3D model uploaded!");
      } catch (e: any) { toast.error(e.message); }
      finally { setModelUploading(false); }
    } else {
      setModelUrl("pending");
      setPreviewUrl(""); setPreviewType("none"); setShowPreview(false);
      notify({ tourType: "model", tourUrl: "", modelFile, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [], panoramaBlob: null });
      toast.success("Model selected — will be uploaded when you publish");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Mode C — Directional wall image upload
  // ─────────────────────────────────────────────────────────────────────────

  const handleWallFileSelect = useCallback((slotIndex: number, file: File) => {
    const valid = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!valid.includes(file.type)) {
      toast.error(`${file.name}: only JPG, PNG, or WEBP allowed`);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error(`${file.name}: file exceeds 15 MB limit`);
      return;
    }
    if (file.size < 5 * 1024) {
      toast.error(`${file.name}: file is too small to be a valid photo`);
      return;
    }

    const slot = WALL_SLOTS[slotIndex];
    const previewUrl = URL.createObjectURL(file);

    setWallSlots(prev => {
      const next = [...prev];
      // Revoke previous blob URL for this slot if any
      if (next[slotIndex]?.previewUrl) {
        URL.revokeObjectURL(next[slotIndex]!.previewUrl);
      }
      next[slotIndex] = { slotId: slotIndex, file, previewUrl, angle: slot.angle };
      return next;
    });
    // Clear any existing panorama preview when slots change
    setPreviewUrl("");
    setPreviewType("none");
    setShowPreview(false);
  }, []);

  const handleWallInputChange = useCallback((slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleWallFileSelect(slotIndex, file);
    // Reset input so same file can be re-selected after removal
    e.target.value = "";
  }, [handleWallFileSelect]);

  const removeWallSlot = useCallback((slotIndex: number) => {
    setWallSlots(prev => {
      const next = [...prev];
      if (next[slotIndex]?.previewUrl) URL.revokeObjectURL(next[slotIndex]!.previewUrl);
      next[slotIndex] = null;
      return next;
    });
    setPreviewUrl("");
    setPreviewType("none");
    setShowPreview(false);
  }, []);

  const handleAddExtraAngle = () => {
    setVisibleWalls(v => Math.min(MAX_WALLS, v + 1));
  };

  // ── Drag-and-drop for wall slots ──────────────────────────────────────────
  const handleWallDrop = useCallback((slotIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleWallFileSelect(slotIndex, file);
  }, [handleWallFileSelect]);

  // ── Stitch + generate panorama ─────────────────────────────────────────────
  const handleGenerate360 = async () => {
    const filled = wallSlots.slice(0, visibleWalls).filter(Boolean) as WallSlot[];

    const validationError = validateSlots(wallSlots, visibleWalls);
    if (validationError) { toast.error(validationError); return; }

    setGenerating(true);
    setStitchProgress("Preparing images…");

    try {
      // Step 1: stitch in browser
      setStitchProgress("Stitching panorama…");
      const { blob: panoramaBlob, dataUrl: localDataUrl } = await stitchPanorama(
        filled.map(s => ({ url: s.previewUrl, angle: s.angle }))
      );

      // Step 2: preview is ready immediately
      setStitchProgress("Preparing preview…");
      setPreviewUrl(localDataUrl);
      setPreviewType("ai_generated");
      setShowPreview(true);

      const sourceFiles = filled.sort((a, b) => a.angle - b.angle).map(s => s.file);
      const directions  = filled.sort((a, b) => a.angle - b.angle).map(s => ({
        slot:  s.slotId,
        label: WALL_SLOTS[s.slotId].label,
        angle: s.angle,
      }));

      if (propertyId) {
        // Step 3a: upload pre-stitched panorama to server
        setStitchProgress("Uploading panorama…");
        const panoramaFile = new File([panoramaBlob], `panorama-${propertyId}.jpg`, { type: "image/jpeg" });
        const res = await tourApi.generate360(propertyId, sourceFiles, panoramaFile, directions);
        const serverUrl = res.tour_ai_panorama_url;

        // Keep localDataUrl or swap to serverUrl if available
        if (serverUrl) {
          setPreviewUrl(serverUrl);
        }

        const state: TourFormState = {
          tourType: "ai_generated", tourUrl: "", modelFile: null,
          tourModelUrl: "", tourPanoramaUrl: serverUrl || localDataUrl, aiSourceFiles: sourceFiles,
          panoramaBlob: null,
        };
        onSaved?.(state); notify(state);
        toast.success("✨ 360° panorama created and saved!");
      } else {
        // Step 3b: no property yet — keep data URL + blob, notify parent
        notify({
          tourType: "ai_generated", tourUrl: "", modelFile: null,
          tourModelUrl: "", tourPanoramaUrl: localDataUrl,
          aiSourceFiles: sourceFiles,
          panoramaBlob: panoramaBlob,
        });
        toast.success("✨ 360° preview ready! Full panorama saved on publish.");
      }
    } catch (e: any) {
      console.error("[AI360Generator] Error generating 360 view:", e);
      toast.error(e.message ?? "Panorama generation failed — please retry");
      setPreviewUrl("");
      setPreviewType("none");
      setShowPreview(false);
    } finally {
      setGenerating(false);
      setStitchProgress("");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────────────────────────────────
  const reset = () => {
    setTourUrl(""); setLinkSaved(false);
    setModelFile(null); setModelUrl("");
    setWallSlots(prev => {
      prev.forEach(s => { if (s?.previewUrl) URL.revokeObjectURL(s.previewUrl); });
      return Array(MAX_WALLS).fill(null);
    });
    setVisibleWalls(MIN_WALLS);
    setPreviewUrl(""); setPreviewType("none"); setShowPreview(false);
    notify({ tourType: "none", tourUrl: "", modelFile: null, tourModelUrl: "", tourPanoramaUrl: "", aiSourceFiles: [], panoramaBlob: null });
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const hasTour =
    (mode === "link"  && linkSaved) ||
    (mode === "model" && !!modelUrl) ||
    (mode === "ai"    && !!previewUrl);

  const filledWalls = wallSlots.slice(0, visibleWalls).filter(Boolean).length;
  const requiredFilled = wallSlots.slice(0, MIN_WALLS).filter(Boolean).length;
  const canGenerate = requiredFilled >= MIN_WALLS;

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ── Mode tabs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {([
          { key: "link",  Icon: Globe,     label: "Tour Link",    sub: "Matterport · Kuula" },
          { key: "model", Icon: Box,       label: "3D Model",     sub: "GLB / GLTF file"    },
          { key: "ai",    Icon: Sparkles,  label: "360° View",    sub: "Wall-by-wall photos" },
        ] as const).map(({ key, Icon, label, sub }) => (
          <button key={key} type="button"
            onClick={() => setMode(key)}
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

      {/* ── Mode C: 360° View — directional wall upload ───────────────────── */}
      {mode === "ai" && (
        <div className="space-y-4 rounded-2xl border border-[#e8d9c0] bg-white p-4 sm:p-5">

          {/* Header */}
          <div>
            <p className="text-sm font-bold" style={{ color: "#1a1209" }}>360° Property View</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload one photo per wall direction — we stitch them into an interactive 360° panorama.
            </p>
          </div>

          {/* Room layout diagram */}
          <div className="flex items-center justify-center py-1">
            <div className="relative w-48 h-36">
              {/* Room box */}
              <div className="absolute inset-8 border-2 rounded-lg flex items-center justify-center"
                style={{ borderColor: "#C9921A", backgroundColor: "#fef8eb" }}>
                <span className="text-[10px] font-bold text-center leading-tight" style={{ color: "#836737" }}>
                  360°<br/>VIEW
                </span>
              </div>
              {/* Direction labels */}
              <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold" style={{ color: "#1a1209" }}>
                WALL 1 · FRONT
              </span>
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{ color: "#1a1209" }}>
                WALL 2
              </span>
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-bold" style={{ color: "#1a1209" }}>
                WALL 3 · BACK
              </span>
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{ color: "#1a1209" }}>
                WALL 4
              </span>
            </div>
          </div>

          {/* Wall slots */}
          <div className="space-y-2.5">
            {WALL_SLOTS.slice(0, visibleWalls).map((slotDef, i) => {
              const slot = wallSlots[i];
              const SlotIcon = slotDef.Icon;
              const isFilled = !!slot;

              return (
                <div key={slotDef.id}
                  className={cn(
                    "relative flex items-center gap-3 rounded-2xl border-2 p-3 transition-all",
                    isFilled
                      ? "border-[#C9921A] bg-[#fef8eb]"
                      : "border-[#e8d9c0] bg-[#fafaf8]"
                  )}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleWallDrop(i, e)}
                >
                  {/* Direction icon badge */}
                  <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border"
                    style={{
                      borderColor: isFilled ? "#C9921A" : "#e8d9c0",
                      backgroundColor: isFilled ? "#fff8e7" : "#fff",
                    }}>
                    <SlotIcon className="h-4 w-4 mb-0.5" style={{ color: isFilled ? GOLD : "#a08858" }} />
                    <span className="text-[9px] font-bold leading-none" style={{ color: isFilled ? "#836737" : "#a08858" }}>
                      {slotDef.angle}°
                    </span>
                  </div>

                  {/* Label + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: "#1a1209" }}>
                        {slotDef.label}
                      </span>
                      {slotDef.required && (
                        <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                          style={{ backgroundColor: "#e8d9c0", color: "#836737" }}>
                          required
                        </span>
                      )}
                      {!slotDef.required && (
                        <span className="text-[9px] font-medium rounded-full px-1.5 py-0.5"
                          style={{ backgroundColor: "#f0fdf4", color: "#16a34a" }}>
                          optional
                        </span>
                      )}
                    </div>
                    <span className="text-[11px]" style={{ color: "#836737" }}>
                      {isFilled
                        ? <span className="font-medium truncate block" style={{ color: "#1a1209" }}>{slot!.file.name}</span>
                        : slotDef.sub
                      }
                    </span>
                  </div>

                  {/* Thumbnail (when filled) */}
                  {isFilled && (
                    <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border"
                      style={{ borderColor: "#C9921A" }}>
                      <img src={slot!.previewUrl} alt={slotDef.label}
                        className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Upload / Remove button */}
                  {isFilled ? (
                    <button type="button" onClick={() => removeWallSlot(i)}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:bg-red-500"
                      style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
                      title="Remove image">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button type="button"
                      onClick={() => wallInputRefs.current[i]?.click()}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition"
                      style={{
                        borderColor: "#C9921A", color: GOLD,
                        backgroundColor: "white",
                      }}>
                      <Upload className="h-3 w-3" />
                      Upload
                    </button>
                  )}

                  {/* Hidden file input for this slot */}
                  <input
                    ref={el => { wallInputRefs.current[i] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => handleWallInputChange(i, e)}
                  />
                </div>
              );
            })}
          </div>

          {/* Add extra angle button */}
          {visibleWalls < MAX_WALLS && (
            <button type="button" onClick={handleAddExtraAngle}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-2.5 text-xs font-semibold transition"
              style={{ borderColor: "#e8d9c0", color: "#836737" }}
              onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#C9921A"; (e.currentTarget as HTMLButtonElement).style.color = GOLD; }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e8d9c0"; (e.currentTarget as HTMLButtonElement).style.color = "#836737"; }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add another angle ({visibleWalls}/{MAX_WALLS})
            </button>
          )}

          {/* Progress / status bar */}
          {filledWalls > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "#faf6ee", border: "1px solid #e8d9c0" }}>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#e8d9c0" }}>
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${(requiredFilled / MIN_WALLS) * 100}%`,
                    backgroundColor: requiredFilled >= MIN_WALLS ? "#16a34a" : GOLD,
                  }} />
              </div>
              <span className="text-[11px] font-semibold shrink-0" style={{ color: "#836737" }}>
                {requiredFilled}/{MIN_WALLS} required · {filledWalls} total
              </span>
            </div>
          )}

          {/* Tips */}
          <div className="rounded-xl bg-[#fef8eb] border border-[#f4deb4] p-3 text-xs space-y-1"
            style={{ color: "#836737" }}>
            <p className="font-bold text-[#1a1209]">📸 Tips for best results</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Stand in the centre of the room and face each wall squarely</li>
              <li>Use landscape orientation and include floor-to-ceiling in frame</li>
              <li>Keep consistent lighting — avoid mixing day and flash shots</li>
              <li>More angles (5–8) produce a smoother, more seamless panorama</li>
            </ul>
          </div>

          {/* Generate button */}
          <button type="button" onClick={handleGenerate360}
            disabled={generating || !canGenerate}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: GOLD, boxShadow: "0 4px 14px rgba(201,146,26,0.30)" }}>
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {stitchProgress || "Creating 360° View…"}</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Create 360° View</>
            )}
          </button>

          {!canGenerate && filledWalls > 0 && filledWalls < MIN_WALLS && (
            <p className="text-center text-xs" style={{ color: "#836737" }}>
              Upload {MIN_WALLS - requiredFilled} more wall image{MIN_WALLS - requiredFilled !== 1 ? "s" : ""} to enable
            </p>
          )}

          {/* Success status */}
          {previewUrl && mode === "ai" && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold text-emerald-700 flex-1">
                {previewUrl.startsWith("blob:")
                  ? "✨ 360° preview ready below ↓ — full panorama saved on publish"
                  : "✨ 360° panorama created — preview below ↓"}
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

      {/* ── Live preview ───────────────────────────────────────────────────── */}
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
            tourUrl={previewType === "link"          ? previewUrl : undefined}
            tourModelUrl={previewType === "model"    ? previewUrl : undefined}
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
