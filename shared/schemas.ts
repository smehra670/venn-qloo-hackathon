import { z } from "zod";
import {
  ANCHOR_STATUSES,
  APPETITE_OPTIONS,
  BUSINESS_TYPES,
  FEASIBILITY_LEVELS,
  GOAL_IDS,
  PARTNER_KINDS,
  REACH_OPTIONS,
  STEP_ORDER,
  type AgentEvent,
  type BusinessInput,
} from "./types.js";

export function stripControls(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

const cleaned = (value: string): string => stripControls(value).trim();

const DecisionOriginSchema = z.enum(["rule", "qloo", "ai"]);

const GoalsSchema = z.object({
  wants: z.array(z.enum(GOAL_IDS)).max(2),
  reach: z.enum(REACH_OPTIONS),
  appetite: z.enum(APPETITE_OPTIONS),
  avoid: z
    .array(
      z
        .string()
        .transform((value) => cleaned(value))
        .pipe(z.string().min(1).max(40)),
    )
    .max(10),
});

export const BusinessInputSchema = z
  .object({
    businessName: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const next = cleaned(value);
        return next.length === 0 ? undefined : next;
      })
      .pipe(z.string().min(1).max(60).optional()),
    businessType: z.enum(BUSINESS_TYPES),
    businessTypeCustom: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const next = cleaned(value);
        return next.length === 0 ? undefined : next;
      }),
    city: z
      .string()
      .transform((value) => cleaned(value))
      .pipe(z.string().min(2, "Enter a city.").max(60)),
    anchors: z
      .array(
        z
          .string()
          .transform((value) => cleaned(value))
          .pipe(z.string().min(2).max(60)),
      )
      .min(1, "Add at least one thing your customers love.")
      .max(6, "Six is the maximum.")
      .transform((list) => {
        const seen = new Set<string>();
        const unique: string[] = [];
        for (const item of list) {
          const key = item.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(item);
        }
        return unique;
      })
      .refine((list) => list.length >= 1, "Add at least one thing your customers love.")
      .refine((list) => list.length <= 6, "Six is the maximum."),
    goals: GoalsSchema.optional(),
    tasteAnchors: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          kind: z.enum(["entity", "tag"]),
          id: z.string().min(1),
          type: z.string().min(1),
          origin: z.enum(["user", "qloo", "ai_suggested"]),
        }),
      )
      .max(6)
      .optional(),
    anchorNotes: z.array(z.string().min(1).max(60)).max(6).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.businessType !== "other") return;
    const custom = data.businessTypeCustom ?? "";
    if (custom.length < 2 || custom.length > 40) {
      ctx.addIssue({
        code: "custom",
        path: ["businessTypeCustom"],
        message: "Describe your business in a few words.",
      });
    }
  });

export const BriefRequestSchema = z.object({
  partnerId: z.string().min(1),
  variant: z.number().int().min(0).max(9),
  tone: z.enum(["warm", "direct", "playful"]).optional(),
  length: z.enum(["short", "standard"]).optional(),
  regenerate: z.boolean().optional(),
});

export const ExpandRequestSchema = z.object({
  partnerId: z.string().min(1),
});

export const HeatmapQuerySchema = z.object({
  partnerId: z.string().min(1).optional(),
});

export const CompareRequestSchema = z.object({
  partnerId: z.string().min(1),
});

export const AnchorResolveRequestSchema = z.object({
  anchors: z
    .array(
      z
        .string()
        .transform((value) => cleaned(value))
        .pipe(z.string().min(1).max(60)),
    )
    .min(1)
    .max(6),
  city: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : cleaned(value))),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  goal: z.string().max(80).optional(),
  /** When true, skip the OpenAI suggestion step (tests / offline). */
  skipAi: z.boolean().optional(),
});

export const CheckRequestSchema = z.object({
  name: z
    .string()
    .transform((value) => cleaned(value))
    .pipe(z.string().min(1, "Enter a name to check.").max(60, "Keep it under 60 characters.")),
  entityHint: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const next = cleaned(value).toLowerCase();
      return next.length === 0 ? undefined : next;
    }),
});

const StepIdSchema = z.enum(STEP_ORDER);
const PartnerKindSchema = z.enum(PARTNER_KINDS);
const EntityTypeSchema = z.enum([
  "brand",
  "place",
  "artist",
  "person",
  "podcast",
  "tv_show",
  "movie",
  "book",
  "destination",
]);
const ProviderSchema = z.enum(["mock", "qloo", "snapshot"]);

