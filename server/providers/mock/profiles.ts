import type { BusinessType, PartnerKind } from "@shared/types";
import type { TagId } from "./taxonomy.js";

export interface BusinessProfile {
  category: PartnerKind;
  baseTags: TagId[];
  kinds: PartnerKind[];
}

export const PROFILES: Record<BusinessType, BusinessProfile> = {
  cafe: {
    category: "food",
    baseTags: ["specialty_coffee", "community", "brunch", "slow_living", "bakery"],
    kinds: ["music", "retail", "fashion", "wellness", "culture", "fitness", "venue", "drink"],
  },
  restaurant: {
    category: "food",
    baseTags: ["street_food", "community", "natural_wine", "nightlife", "design"],
    kinds: ["drink", "music", "venue", "culture", "fashion", "retail", "wellness"],
  },
  bar: {
    category: "drink",
    baseTags: ["craft_beer", "cocktails", "nightlife", "live_music", "community"],
    kinds: ["music", "venue", "fashion", "food", "culture", "fitness", "retail"],
  },
  music_venue: {
    category: "venue",
    baseTags: ["live_music", "nightlife", "indie_music", "craft_beer", "community"],
    kinds: ["drink", "fashion", "music", "food", "retail", "culture", "fitness"],
  },
  gym_studio: {
    category: "fitness",
    baseTags: ["strength", "community", "wellness", "running", "plant_based"],
    kinds: ["wellness", "food", "drink", "fashion", "retail", "music", "culture"],
  },
  retail_shop: {
    category: "retail",
    baseTags: ["design", "craft", "community", "local_pride", "minimalist"],
    kinds: ["culture", "food", "drink", "music", "fashion", "wellness", "venue"],
  },
  fashion_brand: {
    category: "fashion",
    baseTags: ["streetwear", "design", "vintage", "sneakers", "indie_music"],
    kinds: ["music", "culture", "drink", "venue", "retail", "fitness", "food"],
  },
  bakery: {
    category: "food",
    baseTags: ["bakery", "brunch", "slow_living", "community", "plant_based"],
    kinds: ["drink", "wellness", "culture", "retail", "fitness", "music", "fashion"],
  },
  bookshop: {
    category: "culture",
    baseTags: ["bookish", "slow_living", "specialty_coffee", "design", "community"],
    kinds: ["food", "drink", "music", "retail", "venue", "wellness", "fashion"],
  },
  salon_spa: {
    category: "wellness",
    baseTags: ["skincare", "wellness", "premium", "slow_living", "minimalist"],
    kinds: ["retail", "food", "fashion", "fitness", "culture", "drink", "music"],
  },
  hotel: {
    category: "venue",
    baseTags: ["travel", "premium", "design", "brunch", "local_pride"],
    kinds: ["food", "drink", "culture", "music", "wellness", "fashion", "retail"],
  },
  coworking: {
    category: "venue",
    baseTags: ["startup", "tech", "specialty_coffee", "community", "design"],
    kinds: ["food", "drink", "wellness", "fitness", "retail", "culture", "music"],
  },
  other: {
    category: "retail",
    baseTags: ["community", "local_pride", "design", "specialty_coffee", "craft"],
    kinds: ["food", "drink", "music", "culture", "wellness", "fashion", "retail"],
  },
};

export function profileFor(type: BusinessType): BusinessProfile {
  return PROFILES[type];
}
