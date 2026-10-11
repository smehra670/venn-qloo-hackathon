import type { TagId } from "./taxonomy.js";

export interface Neighbourhood {
  id: string;
  name: string;
  lat: number;
  lng: number;
  character: Partial<Record<TagId, number>>;
}

export interface DemoCity {
  name: string;
  aliases: string[];
  center: [number, number];
  zoom: number;
  neighbourhoods: Neighbourhood[];
}

function character(pairs: Array<[TagId, number]>): Partial<Record<TagId, number>> {
  const out: Partial<Record<TagId, number>> = {};
  for (const [tag, weight] of pairs) out[tag] = weight;
  return out;
}

export const CITIES: DemoCity[] = [
  {
    name: "London",
    aliases: ["greater london", "london uk"],
    center: [51.5074, -0.1278],
    zoom: 11,
    neighbourhoods: [
      { id: "shoreditch", name: "Shoreditch", lat: 51.5265, lng: -0.078, character: character([["indie_music", 0.9], ["streetwear", 0.82], ["specialty_coffee", 0.78], ["nightlife", 0.74], ["design", 0.66], ["startup", 0.55], ["vinyl", 0.48]]) },
      { id: "dalston", name: "Dalston", lat: 51.5461, lng: -0.075, character: character([["indie_music", 0.92], ["nightlife", 0.84], ["vinyl", 0.8], ["natural_wine", 0.7], ["craft_beer", 0.64], ["community", 0.58], ["streetwear", 0.46]]) },
      { id: "peckham", name: "Peckham", lat: 51.474, lng: -0.069, character: character([["community", 0.9], ["street_food", 0.8], ["craft", 0.74], ["streetwear", 0.68], ["nightlife", 0.6], ["vintage", 0.55], ["art_house_film", 0.45]]) },
      { id: "hackney-wick", name: "Hackney Wick", lat: 51.5435, lng: -0.025, character: character([["craft_beer", 0.86], ["electronic", 0.8], ["craft", 0.72], ["running", 0.64], ["community", 0.58], ["climbing", 0.5]]) },
      { id: "camden", name: "Camden", lat: 51.539, lng: -0.1426, character: character([["live_music", 0.92], ["vintage", 0.82], ["nightlife", 0.76], ["vinyl", 0.7], ["streetwear", 0.6], ["indie_music", 0.52]]) },
      { id: "notting-hill", name: "Notting Hill", lat: 51.509, lng: -0.203, character: character([["design", 0.86], ["premium", 0.8], ["brunch", 0.74], ["vintage", 0.66], ["specialty_coffee", 0.6], ["family", 0.5]]) },
      { id: "brixton", name: "Brixton", lat: 51.4613, lng: -0.1156, character: character([["live_music", 0.9], ["street_food", 0.82], ["hip_hop", 0.76], ["nightlife", 0.7], ["community", 0.62], ["vintage", 0.48]]) },
      { id: "soho", name: "Soho", lat: 51.5136, lng: -0.1365, character: character([["nightlife", 0.92], ["theatre", 0.82], ["cocktails", 0.78], ["design", 0.64], ["jazz", 0.55], ["premium", 0.46]]) },
      { id: "marylebone", name: "Marylebone", lat: 51.5205, lng: -0.15, character: character([["premium", 0.88], ["wellness", 0.8], ["bookish", 0.72], ["specialty_coffee", 0.66], ["design", 0.58], ["tea", 0.48]]) },
      { id: "clapton", name: "Clapton", lat: 51.5615, lng: -0.056, character: character([["slow_living", 0.9], ["natural_wine", 0.78], ["bakery", 0.72], ["community", 0.66], ["family", 0.55], ["specialty_coffee", 0.48]]) },
      { id: "greenwich", name: "Greenwich", lat: 51.4826, lng: -0.0077, character: character([["family", 0.86], ["outdoors", 0.78], ["bookish", 0.66], ["slow_living", 0.6], ["local_pride", 0.5], ["brunch", 0.44]]) },
      { id: "islington", name: "Islington", lat: 51.5362, lng: -0.1033, character: character([["bookish", 0.88], ["family", 0.74], ["brunch", 0.7], ["theatre", 0.62], ["specialty_coffee", 0.58], ["design", 0.46]]) },
      { id: "kings-cross", name: "King's Cross", lat: 51.5309, lng: -0.1233, character: character([["tech", 0.86], ["startup", 0.8], ["design", 0.7], ["running", 0.58], ["specialty_coffee", 0.54], ["community", 0.44]]) },
      { id: "battersea", name: "Battersea", lat: 51.475, lng: -0.148, character: character([["running", 0.84], ["wellness", 0.78], ["family", 0.7], ["outdoors", 0.64], ["pilates", 0.56], ["brunch", 0.46]]) },
    ],
  },
  {
    name: "Manchester",
    aliases: ["greater manchester"],
    center: [53.4808, -2.2426],
    zoom: 12,
    neighbourhoods: [
      { id: "northern-quarter", name: "Northern Quarter", lat: 53.484, lng: -2.235, character: character([["indie_music", 0.9], ["vinyl", 0.84], ["specialty_coffee", 0.76], ["streetwear", 0.7], ["nightlife", 0.64], ["design", 0.52]]) },
      { id: "ancoats", name: "Ancoats", lat: 53.4833, lng: -2.226, character: character([["specialty_coffee", 0.88], ["design", 0.78], ["brunch", 0.7], ["community", 0.64], ["bakery", 0.56], ["running", 0.46]]) },
      { id: "deansgate", name: "Deansgate", lat: 53.479, lng: -2.25, character: character([["cocktails", 0.86], ["nightlife", 0.78], ["premium", 0.7], ["designer", 0.62], ["live_music", 0.54], ["design", 0.46]]) },
      { id: "didsbury", name: "Didsbury", lat: 53.4166, lng: -2.23, character: character([["family", 0.86], ["brunch", 0.76], ["slow_living", 0.7], ["specialty_coffee", 0.62], ["bakery", 0.55], ["outdoors", 0.46]]) },
      { id: "chorlton", name: "Chorlton", lat: 53.44, lng: -2.276, character: character([["natural_wine", 0.86], ["community", 0.78], ["indie_music", 0.68], ["bakery", 0.6], ["slow_living", 0.54], ["vintage", 0.46]]) },
      { id: "salford-quays", name: "Salford Quays", lat: 53.472, lng: -2.297, character: character([["electronic", 0.82], ["nightlife", 0.74], ["tech", 0.66], ["design", 0.58], ["live_music", 0.5], ["startup", 0.44]]) },
      { id: "castlefield", name: "Castlefield", lat: 53.477, lng: -2.257, character: character([["design", 0.84], ["craft", 0.76], ["photography", 0.68], ["specialty_coffee", 0.58], ["community", 0.5], ["bookish", 0.44]]) },
      { id: "withington", name: "Withington", lat: 53.43, lng: -2.23, character: character([["indie_music", 0.8], ["craft_beer", 0.74], ["budget_friendly", 0.66], ["vinyl", 0.6], ["street_food", 0.52], ["community", 0.46]]) },
      { id: "hulme", name: "Hulme", lat: 53.467, lng: -2.253, character: character([["community", 0.88], ["live_music", 0.76], ["street_food", 0.68], ["hip_hop", 0.6], ["craft", 0.52], ["nightlife", 0.46]]) },
      { id: "levenshulme", name: "Levenshulme", lat: 53.445, lng: -2.19, character: character([["street_food", 0.86], ["bakery", 0.74], ["community", 0.7], ["family", 0.6], ["local_pride", 0.52], ["indie_music", 0.44]]) },
      { id: "fallowfield", name: "Fallowfield", lat: 53.44, lng: -2.22, character: character([["craft_beer", 0.84], ["nightlife", 0.76], ["budget_friendly", 0.68], ["live_music", 0.58], ["street_food", 0.5], ["gaming", 0.44]]) },
      { id: "spinningfields", name: "Spinningfields", lat: 53.481, lng: -2.251, character: character([["premium", 0.88], ["cocktails", 0.76], ["designer", 0.68], ["tech", 0.58], ["startup", 0.5], ["design", 0.44]]) },
    ],
  },
  {
    name: "New York",
    aliases: ["new york city", "nyc", "ny"],
    center: [40.7306, -73.9866],
    zoom: 11,
    neighbourhoods: [
      { id: "williamsburg", name: "Williamsburg", lat: 40.7081, lng: -73.9571, character: character([["indie_music", 0.88], ["specialty_coffee", 0.8], ["vintage", 0.72], ["design", 0.66], ["nightlife", 0.58], ["streetwear", 0.5]]) },
      { id: "bushwick", name: "Bushwick", lat: 40.6944, lng: -73.9213, character: character([["electronic", 0.86], ["nightlife", 0.8], ["vinyl", 0.74], ["streetwear", 0.66], ["craft", 0.56], ["indie_music", 0.48]]) },
      { id: "lower-east-side", name: "Lower East Side", lat: 40.715, lng: -73.9843, character: character([["nightlife", 0.88], ["live_music", 0.78], ["vintage", 0.7], ["cocktails", 0.64], ["street_food", 0.55], ["indie_music", 0.46]]) },
      { id: "west-village", name: "West Village", lat: 40.7358, lng: -74.0036, character: character([["bookish", 0.86], ["natural_wine", 0.78], ["brunch", 0.7], ["design", 0.62], ["slow_living", 0.54], ["specialty_coffee", 0.48]]) },
      { id: "harlem", name: "Harlem", lat: 40.8116, lng: -73.9465, character: character([["jazz", 0.92], ["live_music", 0.82], ["community", 0.74], ["hip_hop", 0.66], ["street_food", 0.55], ["local_pride", 0.48]]) },
      { id: "greenpoint", name: "Greenpoint", lat: 40.7304, lng: -73.9544, character: character([["specialty_coffee", 0.84], ["yoga", 0.76], ["slow_living", 0.7], ["design", 0.62], ["plant_based", 0.54], ["vinyl", 0.46]]) },
      { id: "park-slope", name: "Park Slope", lat: 40.671, lng: -73.9777, character: character([["family", 0.88], ["brunch", 0.76], ["bookish", 0.68], ["running", 0.6], ["specialty_coffee", 0.52], ["slow_living", 0.46]]) },
      { id: "fort-greene", name: "Fort Greene", lat: 40.689, lng: -73.974, character: character([["natural_wine", 0.84], ["design", 0.76], ["jazz", 0.66], ["community", 0.6], ["brunch", 0.52], ["bookish", 0.46]]) },
      { id: "soho", name: "SoHo", lat: 40.7233, lng: -74.003, character: character([["designer", 0.9], ["premium", 0.82], ["streetwear", 0.7], ["design", 0.64], ["photography", 0.54], ["luxury", 0.48]]) },
      { id: "east-village", name: "East Village", lat: 40.7265, lng: -73.9815, character: character([["nightlife", 0.86], ["indie_music", 0.8], ["vinyl", 0.72], ["cocktails", 0.64], ["vintage", 0.55], ["live_music", 0.48]]) },
      { id: "red-hook", name: "Red Hook", lat: 40.6734, lng: -74.0083, character: character([["craft_beer", 0.82], ["outdoors", 0.74], ["running", 0.66], ["community", 0.6], ["street_food", 0.5], ["local_pride", 0.44]]) },
      { id: "astoria", name: "Astoria", lat: 40.7644, lng: -73.9235, character: character([["street_food", 0.86], ["family", 0.74], ["community", 0.68], ["nightlife", 0.56], ["local_pride", 0.5], ["brunch", 0.44]]) },
    ],
  },
];

export function matchCity(input: string): DemoCity | null {
  const key = input.trim().toLowerCase();
  return (
    CITIES.find(
      (city) => city.name.toLowerCase() === key || city.aliases.some((alias) => alias === key),
    ) ?? null
  );
}
