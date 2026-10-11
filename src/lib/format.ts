import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import type { BusinessInput, Partner } from "@shared/types";

export function businessLabel(input: BusinessInput): string {
  if (input.businessName) return input.businessName;
  if (input.businessType === "other" && input.businessTypeCustom) return input.businessTypeCustom;
  return BUSINESS_TYPE_LABELS[input.businessType];
}

export function summaryLine(input: BusinessInput): string {
  const type =
    input.businessType === "other" && input.businessTypeCustom
      ? input.businessTypeCustom
      : BUSINESS_TYPE_LABELS[input.businessType];
  return `${type} · ${input.city} · ${input.anchors.join(", ")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function partnersToCsv(partners: Partner[]): string {
  const lines = ["rank,name,kind,local,matchScore,surprise,sharedTags"];
  partners.forEach((partner, index) => {
    lines.push(
      [
        String(index + 1),
        csvCell(partner.name),
        partner.kind,
        partner.local ? "true" : "false",
        String(partner.matchScore),
        partner.surprise.toFixed(2),
        csvCell(partner.sharedTags.join("|")),
      ].join(","),
    );
  });
  return lines.join("\n");
}

export function downloadText(filename: string, contents: string, type = "text/plain"): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function briefAsText(brief: {
  title: string;
  format: string;
  concept: string;
  whyItFits: { text: string }[];
  firstStep: string;
  plan: { when: string; action: string }[];
  measure: string[];
  risks: string[];
  outreach: { subject: string; body: string };
  limits: string;
}): string {
  return [
    brief.title,
    brief.format,
    "",
    brief.concept,
    "",
    "Why it fits",
    ...brief.whyItFits.map((item) => `- ${item.text}`),
    "",
    "First step",
    brief.firstStep,
    "",
    "Two-week plan",
    ...brief.plan.map((row) => `${row.when}: ${row.action}`),
    "",
    "What to measure",
    ...brief.measure.map((item) => `- ${item}`),
    "",
    "Risks",
    ...brief.risks.map((item) => `- ${item}`),
    "",
    "Outreach",
    brief.outreach.subject,
    brief.outreach.body,
    "",
    brief.limits,
  ].join("\n");
}
