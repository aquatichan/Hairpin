import { z } from "zod";
import { HAIR_TYPES } from "./hair-types";

/** What the AI reads from a photo of the person's own hair. Shared by /api/analyze-hair and the client. */
export const hairAnalysisSchema = z.object({
  hairType: z.enum(HAIR_TYPES),
  length: z.enum(["short", "medium", "long"]),
  color: z.string().trim().min(1).max(40),
  density: z.enum(["fine", "medium", "thick"]),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string().trim().max(240),
});
export type HairAnalysis = z.infer<typeof hairAnalysisSchema>;
