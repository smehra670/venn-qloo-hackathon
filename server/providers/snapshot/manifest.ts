import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../../config.js";

export interface ManifestEntry {
  index: number;
  hash: string;
  businessName?: string;
  city: string;
  provider: string;
  date: string;
}

export function snapshotDirPath(): string {
  return path.resolve(process.cwd(), config.snapshotDir);
}

export function loadManifest(): ManifestEntry[] {
  const file = path.join(snapshotDirPath(), "manifest.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as ManifestEntry[]) : [];
  } catch {
    return [];
  }
}

export function latestSnapshotDate(): string | null {
  const manifest = loadManifest();
  const first = manifest[0];
  if (!first) return null;
  return manifest.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), first.date);
}