const SignalSchema = z.object({
  affinityToPartner: z.number(),
  affinityFromPartner: z.number(),
  tagOverlap: z.number(),
  localPopularity: z.number(),
  trend: z.number(),
});

const EvidenceSchema = z.object({
  label: z.string(),
  value: z.string(),
  origin: z.enum(["data", "interpretation"]),
});

const NormalizationSchema = z.object({
  minRaw: z.number(),
  maxRaw: z.number(),
  absolute: z.boolean().optional(),
});

const ScoreBasisSchema = z.object({
  callId: z.string(),
  poolSize: z.number(),
  rawAffinity: z.number(),
  popularity: z.number(),
});

const DiscoverSpecSchema = z.object({
  kind: PartnerKindSchema,
  entityType: EntityTypeSchema,
  params: z.record(z.string(), z.string()),
  poolIds: z.array(z.string()),
});

const VenueFactsSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  address: z.string().optional(),
  neighbourhood: z.string().optional(),
  website: z.string().optional(),
  distanceM: z.number().optional(),
});

export const QlooCallRecordSchema = z.object({
  id: z.string(),
  at: z.number(),
  step: StepIdSchema.optional(),
  path: z.string(),
  params: z.record(z.string(), z.string()),
  status: z.enum(["ok", "error"]),
  ms: z.number(),
  httpStatus: z.number().optional(),
  error: z.string().optional(),
});

export const PartnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: PartnerKindSchema,
  entityType: EntityTypeSchema,
  blurb: z.string(),
  local: z.boolean(),
  locationLabel: z.string().optional(),
  matchScore: z.number(),
  surprise: z.number(),
  isSurprising: z.boolean(),
  reasons: z.array(z.string()),
  sharedTags: z.array(z.string()),
  tags: z.array(z.string()),
  signals: SignalSchema,
  evidence: z.array(EvidenceSchema),
  relatedIds: z.array(z.string()),
  parentId: z.string().optional(),
  expanded: z.boolean().optional(),
  userAdded: z.boolean().optional(),
  origin: z.enum(["discovered", "user_added"]).optional(),
  scoreBasis: ScoreBasisSchema.optional(),
  goalFit: z.number().min(0).max(1).optional(),
  feasibility: z
    .object({
      level: z.enum(FEASIBILITY_LEVELS),
      reason: z.string(),
      origin: DecisionOriginSchema,
    })
    .optional(),
  venueFacts: VenueFactsSchema.optional(),
  popularityLift: z.number().optional(),
  drivers: z.array(z.object({ anchor: z.string(), share: z.number() })).optional(),
  crowdTags: z
    .array(z.object({ label: z.string(), you: z.number(), onPartner: z.boolean().optional(), them: z.number().optional() }))
    .optional(),
});

const TopPickSchema = z.object({
  role: z.enum(["best_overall", "best_local", "wildcard"]),
  partnerId: z.string(),
  headline: z.string(),
});

const CityInfoSchema = z.object({
  name: z.string(),
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number(),
  hasLocalData: z.boolean(),
});

const ResolvedAnchorSchema = z.object({
  input: z.string(),
  status: z.enum(["matched", "keyword", "guessed"]),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
  tags: z.array(z.string()),
  note: z.string(),
  proxies: z.array(z.object({ id: z.string(), name: z.string(), entityType: EntityTypeSchema })).optional(),
  placeCategory: z.string().optional(),
});

export const RunResultSchema = z.object({
  runId: z.string(),
  createdAt: z.number(),
  provider: ProviderSchema,
  providerLabel: z.string(),
  input: z.object({
    businessName: z.string().optional(),
    businessType: z.enum(BUSINESS_TYPES),
    businessTypeCustom: z.string().optional(),
    city: z.string(),
    anchors: z.array(z.string()),
    goals: GoalsSchema.optional(),
  }),
  resolvedAnchors: z.array(ResolvedAnchorSchema),
  plannedKinds: z.array(PartnerKindSchema),
  partners: z.array(PartnerSchema),
  topPicks: z.array(TopPickSchema),
  city: CityInfoSchema.nullable(),
  headline: z.string(),
  notes: z.array(z.string()),
  limits: z.array(z.string()),
  stats: z.object({
    candidatesConsidered: z.number(),
    retries: z.number(),
    toolCalls: z.number(),
    elapsedMs: z.number(),
  }),
  normalization: NormalizationSchema.optional(),
  decisions: z
    .array(
      z.object({
        step: StepIdSchema.optional(),
        decision: z.string(),
        reason: z.string(),
        origin: DecisionOriginSchema,
        kind: PartnerKindSchema.optional(),
        subject: z.string().optional(),
      }),
    )
    .optional(),
  discoverSpecs: z.array(DiscoverSpecSchema).optional(),
  calls: z.array(QlooCallRecordSchema).optional(),
});

