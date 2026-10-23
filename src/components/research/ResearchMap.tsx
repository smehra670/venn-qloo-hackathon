import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Partner, StepId } from "@shared/types";
import { PercentGauge } from "@/components/research/PercentGauge";
import { KIND_META, kindTint } from "@/lib/kinds";
import { maplibregl } from "@/lib/maplibre";
import { RESEARCH_RADIUS_M } from "@/lib/researchCities";
import {
  easeInOut,
  easeOut,
  prefersReducedMotion,
  progressPercent,
  stepIndex,
  zoomForRing,
} from "@/lib/researchMotion";
import { cn } from "@/lib/cn";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const KINDS = ["Music", "Culture", "Fashion", "Retail", "Fitness", "Wellness"] as const;
const CAMERA_EASE_MS = 1900;

type LngLat = { lng: number; lat: number };

const DEFAULT_PIN_COLOR = "#4F5BFF";

/** Each partner takes its kind's colour (same palette as the results graphs). */
function kindColor(p: Partner): string {
  return KIND_META[p.kind]?.color ?? DEFAULT_PIN_COLOR;
}

interface MapPartner {
  partner: Partner;
  color: string;
  lngLat: LngLat;
  score: number;
  closed: boolean;
  rank: number;
  arrivedAt: number;
}

function partnerLngLat(p: Partner): LngLat | null {
  const vf = p.venueFacts;
  if (vf && typeof vf.lat === "number" && typeof vf.lon === "number") {
    return { lat: vf.lat, lng: vf.lon };
  }
  return null;
}

/** Closed places are usually filtered server-side; keep a soft check for any that slip through. */
function isClosedPartner(p: Partner): boolean {
  const blurb = (p.blurb ?? "").toLowerCase();
  return /\bpermanently closed\b/.test(blurb);
}

/** matchScore / popularityLift arrive as 0-100 from the server (0-1 in older fixtures); visuals expect 0-1. */
function unit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const v = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, v));
}

/** Current root font size relative to 16px, so px-based overlay maths follows the fluid UI scale. */
function rootScale(): number {
  if (typeof window === "undefined") return 1;
  return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
}

interface OverlayLabel {
  id: string;
  text: string;
  kind: "you" | "name" | "rank" | "closed" | "radius";
  x: number;
  y: number;
  opacity: number;
  rank?: number;
  color?: string;
}

function collidePlace(
  w: number,
  h: number,
  candidates: [number, number][],
  obstacles: { x: number; y: number; w: number; h: number }[],
  vw: number,
  vh: number,
): { x: number; y: number } {
  const hit = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
    m = 5,
  ) =>
    a.x < b.x + b.w + m &&
    a.x + a.w + m > b.x &&
    a.y < b.y + b.h + m &&
    a.y + a.h + m > b.y;
  const fits = (r: { x: number; y: number; w: number; h: number }) =>
    r.x >= 8 && r.y >= 8 && r.x + r.w <= vw - 8 && r.y + r.h <= vh - 8;

  for (const [x, y] of candidates) {
    const r = { x, y, w, h };
    if (fits(r) && !obstacles.some((o) => hit(r, o))) {
      obstacles.push(r);
      return { x, y };
    }
  }
  const [x, y] = candidates[0] ?? [8, 8];
  const r = {
    x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, vh - h - 8)),
    w,
    h,
  };
  obstacles.push(r);
  return { x: r.x, y: r.y };
}

