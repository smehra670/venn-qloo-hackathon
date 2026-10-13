import type { BusinessInput } from "@shared/types";
import { createHash } from "node:crypto";

/** Stable id for a search, independent of display-only fields like businessName. */
export function hashInput(input: BusinessInput): string {
  const anchors = [...input.anchors].map((anchor) => anchor.toLowerCase().trim()).sort();
  const key = `${input.businessType}|${input.city.trim().toLowerCase()}|${anchors.join(",")}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