export const HeatmapSchema = z.object({
  runId: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  city: CityInfoSchema,
  spots: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      intensityA: z.number(),
      intensityB: z.number(),
      overlap: z.number(),
      rank: z.number().nullable(),
      why: z.string(),
    }),
  ),
  caption: z.string(),
});

const BriefSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  origin: z.enum(["data", "interpretation"]),
});

export const BriefSchema = z.object({
  runId: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  variant: z.number(),
  variantCount: z.number(),
  title: z.string(),
  format: z.string(),
  concept: z.string(),
  whyItFits: z.array(z.object({ text: z.string(), evidence: z.array(z.string()) })),
  firstStep: z.string(),
  plan: z.array(z.object({ when: z.string(), action: z.string() })),
  measure: z.array(z.string()),
  risks: z.array(z.string()),
  outreach: z.object({ subject: z.string(), body: z.string() }),
  limits: z.string(),
  generatedBy: z.enum(["template", "llm"]),
  model: z.string().optional(),
  tone: z.enum(["warm", "direct", "playful"]).optional(),
  length: z.enum(["short", "standard"]).optional(),
  sources: z.array(BriefSourceSchema).optional(),
});

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  partnerIds: z.array(z.string()).optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(600),
});

export const ChatResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    reply: ChatTurnSchema,
    /** How many more chat turns this run can still spend; lets the UI warn before the cap. */
    remaining: z.number().int().nonnegative(),
  }),
  // No LLM is configured — the client shows a calm "needs an AI key" note, not an error toast.
  z.object({ status: z.literal("disabled") }),
  // This run has spent its LLM_CHAT_BUDGET_PER_RUN replies.
  z.object({ status: z.literal("budget") }),
]);

export const AgentEventSchema: z.ZodType<AgentEvent> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_started"),
    runId: z.string(),
    provider: ProviderSchema,
    providerLabel: z.string(),
  }),
  z.object({
    type: z.literal("step_started"),
    step: StepIdSchema,
    title: z.string(),
  }),
  z.object({
    type: z.literal("tool_call"),
    step: StepIdSchema,
    callId: z.string(),
    tool: z.string(),
    args: z.string(),
  }),
  z.object({
    type: z.literal("tool_result"),
    step: StepIdSchema,
    callId: z.string(),
    tool: z.string(),
    summary: z.string(),
    ms: z.number(),
  }),
  z.object({
    type: z.literal("step_note"),
    step: StepIdSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal("retry"),
    step: StepIdSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal("decision"),
    step: StepIdSchema.optional(),
    decision: z.string(),
    reason: z.string(),
    origin: DecisionOriginSchema,
    kind: PartnerKindSchema.optional(),
    subject: z.string().optional(),
  }),
  z.object({
    type: z.literal("step_completed"),
    step: StepIdSchema,
    summary: z.string(),
  }),
  z.object({
    type: z.literal("result"),
    result: RunResultSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("cancelled"),
  }),
]);

const ProofItemSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  score: z.number(),
  rawAffinity: z.number().optional(),
  popularity: z.number().optional(),
});

const ProofKindGroupSchema = z.object({
  kind: PartnerKindSchema,
  callId: z.string().optional(),
  poolSize: z.number(),
  vennItems: z.array(ProofItemSchema),
  baselineItems: z.array(ProofItemSchema),
  note: z.string().optional(),
});

const ProofSummarySchema = z.object({
  kindsCompared: z.number(),
  avgVennScore: z.number(),
  avgBaselineScore: z.number(),
  avgDelta: z.number(),
  vennWins: z.number(),
  baselineWins: z.number(),
  ties: z.number(),
});

const ProofCallLogSchema = z.object({
  callId: z.string(),
  kind: PartnerKindSchema,
  poolSize: z.number(),
});

export const ProofResultSchema = z.object({
  runId: z.string(),
  baseline: z.enum(["popularity", "ai"]),
  narrative: z.string(),
  perKind: z.array(ProofKindGroupSchema),
  summary: ProofSummarySchema,
  caveats: z.array(z.string()),
  calls: z.array(ProofCallLogSchema),
  legacy: z.boolean(),
});

const CompareSignalSchema = z.object({
  label: z.string(),
  value: z.number(),
  median: z.number(),
});

