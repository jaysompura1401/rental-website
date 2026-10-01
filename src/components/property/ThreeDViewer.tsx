/**
 * ThreeDViewer.tsx
 *
 * Renders the right viewer based on tour_type:
 *
 *  "link"         → <iframe> embed (Matterport, Kuula, etc.)
 *  "model"        → Google <model-viewer> CDN web component (GLB/GLTF)
 *  "ai_generated" → Pannellum CDN equirectangular sphere viewer (true 360°)
 *
 * PanoramaViewer uses pannellum (https://pannellum.org) loaded from CDN.
 * Pannellum renders the equirectangular image onto a WebGL sphere so the
 * user truly stands at the centre of the room and looks in any direction.
 * It handles drag (mouse + touch), zoom (pinch + scroll), and fullscreen.
 *
 * CDN files loaded once per page:
 *   https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js
 *   https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css
 *
 * Works with both blob: URLs (local preview) and https: Supabase Storage URLs.
 */

import { useEffect, useRef, useState } from "react";
import {
  Loader2, Maximize2, RotateCcw, ZoomIn, ZoomOut, X, Box, Globe,
} from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pannellum?: any;
  }
}

const GOLD = "#C9921A";

// ── Inject Google model-viewer script once ────────────────────────────────────
let modelViewerInjected = false;
function ensureModelViewer() {
  if (modelViewerInjected || typeof document === "undefined") return;
  if (document.querySelector('script[data-mv="1"]')) { modelViewerInjected = true; return; }
  const s = document.createElement("script");
  s.type = "module";
  s.setAttribute("data-mv", "1");
  s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js";
  document.head.appendChild(s);
  modelViewerInjected = true;
}

// ── Inject pannellum CSS + JS from CDN once ───────────────────────────────────
let pannellumInjected = false;
let pannellumReady = false;
const pannellumReadyCallbacks: Array<() => void> = [];

function ensurePannellum(onReady: () => void) {
  if (pannellumReady) { onReady(); return; }
  pannellumReadyCallbacks.push(onReady);
  if (pannellumInjected) return;
  pannellumInjected = true;

  // Inject CSS
  if (!document.querySelector('link[data-pn="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-pn", "1");
    link.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
    document.head.appendChild(link);
  }

  // Inject JS
  const script = document.createElement("script");
  script.setAttribute("data-pn", "1");
  script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
  script.onload = () => {
    pannellumReady = true;
    pannellumReadyCallbacks.forEach(cb => cb());
    pannellumReadyCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

// ─────────────────────────────────────────────────────────────────────────────

export type TourType = "none" | "link" | "model" | "ai_generated";

export interface ThreeDViewerProps {
  tourType: TourType;
  tourUrl?: string | null;
  tourModelUrl?: string | null;
  tourPanoramaUrl?: string | null;
  title?: string;
  height?: string;
}

// =============================================================================
export function ThreeDViewer({
  tourType,
  tourUrl,
  tourModelUrl,
  tourPanoramaUrl,
  title = "3D Property Tour",
  height = "480px",
}: ThreeDViewerProps) {
  if (tourType === "link" && tourUrl)
    return <LinkViewer url={tourUrl} title={title} height={height} />;
  if (tourType === "model" && tourModelUrl)
    return <ModelViewer url={tourModelUrl} title={title} height={height} />;
  if (tourType === "ai_generated" && tourPanoramaUrl)
    return <PanoramaViewer url={tourPanoramaUrl} title={title} height={height} />;
  return null;
}

// =============================================================================
// 1. External link iframe (unchanged)
// =============================================================================
function LinkViewer({ url, title, height }: { url: string; title: string; height: string }) {
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState(false);

  const embedUrl = (() => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("matterport.com") && u.pathname.includes("/show/")) {
        u.searchParams.set("play", "1");
        u.searchParams.set("qs", "1");
        return u.toString();
      }
      return url;
    } catch { return url; }
  })();

  return (
    <div
      className="relative rounded-2xl overflow-hidden border"
      style={{ height: full ? "90vh" : height, borderColor: "#e8d9c0", backgroundColor: "#1a1209" }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
          style={{ backgroundColor: "#1a1209" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium text-white/70">Loading 3D Tour…</p>
        </div>
      )}
      <iframe
        src={embedUrl} title={title}
        allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
        allowFullScreen onLoad={() => setLoaded(true)}
        className="w-full h-full border-0"
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s" }}
      />
      <div className="absolute bottom-3 right-3 z-20">
        <ControlBtn onClick={() => setFull(f => !f)} title={full ? "Exit fullscreen" : "Fullscreen"}>
          {full ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </ControlBtn>
      </div>
      <TourBadge icon={<Globe className="h-3 w-3" />} label="Virtual Tour" />
    </div>
  );
}

// =============================================================================
// 2. GLB / GLTF model viewer (unchanged)
// =============================================================================
function ModelViewer({ url, title, height }: { url: string; title: string; height: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureModelViewer();
    const check = setInterval(() => {
      if (customElements.get("model-viewer")) { setReady(true); clearInterval(check); }
    }, 100);
    return () => clearInterval(check);
  }, []);

  return (
    <div
      className="relative rounded-2xl overflow-hidden border"
      style={{ height, borderColor: "#e8d9c0", backgroundColor: "#1a1209" }}
    >
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
          style={{ backgroundColor: "#1a1209" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium text-white/70">Loading 3D Model…</p>
        </div>
      )}
      {ready && (
        /* @ts-expect-error model-viewer is a custom HTML element */
        <model-viewer src={url} alt={title} auto-rotate camera-controls
          shadow-intensity="1" environment-image="neutral"
          style={{ width: "100%", height: "100%", backgroundColor: "#1a1209" }} loading="eager" />
      )}
      {ready && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium text-white pointer-events-none select-none"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        >
          Drag to rotate · Scroll to zoom
        </div>
      )}
      <TourBadge icon={<Box className="h-3 w-3" />} label="3D Model" />
    </div>
  );
}