export function ResearchMap({
  center,
  cityName,
  businessName,
  anchors,
  plannedKinds,
  visualStep,
  visualDone,
  stepStartedAt,
  partners,
  zeroResults,
  onSeePartners,
  className,
}: {
  center: [number, number];
  cityName: string;
  businessName: string;
  anchors: string[];
  plannedKinds: string[];
  visualStep: StepId | null;
  visualDone: boolean;
  stepStartedAt: number;
  partners: Partner[];
  zeroResults: boolean;
  onSeePartners?: () => void;
  className?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const youMarkerRef = useRef<maplibregl.Marker | null>(null);
  const partnerMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ringSourceReady = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 640 });
  const [u, setU] = useState(rootScale);
  const [tick, setTick] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(new Set());
  const cameraDoneRef = useRef(false);
  const finalCameraRef = useRef(false);
  const reduced = prefersReducedMotion();

  const [lat, lng] = center;
  const you: LngLat = { lat, lng };
  const radiusM = RESEARCH_RADIUS_M;
  const radiusKm = Math.round((radiusM / 1000) * 10) / 10;

  const mapped = useMemo(() => {
    const withCoords: MapPartner[] = [];
    for (const p of partners) {
      const ll = partnerLngLat(p);
      if (!ll) continue;
      withCoords.push({
        partner: p,
        color: kindColor(p),
        lngLat: ll,
        score: unit(p.matchScore),
        closed: isClosedPartner(p),
        rank: 0,
        arrivedAt: 0,
      });
    }
    withCoords.sort((a, b) => b.score - a.score);
    withCoords.forEach((m, i) => {
      m.rank = i;
    });
    return withCoords;
  }, [partners]);

  const brands = useMemo(
    () => partners.filter((p) => !partnerLngLat(p)),
    [partners],
  );

  const openCount = mapped.filter((m) => !m.closed).length;
  const closedCount = mapped.filter((m) => m.closed).length;
  const topFive = mapped.filter((m) => !m.closed).slice(0, 5);
  const labelCap = size.w < 520 ? 3 : 5;

  const percent = progressPercent(visualStep, visualDone, 0.55);
  const vIdx = stepIndex(visualStep);
  const since = Date.now() - stepStartedAt;

  // Mark partners as arrived when discover is active / complete (real arrival = when they appear in state).
  useEffect(() => {
    if (vIdx < stepIndex("discover")) return;
    setArrivedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const m of mapped) {
        if (!next.has(m.partner.id)) {
          next.add(m.partner.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mapped, vIdx]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      setU(rootScale());
      mapRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Init map + camera
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const w0 = el.clientWidth || 800;
    const h0 = el.clientHeight || 640;
    const workingZoom = zoomForRing(lat, radiusM, w0, h0);
    const startZoom = workingZoom - 1; // ~2× wider

    const map = new maplibregl.Map({
      container: el,
      style: OPENFREEMAP_STYLE,
      center: [lng, lat],
      zoom: reduced ? workingZoom : startZoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    // Ensure attribution stays visible
    map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.setAttribute("data-research-attrib", "1");

    map.on("load", () => {
      // Parent wrapper now gives real size; resize before measuring zoom / easing.
      map.resize();
      const w = el.clientWidth || w0;
      const h = el.clientHeight || h0;
      const zoom = zoomForRing(lat, radiusM, w, h);
      setSize({ w, h });

      ringSourceReady.current = true;
      map.addSource("research-ring", {
        type: "geojson",
        data: ringGeoJSON(you, radiusM, 0),
      });
      map.addLayer({
        id: "research-ring-fill",
        type: "fill",
        source: "research-ring",
        paint: { "fill-color": "#4F5BFF", "fill-opacity": 0 },
      });
      map.addLayer({
        id: "research-ring-line",
        type: "line",
        source: "research-ring",
        paint: {
          "line-color": "#4F5BFF",
          "line-width": 2,
          "line-opacity": 0,
        },
      });

      // Heatspots source
      map.addSource("research-heat", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "research-heat",
        type: "circle",
        source: "research-heat",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": ["get", "color"],
          "circle-opacity": 0,
          "circle-blur": 0.85,
        },
      });

      // Score lines
      map.addSource("research-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "research-lines",
        type: "line",
        source: "research-lines",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": ["get", "opacity"],
        },
      });

      if (reduced) {
        map.jumpTo({ center: [lng, lat], zoom });
      } else {
        map.jumpTo({ center: [lng, lat], zoom: zoom - 1 });
        map.easeTo({
          center: [lng, lat],
          zoom,
          duration: CAMERA_EASE_MS,
          easing: easeInOut,
        });
      }
      cameraDoneRef.current = true;
      setMapReady(true);
      sectionRef.current?.setAttribute("data-research-map-ready", "1");
      // Idle after first paint (and again after camera ease settles tiles)
      const markIdle = () => sectionRef.current?.setAttribute("data-research-map-idle", "1");
      map.once("idle", markIdle);
      if (!reduced) {
        window.setTimeout(() => map.once("idle", markIdle), CAMERA_EASE_MS + 80);
      }
    });

    // You pin
    const youEl = document.createElement("div");
    youEl.className = "research-you-pin";
    youEl.innerHTML = `<span class="research-you-halo"></span><span class="research-you-ripple"></span><span class="research-you-ripple delay"></span><span class="research-you-dot"></span>`;
    youMarkerRef.current = new maplibregl.Marker({ element: youEl, anchor: "center" })
      .setLngLat([lng, lat])
      .addTo(map);

    mapRef.current = map;
    return () => {
      partnerMarkersRef.current.forEach((m) => m.remove());
      partnerMarkersRef.current.clear();
      youMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      ringSourceReady.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per center
  }, [lat, lng, reduced, radiusM]);

  // Animation frame for ring progress / radar / pulse (transform & opacity only + camera)
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Update ring / heat / lines / markers from visual step
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ringSourceReady.current) return;

    const planOn = vIdx >= stepIndex("plan") || visualDone;
    const discoverOn = vIdx >= stepIndex("discover") || visualDone;
    const scoreOn = vIdx >= stepIndex("score") || visualDone;
    const enrichOn = vIdx >= stepIndex("enrich") || visualDone;
    const adaptOn = vIdx >= stepIndex("adapt") || visualDone;
    const assembleOn = vIdx >= stepIndex("assemble") || visualDone;

    const ringProgress =
      reduced || visualDone
        ? 1
        : vIdx > stepIndex("plan")
          ? 1
          : vIdx === stepIndex("plan")
            ? easeOut(Math.min(1, since / 1000))
            : 0;

    const ringSrc = map.getSource("research-ring") as maplibregl.GeoJSONSource | undefined;
    ringSrc?.setData(ringGeoJSON(you, radiusM * ringProgress, ringProgress));

    map.setPaintProperty("research-ring-line", "line-opacity", planOn ? 0.7 * (assembleOn ? 0.35 : 1) : 0);
    map.setPaintProperty(
      "research-ring-fill",
      "fill-opacity",
      planOn && ringProgress > 0.9 ? 0.045 * (assembleOn ? 0.3 : 1) : 0,
    );

    // Taste-lift hotspots — real partner coords ranked by popularityLift (no invented locations)
    const heatSources = [...mapped]
      .filter((m) => arrivedIds.has(m.partner.id) || visualDone)
      .sort(
        (a, b) =>
          unit(b.partner.popularityLift ?? b.score) - unit(a.partner.popularityLift ?? a.score),
      )
      .slice(0, 3);
    const heatFeatures =
      enrichOn
        ? heatSources.map((m, i) => ({
            type: "Feature" as const,
            properties: {
              color: m.color,
              r:
                48 * u +
                unit(m.partner.popularityLift ?? m.score) * 36 * u +
                (reduced ? 0 : 2.4 * Math.sin(Date.now() / 650 + i * 1.9)),
            },
            geometry: {
              type: "Point" as const,
              coordinates: [m.lngLat.lng, m.lngLat.lat],
            },
          }))
        : [];
    (map.getSource("research-heat") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: heatFeatures,
    });
    // 3–5% slow pulse on plum glows
    const heatPulse = reduced ? 1 : 1 + 0.04 * Math.sin(Date.now() / 900);
    const heatOp =
      enrichOn
        ? 0.32 * heatPulse * (assembleOn ? 0.55 : 1)
        : 0;
    map.setPaintProperty("research-heat", "circle-opacity", heatOp);

    // Score lines
    const lineFeatures =
      scoreOn
        ? mapped
            .filter((m) => arrivedIds.has(m.partner.id))
            .map((m) => {
              const dim = assembleOn ? (m.rank < 5 && !m.closed ? 1 : 0.28) : 1;
              const closedFade = adaptOn && m.closed ? 0.15 : 1;
              return {
                type: "Feature" as const,
                properties: {
                  color: m.color,
                  width: 1.2 + m.score * 2.4,
                  opacity: (0.22 + 0.5 * m.score) * dim * closedFade,
                },
                geometry: {
                  type: "LineString" as const,
                  coordinates: curveCoords(you, m.lngLat),
                },
              };
            })
        : [];
    (map.getSource("research-lines") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: lineFeatures,
    });

    // Partner pins — drop when they arrive during discover+
    const keep = new Set<string>();
    for (const m of mapped) {
      if (!arrivedIds.has(m.partner.id) && !visualDone && vIdx < stepIndex("discover")) continue;
      if (!discoverOn && !visualDone) continue;
      keep.add(m.partner.id);
      let marker = partnerMarkersRef.current.get(m.partner.id);
      if (!marker) {
        // Outer el is owned by MapLibre (transform = translate). Scale/opacity live on .inner.
        const el = document.createElement("div");
        el.className = "research-partner-pin";
        el.style.setProperty("--pin", m.color);
        el.innerHTML = `<span class="research-partner-inner"><span class="research-partner-halo"></span><span class="research-partner-dot"></span><span class="research-partner-tick" hidden></span></span>`;
        marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([m.lngLat.lng, m.lngLat.lat])
          .addTo(map);
        partnerMarkersRef.current.set(m.partner.id, marker);
        if (!reduced) {
          const inner = el.querySelector<HTMLElement>(".research-partner-inner");
          if (inner) {
            inner.style.opacity = "0";
            inner.style.transform = "scale(0.4)";
            requestAnimationFrame(() => {
              inner.style.transition = "opacity 0.45s ease-out, transform 0.45s ease-out";
              inner.style.opacity = "1";
              inner.style.transform = "scale(1)";
            });
          }
        }
      }
      const el = marker.getElement();
      const inner = el.querySelector<HTMLElement>(".research-partner-inner") ?? el;
      const grow = scoreOn ? 0.85 + m.score * 0.45 : 1;
      const dim =
        assembleOn && !(m.rank < 5 && !m.closed) ? 0.42 : 1;
      if (m.closed && adaptOn) {
        el.classList.add("is-closed");
      } else {
        el.classList.remove("is-closed");
      }
      if (adaptOn && !m.closed) {
        el.querySelector<HTMLElement>(".research-partner-tick")?.removeAttribute("hidden");
      }
      // Never set transform on the Marker root — MapLibre uses it for lng/lat placement.
      const scale = grow * (assembleOn && m.rank < 5 && !m.closed ? 1.05 : 1);
      if (scoreOn || assembleOn || reduced || visualDone) {
        inner.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
        inner.style.transform = `scale(${scale})`;
      }
      inner.style.opacity = String(dim);
    }
    partnerMarkersRef.current.forEach((marker, id) => {
      if (!keep.has(id)) {
        marker.remove();
        partnerMarkersRef.current.delete(id);
      }
    });

    // Final camera fit You + top five
    if (assembleOn && !finalCameraRef.current && topFive.length > 0) {
      finalCameraRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([you.lng, you.lat]);
      topFive.forEach((m) => bounds.extend([m.lngLat.lng, m.lngLat.lat]));
      if (reduced) {
        map.fitBounds(bounds, { padding: { top: 90 * u, left: 80 * u, right: 80 * u, bottom: 120 * u }, maxZoom: finalZoomCap(map), duration: 0 });
      } else {
        map.fitBounds(bounds, {
          padding: { top: 90 * u, left: 80 * u, right: 80 * u, bottom: 120 * u },
          maxZoom: finalZoomCap(map),
          duration: 1100,
          easing: easeInOut,
        });
      }
    }
  }, [tick, vIdx, visualDone, since, mapped, arrivedIds, topFive, you, radiusM, reduced]);

  // You screen position + ring radius in px (for radar / ping overlays)
  const youScreen = useMemo(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return null;
    const pt = map.project([you.lng, you.lat]);
    const edge = destination(you, radiusM, 90);
    const ep = map.project([edge.lng, edge.lat]);
    const rPx = Math.hypot(ep.x - pt.x, ep.y - pt.y);
    return { x: pt.x, y: pt.y, rPx: Math.max(40, rPx) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, mapReady, you.lng, you.lat, radiusM, size.w, size.h]);

  // Labels (HTML overlays)
  const labels = useMemo(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !containerRef.current) return [] as OverlayLabel[];
    const vw = size.w;
    const vh = size.h;
    const obstacles: { x: number; y: number; w: number; h: number }[] = [
      { x: 16 * u, y: 16 * u, w: 230 * u, h: 48 * u },
      { x: vw - 150 * u, y: 16 * u, w: 134 * u, h: 56 * u },
    ];
    const out: OverlayLabel[] = [];
    const youPt = map.project([you.lng, you.lat]);

    if (vIdx >= 0 || visualDone) {
      const pos = collidePlace(
        120 * u,
        28 * u,
        [
          [youPt.x - 60 * u, youPt.y - 40 * u],
          [youPt.x - 60 * u, youPt.y + 20 * u],
          [youPt.x + 18 * u, youPt.y - 14 * u],
          [youPt.x - 138 * u, youPt.y - 14 * u],
        ],
        obstacles,
        vw,
        vh,
      );
      out.push({
        id: "you",
        text: businessName || "You",
        kind: "you",
        x: pos.x,
        y: pos.y,
        opacity: reduced || visualDone || since > 400 || vIdx > 0 ? 1 : easeOut(since / 900),
      });
    }

    if ((vIdx === stepIndex("plan") || (vIdx > stepIndex("plan") && vIdx < stepIndex("discover"))) && !visualDone) {
      // Approximate ring edge to the east
      const edge = destination(you, radiusM, 90);
      const pt = map.project([edge.lng, edge.lat]);
      out.push({
        id: "radius",
        text: `${radiusKm} km`,
        kind: "radius",
        x: pt.x - 28 * u,
        y: pt.y - 13 * u,
        opacity: 1,
      });
    }

    // Rank labels only while assembling (top 5, or top 3 under 520px).
    // Transient name pills only briefly as pins drop during discover.
    const showRank = vIdx >= stepIndex("assemble") || visualDone;
    if (showRank) {
      const ranked = topFive.slice(0, labelCap);
      ranked.forEach((m, i) => {
        if (!arrivedIds.has(m.partner.id) && !visualDone) return;
        const pt = map.project([m.lngLat.lng, m.lngLat.lat]);
        const stagger =
          reduced || visualDone
            ? 1
            : easeOut(Math.max(0, (Date.now() - stepStartedAt - i * 160) / 400));
        if (stagger <= 0.02) return;
        const w = Math.min(190 * u, (30 + m.partner.name.length * 7.6) * u);
        const pos = collidePlace(
          w,
          28 * u,
          sideCandidates(pt.x, pt.y, 10 * u, w, 28 * u),
          obstacles,
          vw,
          vh,
        );
        obstacles.push({ x: pos.x, y: pos.y, w, h: 28 * u });
        out.push({
          id: `rank-${m.partner.id}`,
          text: m.partner.name,
          kind: "rank",
          rank: i + 1,
          color: m.color,
          x: pos.x,
          y: pos.y,
          opacity: stagger,
        });
      });
    } else if (vIdx === stepIndex("discover") && !visualDone) {
      // Newest arrivals first — brief name flash while dropping
      const dropping = [...mapped]
        .filter((m) => arrivedIds.has(m.partner.id))
        .slice(0, labelCap);
      dropping.forEach((m, i) => {
        const pt = map.project([m.lngLat.lng, m.lngLat.lat]);
        // Fade in then out over ~1s of presence (shot harness freezes mid-step)
        const local = Math.min(1, Math.max(0, (since - i * 120) / 900));
        const op = local < 0.2 ? easeOut(local / 0.2) : local > 0.75 ? 1 - (local - 0.75) / 0.25 : 1;
        if (op <= 0.02) return;
        const w = Math.min(190 * u, (30 + m.partner.name.length * 7.6) * u);
        const pos = collidePlace(
          w,
          28 * u,
          sideCandidates(pt.x, pt.y, 10 * u, w, 28 * u),
          obstacles,
          vw,
          vh,
        );
        obstacles.push({ x: pos.x, y: pos.y, w, h: 28 * u });
        out.push({
          id: `name-${m.partner.id}`,
          text: m.partner.name,
          kind: "name",
          x: pos.x,
          y: pos.y,
          opacity: op,
        });
      });
    }

    if (vIdx >= stepIndex("adapt") || visualDone) {
      mapped
        .filter((m) => m.closed)
        .forEach((m) => {
          const pt = map.project([m.lngLat.lng, m.lngLat.lat]);
          const pos = collidePlace(
            64 * u,
            26 * u,
            [
              [pt.x - 32 * u, pt.y + 14 * u],
              [pt.x - 32 * u, pt.y - 36 * u],
              ...sideCandidates(pt.x, pt.y, 12 * u, 64 * u, 26 * u),
            ],
            obstacles,
            vw,
            vh,
          );
          out.push({
            id: `closed-${m.partner.id}`,
            text: "Closed",
            kind: "closed",
            x: pos.x,
            y: pos.y,
            opacity: 1,
          });
        });
    }

    return out;
    // tick forces reproject on camera move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tick,
    size,
    vIdx,
    visualDone,
    mapped,
    topFive,
    arrivedIds,
    businessName,
    radiusKm,
    radiusM,
    you,
    labelCap,
    reduced,
    stepStartedAt,
    since,
    u,
  ]);

  const kindsOn = plannedKinds.length
    ? plannedKinds
    : KINDS.filter((_, i) => [0, 1, 3, 4, 5].includes(i));
  const showKinds = vIdx >= stepIndex("plan") || visualDone;
  const kindReveal =
    reduced || visualDone || vIdx > stepIndex("plan")
      ? kindsOn.length
      : Math.floor(Math.min(kindsOn.length, since / 200));

  // Anchor chips fly state
  const anchorsFlown = vIdx > stepIndex("resolve") || visualDone || (vIdx === 0 && since > 2200);

  const counter = (() => {
    if (zeroResults && (vIdx >= stepIndex("discover") || visualDone)) {
      return { text: "No places found nearby", cta: false };
    }
    if (vIdx >= stepIndex("assemble") || visualDone) {
      return {
        text: `See your ${openCount || mapped.length} partners`,
        cta: true,
      };
    }
    if (vIdx >= stepIndex("adapt")) return { text: "Checking they are open", cta: false };
    if (vIdx >= stepIndex("enrich")) return { text: "Finding busy areas", cta: false };
    if (vIdx >= stepIndex("score")) {
      return {
        text: `Scoring <b>${mapped.length}</b> of ${mapped.length || "…"}`,
        cta: false,
      };
    }
    if (vIdx >= stepIndex("discover")) {
      return {
        text: `<b>${arrivedIds.size || mapped.length}</b> places found`,
        cta: false,
      };
    }
    return null;
  })();

  // Radar: stacked blue wedges, fading tail (stop when zero results).
  // Angle is a function of step elapsed time so Playwright frames are reproducible.
  const sweep =
    !reduced &&
    !zeroResults &&
    vIdx === stepIndex("discover") &&
    !visualDone;
  const sweepAngle = sweep ? ((since / 3200) % 1) * 360 : 0;
  const sweepWedges = Array.from({ length: 10 }, (_, i) => {
    const t = (i + 1) / 10;
    // Reference formula is ~0.02+0.2*t²; bump slightly so the fan reads on positron tiles.
    return {
      start: sweepAngle - 7.5 * (10 - i),
      span: 7.5,
      opacity: 0.05 + 0.32 * t * t,
    };
  });

  // Coverage: one plum ping ring from You
  const adaptActive = vIdx === stepIndex("adapt") && !visualDone;
  const pingU = reduced || visualDone
    ? 0
    : adaptActive
      ? easeOut(Math.min(1, since / 1200))
      : 0;

  // Anchor fly-in progress (resolve step)
  const resolveActive = vIdx === stepIndex("resolve") && !visualDone;
  const flyProgress = reduced || visualDone || vIdx > stepIndex("resolve")
    ? 1
    : resolveActive
      ? easeOut(Math.min(1, Math.max(0, (since - 400) / 1100)))
      : 0;

  return (
    <section
      ref={sectionRef}
      className={cn(
        "relative h-[clamp(30rem,70dvh,48rem)] overflow-hidden rounded-3xl border border-[#E3E6EB] bg-[#F4F5F7] lg:h-full lg:min-h-[30rem]",
        className,
      )}
      aria-label={`Animated map of ${cityName}`}
      data-research-map-ready={mapReady ? "1" : "0"}
    >
      {/* Wrapper stays absolutely filled; MapLibre sets position:relative on its container. */}
      <div className="absolute inset-0 overflow-hidden rounded-[23px]">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Search ring radar — SVG wedges (reference), centred on You */}
      {sweep && youScreen ? (
        <div
          className="pointer-events-none absolute inset-0 z-[4] overflow-hidden rounded-[23px]"
          aria-hidden
          data-research-radar="1"
        >
          <svg
            className="absolute"
            width={youScreen.rPx * 2}
            height={youScreen.rPx * 2}
            viewBox={`${-youScreen.rPx} ${-youScreen.rPx} ${youScreen.rPx * 2} ${youScreen.rPx * 2}`}
            style={{
              left: youScreen.x - youScreen.rPx,
              top: youScreen.y - youScreen.rPx,
              overflow: "visible",
            }}
          >
            <g transform={`rotate(${sweepAngle})`}>
              {sweepWedges.map((w, i) => {
                const R = youScreen.rPx;
                const a0 = ((-90 - 7.5 * (10 - i)) * Math.PI) / 180;
                const a1 = ((-90 - 7.5 * (10 - i - 1)) * Math.PI) / 180;
                const d = `M0,0 L${R * Math.cos(a0)},${R * Math.sin(a0)} A${R},${R} 0 0 1 ${R * Math.cos(a1)},${R * Math.sin(a1)} Z`;
                return (
                  <path
                    key={i}
                    d={d}
                    fill="#4F5BFF"
                    fillOpacity={w.opacity}
                  />
                );
              })}
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-youScreen.rPx}
                stroke="#4F5BFF"
                strokeOpacity={0.55}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>
      ) : null}

      {/* Coverage plum ping from You */}
      {pingU > 0 && pingU < 1 && youScreen ? (
        <div
          className="pointer-events-none absolute z-[5] rounded-full border-2 border-[#6B3FA0]"
          style={{
            left: youScreen.x - youScreen.rPx * pingU,
            top: youScreen.y - youScreen.rPx * pingU,
            width: youScreen.rPx * 2 * pingU,
            height: youScreen.rPx * 2 * pingU,
            opacity: 0.55 * (1 - pingU),
          }}
          aria-hidden
        />
      ) : null}

      {/* Location pill */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/92 px-4 py-2.5 text-[0.98rem] font-semibold tracking-[-0.01em] text-[#14151A] shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)] backdrop-blur-[8px]">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            d="M9 16.2s5.3-4.5 5.3-8.6A5.3 5.3 0 0 0 3.7 7.6c0 4.1 5.3 8.6 5.3 8.6z"
            fill="#14151A"
          />
          <circle cx="9" cy="7.6" r="2" fill="#fff" />
        </svg>
        <span>
          {cityName}
          {showKinds ? (
            <small className="ml-1 inline-block max-w-[15rem] overflow-hidden align-bottom text-[0.88rem] font-medium text-[#596070] max-[560px]:hidden">
              {" "}
              · {radiusKm} km around {businessName || "you"}
            </small>
          ) : null}
        </span>
      </div>

      {/* Anchor tags: fly from header onto map, tick, then dock under location pill */}
      {(resolveActive || anchorsFlown) && anchors.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
          {anchors.slice(0, 4).map((a, i) => {
            const stagger = Math.min(1, Math.max(0, (flyProgress * 1.15 - i * 0.12)));
            const docked = anchorsFlown && (!resolveActive || flyProgress >= 0.95);
            const startX = (120 + i * 90) * u;
            const startY = -48 * u;
            const midX = size.w * 0.52 + (i % 2 === 0 ? -70 : 70) * u;
            const midY = size.h * 0.42 + (i - 1) * 28 * u;
            const endX = 16 * u;
            const endY = (58 + i * 42) * u;
            const t = docked ? 1 : stagger;
            // Arc: header → map (ease), then dock under pill
            const dockT = docked ? 1 : Math.max(0, (stagger - 0.72) / 0.28);
            const flyT = Math.min(1, stagger / 0.72);
            const x = dockT > 0
              ? midX + (endX - midX) * easeOut(dockT)
              : startX + (midX - startX) * easeOut(flyT);
            const y = dockT > 0
              ? midY + (endY - midY) * easeOut(dockT)
              : startY + (midY - startY) * easeOut(flyT) - 36 * u * Math.sin(Math.PI * flyT);
            const showTick = stagger > 0.55 || docked;
            return (
              <span
                key={a}
                className="absolute inline-flex h-[2.125rem] items-center gap-1.5 rounded-full bg-[#FFE8E3] px-3.5 text-[0.95rem] font-semibold text-[#14151A] shadow-[0_0_0_1px_rgba(255,107,87,.35),0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)]"
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: t > 0.02 ? 1 : 0,
                }}
              >
                {a}
                <span
                  className="inline-block size-0 rounded-full bg-[#FF6B57] bg-center bg-no-repeat transition-[width] duration-200"
                  style={{
                    width: showTick ? "1rem" : 0,
                    height: "1rem",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.6 8.3l2.2 2.2 4.6-4.9' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundSize: "1rem",
                  }}
                />
              </span>
            );
          })}
        </div>
      ) : null}

      <PercentGauge percent={percent} className="absolute right-4 top-4 z-10" />

      {/* Kinds chips */}
      {showKinds ? (
        <div className="pointer-events-none absolute bottom-16 left-4 z-10 flex max-w-[62%] flex-wrap gap-1.5 max-[560px]:hidden">
          {KINDS.map((k) => {
            const on = kindsOn.some((x) => x.toLowerCase() === k.toLowerCase());
            const revealed = on && kindReveal > kindsOn.findIndex((x) => x.toLowerCase() === k.toLowerCase());
            const fadeUnused = vIdx > stepIndex("plan") || visualDone;
            if (!on && fadeUnused) return null;
            const kindKey = k.toLowerCase() as keyof typeof KIND_META;
            const color = KIND_META[kindKey]?.color ?? DEFAULT_PIN_COLOR;
            return (
              <span
                key={k}
                style={
                  revealed
                    ? { backgroundColor: kindTint(kindKey, 0.2), boxShadow: `0 0 0 1px ${color}55, 0 1px 2px rgba(20,21,26,.06), 0 8px 22px rgba(20,21,26,.09)` }
                    : undefined
                }
                className={cn(
                  "inline-flex h-[1.875rem] items-center gap-1.5 rounded-full px-3 text-[0.88rem] font-semibold shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)] transition-[background-color,color,opacity] duration-300",
                  revealed
                    ? "text-[#14151A]"
                    : "bg-white/92 text-[#8A91A0]",
                  !on && "opacity-40",
                )}
              >
                <i
                  className={cn("size-2 rounded-full", !revealed && "bg-[#C4C9D2]")}
                  style={revealed ? { backgroundColor: color } : undefined}
                />
                {k}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Brands without location — small chips above the counter */}
      {brands.length > 0 && (vIdx >= stepIndex("discover") || visualDone) ? (
        <div className="pointer-events-none absolute bottom-[3.75rem] right-4 z-10 flex max-w-[min(20rem,70%)] flex-wrap justify-end gap-1.5">
          <span className="w-full text-right text-[0.8rem] font-medium text-[#596070]">
            Brands (no location)
          </span>
          {brands.slice(0, 6).map((b) => (
            <span
              key={b.id}
              className="rounded-full bg-white px-2.5 py-1 text-[0.8rem] font-semibold text-[#14151A] shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)]"
            >
              {b.name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Counter / CTA */}
      {counter ? (
        <button
          type="button"
          tabIndex={counter.cta ? 0 : -1}
          onClick={counter.cta ? onSeePartners : undefined}
          className={cn(
            "absolute bottom-4 right-4 z-10 flex h-11 items-center gap-2.5 rounded-full px-[1.125rem] text-[0.98rem] font-semibold tracking-[-0.01em] tabular-nums shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)]",
            counter.cta
              ? "cursor-pointer bg-[#14151A] text-white shadow-[0_2px_4px_rgba(20,21,26,.16),0_10px_24px_rgba(20,21,26,.22)] hover:bg-black"
              : "pointer-events-none bg-white/92 text-[#14151A] backdrop-blur-[8px]",
          )}
          dangerouslySetInnerHTML={{ __html: `<span>${counter.text}</span>` }}
        />
      ) : null}

      {/* Labels */}
      {labels.map((l) => (
        <div
          key={l.id}
          className={cn(
            "pointer-events-none absolute z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[0.84rem] font-semibold tracking-[-0.005em] shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)]",
            l.kind === "you" &&
              "bg-[#FF6B57] text-white shadow-[0_2px_4px_rgba(255,107,87,.3),0_8px_20px_rgba(255,107,87,.28)]",
            l.kind === "closed" && "bg-[#F4F5F7] font-medium text-[#596070] shadow-[0_0_0_1px_#E3E6EB]",
            l.kind === "radius" && "bg-white text-[#4F5BFF]",
            (l.kind === "name" || l.kind === "rank") && "bg-white text-[#14151A]",
          )}
          style={{
            transform: `translate(${l.x}px, ${l.y}px)`,
            opacity: l.opacity,
            height: `${(l.kind === "radius" ? 26 : 28) / 16}rem`,
          }}
        >
          {l.kind === "rank" && l.rank != null ? (
            <span
              className="-ml-1 grid size-[1.1875rem] place-items-center rounded-full text-[0.72rem] font-bold text-white"
              style={{ backgroundColor: l.color ?? DEFAULT_PIN_COLOR }}
            >
              {l.rank}
            </span>
          ) : null}
          {l.text}
        </div>
      ))}

      <style>{`
        .research-you-pin { width: 1.75rem; height: 1.75rem; }
        .research-you-dot {
          position: absolute; inset: 0.25rem; border-radius: 50%;
          background: #FF6B57; border: 0.1875rem solid #fff;
          box-shadow: 0 1px 3px rgba(20,21,26,.28);
        }
        .research-you-halo {
          position: absolute; inset: -0.375rem; border-radius: 50%;
          background: rgba(255,107,87,.16);
        }
        .research-you-ripple {
          position: absolute; inset: 0.125rem; border-radius: 50%;
          border: 1.5px solid #FF6B57; opacity: 0;
          animation: research-ripple 2.4s ease-out infinite;
        }
        .research-you-ripple.delay { animation-delay: 0.8s; }
        @keyframes research-ripple {
          0% { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        .research-partner-pin { width: 1.375rem; height: 1.375rem; }
        .research-partner-inner {
          display: block; position: relative; width: 1.375rem; height: 1.375rem;
          will-change: transform, opacity; transform-origin: center center;
        }
        .research-partner-dot {
          position: absolute; inset: 0.1875rem; border-radius: 50%;
          background: var(--pin, #4F5BFF); border: 0.1562rem solid #fff;
          box-shadow: 0 1px 3px rgba(20,21,26,.28);
        }
        .research-partner-halo {
          position: absolute; inset: -0.25rem; border-radius: 50%;
          background: color-mix(in srgb, var(--pin, #4F5BFF) 20%, transparent);
        }
        .research-partner-pin.is-closed .research-partner-dot { background: #9AA1AF; }
        .research-partner-pin.is-closed .research-partner-halo { opacity: 0; }
        .research-partner-tick {
          position: absolute; right: -0.125rem; top: -0.125rem; width: 0.75rem; height: 0.75rem;
          border-radius: 50%; background-color: var(--pin, #4F5BFF); border: 1.5px solid #fff;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 6.2l2 2 4-4.2' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
          background-size: 0.75rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .research-you-ripple { animation: none; opacity: 0; }
        }
      `}</style>
    </section>
  );
}

/** Final fit may zoom past the search-ring view so the top picks spread out and their labels stay readable. */
function finalZoomCap(map: maplibregl.Map) {
  return Math.max(map.getZoom() + 1.5, 14);
}

function ringGeoJSON(
  center: LngLat,
  radiusM: number,
  _progress: number,
): {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }[];
} {
  const pts: [number, number][] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 360;
    const p = destination(center, radiusM, bearing);
    pts.push([p.lng, p.lat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [pts] },
      },
    ],
  };
}

function destination(from: LngLat, distM: number, bearingDeg: number): LngLat {
  const R = 6371000;
  const δ = distM / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (from.lat * Math.PI) / 180;
  const λ1 = (from.lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

function curveCoords(a: LngLat, b: LngLat): [number, number][] {
  const mx = (a.lng + b.lng) / 2;
  const my = (a.lat + b.lat) / 2;
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = dist * 0.12;
  const nx = -dy / dist;
  const ny = dx / dist;
  return [
    [a.lng, a.lat],
    [mx + nx * bow, my + ny * bow],
    [b.lng, b.lat],
  ];
}

function sideCandidates(
  sx: number,
  sy: number,
  o: number,
  w: number,
  h: number,
): [number, number][] {
  const prefRight = sx < 400 * (o / 10);
  const R = (dy: number): [number, number] => [sx + o, sy - h / 2 + dy];
  const L = (dy: number): [number, number] => [sx - o - w, sy - h / 2 + dy];
  return prefRight
    ? [R(0), L(0), R(-30), R(30), L(-30), L(30), R(-60), R(60)]
    : [L(0), R(0), L(-30), L(30), R(-30), R(30), L(-60), L(60)];
}
