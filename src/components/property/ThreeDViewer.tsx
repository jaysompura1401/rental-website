/**
 * ThreeDViewer.tsx
 *
 * Renders the right viewer based on tour_type:
 *
 *  "link"         → <iframe> embed (Matterport, Kuula, etc.)
 *  "model"        → Google <model-viewer> CDN web component (GLB/GLTF)
 *  "ai_generated" → CSS-based 360° panorama viewer (works with blob: and https: URLs)
 *
 * The panorama viewer uses a CSS background-position scroll approach:
 *   - The image is repeated horizontally via background-repeat
 *   - Drag moves the background-position-x (yaw)
 *   - This works with blob: URLs, crossOrigin restrictions, and doesn't need canvas
 *   - Much faster than pixel-by-pixel canvas projection
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, RotateCcw, ZoomIn, ZoomOut, X, Box, Globe } from "lucide-react";

const GOLD = "#C9921A";

// ── Inject model-viewer script once ──────────────────────────────────────────
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
  if (tourType === "link"  && tourUrl)
    return <LinkViewer url={tourUrl} title={title} height={height} />;
  if (tourType === "model" && tourModelUrl)
    return <ModelViewer url={tourModelUrl} title={title} height={height} />;
  if (tourType === "ai_generated" && tourPanoramaUrl)
    return <PanoramaViewer url={tourPanoramaUrl} title={title} height={height} />;
  return null;
}

// =============================================================================
// 1. External link iframe
// =============================================================================
function LinkViewer({ url, title, height }: { url: string; title: string; height: string }) {
  const [loaded, setLoaded] = useState(false);
  const [full,   setFull]   = useState(false);

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
    <div className="relative rounded-2xl overflow-hidden border"
      style={{ height: full ? "90vh" : height, borderColor: "#e8d9c0", backgroundColor: "#1a1209" }}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
          style={{ backgroundColor: "#1a1209" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium text-white/70">Loading 3D Tour…</p>
        </div>
      )}
      <iframe src={embedUrl} title={title}
        allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
        allowFullScreen onLoad={() => setLoaded(true)}
        className="w-full h-full border-0"
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s" }} />
      <div className="absolute bottom-3 right-3 z-20">
        <ControlBtn onClick={() => setFull(f => !f)} title={full ? "Exit" : "Expand"}>
          {full ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </ControlBtn>
      </div>
      <TourBadge icon={<Globe className="h-3 w-3" />} label="Virtual Tour" />
    </div>
  );
}

// =============================================================================
// 2. GLB / GLTF model viewer
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
    <div className="relative rounded-2xl overflow-hidden border"
      style={{ height, borderColor: "#e8d9c0", backgroundColor: "#1a1209" }}>
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
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium text-white pointer-events-none select-none"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
          Drag to rotate · Scroll to zoom
        </div>
      )}
      <TourBadge icon={<Box className="h-3 w-3" />} label="3D Model" />
    </div>
  );
}

// =============================================================================
// 3. 360° Panorama Viewer — CSS background-scroll approach
//
//  Works with both:
//    • blob: URLs  (local preview before publish, no crossOrigin needed)
//    • https: URLs (server-hosted equirectangular images)
//
//  Technique: The image is set as a CSS background-image with background-size
//  covering the full height. The background-position-x is animated continuously
//  for auto-rotate, and controlled by mouse/touch drag. This avoids canvas
//  drawImage() which fails with blob: + crossOrigin="anonymous".
// =============================================================================
function PanoramaViewer({ url, title, height }: { url: string; title: string; height: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef     = useRef({ xPos: 0, dragging: false, lastX: 0, animId: 0, autoSpeed: 0.03 });
  const [imgLoaded,  setImgLoaded]  = useState(false);
  const [imgError,   setImgError]   = useState(false);
  const [full,       setFull]       = useState(false);

  // Pre-load image to check it's valid (without crossOrigin so blob: works)
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    const img = new Image();
    // Do NOT set crossOrigin — blob: URLs fail with it
    img.onload  = () => setImgLoaded(true);
    img.onerror = () => setImgError(true);
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [url]);

  // Animation loop — moves background-position-x
  useEffect(() => {
    if (!imgLoaded) return;
    const el = containerRef.current;
    if (!el) return;
    const s = stateRef.current;

    const loop = () => {
      if (!s.dragging) {
        s.xPos = (s.xPos + s.autoSpeed) % 100;
      }
      el.style.backgroundPositionX = `${s.xPos}%`;
      s.animId = requestAnimationFrame(loop);
    };
    s.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(s.animId);
  }, [imgLoaded]);

  // Mouse drag
  const onMouseDown = (e: React.MouseEvent) => {
    const s = stateRef.current;
    s.dragging = true; s.lastX = e.clientX;
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    s.xPos = ((s.xPos - dx * 0.04) % 100 + 100) % 100;
    s.lastX = e.clientX;
  };
  const onMouseUp = () => { stateRef.current.dragging = false; };

  // Touch drag
  const onTouchStart = (e: React.TouchEvent) => {
    const s = stateRef.current;
    s.dragging = true; s.lastX = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    const dx = e.touches[0].clientX - s.lastX;
    s.xPos = ((s.xPos - dx * 0.04) % 100 + 100) % 100;
    s.lastX = e.touches[0].clientX;
  };
  const onTouchEnd = () => { stateRef.current.dragging = false; };

  // Zoom: change background-size percentage
  const [zoom, setZoom] = useState(200); // 200% = 2× image width
  const zoomIn  = () => setZoom(z => Math.min(400, z + 30));
  const zoomOut = () => setZoom(z => Math.max(100, z - 30));
  const reset   = () => { setZoom(200); stateRef.current.xPos = 0; };

  return (
    <div className="relative rounded-2xl overflow-hidden border"
      style={{ height: full ? "90vh" : height, borderColor: "#e8d9c0" }}>

      {/* Loading */}
      {!imgLoaded && !imgError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: "#1a1209" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium text-white/70">Loading 360° View…</p>
        </div>
      )}

      {/* Error */}
      {imgError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: "#1a1209" }}>
          <span className="text-3xl">🌐</span>
          <p className="text-sm text-white/70">Could not load panorama image</p>
        </div>
      )}

      {/* Panorama — CSS background-image scroll */}
      {imgLoaded && (
        <div
          ref={containerRef}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{
            backgroundImage: `url("${url}")`,
            backgroundRepeat: "repeat-x",
            backgroundSize: `${zoom}% auto`,
            backgroundPositionY: "center",
            backgroundPositionX: "0%",
            touchAction: "none",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      )}

      {/* Controls */}
      {imgLoaded && (
        <>
          <div className="absolute bottom-3 right-3 flex gap-2 z-20">
            <ControlBtn onClick={zoomIn}  title="Zoom in">  <ZoomIn  className="h-4 w-4" /></ControlBtn>
            <ControlBtn onClick={zoomOut} title="Zoom out"> <ZoomOut className="h-4 w-4" /></ControlBtn>
            <ControlBtn onClick={reset}   title="Reset">    <RotateCcw className="h-4 w-4" /></ControlBtn>
            <ControlBtn onClick={() => setFull(f => !f)} title={full ? "Exit" : "Expand"}>
              {full ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </ControlBtn>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium text-white pointer-events-none select-none"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
            Drag to look around · Scroll buttons to zoom
          </div>
        </>
      )}

      {/* Badge */}
      <TourBadge icon={<span className="text-[10px]">✨</span>} label="AI 360° View" />
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function ControlBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="flex h-8 w-8 items-center justify-center rounded-xl text-white transition hover:scale-110 active:scale-95"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
      {children}
    </button>
  );
}

function TourBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white pointer-events-none select-none"
      style={{ backgroundColor: "rgba(201,146,26,0.88)", backdropFilter: "blur(4px)" }}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