// =============================================================================
// 3. True 360° Panorama Viewer — Pannellum equirectangular sphere
//
// Pannellum maps the equirectangular image onto a WebGL sphere.
// The user stands at the centre and can look in any direction — exactly the
// experience of being inside the room. Drag rotates the view; pinch/scroll
// zooms; the image wraps continuously at the 360° seam.
//
// Pannellum's own controls (drag + pinch) are used directly; we overlay
// our own zoom/reset/fullscreen buttons for visual consistency.
// =============================================================================
function PanoramaViewer({
  url,
  title: _title,
  height,
}: {
  url: string;
  title: string;
  height: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [full, setFull] = useState(false);

  // ── Build / rebuild pannellum viewer whenever url changes ─────────────────
  useEffect(() => {
    if (!url) return;

    setStatus("loading");

    let destroyed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    // Destroy previous viewer instance if any
    const destroy = () => {
      destroyed = true;
      if (pollTimer)    clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try { viewerRef.current?.destroy(); } catch { /* ignore */ }
      viewerRef.current = null;
    };

    ensurePannellum(() => {
      const container = containerRef.current;
      if (!container || destroyed) return;

      // Clear and reset the container div so pannellum gets a clean element
      container.innerHTML = "";

      try {
        viewerRef.current = window.pannellum.viewer(container, {
          type:           "equirectangular",
          panorama:       url,
          autoLoad:       true,
          autoRotate:     -1,      // deg/s, stops on any interaction
          autoRotateInactivityDelay: 3000,
          compass:              false,
          showZoomCtrl:         false,
          showFullscreenCtrl:   false,
          showControls:         false,
          mouseZoom:            true,
          touchPanSpeedCoeffFactor: 1,
          hfov:    100,
          minHfov: 30,
          maxHfov: 150,
          pitch:   0,
          yaw:     0,
          // onLoad fires when pannellum finishes drawing the first frame
          onLoad: () => {
            if (!destroyed) setStatus("ok");
          },
          onError: () => {
            if (!destroyed) setStatus("error");
          },
        });

        // Polling fallback: pannellum's onLoad sometimes doesn't fire for
        // data: URLs in certain browser versions. Poll until the WebGL canvas
        // appears inside the container or 10 s timeout.
        pollTimer = setInterval(() => {
          if (destroyed) { clearInterval(pollTimer!); return; }
          const gl = container.querySelector("canvas");
          if (gl) {
            clearInterval(pollTimer!);
            pollTimer = null;
            setStatus("ok");
          }
        }, 200);

        // Hard timeout — show error if nothing renders in 15 s
        timeoutTimer = setTimeout(() => {
          if (destroyed) return;
          clearInterval(pollTimer!);
          pollTimer = null;
          setStatus(prev => prev === "loading" ? "error" : prev);
        }, 15000);

      } catch (e) {
        console.error("[PanoramaViewer] pannellum init error:", e);
        if (!destroyed) setStatus("error");
      }
    });

    return destroy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ── Sync full-screen height with state ────────────────────────────────────
  useEffect(() => {
    const handler = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Control handlers ──────────────────────────────────────────────────────
  const zoomIn = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.setHfov(Math.max(30, v.getHfov() - 15));
  };
  const zoomOut = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.setHfov(Math.min(150, v.getHfov() + 15));
  };
  const resetView = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.setYaw(0);
    v.setPitch(0);
    v.setHfov(100);
  };
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden border"
      style={{
        height: full ? "100vh" : height,
        borderColor: "#e8d9c0",
        backgroundColor: "#1a1209",
      }}
    >
      {/* Loading overlay */}
      {status === "loading" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none"
          style={{ backgroundColor: "#1a1209" }}
        >
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium text-white/70">Loading 360° View…</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
          style={{ backgroundColor: "#1a1209" }}
        >
          <span className="text-3xl">🌐</span>
          <p className="text-sm font-medium text-white/70">Could not load panorama</p>
          <p className="text-xs text-white/40">The image may still be processing — try again shortly</p>
        </div>
      )}

      {/* Pannellum mounts here — it fills the container div */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ display: status === "error" ? "none" : "block" }}
      />

      {/* Our control overlay — shown once loaded */}
      {status === "ok" && (
        <>
          {/* Bottom-right: zoom / reset / fullscreen */}
          <div className="absolute bottom-3 right-3 flex gap-2 z-20">
            <ControlBtn onClick={zoomIn}          title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </ControlBtn>
            <ControlBtn onClick={zoomOut}         title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </ControlBtn>
            <ControlBtn onClick={resetView}       title="Reset view">
              <RotateCcw className="h-4 w-4" />
            </ControlBtn>
            <ControlBtn onClick={toggleFullscreen} title={full ? "Exit fullscreen" : "Fullscreen"}>
              {full ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </ControlBtn>
          </div>

          {/* Bottom-center hint */}
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium text-white pointer-events-none select-none"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          >
            Drag to look around · Pinch or buttons to zoom
          </div>
        </>
      )}

      {/* 360° badge */}
      <TourBadge icon={<span className="text-[10px]">✨</span>} label="360° View" />
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function ControlBtn({
  onClick, title, children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className="flex h-8 w-8 items-center justify-center rounded-xl text-white transition hover:scale-110 active:scale-95"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
    >
      {children}
    </button>
  );
}

function TourBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white pointer-events-none select-none"
      style={{ backgroundColor: "rgba(201,146,26,0.88)", backdropFilter: "blur(4px)" }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
