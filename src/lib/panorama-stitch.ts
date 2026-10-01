/**
 * panorama-stitch.ts
 *
 * Browser-side equirectangular panorama stitcher.
 * Shared by AI360Generator (owner upload) and the property detail page
 * (auto-generate from existing uploaded images).
 *
 * Input:  array of { url?: string; previewUrl?: string; angle: number }
 * Output: { blob: Blob, dataUrl: string }
 */

export interface PanoramaSlot {
  url?:        string;
  previewUrl?: string;
  angle:       number;   // degrees, 0–359
}

export interface PanoramaResult {
  blob:    Blob;
  dataUrl: string;  // "data:image/jpeg;base64,…" — safe for pannellum & canvas viewers
}

// ---------------------------------------------------------------------------

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!url) {
      return reject(new Error("Empty image URL provided for panorama stitching"));
    }

    const img = new Image();
    // Only set anonymous crossOrigin for external remote URLs
    if (/^https?:\/\//i.test(url)) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => resolve(img);
    img.onerror = () => {
      // Retry without crossOrigin
      const img2 = new Image();
      img2.onload = () => resolve(img2);
      img2.onerror = () => reject(new Error(`Cannot load image: ${url.slice(0, 80)}`));
      img2.src = url;
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------

export async function stitchPanorama(slots: PanoramaSlot[]): Promise<PanoramaResult> {
  if (!slots || slots.length === 0) {
    throw new Error("No images provided for panorama stitching");
  }

  // 1. Load all images in parallel
  const loaded = await Promise.all(
    slots.map(async (s) => {
      const srcUrl = s.url || s.previewUrl;
      if (!srcUrl) throw new Error("Image URL is missing for one of the wall angles");
      const img = await loadImage(srcUrl);
      return { img, angle: s.angle ?? 0 };
    })
  );

  // 2. Sort by ascending angle
  const sorted = [...loaded].sort((a, b) => a.angle - b.angle);
  const count  = sorted.length;

  // 3. Compute angular span per image
  const spans = sorted.map((entry, i) => {
    const prevAngle = sorted[(i - 1 + count) % count].angle;
    const nextAngle = sorted[(i + 1)         % count].angle;

    const gapBefore = ((entry.angle - prevAngle) + 360) % 360;
    const gapAfter  = ((nextAngle - entry.angle)  + 360) % 360;

    const startAngle = (entry.angle - gapBefore / 2 + 360) % 360;
    const spanAngle  = gapBefore / 2 + gapAfter / 2;

    return { startAngle, spanAngle: spanAngle <= 0 ? 360 / count : spanAngle };
  });

  // 4. Draw onto 4096×2048 canvas (standard equirectangular 2:1 ratio)
  const PAN_W = 4096;
  const PAN_H = 2048;

  const canvas  = document.createElement("canvas");
  canvas.width  = PAN_W;
  canvas.height = PAN_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available in browser");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, PAN_W, PAN_H);

  sorted.forEach(({ img }, i) => {
    const { startAngle, spanAngle } = spans[i];

    const dx = Math.round((startAngle / 360) * PAN_W);
    const dw = Math.round((spanAngle  / 360) * PAN_W);
    if (dw <= 0) return;

    const nw = img.naturalWidth || img.width || 800;
    const nh = img.naturalHeight || img.height || 600;

    if (dx + dw <= PAN_W) {
      // No seam
      ctx.drawImage(img, 0, 0, nw, nh, dx, 0, dw, PAN_H);
    } else {
      // Straddles the 0°/360° seam — split into two draws
      const part1W    = PAN_W - dx;
      const part2W    = dw - part1W;
      const frac      = part1W / dw;
      const srcSplitX = Math.round(nw * frac);

      ctx.drawImage(img, 0, 0, srcSplitX, nh, dx, 0, part1W, PAN_H);
      ctx.drawImage(
        img, srcSplitX, 0, nw - srcSplitX, nh,
        0, 0, part2W, PAN_H
      );
    }
  });

  // 5. Export as JPEG blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.92
    );
  });

  // 6. Convert to base64 data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed to convert panorama blob"));
    reader.readAsDataURL(blob);
  });

  return { blob, dataUrl };
}
