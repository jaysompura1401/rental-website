/**
 * server/routes/maps.js  — Map module v3 (scratch rewrite)
 *
 * Endpoints:
 *   GET /api/maps/resolve?url=...
 *     Resolves any Google Maps URL (including maps.app.goo.gl short links)
 *     to exact lat/lng coordinates embedded in the URL or redirect chain.
 *     NEVER falls back to address geocoding — wrong pin is worse than no pin.
 *     Returns: { lat, lng, source, resolved_url }
 *
 *   GET /api/maps/geocode?address=...
 *     Text geocoding via OpenStreetMap Nominatim.
 *     Kept for non-property uses only. NOT used by any map display.
 *
 * Design principles:
 *   1. Only return coords that are embedded in the actual URL / redirect chain.
 *   2. Never geocode locality / address / city for pin placement.
 *   3. If exact coords cannot be found → 422, frontend shows "no location".
 */

import { Router } from "express";
import express from "express";
import https from "https";
import http from "http";

const router = Router();

// ─── HTTP GET helper ──────────────────────────────────────────────────────────
// Follows up to 12 redirects manually (does NOT auto-follow with Node's http).
// Returns { finalUrl, body, status }.
//
// Multiple User-Agent strategies tried in order so we handle both:
//   (a) maps.app.goo.gl  → Google now often returns a JS page; we capture the
//       redirect URL from the Location header before the JS runs.
//   (b) full maps.google.com URLs → coords already in the URL, no fetch needed.

