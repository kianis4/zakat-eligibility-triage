import { z } from "zod";

/**
 * The organizer as the platform knows them. `relationshipToBeneficiary` is what
 * the organizer declared in a form field, which is not necessarily what the
 * story text claims; the extraction step captures the latter separately so a
 * reviewer can see the two side by side.
 */
export const Organizer = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  relationshipToBeneficiary: z.string().min(1).optional(),
});

/**
 * A campaign as a donor pasted it, or as an eval fixture records it.
 *
 * Only the title and the story are required, because they are what every campaign page shows.
 * The rest is optional because a donor may not have it, and the prompts print a line for a
 * field only when it is present. The organizer is never printed into a prompt at all.
 *
 * `category` stays a plain string on purpose. It is the campaign page's own
 * taxonomy, it changes without our involvement, and it is not evidence of
 * anything. Modelling it as an enum here would quietly turn a merchandising
 * label into a category of zakat recipient.
 */
export const CampaignInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  story: z.string().min(1),
  category: z.string().min(1).optional(),
  goalAmount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
  organizer: Organizer.optional(),
});

export type Organizer = z.infer<typeof Organizer>;
export type CampaignInput = z.infer<typeof CampaignInput>;
