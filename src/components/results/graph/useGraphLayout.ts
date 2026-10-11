import { PARTNER_KINDS, type Partner, type PartnerKind } from "@shared/types";
import { forceCollide, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { clamp } from "@/lib/format";

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  targetX: number;
  targetY: number;
}

export interface GraphLayout {
  cx: number;
  cy: number;
  businessR: number;
  nodes: { id: string; x: number; y: number; r: number }[];
}

export function layoutGraph(
  partners: Partner[],
  width: number,
  height: number,
  previous?: Map<string, { x: number; y: number }>,
): GraphLayout {
  const shortest = Math.min(width, height);
  const businessR = clamp(shortest * 0.22, Math.min(72, shortest * 0.16), 150);
  const cx = width / 2;
  const cy = height / 2;
  const groups = new Map<PartnerKind, Partner[]>();
  for (const partner of partners) {
    const list = groups.get(partner.kind) ?? [];
    list.push(partner);
    groups.set(partner.kind, list);
  }
  const nodes: SimNode[] = partners.map((partner) => {
    const t = clamp((partner.matchScore - 52) / 44, 0, 1);
    const r = businessR * (0.28 + 0.3 * t);
    const overlap = clamp(0.12 + 0.62 * t, 0.12, 0.74);
    const distance = Math.max(businessR + 1, businessR + r - overlap * 2 * r);
    const kindIndex = Math.max(0, PARTNER_KINDS.indexOf(partner.kind));
    const base = (kindIndex / 9) * Math.PI * 2 - Math.PI / 2;
    const siblings = groups.get(partner.kind) ?? [partner];
    const index = Math.max(0, siblings.findIndex((item) => item.id === partner.id));
    const angle = base + (index - (siblings.length - 1) / 2) * 0.22;
    const prior = previous?.get(partner.id);
    return {
      id: partner.id,
      r,
      targetX: cx + Math.cos(angle) * distance,
      targetY: cy + Math.sin(angle) * distance,
      x: prior?.x ?? cx + Math.cos(angle) * distance,
      y: prior?.y ?? cy + Math.sin(angle) * distance,
    };
  });
  if (nodes.length > 0) {
    const simulation = forceSimulation(nodes)
      .force("collide", forceCollide<SimNode>((node) => node.r * 0.62 + 4))
      .force("x", forceX<SimNode>((node) => node.targetX).strength(0.9))
      .force("y", forceY<SimNode>((node) => node.targetY).strength(0.9))
      .force("charge", forceManyBody<SimNode>().strength(-8))
      .stop();
    for (let tick = 0; tick < 300; tick += 1) simulation.tick();
  }
  for (const node of nodes) {
    const x = node.x ?? cx;
    const y = node.y ?? cy;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const min = businessR + 1;
    if (dist < min) {
      const angle = Math.atan2(node.targetY - cy, node.targetX - cx);
      node.x = cx + Math.cos(angle) * min;
      node.y = cy + Math.sin(angle) * min;
    }
  }
  return {
    cx,
    cy,
    businessR,
    nodes: nodes.map((node) => ({ id: node.id, x: node.x ?? cx, y: node.y ?? cy, r: node.r })),
  };
}
