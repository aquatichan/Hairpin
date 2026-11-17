import { z } from "zod";

const line = z.string().trim().max(600);

export const barberBriefSchema = z.object({
  styleName: z.string().trim().min(1).max(80),
  top: line,
  sides: line,
  back: line,
  fringeOrPart: line,
  textureAndFinish: line,
  styling: line,
  maintenance: line,
  askYourBarber: z.array(z.string().trim().max(200)).max(8),
  uncertain: z.array(z.string().trim().max(200)).max(8),
});

export type BarberBrief = z.infer<typeof barberBriefSchema>;

export const briefSections: { key: Exclude<keyof BarberBrief, "styleName" | "askYourBarber" | "uncertain">; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "sides", label: "Sides" },
  { key: "back", label: "Back" },
  { key: "fringeOrPart", label: "Fringe / part" },
  { key: "textureAndFinish", label: "Texture & finish" },
  { key: "styling", label: "Styling" },
  { key: "maintenance", label: "Maintenance" },
];

export const briefRequestSchema = z.object({
  lookName: z.string().trim().min(1).max(80),
  tweak: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});