const USER_AGENTS = [
  // Googlebot — often gets a clean redirect
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  // Android Chrome — triggers app-redirect HTML that has og:url with coords
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  // Desktop Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function httpGetWithAgent(url, userAgent, depth = 0) {
  if (depth > 15) return Promise.reject(new Error("Too many redirects"));

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error("Invalid URL: " + url));
    }

    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
          Connection: "close",
          // Referer helps some Google endpoints return richer HTML
          Referer: "https://www.google.com/",
        },
      },
      (res) => {
        // Follow 3xx redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          let next = res.headers.location;
          if (next.startsWith("/")) {
            next = `${parsed.protocol}//${parsed.hostname}${next}`;
          }
          // If the Location header itself contains coords — capture it before following
          const earlyCoords = extractCoords(next);
          if (earlyCoords) {
            res.resume();
            return resolve({ finalUrl: next, body: "", status: res.statusCode, earlyCoords });
          }
          res.resume();
          return httpGetWithAgent(next, userAgent, depth + 1).then(resolve).catch(reject);
        }

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 500_000) req.destroy();
        });
        res.on("end", () => resolve({ finalUrl: url, body, status: res.statusCode }));
      }
    );

    req.on("error", reject);
    req.setTimeout(15_000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

// Try all user agents in sequence, return first successful result
async function httpGet(url) {
  let lastErr = null;
  for (const ua of USER_AGENTS) {
    try {
      const result = await httpGetWithAgent(url, ua, 0);
      return result;
    } catch (e) {
      lastErr = e;
      // Continue to next UA
    }
  }
  throw lastErr ?? new Error("All fetch attempts failed");
}

// ─── Coordinate extractor ─────────────────────────────────────────────────────
// Tries every known Google Maps coordinate encoding, most precise first.
// All patterns require ≥4 decimal places to avoid false matches on integers.
function extractCoords(src) {
  if (!src || typeof src !== "string") return null;
  let m;

  // 1. @lat,lng,zoom — standard browser URL  e.g. @23.06089,72.54780,17z
  m = src.match(/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "@lat,lng" };

  // 2. !3d<lat>!4d<lng> — place / embed links
  m = src.match(/!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "!3d!4d" };

  // 3. ?q=lat,lng — numeric only (skip if value has letters = place name)
  m = src.match(/[?&]q=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "?q=" };

  // 4. ll=lat,lng — older format
  m = src.match(/\bll=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "ll=" };

  // 5. center=lat,lng
  m = src.match(/\bcenter=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "center=" };

  // 6. /@lat,lng — path-embedded
  m = src.match(/\/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "/@" };

  // 7. !8m2!3d<lat>!4d<lng> — directions embed variant
  m = src.match(/!8m2!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "!8m2!3d!4d" };

  // 8. !1d<lng>!2d<lat> — older embed (note reversed order)
  m = src.match(/!1d(-?\d{1,3}\.\d{4,})!2d(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[2], lng: +m[1], source: "!1d!2d" };

  // 9. daddr= / saddr= — directions link
  m = src.match(/[sd]addr=(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "daddr/saddr" };

  // 10. /maps/place/.../lat,lng — some share links put coords in the path
  m = src.match(/\/maps\/place\/[^/]+\/(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (m) return { lat: +m[1], lng: +m[2], source: "place/lat,lng" };

  return null;
}

// ─── HTML body scanner ────────────────────────────────────────────────────────
// When Google returns a 200 HTML page (JS redirect, share page, etc.)
// we scan for the canonical maps.google.com URL that contains coords.
// Returns { coords, canonicalUrl } or null.
function scanHtmlBody(body, fallbackUrl) {
  if (!body) return null;

  // 1. og:url meta tag — most reliable; Google puts the full place URL here
  for (const pat of [
    /property=["']og:url["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:url["']/i,
  ]) {
    const m = body.match(pat);
    if (m) {
      const coords = extractCoords(m[1]);
      if (coords) return { coords, canonicalUrl: m[1] };
    }
  }

  // 2. <link rel="canonical" href="...">
  const canonPat =
    body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonPat) {
    const coords = extractCoords(canonPat[1]);
    if (coords) return { coords, canonicalUrl: canonPat[1] };
  }

  // 3. window.location.replace("https://maps.google.com/...") in inline JS
  const wlPat = body.match(
    /window\.location(?:\.replace)?\s*\(\s*["']([^"']+google\.com[^"']+)["']/i
  );
  if (wlPat) {
    const coords = extractCoords(wlPat[1]);
    if (coords) return { coords, canonicalUrl: wlPat[1] };
  }

  // 4. meta http-equiv refresh
  const metaRefresh =
    body.match(/http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)/i) ??
    body.match(/content=["'][^"']*url=([^"']+)["'][^>]*http-equiv=["']refresh["']/i);
  if (metaRefresh) {
    const target = metaRefresh[1].trim();
    const coords = extractCoords(target);
    if (coords) return { coords, canonicalUrl: target };
  }

  // 5. Any maps.google.com URL in the body that contains coords
  const gmUrls = body.match(
    /https?:\/\/(?:www\.)?(?:maps\.)?google\.com\/maps[^\s"'<>]{20,}/g
  );
  if (gmUrls) {
    for (const candidate of gmUrls) {
      const coords = extractCoords(candidate);
      if (coords) return { coords, canonicalUrl: candidate };
    }
  }

  // 6. JSON coord patterns — "lat":23.0608,"lng":72.5477 (≥4 dp required)
  const jsonCoords = body.match(
    /"lat"\s*:\s*(-?\d{1,3}\.\d{4,})\s*,\s*"(?:lng|lon)"\s*:\s*(-?\d{1,3}\.\d{4,})/
  );
  if (jsonCoords) {
    return {
      coords: { lat: +jsonCoords[1], lng: +jsonCoords[2], source: "json" },
      canonicalUrl: fallbackUrl,
    };
  }

  // 7. Numeric array coords [lat, lng] in JS data blobs (≥6 dp = high precision GPS)
  const arrayCoords = body.match(/\[(-?\d{1,3}\.\d{6,}),(-?\d{1,3}\.\d{6,})\]/);
  if (arrayCoords) {
    const lat = +arrayCoords[1];
    const lng = +arrayCoords[2];
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        coords: { lat, lng, source: "array" },
        canonicalUrl: fallbackUrl,
      };
    }
  }

  // 8. maps.app.goo.gl share page — Google embeds coords in various JS data structures
  // Pattern: ",...,lat,lng,..." inside JS arrays (Google Maps internal data)
  const gooGlPatterns = [
    // [null,null,lat,lng] — common in Google's share pages
    /\[null,null,(-?\d{1,3}\.\d{5,}),(-?\d{1,3}\.\d{5,})\]/,
    // [lat,lng] anywhere with 5+ decimal places (high-precision GPS)
    /(?:^|[^-\d])(-2[0-9]\.\d{5,}|[0-3][0-9]\.\d{5,}),\s*(-?\d{2,3}\.\d{5,})/,
    // ftm= or similar params in JS
    /["'](-?\d{1,3}\.\d{6,})["'],\s*["'](-?\d{1,3}\.\d{6,})["']/,
  ];
  for (const pat of gooGlPatterns) {
    const m = body.match(pat);
    if (m) {
      const lat = +m[1], lng = +m[2];
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
        return { coords: { lat, lng, source: "gooGl_js" }, canonicalUrl: fallbackUrl };
      }
    }
  }

  // 9. All 5+ decimal coordinate pairs in the entire body (last resort)
  const allCoordPairs = [...body.matchAll(/(-?\d{1,3}\.\d{5,})[,\s]+(-?\d{1,3}\.\d{5,})/g)];
  for (const match of allCoordPairs) {
    const lat = +match[1], lng = +match[2];
    // India bounding box: lat 6–37, lng 68–97
    if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97) {
      return { coords: { lat, lng, source: "body_scan_india" }, canonicalUrl: fallbackUrl };
    }
  }

  return null;
}

// ─── Coordinate validator ─────────────────────────────────────────────────────
function validCoords(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // Reject (0,0) — almost always an extraction artifact, not a real location
    !(lat === 0 && lng === 0)
  );
}

// ─── Build canonical Google Maps URL from coords ──────────────────────────────
function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=17`;
}

// ─── GET /api/maps/resolve?url=... ────────────────────────────────────────────
router.get("/resolve", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    const inputUrl = url.trim();

    // ── Step 1: direct extraction from the URL string itself ──────────────
    // Works immediately for full maps.google.com URLs that already embed coords.
    // Short links (maps.app.goo.gl) have no coords here — they go to Step 2.
    const directCoords = extractCoords(inputUrl);
    if (directCoords && validCoords(directCoords.lat, directCoords.lng)) {
      const resolved_url = inputUrl.includes("google.com")
        ? inputUrl
        : buildMapsUrl(directCoords.lat, directCoords.lng);
      return res.json({
        lat: directCoords.lat,
        lng: directCoords.lng,
        source: "direct_url_" + directCoords.source,
        resolved_url,
      });
    }

    // ── Step 2: fetch the URL and follow all redirects ────────────────────
    // maps.app.goo.gl → redirect chain → full maps.google.com URL
    let fetchResult;
    try {
      fetchResult = await httpGet(inputUrl);
    } catch (fetchErr) {
      return res.status(422).json({
        error: "Could not fetch this link: " + fetchErr.message,
        tip: "Open Google Maps → search your property → long-press the exact pin → tap Share → Copy link. Paste the maps.app.goo.gl link here.",
      });
    }

    const { finalUrl, body, status, earlyCoords } = fetchResult;

    // ── Step 3a: coords captured from Location header during redirect ─────
    if (earlyCoords && validCoords(earlyCoords.lat, earlyCoords.lng)) {
      return res.json({
        lat: earlyCoords.lat,
        lng: earlyCoords.lng,
        source: "redirect_header_" + (earlyCoords.source || ""),
        resolved_url: finalUrl,
      });
    }

    // ── Step 3b: try coords in the final redirected URL ───────────────────
    if (finalUrl && finalUrl !== inputUrl) {
      const redirectCoords = extractCoords(finalUrl);
      if (redirectCoords && validCoords(redirectCoords.lat, redirectCoords.lng)) {
        const resolved_url = finalUrl.includes("google.com")
          ? finalUrl
          : buildMapsUrl(redirectCoords.lat, redirectCoords.lng);
        return res.json({
          lat: redirectCoords.lat,
          lng: redirectCoords.lng,
          source: "redirect_url_" + redirectCoords.source,
          resolved_url,
        });
      }
    }

    // ── Step 4: deep-scan the HTML body ───────────────────────────────────
    const htmlResult = scanHtmlBody(body, finalUrl || inputUrl);
    if (htmlResult && validCoords(htmlResult.coords.lat, htmlResult.coords.lng)) {
      const { coords, canonicalUrl } = htmlResult;
      const resolved_url =
        canonicalUrl && canonicalUrl.includes("google.com")
          ? canonicalUrl
          : buildMapsUrl(coords.lat, coords.lng);
      return res.json({
        lat: coords.lat,
        lng: coords.lng,
        source: "html_body_" + (coords.source || "scan"),
        resolved_url,
      });
    }

    // ── Step 5: try fetching the finalUrl directly if it's a maps.google.com URL ──
    // Sometimes the first fetch lands on a JS page; a second fetch of the canonical
    // URL with a different UA gives us the real place page with coords.
    if (finalUrl && finalUrl !== inputUrl && finalUrl.includes("google.com/maps")) {
      try {
        const secondFetch = await httpGetWithAgent(
          finalUrl,
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          0
        );
        if (secondFetch.earlyCoords && validCoords(secondFetch.earlyCoords.lat, secondFetch.earlyCoords.lng)) {
          return res.json({
            lat: secondFetch.earlyCoords.lat,
            lng: secondFetch.earlyCoords.lng,
            source: "second_fetch_header",
            resolved_url: secondFetch.finalUrl || finalUrl,
          });
        }
        const secondResult = extractCoords(secondFetch.finalUrl);
        if (secondResult && validCoords(secondResult.lat, secondResult.lng)) {
          return res.json({
            lat: secondResult.lat,
            lng: secondResult.lng,
            source: "second_fetch_url",
            resolved_url: secondFetch.finalUrl,
          });
        }
        const secondHtml = scanHtmlBody(secondFetch.body, secondFetch.finalUrl);
        if (secondHtml && validCoords(secondHtml.coords.lat, secondHtml.coords.lng)) {
          return res.json({
            lat: secondHtml.coords.lat,
            lng: secondHtml.coords.lng,
            source: "second_fetch_html_" + (secondHtml.coords.source || ""),
            resolved_url: secondHtml.canonicalUrl || finalUrl,
          });
        }
      } catch {
        // ignore — fall through to 422
      }
    }

    // ── Step 6: coords not found — return 422, NEVER geocode ─────────────
    console.warn(
      `[maps/resolve] Could not extract coords from: ${inputUrl} (final: ${finalUrl}, http: ${status})`
    );
    return res.status(422).json({
      error: "Could not extract exact coordinates from this link.",
      tip:
        "Google Maps → search your property → long-press the exact pin on the map → tap Share → Copy link. Use the maps.app.goo.gl link.",
      debug: {
        inputUrl,
        finalUrl: finalUrl ?? "(no redirect)",
        httpStatus: status,
      },
    });
  } catch (err) {
    console.error("[maps/resolve] Internal error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ─── GET /api/maps/geocode?address=... ───────────────────────────────────────
// Text geocoding via OpenStreetMap Nominatim.
// IMPORTANT: This endpoint is NOT used for property map display.
// It exists only for external / admin tooling.
router.get("/geocode", async (req, res) => {
  try {
    const { address, city, locality, state } = req.query;

    let query = address;
    if (!query && (city || locality)) {
      query = [locality, city, state, "India"].filter(Boolean).join(", ");
    }
    if (!query) {
      return res
        .status(400)
        .json({ error: "address, or at least city/locality, is required" });
    }

    const q = encodeURIComponent(String(query));
    let result;
    try {
      result = await httpGet(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=in`
      );
    } catch (e) {
      return res
        .status(502)
        .json({ error: "Nominatim unreachable: " + e.message });
    }

    let data;
    try {
      data = JSON.parse(result.body);
    } catch {
      data = [];
    }

    if (Array.isArray(data) && data.length > 0) {
      return res.json({
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name,
        source: "nominatim",
        query,
      });
    }

    res.status(404).json({ error: "Location not found for: " + query });
  } catch (err) {
    console.error("[maps/geocode] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/maps/overpass ─────────────────────────────────────────────────
// Server-side proxy for Overpass API — avoids CORS + browser rate limits.
// Body: plain-text Overpass QL query (Content-Type: text/plain).
//
// express.text() is applied as per-route middleware so the body is parsed and
// available as req.body (a string) before the async handler runs — this avoids
// the race condition where req.on("data") is attached after the body has already
// been buffered by Node's socket layer for small payloads.
//
// Races three Overpass mirrors; returns first successful JSON response.
router.post(
  "/overpass",
  express.text({ type: ["text/plain", "text/*", "application/octet-stream"], limit: "64kb" }),
  async (req, res) => {
    // req.body is a string when express.text() parsed it;
    // fall back to raw stream accumulation if for any reason it wasn't parsed.
    let query = typeof req.body === "string" ? req.body.trim() : "";

    if (!query) {
      // Safety fallback: try to read from stream (should not normally be needed)
      query = await new Promise(resolve => {
        let buf = "";
        req.on("data", chunk => { buf += chunk.toString(); });
        req.on("end",  () => resolve(buf.trim()));
        req.on("error", () => resolve(""));
        // If the stream is already consumed, end fires synchronously after 0 data events
        setTimeout(() => resolve(buf.trim()), 100);
      });
    }

    if (!query) return res.status(400).json({ error: "Empty Overpass query" });

    const MIRRORS = [
      "https://overpass-api.de/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      "https://overpass.openstreetmap.ru/api/interpreter",
    ];

    // Race all mirrors in parallel — return first success, fail only if ALL fail
    const fetchMirror = (mirror) =>
      new Promise((resolve, reject) => {
        const url  = new URL(mirror);
        const data = Buffer.from(`data=${encodeURIComponent(query)}`, "utf8");
        const opts = {
          hostname: url.hostname,
          path:     url.pathname,
          method:   "POST",
          headers: {
            "Content-Type":   "application/x-www-form-urlencoded",
            "Content-Length": data.length,
            "User-Agent":     "Nivaas/1.0 (nivaas.in proximity lookup)",
            "Accept":         "application/json",
          },
        };
        const req2 = https.request(opts, resp => {
          let chunks = "";
          resp.on("data", c => { chunks += c; });
          resp.on("end", () => {
            if (resp.statusCode && resp.statusCode >= 400) {
              reject(new Error(`HTTP ${resp.statusCode} from ${mirror}`));
            } else {
              try { resolve(JSON.parse(chunks)); }
              catch (e) { reject(new Error(`Invalid JSON from ${mirror}`)); }
            }
          });
        });
        req2.on("error", reject);
        req2.setTimeout(18000, () => { req2.destroy(); reject(new Error("timeout")); });
        req2.write(data);
        req2.end();
      });

    try {
      const parsed = await Promise.any(MIRRORS.map(fetchMirror));
      res.setHeader("Content-Type", "application/json");
      return res.json(parsed);
    } catch (err) {
      const msg = err && err.errors ? err.errors.map(e => e.message).join("; ") : String(err);
      res.status(502).json({ error: "All Overpass mirrors failed: " + msg });
    }
  },
);

// ─── GET /api/maps/nominatim-search ──────────────────────────────────────────
// Server-side proxy for Nominatim /search — avoids browser rate-limiting and
// the Nominatim policy requiring a valid User-Agent + no parallel requests.
//
// Query params forwarded verbatim to Nominatim, plus we inject the required
// User-Agent header that browsers cannot set freely.
//
// Example: GET /api/maps/nominatim-search?amenity=school&lat=23.02&lon=72.57&radius=3000&limit=10
router.get("/nominatim-search", async (req, res) => {
  const { amenity, lat, lon, radius = "3000", limit = "10" } = req.query;

  if (!amenity || !lat || !lon) {
    return res.status(400).json({ error: "amenity, lat, and lon are required" });
  }

  const latN   = parseFloat(lat);
  const lonN   = parseFloat(lon);
  const radN   = parseInt(radius, 10);

  if (isNaN(latN) || isNaN(lonN) || isNaN(radN)) {
    return res.status(400).json({ error: "lat, lon, radius must be numbers" });
  }

  // Build a bounding box ~radius metres around the point (1° ≈ 111 km)
  const deg = radN / 111000;
  const viewbox = `${lonN - deg},${latN + deg},${lonN + deg},${latN - deg}`; // W,N,E,S

  const params = new URLSearchParams({
    amenity:      String(amenity),
    format:       "json",
    limit:        String(Math.min(parseInt(limit, 10) || 10, 50)),
    viewbox,
    bounded:      "1",
    addressdetails: "0",
    extratags:    "1",   // phone, website, opening_hours
    namedetails:  "0",
  });

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  return new Promise((resolve) => {
    const opts = {
      hostname: "nominatim.openstreetmap.org",
      path:     `/search?${params.toString()}`,
      method:   "GET",
      headers: {
        "User-Agent":  "Nivaas/1.0 (nivaas.in rental platform; contact@nivaas.in)",
        "Accept":      "application/json",
        "Referer":     "https://nivaas.in/",
      },
    };

    const req2 = https.request(opts, (resp) => {
      let chunks = "";
      resp.on("data", (c) => { chunks += c; });
      resp.on("end", () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          res.status(502).json({ error: `Nominatim returned HTTP ${resp.statusCode}` });
          return resolve(undefined);
        }
        try {
          const parsed = JSON.parse(chunks);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "public, max-age=3600"); // cache 1 hour
          res.json(parsed);
        } catch {
          res.status(502).json({ error: "Invalid JSON from Nominatim" });
        }
        resolve(undefined);
      });
    });

    req2.on("error", (err) => {
      res.status(502).json({ error: `Nominatim request failed: ${err.message}` });
      resolve(undefined);
    });
    req2.setTimeout(12000, () => {
      req2.destroy();
      res.status(504).json({ error: "Nominatim request timed out" });
      resolve(undefined);
    });
    req2.end();
  });
});

