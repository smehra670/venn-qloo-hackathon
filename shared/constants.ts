import type { BusinessType, StepId } from "./types.js";

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  cafe: "café",
  restaurant: "restaurant",
  bar: "bar",
  music_venue: "music venue",
  gym_studio: "gym or studio",
  retail_shop: "shop",
  fashion_brand: "fashion brand",
  bakery: "bakery",
  bookshop: "bookshop",
  salon_spa: "salon or spa",
  hotel: "hotel",
  coworking: "coworking space",
  other: "business",
};

export const STEP_TITLES: Record<StepId, string> = {
  resolve: "Understanding your customers' taste",
  plan: "Choosing where to look",
  discover: "Searching for candidate partners",
  score: "Scoring how well each one fits",
  enrich: "Checking trends and local popularity",
  adapt: "Double-checking coverage",
  assemble: "Drawing your map",
};

export const MAX_PARTNERS = 28;

export const DEMO_LIMITS = [
  "Match scores describe group-level taste patterns, not individual customers.",
  "Scores are relative to this search, not absolute probabilities.",
  "Demo dataset: illustrative affinities for building and testing the interface, not real audience data.",
] as const;

export const UNKNOWN_CITY_LIMIT =
  "Map preview and local places are available for London, Manchester and New York in demo mode.";

/** Qloo surfaces actually called by `server/providers/qloo/client.ts`. Keep in sync; see capabilities.test.ts. */
export const QLOO_CAPABILITIES = [
  { path: "/search", label: "Entity search", usedFor: "resolveAnchors, resolveCity" },
  { path: "/v2/insights", label: "Insights", usedFor: "discover, score, enrich, expand, heatmap" },
  { path: "/v2/tags", label: "Tag search", usedFor: "resolveAnchors (keyword fallback)" },
] as const;