export const ComparePayloadSchema = z.object({
  runId: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  sharedTags: z.array(z.string()),
  affinityToPartner: z.number(),
  affinityFromPartner: z.number(),
  popularityDelta: z.number(),
  signals: z.array(CompareSignalSchema),
  note: z.string(),
  source: z.enum(["qloo_tags", "computed_from_tags"]).optional(),
  tagScores: z
    .array(z.object({ label: z.string(), a: z.number(), b: z.number() }))
    .optional(),
});

const TasteAnchorCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["entity", "tag"]),
  type: z.string(),
  score: z.number(),
  popularity: z.number().optional(),
});

const TasteAnchorSchema = z.object({
  name: z.string(),
  kind: z.enum(["entity", "tag"]),
  id: z.string(),
  type: z.string(),
  origin: z.enum(["user", "qloo", "ai_suggested"]),
  via: z.enum(["swipe", "typed", "ai"]).optional(),
});

const AiAnchorSuggestionSchema = z.object({
  query: z.string(),
  kind: z.enum(["topic", "name"]),
  entityType: z.string(),
  why: z.string(),
  verified: TasteAnchorSchema.optional(),
  suggested: z.literal(true).optional(),
});

export const AnchorResolutionSchema = z.object({
  input: z.string(),
  status: z.enum(ANCHOR_STATUSES),
  entityCandidates: z.array(TasteAnchorCandidateSchema).default([]),
  topicCandidates: z.array(TasteAnchorCandidateSchema).default([]),
  candidates: z.array(TasteAnchorCandidateSchema).optional(),
  aiSuggestions: z.array(AiAnchorSuggestionSchema).optional(),
  note: z.string().optional(),
  verdict: z.enum(["rewrite", "too_broad", "no_close_match", "not_a_taste_signal", "sensitive"]).optional(),
  selected: TasteAnchorSchema.optional(),
});

export function parseBusinessInput(value: unknown): BusinessInput {
  return BusinessInputSchema.parse(value);
}

// ---------- Swipe cards (Setup "Swipe your crowd") ----------

const BusinessTypeSchema = z.enum(BUSINESS_TYPES);

export const CardKind = z.enum(["brand", "artist", "place", "topic"]);
export type CardKind = z.infer<typeof CardKind>;

/** Where a card came from. The server sets this; the UI turns it into the provenance line. */
export const CardProvenance = z.enum([
  "qloo_local", // live Qloo, location verified to change results
  "qloo_seed", // seeded name, id resolved on Qloo ahead of time
  "qloo_refill", // live Qloo, signalled by the person's Yeses
  "snapshot", // recorded from Qloo (snapshot provider)
  "sample", // mock provider, NOT from Qloo
]);
export type CardProvenance = z.infer<typeof CardProvenance>;

export const SwipeCard = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(48),
  kind: CardKind,
  provenance: CardProvenance,
  /** Refill only: the name of the Yes that caused it. */
  because: z.string().max(48).optional(),
  /** Exactly what becomes a chip if the person says Yes. */
  anchor: z.object({
    kind: z.enum(["entity", "tag"]),
    id: z.string().min(1).max(120),
    // Short form, exactly as the typed resolver writes it: "brand", "artist", "place", "topic"…
    // (see shared/anchorType.ts), so a swiped run and a typed run send the same request.
    type: z.string().max(80),
  }),
});
export type SwipeCard = z.infer<typeof SwipeCard>;

const CardCitySchema = z
  .string()
  .transform((value) => cleaned(value))
  .pipe(z.string().min(2, "Enter a city.").max(80));

export const CardsRequest = z.object({
  businessType: BusinessTypeSchema,
  city: CardCitySchema,
});
export type CardsRequest = z.infer<typeof CardsRequest>;

export const CardsResponse = z.object({
  status: z.enum(["ok", "unsupported_city", "unavailable"]),
  cards: z.array(SwipeCard).max(20),
  note: z.string().max(160).optional(),
});
export type CardsResponse = z.infer<typeof CardsResponse>;

export const RefillRequest = z.object({
  businessType: BusinessTypeSchema,
  city: CardCitySchema,
  likedIds: z.array(z.string().min(1).max(120)).min(1).max(6),
  excludeIds: z.array(z.string().min(1).max(120)).max(40),
});
export type RefillRequest = z.infer<typeof RefillRequest>;

export const RefillResponse = z.object({
  status: z.enum(["ok", "unavailable"]),
  cards: z.array(SwipeCard).max(6),
});
export type RefillResponse = z.infer<typeof RefillResponse>;