// ─── Clean JSON GET helper for Google APIs ────────────────────────────────────
// Unlike the main httpGet (which uses text/html + redirect-following for Maps URLs),
// this helper is purpose-built for Google's REST JSON APIs. It sends a proper
// Accept: application/json header, does NOT follow HTML redirects, and returns
// the parsed JSON body directly.
function googleJsonGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers: {
          "Accept":       "application/json",
          "User-Agent":   "Nivaas/1.0 (nivaas.in; contact@nivaas.in)",
          "Connection":   "close",
        },
      },
      (resp) => {
        let raw = "";
        resp.on("data", (c) => { raw += c; });
        resp.on("end", () => {
          if (resp.statusCode && resp.statusCode >= 400) {
            // Try to parse error body from Google
            try {
              const errBody = JSON.parse(raw);
              return resolve(errBody); // let the caller handle status field
            } catch { /* ignore */ }
            return reject(new Error(`Google API HTTP ${resp.statusCode}`));
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error("Invalid JSON from Google API: " + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("Google API request timed out"));
    });
    req.end();
  });
}

// ─── Helper: POST to Places API (New) ────────────────────────────────────────
// Uses X-Goog-Api-Key header (server-to-server — no HTTP Referrer restriction applies).
// The key needs "Places API (New)" enabled in Google Cloud Console.
function placesNewPost(path, body, apiKey, fieldMask) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "places.googleapis.com",
        path,
        method:   "POST",
        headers: {
          "Content-Type":    "application/json",
          "Content-Length":  Buffer.byteLength(payload),
          "X-Goog-Api-Key":  apiKey,
          "X-Goog-FieldMask": fieldMask,
          "Accept":          "application/json",
          "Connection":      "close",
        },
      },
      (resp) => {
        let raw = "";
        resp.on("data", (c) => { raw += c; });
        resp.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            if (resp.statusCode && resp.statusCode >= 400) {
              return resolve({ _httpStatus: resp.statusCode, ...parsed });
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error("Invalid JSON from Places API (New): " + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("Places API (New) request timed out"));
    });
    req.write(payload);
    req.end();
  });
}

