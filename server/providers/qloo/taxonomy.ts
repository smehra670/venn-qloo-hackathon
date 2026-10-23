import type { BusinessType, PartnerKind } from "@shared/types";
import type { QlooEntity } from "./schemas.js";

/**
 * Qloo category tags behind each partner kind. Every id below was confirmed against the
 * hackathon API (`/v2/tags` search + an insights call with `filter.tags`) on 2026-10-17.
 *
 * Without these, every place kind sent the identical request, so "music" partners were
 * whatever came back first (a museum, a hotel) and kind labels meant nothing.
 */
const PLACE = "urn:tag:category:place:";
const BRAND = "urn:tag:genre:brand:";

const place = (...slugs: string[]) => slugs.map((slug) => `${PLACE}${slug}`);
const brand = (...slugs: string[]) => slugs.map((slug) => `${BRAND}${slug}`);

/** Local place categories searched for each kind (sent as `filter.tags`, union). */
export const KIND_PLACE_CATEGORIES: Record<PartnerKind, string[]> = {
  music: place("record_store", "music_store", "musical_instrument_store", "live_music_venue", "jazz_club", "concert_hall"),
  culture: place("art_gallery", "museum", "book_store", "used_book_store", "comic_book_store", "movie_theater", "cultural_center", "art_studio"),
  fitness: place("gym", "fitness_center", "yoga_studio", "pilates_studio", "rock_climbing_gym", "boxing_gym", "dance_school", "sports_club"),
  wellness: place("spa", "day_spa", "massage", "beauty_salon", "hair_salon", "wellness_center", "health_food_store", "yoga_studio"),
  food: place("restaurant", "bakery", "patisserie", "deli", "ice_cream_shop", "farmers_market"),
  drink: place("bar", "cocktail_bar", "wine_bar", "pub", "brewery", "wine_store", "coffee_shop", "tea_house", "juice_shop"),
  venue: place("event_venue", "live_music_venue", "night_club", "comedy_club", "coworking_space", "community_center"),
  // Independent shops are often the best local collab partners, so these kinds search places too.
  retail: place("boutique", "gift_shop", "florist", "stationery_store", "furniture_store", "bicycle_shop", "skateboard_shop", "outdoor_sports_store"),
  fashion: place("clothing_store", "vintage_clothing_store", "boutique"),
};

/** Brand genres searched for the brand-led kinds; other kinds are local places only. */
export const KIND_BRAND_GENRES: Partial<Record<PartnerKind, string[]>> = {
  fashion: brand("fashion"),
  retail: brand("retail", "health_and_beauty", "food_and_beverage", "electronics", "travel", "entertainment", "website", "mobile_app"),
};

/** Places that are never outreach partners, whatever they score: landmarks, transport,
 * worship, parks, hotels and institutions. Matched against the place's category tags. */
const EXCLUDED_PLACE_SLUGS = [
  "tourist_attraction",
  "historical_landmark",
  "monument",
  "palace",
  "castle",
  "subway_station",
  "train_station",
  "bus_station",
  "airport",
  "place_worship",
  "place_of_worship",
  "church",
  "cathedral",
  "mosque",
  "synagogue",
  "park",
  "parking_lot",
  "parking_garage",
  "hotel",
  "university",
  "school",
  "hospital",
  "government_office",
  "embassy",
  "city_hall",
  // Chains you can't really collaborate with locally.
  "drug_store",
  "pharmacy",
  "convenience_store",
  "supermarket",
  "grocery_store",
  "gas_station",
  "bank",
  "atm",
];

/** Brand genres that are never collab partners for a small business (banks, universities,
 * charities, carmakers, consultancies, big public institutions). */
const EXCLUDED_BRAND_GENRES = brand(
  "financial_services",
  "academic",
  "ngo",
  "automotive",
  "professional_services",
  "cultural_arts",
  // Broadcasters (Channel 4); independent magazines (Kinfolk, Design Milk) stay in.
  "entertainment:tv_networks",
);

/** Brand industries that make a brand a direct competitor of the business. */
const COMPETITOR_BRAND_INDUSTRIES: Partial<Record<BusinessType, string[]>> = {
  bookshop: ["urn:tag:industry:qloo:books"],
};

