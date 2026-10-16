/** Client-side city centres matching the demo/Qloo search centres the app already uses.
 * Unknown cities return null → Research screen keeps the Venn-circles fallback. */

export interface ResearchCity {
  name: string;
  /** [lat, lng] — same order as `CityInfo.center`. */
  center: [number, number];
  aliases: string[];
}

/** Search radius in metres used for local place discover (see `LOCAL_PLACE_RADIUS_M`). */
export const RESEARCH_RADIUS_M = 8000;

const CITIES: ResearchCity[] = [
  { name: "London", center: [51.5074, -0.1278], aliases: ["greater london", "london uk"] },
  { name: "Manchester", center: [53.4808, -2.2426], aliases: ["greater manchester"] },
  { name: "New York", center: [40.7306, -73.9866], aliases: ["new york city", "nyc", "ny"] },
];

export function matchResearchCity(input: string): ResearchCity | null {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  return (
    CITIES.find(
      (city) => city.name.toLowerCase() === key || city.aliases.some((alias) => alias === key),
    ) ?? null
  );
}

/** Prefer live run city when present; else known demo centres. */
export function resolveResearchCenter(
  cityName: string,
  runCity: { center: [number, number]; hasLocalData: boolean } | null | undefined,
): [number, number] | null {
  if (runCity?.hasLocalData && runCity.center) return runCity.center;
  return matchResearchCity(cityName)?.center ?? null;
}
