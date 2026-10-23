import type { BusinessType } from "@shared/types";

/**
 * Hand-written swipe-card seeds per business type (Strategy S in docs/CARDS_PROBE.md): names a
 * customer of that business could plausibly love. Widely known names only, no private
 * individuals, no political or adult topics. `npm run cards:seed` resolves each one to an exact
 * Qloo id (`/search` for brands and artists, `/v2/tags` for topics) and writes the clean ones to
 * `seed-ids.json`; anything ambiguous or unresolved is dropped, never guessed.
 */
export interface SeedList {
  brands: string[];
  artists: string[];
  topics: string[];
}

export const SEEDS: Record<BusinessType, SeedList> = {
  cafe: {
    brands: ["Aesop", "Oatly", "Patagonia", "Chemex", "Muji", "Kinfolk", "Le Creuset", "Penguin Books"],
    artists: ["Joy Division", "Floating Points", "Little Simz", "Bon Iver", "Radiohead", "Khruangbin"],
    topics: ["Vinyl records", "Sourdough baking", "Trail running", "Houseplants"],
  },
  restaurant: {
    brands: ["Le Creuset", "Dishoom", "Waitrose", "Smeg", "Riedel", "Bon Appétit", "Michelin Guide", "Aesop"],
    artists: ["Khruangbin", "Sade", "Nina Simone", "Jamie xx", "Norah Jones", "Massive Attack"],
    topics: ["Natural wine", "Food markets", "Wine tasting", "Street food"],
  },
  bar: {
    brands: ["BrewDog", "Beavertown", "Aperol", "Hendrick's", "Converse", "Vans", "Dr. Martens", "Carhartt"],
    artists: ["Arctic Monkeys", "Fontaines D.C.", "IDLES", "Jamie xx", "The Strokes", "Bicep"],
    topics: ["Craft beer", "Cocktails", "Pub quizzes", "Live music"],
  },
  music_venue: {
    brands: ["Fender", "Bandcamp", "Rough Trade", "Dr. Martens", "Converse", "Vans", "Levi's", "Sonos"],
    artists: ["Fontaines D.C.", "IDLES", "Wet Leg", "Little Simz", "Arctic Monkeys", "Bicep"],
    topics: ["Vinyl records", "Live music", "Music festivals", "Record collecting"],
  },
  gym_studio: {
    brands: ["Nike", "Lululemon", "Peloton", "Strava", "Gymshark", "Garmin", "Huel", "Brooks Running"],
    artists: ["Calvin Harris", "Dua Lipa", "Bicep", "Disclosure", "Beyoncé", "Fred again.."],
    topics: ["Trail running", "Cold water swimming", "Meal prep", "Yoga"],
  },
  retail_shop: {
    brands: ["Muji", "Polaroid", "Bandcamp", "Uniqlo", "Kinfolk", "Sonos", "Moleskine", "Patagonia"],
    artists: ["Khruangbin", "Phoebe Bridgers", "Radiohead", "Mac DeMarco", "Bon Iver", "Jungle"],
    topics: ["Vintage fashion", "Interior design", "Houseplants", "Vinyl records"],
  },
  fashion_brand: {
    brands: ["Carhartt", "Stüssy", "COS", "Arket", "Acne Studios", "Dr. Martens", "New Balance", "Aesop"],
    artists: ["Little Simz", "FKA twigs", "Frank Ocean", "Rosalía", "Jamie xx", "Solange"],
    topics: ["Streetwear", "Vintage fashion", "Sustainable fashion", "Photography"],
  },
  bakery: {
    brands: ["Le Creuset", "Oatly", "Waitrose", "KitchenAid", "Bon Appétit", "Kinfolk", "Smeg", "Fortnum & Mason"],
    artists: ["Norah Jones", "Bon Iver", "Nick Drake", "Fleetwood Mac", "Joni Mitchell", "Khruangbin"],
    topics: ["Sourdough baking", "Specialty coffee", "Farmers markets", "Afternoon tea"],
  },
  bookshop: {
    brands: ["Penguin Books", "Moleskine", "Folio Society", "Audible", "Kindle", "Muji", "The New Yorker", "Kinfolk"],
    artists: ["Phoebe Bridgers", "Nick Drake", "Bon Iver", "Joni Mitchell", "Leonard Cohen", "Radiohead"],
    topics: ["Literary festivals", "Slow travel", "Board games", "Poetry"],
  },
  salon_spa: {
    brands: ["Aesop", "Glossier", "Rituals", "Le Labo", "Diptyque", "Lululemon", "Dyson", "Sephora"],
    artists: ["Sade", "SZA", "Norah Jones", "Beyoncé", "Jorja Smith", "Lana Del Rey"],
    topics: ["Skincare", "Yoga", "Meditation", "Self care"],
  },
  hotel: {
    brands: ["Aesop", "Airbnb", "Soho House", "Le Labo", "Rimowa", "Kinfolk", "Sonos", "Ace Hotel"],
    artists: ["Khruangbin", "Massive Attack", "Jamie xx", "Sade", "Bonobo", "Air"],
    topics: ["Slow travel", "Architecture", "Interior design", "Food markets"],
  },
  coworking: {
    brands: ["Apple", "Muji", "Slack", "Moleskine", "Notion", "Patagonia", "Oatly", "Sonos"],
    artists: ["Bonobo", "Floating Points", "Tycho", "Jamie xx", "Khruangbin", "Four Tet"],
    topics: ["Startups", "Podcasts", "Graphic design", "Productivity"],
  },
  other: {
    brands: ["Patagonia", "Muji", "Aesop", "IKEA", "Nike", "Oatly", "Bandcamp", "Polaroid"],
    artists: ["Radiohead", "Little Simz", "Bon Iver", "Khruangbin", "Dua Lipa", "Arctic Monkeys"],
    topics: ["Vinyl records", "Houseplants", "Trail running", "Specialty coffee"],
  },
};

/**
 * Display name → the exact name Qloo uses, for seeds whose Qloo entity is named differently.
 * `cards:seed` searches and matches on the Qloo name and stores the display name.
 */
export const QLOO_NAMES: Record<string, string> = {
  Waitrose: "Waitrose & Partners",
  Riedel: "RIEDEL - The Wine Glass Company",
  "Hendrick's": "Hendrick's Gin",
  "Albert Hall": "Albert Hall, Manchester",
  "Levi's": "Levi Strauss & Co.",
  "Le Labo": "Le Labo Fragrances",
  Apple: "Apple Inc",
  "Folio Society": "The Folio Society",
  Beavertown: "Beavertown Brewery",
};

/** Place cards for the demo cities only. Other cities get no place cards: the probe found live
 * local places too slow and noisy (docs/CARDS_PROBE.md). These differ from the reference's
 * neighbourhoods (Northern Quarter, Stokes Croft…), which Qloo has no single place entity for. */
export const PLACES: Record<string, string[]> = {
  Manchester: ["Band on the Wall", "Manchester Art Gallery", "Albert Hall"],
  London: ["Barbican Centre", "Columbia Road Flower Market", "Borough Market"],
  Bristol: ["Watershed", "Clifton Suspension Bridge", "Arnolfini"],
};

/** Canonical demo-city name for a typed city ("manchester, uk" → "Manchester"), or null. */
export function placeCityFor(city: string): string | null {
  const head = city.split(",")[0]?.trim().toLowerCase() ?? "";
  return Object.keys(PLACES).find((name) => name.toLowerCase() === head) ?? null;
}
