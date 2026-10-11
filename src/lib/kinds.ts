import type { PartnerKind } from "@shared/types";

export const KIND_META: Record<PartnerKind, { label: string; color: string }> = {
  food: { label: "Food & bakeries", color: "#E8A33D" },
  drink: { label: "Drinks & bars", color: "#1FA89A" },
  venue: { label: "Venues & nights out", color: "#4F5BFF" },
  music: { label: "Music & labels", color: "#8B5CF6" },
  culture: { label: "Culture & making", color: "#B8A12E" },
  retail: { label: "Retail & lifestyle", color: "#C77D4B" },
  fashion: { label: "Fashion & streetwear", color: "#D9468F" },
  fitness: { label: "Fitness & sport", color: "#2FAE62" },
  wellness: { label: "Wellness & slow living", color: "#5AA9E6" },
};

export function kindAngle(kind: PartnerKind): number {
  const order = ["food", "drink", "venue", "music", "culture", "retail", "fashion", "fitness", "wellness"];
  const index = order.indexOf(kind);
  return (index / 9) * Math.PI * 2 - Math.PI / 2;
}