/** Place categories that make a partner a direct competitor of the business. */
const COMPETITOR_PLACE_SLUGS: Partial<Record<BusinessType, string[]>> = {
  cafe: ["cafe", "coffee_shop", "tea_house", "espresso_bar"],
  restaurant: ["restaurant"],
  bar: ["bar", "pub", "cocktail_bar", "wine_bar", "beer_bar"],
  music_venue: ["live_music_venue", "night_club", "concert_hall", "jazz_club"],
  gym_studio: ["gym", "fitness_center", "boxing_gym", "rock_climbing_gym"],
  bakery: ["bakery", "patisserie", "pastry_shop", "cake_shop"],
  bookshop: ["book_store", "used_book_store", "comic_book_store"],
  salon_spa: ["spa", "day_spa", "beauty_salon", "hair_salon", "massage", "nail_salon"],
  hotel: ["hotel", "hostel", "bed_and_breakfast", "inn"],
  coworking: ["coworking_space"],
  fashion_brand: [],
  retail_shop: [],
};

/** Topic words -> the place category whose regulars share that taste. Curated because Qloo's
 * tag search rarely returns a place category for activity/cuisine words ("yoga", "natural
 * wine"); every target id is verified (see KIND_PLACE_CATEGORIES notes). */
const TOPIC_PLACE_RULES: Array<[RegExp, string]> = [
  [/\byoga\b/, "yoga_studio"],
  [/\bpilates\b/, "pilates_studio"],
  [/\b(climb|climbing|boulder|bouldering)\b/, "rock_climbing_gym"],
  [/\b(boxing|kickboxing|muay thai)\b/, "boxing_gym"],
  [/\b(dance|dancing|ballet|salsa)\b/, "dance_school"],
  [/\b(gym|weightlifting|crossfit|strength training|fitness)\b/, "gym"],
  [/\b(spa|massage|skincare|skin care)\b/, "spa"],
  [/\b(vinyl|records?|crate digging)\b/, "record_store"],
  [/\b(live music|gigs?|concerts?)\b/, "live_music_venue"],
  [/\b(techno|house music|clubbing|raves?|nightlife)\b/, "night_club"],
  [/\bjazz\b/, "jazz_club"],
  [/\b(comedy|stand-?up)\b/, "comedy_club"],
  [/\b(natural wine|wine)\b/, "wine_bar"],
  [/\b(craft beer|beer|brewer(y|ies))\b/, "brewery"],
  [/\b(cocktails?|mixology)\b/, "cocktail_bar"],
  [/\b(specialty coffee|speciality coffee|coffee|espresso)\b/, "coffee_shop"],
  [/\b(tea|matcha)\b/, "tea_house"],
  [/\b(sourdough|bread|baking|pastr(y|ies)|croissants?)\b/, "bakery"],
  [/\b(ice cream|gelato)\b/, "ice_cream_shop"],
  [/\b(farmers'? market|local produce)\b/, "farmers_market"],
  [/\b(books?|reading|literature|poetry)\b/, "book_store"],
  [/\b(comics?|manga|graphic novels?)\b/, "comic_book_store"],
  [/\b(art|painting|contemporary art|galleries)\b/, "art_gallery"],
  [/\b(film|cinema|movies)\b/, "movie_theater"],
  [/\b(vintage clothing|vintage fashion|thrift(ing)?|second-?hand clothes)\b/, "vintage_clothing_store"],
  [/\b(fashion|streetwear|clothing)\b/, "clothing_store"],
  [/\b(skateboard(ing)?|skate)\b/, "skateboard_shop"],
  [/\b(cycling|bikes?|bicycles?)\b/, "bicycle_shop"],
  [/\b(hiking|camping|outdoors|trail running)\b/, "outdoor_sports_store"],
  [/\b(flowers?|floristry|plants?)\b/, "florist"],
  [/\b(stationery|journaling|notebooks)\b/, "stationery_store"],
  [/\b(interior design|furniture|homeware)\b/, "furniture_store"],
];

const slugOf = (tagId: string) => tagId.split(":").pop() ?? tagId;

function tagIdsOf(entity: QlooEntity): string[] {
  return (entity.tags ?? [])
    .map((tag) => tag.tag_id ?? tag.id ?? "")
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Place category tag ids on an entity, in Qloo's order (the first is its main category). */
export function placeCategoriesOf(entity: QlooEntity): string[] {
  return tagIdsOf(entity).filter((id) => id.startsWith(PLACE));
}

/** Brand genre tag ids on an entity (e.g. urn:tag:genre:brand:fashion:accessories). */
export function brandGenresOf(entity: QlooEntity): string[] {
  return tagIdsOf(entity).filter((id) => id.startsWith(BRAND));
}

/** True when a place is a landmark, station, hotel, institution etc. — never a partner. */
export function isExcludedPlace(entity: QlooEntity): boolean {
  return placeCategoriesOf(entity).some((id) => EXCLUDED_PLACE_SLUGS.includes(slugOf(id)));
}

/** Brand industries that aren't collab partners for a small business: supermarkets and mass
 * merchandisers (Tesco, Waitrose), newspapers and broadcasters (verified Qloo industry tags). */
const EXCLUDED_BRAND_INDUSTRIES = [
  "urn:tag:industry:qloo:grocery",
  "urn:tag:industry:qloo:general_merchandise",
  "urn:tag:industry:qloo:news_publishing",
  "urn:tag:industry:qloo:television_broadcasting",
];

/** True when a brand is a bank, university, charity, carmaker, consultancy, museum,
 * supermarket, newspaper or broadcaster. */
export function isExcludedBrand(entity: QlooEntity): boolean {
  const genres = brandGenresOf(entity);
  if (genres.some((id) => EXCLUDED_BRAND_GENRES.some((bad) => id === bad || id.startsWith(`${bad}:`)))) return true;
  const ids = new Set(tagIdsOf(entity));
  return EXCLUDED_BRAND_INDUSTRIES.some((id) => ids.has(id));
}

/** True when a brand is in the business's own industry (Waterstones for a bookshop). */
export function isCompetitorBrand(entity: QlooEntity, businessType: BusinessType): boolean {
  const own = COMPETITOR_BRAND_INDUSTRIES[businessType] ?? [];
  if (own.length === 0) return false;
  const ids = new Set(tagIdsOf(entity));
  return own.some((id) => ids.has(id));
}

/** True when the place's main category is the business's own (a cafe suggesting a cafe). */
export function isCompetitorPlace(entity: QlooEntity, businessType: BusinessType): boolean {
  const own = COMPETITOR_PLACE_SLUGS[businessType] ?? [];
  if (own.length === 0) return false;
  const main = placeCategoriesOf(entity)[0];
  if (!main) return false;
  const slug = slugOf(main);
  // "restaurant" also covers cuisine-specific categories like korean_restaurant.
  return own.some((item) => slug === item || (item === "restaurant" && slug.endsWith("_restaurant")));
}

/** True when the entity carries at least one of the kind's search categories, so a partner
 * labelled "music" really is a record shop or venue rather than Qloo filter leakage. */
export function matchesKindCategories(entity: QlooEntity, kind: PartnerKind, entityType: "place" | "brand"): boolean {
  if (entityType === "place") {
    const wanted = new Set(KIND_PLACE_CATEGORIES[kind]);
    return placeCategoriesOf(entity).some((id) => wanted.has(id));
  }
  const wanted = KIND_BRAND_GENRES[kind] ?? [];
  return brandGenresOf(entity).some((id) => wanted.some((genre) => id === genre || id.startsWith(`${genre}:`)));
}

/** Human label for a place's main category ("Record store") for blurbs and tooltips. */
export function mainCategoryLabel(entity: QlooEntity): string | undefined {
  const main = placeCategoriesOf(entity)[0];
  const tag = (entity.tags ?? []).find((item) => (item.tag_id ?? item.id) === main);
  return tag?.name ?? (main ? slugOf(main).replace(/_/g, " ") : undefined);
}

/** Place category for a topic anchor ("yoga" -> yoga_studio), or undefined. */
export function placeCategoryForTopic(topic: string): string | undefined {
  const text = topic.trim().toLowerCase();
  for (const [pattern, slug] of TOPIC_PLACE_RULES) {
    if (pattern.test(text)) return `${PLACE}${slug}`;
  }
  return undefined;
}

/** True for a music-genre tag, which Qloo does honour as a signal when ranking artists. */
export function isMusicGenreTag(tagId: string): boolean {
  return tagId.startsWith("urn:tag:genre:music:");
}

/**
 * Topic tag families that describe a general interest ("yoga", "jazz", "natural wine") as
 * opposed to a brand-shaped tag (`similar_brand:patagonia`, `competitor_brand:peloton`,
 * `keyword:media:...`) that Qloo only produces because the text is also a brand name.
 */
export function isGeneralInterestTag(tagId: string): boolean {
  return /^urn:tag:(activity_type|activity|hobby|interests|lifestyle|cuisine|product_service|subgenre|genre:qloo|genre:music|genre:place|category:place|music:qloo):/.test(
    tagId,
  );
}

/**
 * Tag vocabularies that describe a crowd and that Qloo also attaches to partners: brands carry
 * lifestyle / audience / customer segment tags, places carry ambience and customer identity
 * tags. Your crowd's top tags in these, intersected with a partner's own tags, are the shared
 * tastes behind "why they match". (Probed: scoring a place's own crowd on tags returns nothing,
 * so the intersection is what works for every partner.)
 */
export const CROWD_TAG_TYPES = [
  "urn:tag:lifestyle:qloo",
  "urn:tag:audience:qloo",
  "urn:tag:customer_segment:qloo",
  "urn:tag:customer_identity:qloo",
  "urn:tag:ambience:qloo",
];