// ─── Nominatim helper ─────────────────────────────────────────────────────────
// OpenStreetMap Nominatim — free, no API key required, India-aware.
// Rate limit: 1 req/s per IP (server-side calls consolidate many users into one
// server IP, so we keep a lightweight token-bucket at ~2 req/s to stay safe).
let _nominatimLastCall = 0;
function nominatimThrottle() {
  const now = Date.now();
  const gap  = 520; // ~2 req/s
  const wait = Math.max(0, gap - (now - _nominatimLastCall));
  _nominatimLastCall = now + wait;
  return new Promise(r => setTimeout(r, wait));
}

function nominatimGet(path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL("https://nominatim.openstreetmap.org" + path);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers: {
          "Accept":          "application/json",
          // Nominatim ToS requires a valid User-Agent & Referer identifying your app
          "User-Agent":      "Nivaas/1.0 (nivaas.in; contact@nivaas.in)",
          "Referer":         "https://nivaas.in/",
          "Accept-Language": "en",
          "Connection":      "close",
        },
      },
      (resp) => {
        let raw = "";
        resp.on("data", c => { raw += c; });
        resp.on("end", () => {
          if (resp.statusCode && resp.statusCode >= 400) {
            return reject(new Error(`Nominatim HTTP ${resp.statusCode}`));
          }
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error("Invalid JSON from Nominatim")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Nominatim request timed out")); });
    req.end();
  });
}

