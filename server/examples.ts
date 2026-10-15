import type { BusinessInput, ExampleInput } from "@shared/types";
import { hashInput } from "./providers/snapshot/hash.js";

/** The handful of searches shown as one-click examples in the UI (`GET /api/meta`,
 * `GET /api/examples`) and, when `EXAMPLES_MODE=snapshot`, replayed from disk by
 * `getProvider()` even when `TASTE_PROVIDER` is `mock`/`qloo` — see providers/index.ts. */
export const EXAMPLES: ExampleInput[] = [
  { businessType: "cafe", city: "London", anchors: ["Aesop", "Radiohead", "pilates"], businessName: "Brew & Co" },
  { businessType: "gym_studio", city: "Manchester", anchors: ["Patagonia", "craft beer", "bouldering"] },
  { businessType: "retail_shop", city: "New York", anchors: ["Bandcamp", "Polaroid", "natural wine"], businessName: "Second Spin Records" },
];

const EXAMPLE_HASHES = new Set(EXAMPLES.map((example) => hashInput(example)));

/** True when `input` matches one of the built-in example searches (by business type, city
 * and anchors — see `hashInput`), regardless of its display-only `businessName`. */
export function isExampleInput(input: BusinessInput): boolean {
  return EXAMPLE_HASHES.has(hashInput(input));
}
