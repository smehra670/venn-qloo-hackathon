import { z } from "zod";

/** Passthrough Zod schemas from Phase 0 probe fixtures. Probe wins over guessed shapes. */

export const QlooTagSchema = z
  .object({
    id: z.string().optional(),
    tag_id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough();

export const QlooExplainabilitySchema = z
  .object({
    "signal.interests.entities": z
      .array(
        z
          .object({
            entity_id: z.string().optional(),
            score: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const QlooEntitySchema = z
  .object({
    entity_id: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    types: z.array(z.string()).optional(),
    subtype: z.string().optional(),
    affinity: z.number().optional(),
    query: z
      .object({
        affinity: z.number().optional(),
        measurements: z
          .object({
            audience_growth: z.number().optional(),
          })
          .passthrough()
          .optional(),
        explainability: QlooExplainabilitySchema.optional(),
      })
      .passthrough()
      .optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(QlooTagSchema).optional(),
    popularity: z.number().optional(),
    location: z
      .object({
        lat: z.number().optional(),
        lon: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .passthrough()
      .optional(),
    disambiguation: z.string().optional(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    external: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type QlooEntity = z.infer<typeof QlooEntitySchema>;

export const SearchResponseSchema = z
  .object({
    success: z.boolean().optional(),
    results: z.array(QlooEntitySchema).optional(),
  })
  .passthrough();

export const HeatmapPointSchema = z
  .object({
    location: z
      .object({
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        lat: z.number().optional(),
        lon: z.number().optional(),
        geohash: z.string().optional(),
      })
      .passthrough()
      .optional(),
    query: z
      .object({
        affinity: z.number().optional(),
        affinity_rank: z.number().optional(),
        popularity: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const InsightsResponseSchema = z
  .object({
    success: z.boolean().optional(),
    results: z
      .object({
        entities: z.array(QlooEntitySchema).optional(),
        heatmap: z.array(HeatmapPointSchema).optional(),
        tags: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .passthrough()
      .optional(),
    query: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const TagsResponseSchema = z
  .object({
    success: z.boolean().optional(),
    results: z
      .object({
        tags: z.array(QlooTagSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** `/entities` returned 400 on hackathon probe with filter.entity.id — keep for future. */
export const EntitiesResponseSchema = z
  .object({
    success: z.boolean().optional(),
    results: z.array(QlooEntitySchema).optional(),
    error: z.unknown().optional(),
  })
  .passthrough();