// ─── Photon helper (komoot.io) ────────────────────────────────────────────────
// Photon is a free, key-less geocoder built on OSM data, specifically designed
// for "search-as-you-type" autocomplete — it does prefix/partial-word matching
// (e.g. "moch" while the user is still typing "mocha"). Nominatim, by contrast,
// expects whole words and often returns nothing for an in-progress word, which
// is why it alone isn't a good fit for a live search box.
// Light throttle for the public Photon instance — same courtesy as Nominatim,
// just a looser limit since Photon is built for higher-frequency typing traffic.
let _photonLastCall = 0;
function photonThrottle() {
  const now = Date.now();
  const gap  = 150; // ~6-7 req/s ceiling
  const wait = Math.max(0, gap - (now - _photonLastCall));
  _photonLastCall = now + wait;
  return new Promise(r => setTimeout(r, wait));
}

function photonGet(path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL("https://photon.komoot.io" + path);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers: {
          "Accept":     "application/json",
          "User-Agent": "Nivaas/1.0 (nivaas.in; contact@nivaas.in)",
          "Connection": "close",
        },
      },
      (resp) => {
        let raw = "";
        resp.on("data", c => { raw += c; });
        resp.on("end", () => {
          if (resp.statusCode && resp.statusCode >= 400) {
            return reject(new Error(`Photon HTTP ${resp.statusCode}`));
          }
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error("Invalid JSON from Photon")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Photon request timed out")); });
    req.end();
  });
}

// Photon's osm_type is a single letter (N/W/R) — normalize to Nominatim's
// full word so place_id stays in the same "osm:<type>:<id>" shape used
// everywhere else (and resolved the same way by /place-details below).
const PHOTON_TYPE_MAP = { N: "node", W: "way", R: "relation" };

function photonFeatureToPrediction(f) {
  const p = f?.properties || {};
  if (!p.osm_id || !p.osm_type) return null;
  const osmType = PHOTON_TYPE_MAP[p.osm_type] || "way";

  const mainText = p.name || p.street || p.city || p.state || "Unnamed place";
  const secondaryParts = [];
  if (p.name && p.street) secondaryParts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  if (p.district && p.district !== mainText) secondaryParts.push(p.district);
  if (p.city && p.city !== mainText) secondaryParts.push(p.city);
  if (p.state) secondaryParts.push(p.state);
  if (p.postcode) secondaryParts.push(p.postcode);
  if (p.country) secondaryParts.push(p.country);
  const secondaryText = secondaryParts.filter(Boolean).join(", ");
  const description = [mainText, secondaryText].filter(Boolean).join(", ");

  const coords = f?.geometry?.coordinates; // [lon, lat]
  return {
    place_id:              `osm:${osmType}:${p.osm_id}`,
    description,
    structured_formatting: { main_text: mainText, secondary_text: secondaryText },
    types:                 [p.osm_value || p.osm_key || "place"],
    _lat: Array.isArray(coords) ? String(coords[1]) : undefined,
    _lng: Array.isArray(coords) ? String(coords[0]) : undefined,
  };
}

function nominatimToDetails(r) {
  const addr = r?.address || {};
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  const locality = addr.suburb || addr.neighbourhood || addr.residential || addr.subdistrict || addr.quarter || "";
  const pincode = addr.postcode || "";
  const state = addr.state || "";
  const country = addr.country || "India";
  return {
    place_id: r?.osm_type && r?.osm_id ? `osm:${r.osm_type}:${r.osm_id}` : (r?.place_id ? String(r.place_id) : "osm"),
    formatted_address: r?.display_name || "",
    lat: parseFloat(r?.lat),
    lng: parseFloat(r?.lon),
    city,
    locality,
    pincode,
    state,
    country,
  };
}

// ─── GET /api/maps/places-autocomplete ───────────────────────────────────────
// Search-as-you-type address autocomplete.
// Priority order:
//   1. Photon      — free, no key, purpose-built for partial-word/live typing
//   2. Nominatim   — free, no key, good fallback for complete-word queries
//   3. Google APIs — if a key is present and has the relevant API enabled
//
// Query params:
//   input        – required, the search text (min 2 chars)
//   sessiontoken – optional, billing session grouping (Google paths only)
//   city         – optional, the city already chosen in the form (e.g. "Ahmedabad").
//                  Appended to the search text (when not already present) and used
//                  to bias ranking, so "Krishna Complex" doesn't match a place of
//                  the same name in a different state.
//   lat / lng    – optional, bias centre coordinates (usually the chosen city's
//                  centre). Used to softly prefer nearby results.
//
// Response: { status, predictions: [{ place_id, description, structured_formatting }] }
router.get("/places-autocomplete", async (req, res) => {
  const { input, city, lat, lng } = req.query;
  if (!input || typeof input !== "string" || input.trim().length < 2) {
    return res.status(400).json({ error: "input is required (min 2 characters)" });
  }

  const query    = input.trim();
  const biasCity = typeof city === "string" ? city.trim() : "";
  const biasLat  = parseFloat(lat);
  const biasLng  = parseFloat(lng);
  const hasBiasCoords = Number.isFinite(biasLat) && Number.isFinite(biasLng);

  // If the user's text doesn't already mention the city, append it. This is
  // the single biggest fix for "wrong state" matches — a bare society/street
  // name is otherwise ambiguous across the whole country.
  const cityAlreadyMentioned = biasCity && query.toLowerCase().includes(biasCity.toLowerCase());
  const queryWithCity = biasCity && !cityAlreadyMentioned ? `${query}, ${biasCity}` : query;

  // A soft ~65km bounding box around the bias point. bounded=0 means it only
  // nudges ranking toward that area rather than hiding everything outside it,
  // so a genuine landmark elsewhere can still be found if typed in full.
  function applyBias(params) {
    if (hasBiasCoords) {
      const box = 0.6; // degrees, ≈ 65km half-width
      params.set("viewbox", `${biasLng - box},${biasLat + box},${biasLng + box},${biasLat - box}`);
      params.set("bounded", "0");
    }
    return params;
  }

  // ── Path 1a: Photon (primary — purpose-built for live/partial-word typing) ──
  // Deliberately does NOT append the city to the query text here: Photon treats
  // the *last* word of the query as the in-progress partial word to prefix-match
  // (that's what makes "moch" find "Mocha ..."). Appending ", Ahmedabad" after
  // it would make "moch" a separate, already-"finished" word that has to match
  // exactly — which breaks the very thing we want. Geographic bias is instead
  // done properly via lat/lon + location_bias_scale below.
  try {
    await photonThrottle();
    const photonParams = new URLSearchParams({ q: query, limit: "8", lang: "en" });
    if (hasBiasCoords) {
      photonParams.set("lat", String(biasLat));
      photonParams.set("lon", String(biasLng));
      photonParams.set("location_bias_scale", "0.8"); // soft pull toward the city
    }

    const photonBody = await photonGet(`/api/?${photonParams.toString()}`);
    const photonPredictions = (photonBody?.features || [])
      .map(photonFeatureToPrediction)
      .filter(Boolean);

    if (photonPredictions.length > 0) {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ status: "OK", predictions: photonPredictions, source: "photon" });
    }
    console.info("[places-autocomplete] Photon returned 0 results, trying Nominatim");
  } catch (photonErr) {
    console.warn("[places-autocomplete] Photon failed:", photonErr.message, "– trying Nominatim");
  }

  // ── Path 1b: Nominatim (fallback — reliable for complete-word queries) ────
  try {
    await nominatimThrottle();
    const params = applyBias(new URLSearchParams({
      q:              queryWithCity,
      format:         "jsonv2",
      addressdetails: "1",
      limit:          "8",
      countrycodes:   "in",
      "accept-language": "en",
    }));

    let results = await nominatimGet(`/search?${params.toString()}`);

    // If biasing the query text with the city produced nothing (e.g. a typo
    // in the city, or a genuinely out-of-city landmark), retry with the
    // user's original text — still soft-biased by viewbox if we have coords.
    if ((!Array.isArray(results) || results.length === 0) && queryWithCity !== query) {
      await nominatimThrottle();
      const fallbackParams = applyBias(new URLSearchParams({
        q:              query,
        format:         "jsonv2",
        addressdetails: "1",
        limit:          "8",
        countrycodes:   "in",
        "accept-language": "en",
      }));
      results = await nominatimGet(`/search?${fallbackParams.toString()}`);
    }

    if (Array.isArray(results) && results.length > 0) {
      const predictions = results.map(r => {
        // Build main_text / secondary_text from display_name parts
        const parts = (r.display_name || "").split(",").map(s => s.trim()).filter(Boolean);
        const mainText      = parts[0] || r.display_name || "";
        const secondaryText = parts.slice(1).join(", ");
        return {
          place_id:              `osm:${r.osm_type}:${r.osm_id}`,
          description:           r.display_name,
          structured_formatting: { main_text: mainText, secondary_text: secondaryText },
          types:                 [r.type || r.category || "place"],
          // Embed lat/lng so place-details can skip a second fetch
          _lat: r.lat,
          _lng: r.lon,
          _address: r,
        };
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ status: "OK", predictions, source: "nominatim" });
    }

    // Nominatim also returned empty — fall through to Google
    console.info("[places-autocomplete] Nominatim returned 0 results, trying Google");
  } catch (nomErr) {
    console.warn("[places-autocomplete] Nominatim failed:", nomErr.message, "– trying Google");
  }

  // ── Path 2 & 3: Google APIs (fallback — need enabled key) ─────────────────
  const GOOGLE_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: "No results found and no Google Maps API key configured" });
  }

  const { sessiontoken } = req.query;

  // Places API (New)
  try {
    const reqBody = {
      input:                   queryWithCity,
      languageCode:            "en",
      includedRegionCodes:     ["IN"],
      includeQueryPredictions: false,
    };
    if (sessiontoken) reqBody.sessionToken = String(sessiontoken);
    if (hasBiasCoords) {
      reqBody.locationBias = {
        circle: { center: { latitude: biasLat, longitude: biasLng }, radius: 60000 },
      };
    }

    const body = await placesNewPost(
      "/v1/places:autocomplete",
      reqBody,
      GOOGLE_KEY,
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
    );

    if (body._httpStatus && (body._httpStatus === 403 || body._httpStatus === 400)) {
      throw new Error("Places API (New) not available: " + (body.error?.message || body._httpStatus));
    }

    if (body.suggestions && Array.isArray(body.suggestions)) {
      const predictions = body.suggestions
        .filter(s => s.placePrediction)
        .map(s => {
          const p = s.placePrediction;
          const mainText      = p.structuredFormat?.mainText?.text      || p.text?.text?.split(",")[0] || "";
          const secondaryText = p.structuredFormat?.secondaryText?.text || p.text?.text?.split(",").slice(1).join(",").trim() || "";
          return {
            place_id:              p.placeId,
            description:           p.text?.text || mainText,
            structured_formatting: { main_text: mainText, secondary_text: secondaryText },
            types:                 [],
          };
        });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ status: predictions.length > 0 ? "OK" : "ZERO_RESULTS", predictions, source: "google-new" });
    }
    throw new Error("Unexpected Places API (New) response shape");
  } catch (newApiErr) {
    console.warn("[places-autocomplete] Places API (New) failed:", newApiErr.message, "– trying legacy");
  }

  // Legacy Places Autocomplete API
  try {
    const params = new URLSearchParams({ input: queryWithCity, key: GOOGLE_KEY, language: "en", components: "country:in" });
    if (sessiontoken) params.set("sessiontoken", String(sessiontoken));
    if (hasBiasCoords) {
      params.set("location", `${biasLat},${biasLng}`);
      params.set("radius", "60000");
    }

    const body = await googleJsonGet(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);

    if (body.status === "REQUEST_DENIED") {
      console.error("[places-autocomplete] Legacy REQUEST_DENIED:", body.error_message);
      // Both Google paths denied — return empty rather than error so the
      // client JS-API fallback can still try
      return res.status(200).json({ status: "ZERO_RESULTS", predictions: [], source: "none" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      status:      body.status || "ZERO_RESULTS",
      predictions: (body.predictions || []).map(p => ({
        place_id:              p.place_id,
        description:           p.description,
        structured_formatting: p.structured_formatting,
        types:                 p.types,
      })),
      source: "google-legacy",
    });
  } catch (err) {
    console.error("[maps/places-autocomplete] all paths failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/maps/place-details ─────────────────────────────────────────────
// Returns full details (lat/lng + address breakdown) for a place_id.
//
// Supports two place_id formats:
//   • "osm:<type>:<id>"  — returned by Nominatim path above, resolved via
//                           Nominatim /lookup (no API key needed)
//   • anything else      — treated as a Google place_id, tried against
//                           Places API (New) then legacy Places Details API
//
// Query params:
//   place_id     – required
//   sessiontoken – optional (Google billing only)
//   lat / lng    – optional shortcut: if present AND place_id is osm:*, skip
//                  the Nominatim lookup and return the coords immediately
//
// Response: { place_id, formatted_address, lat, lng, city, locality, pincode, state, country }
router.get("/place-details", async (req, res) => {
  const { place_id, sessiontoken } = req.query;
  if (!place_id || typeof place_id !== "string") {
    return res.status(400).json({ error: "place_id is required" });
  }

  // Helper to extract address components from Google-style comps array
  const extractFromComponents = (comps) => {
    const getComp = (...types) => {
      for (const type of types) {
        const found = comps.find(c => c.types.includes(type));
        if (found) return found.long_name;
      }
      return "";
    };
    return {
      city:     getComp("locality", "administrative_area_level_3", "administrative_area_level_2"),
      locality: getComp("sublocality_level_1", "sublocality", "neighborhood"),
      pincode:  getComp("postal_code"),
      state:    getComp("administrative_area_level_1"),
      country:  getComp("country"),
    };
  };

  // ── Path 1: Nominatim OSM place_id ───────────────────────────────────────
  // Format: "osm:<type>:<id>"  e.g. "osm:way:123456789"
  if (place_id.startsWith("osm:")) {
    // If the autocomplete response already embedded lat/lng, use them directly
    const quickLat = parseFloat(req.query.lat);
    const quickLng = parseFloat(req.query.lng);

    // Optimistic path: lat & lng were passed in query (client cached from autocomplete)
    // — just re-fetch Nominatim to get full address breakdown
    try {
      await nominatimThrottle();
      const parts   = place_id.split(":"); // ["osm", type, id]
      const osmType = parts[1]; // "node" | "way" | "relation"
      const osmId   = parts[2];

      // Single-letter osm_type for /lookup: N, W, R
      const typeChar = { node: "N", way: "W", relation: "R" }[osmType] || "W";

      const params = new URLSearchParams({
        osm_ids:        `${typeChar}${osmId}`,
        format:         "jsonv2",
        addressdetails: "1",
        "accept-language": "en",
      });

      const results = await nominatimGet(`/lookup?${params.toString()}`);

      if (Array.isArray(results) && results.length > 0) {
        const details = nominatimToDetails(results[0]);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(details);
      }

      // Lookup returned empty — if we have coords from query use them
      if (!isNaN(quickLat) && !isNaN(quickLng)) {
        return res.json({
          place_id,
          formatted_address: "",
          lat: quickLat, lng: quickLng,
          city: "", locality: "", pincode: "", state: "", country: "",
        });
      }

      return res.status(404).json({ error: "OSM place not found" });
    } catch (osmErr) {
      console.warn("[place-details] Nominatim lookup failed:", osmErr.message);
      if (!isNaN(quickLat) && !isNaN(quickLng)) {
        return res.json({
          place_id,
          formatted_address: "",
          lat: quickLat, lng: quickLng,
          city: "", locality: "", pincode: "", state: "", country: "",
        });
      }
      return res.status(500).json({ error: osmErr.message });
    }
  }

  // ── Path 2 & 3: Google place_id ───────────────────────────────────────────
  const GOOGLE_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: "Google Maps API key not configured on the server" });
  }

  // Places API (New) — GET /v1/places/{placeId}
  try {
    const detailsResult = await new Promise((resolve, reject) => {
      const r = https.request(
        {
          hostname: "places.googleapis.com",
          path:     `/v1/places/${encodeURIComponent(place_id.trim())}?languageCode=en`,
          method:   "GET",
          headers: {
            "X-Goog-Api-Key":   GOOGLE_KEY,
            "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location,displayName",
            "Accept":           "application/json",
            "Connection":       "close",
          },
        },
        (resp) => {
          let raw = "";
          resp.on("data", c => { raw += c; });
          resp.on("end", () => {
            try {
              const parsed = JSON.parse(raw);
              if (resp.statusCode && resp.statusCode >= 400) return resolve({ _httpStatus: resp.statusCode, ...parsed });
              resolve(parsed);
            } catch (e) {
              reject(new Error("Invalid JSON from Places API (New) details: " + raw.slice(0, 200)));
            }
          });
        }
      );
      r.on("error", reject);
      r.setTimeout(12000, () => { r.destroy(); reject(new Error("Timed out")); });
      r.end();
    });

    if (!detailsResult._httpStatus && detailsResult.location) {
      const comps = (detailsResult.addressComponents || []).map(c => ({
        long_name:  c.longText || "",
        short_name: c.shortText || "",
        types:      c.types || [],
      }));
      const { city, locality, pincode, state, country } = extractFromComponents(comps);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.json({
        place_id:          detailsResult.id || place_id,
        formatted_address: detailsResult.formattedAddress || "",
        lat: detailsResult.location?.latitude ?? null,
        lng: detailsResult.location?.longitude ?? null,
        city, locality, pincode, state, country,
        address_components: comps,
      });
    }

    if (detailsResult._httpStatus === 403 || detailsResult._httpStatus === 400) {
      throw new Error("Places API (New) details not available: " + (detailsResult.error?.message || detailsResult._httpStatus));
    }
  } catch (newErr) {
    console.warn("[place-details] Places API (New) failed:", newErr.message, "– trying legacy");
  }

  // Legacy Places Details API
  try {
    const params = new URLSearchParams({
      place_id:  place_id.trim(),
      key:       GOOGLE_KEY,
      language:  "en",
      fields:    "place_id,formatted_address,address_components,geometry",
    });
    if (sessiontoken) params.set("sessiontoken", String(sessiontoken));

    const body = await googleJsonGet(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);

    if (body.status === "REQUEST_DENIED") {
      console.error("[place-details] Legacy REQUEST_DENIED:", body.error_message);
      return res.status(403).json({ error: "Google Places API request denied", message: body.error_message });
    }

    if (body.status !== "OK" || !body.result) {
      return res.status(404).json({ error: `Place not found: ${body.status}` });
    }

    const r     = body.result;
    const comps = r.address_components || [];
    const { city, locality, pincode, state, country } = extractFromComponents(comps);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.json({
      place_id:          r.place_id,
      formatted_address: r.formatted_address,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
      city, locality, pincode, state, country,
      address_components: comps,
    });
  } catch (err) {
    console.error("[maps/place-details] all paths failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/maps/reverse-geocode ───────────────────────────────────────────
// Reverse geocoding: lat/lng → address details.
// Uses Nominatim first (free, no key), falls back to Google Geocoding API.
//
// Query params:
//   lat – required
//   lng – required
//
// Response: { formatted_address, lat, lng, city, locality, pincode, state, country, place_id }
router.get("/reverse-geocode", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng are required and must be numbers" });
  }

  // ── Path 1: Nominatim reverse geocode (no API key needed) ─────────────────
  try {
    await nominatimThrottle();
    const params = new URLSearchParams({
      lat:            String(lat),
      lon:            String(lng),
      format:         "jsonv2",
      addressdetails: "1",
      zoom:           "18",
      "accept-language": "en",
    });

    const result = await nominatimGet(`/reverse?${params.toString()}`);

    if (result && result.display_name) {
      const details = nominatimToDetails(result);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.json({ ...details, lat, lng });
    }
  } catch (nomErr) {
    console.warn("[reverse-geocode] Nominatim failed:", nomErr.message, "– trying Google");
  }

  // ── Path 2: Google Geocoding API (fallback) ────────────────────────────────
  const GOOGLE_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: "Reverse geocode unavailable — no Google Maps API key configured" });
  }

  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: GOOGLE_KEY, language: "en" });

  try {
    const body = await googleJsonGet(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);

    if (body.status === "REQUEST_DENIED") {
      return res.status(403).json({ error: "Google Geocoding API request denied", message: body.error_message });
    }

    if (body.status !== "OK" || !body.results || body.results.length === 0) {
      return res.status(404).json({ error: `Geocoding failed: ${body.status}` });
    }

    const result = body.results.find(r =>
      r.types?.some(t => ["street_address", "premise", "establishment", "route"].includes(t))
    ) || body.results[0];

    const comps = result.address_components || [];
    const getComp = (...types) => {
      for (const type of types) {
        const found = comps.find(c => c.types.includes(type));
        if (found) return found.long_name;
      }
      return "";
    };

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      place_id:          result.place_id || "",
      formatted_address: result.formatted_address || "",
      lat:               result.geometry?.location?.lat ?? lat,
      lng:               result.geometry?.location?.lng ?? lng,
      city:     getComp("locality", "administrative_area_level_3", "administrative_area_level_2"),
      locality: getComp("sublocality_level_1", "sublocality", "neighborhood"),
      pincode:  getComp("postal_code"),
      state:    getComp("administrative_area_level_1"),
      country:  getComp("country"),
    });
  } catch (err) {
    console.error("[maps/reverse-geocode]", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
