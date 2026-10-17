// Product activity events, shared by the browser and the API. Used to measure activation:
// sign-up → outline → deck → first edit → present / share / download (within 24 hours).
// Events carry names, ids and small numbers only: never deck text, file names or emails.
import { z } from "zod";

export const EVENT_NAMES = [
  "outline_created",
  "deck_created",
  "deck_edited", // first edit of a deck in an editor session
  "ai_edit_accepted",
  "deck_presented",
  "deck_shared",
  "deck_downloaded",
  "review_opened",
  "review_fix_applied",
  "deck_pass_applied",
  "comment_added",
  "timing", // props.what: generate | outline | export_pptx | export_pdf | export_png | save
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Up to 12 flat values; strings are short labels (engine, format), not user content. */
export const EventProps = z
  .record(z.string().regex(/^[a-zA-Z_]{1,32}$/), z.union([z.string().max(40), z.number().finite(), z.boolean()]))
  .refine((p) => Object.keys(p).length <= 12, "Too many properties");
export type EventProps = z.infer<typeof EventProps>;

export const ActivityEvent = z.object({
  name: z.enum(EVENT_NAMES),
  deckId: z.string().regex(/^[a-z0-9_-]{8,32}$/).optional(),
  props: EventProps.default({}),
  at: z.string().datetime().optional(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

/** Events the server records itself in signed-in mode (the browser only sends them in demo mode). */
export const SERVER_EVENTS: ReadonlySet<EventName> = new Set(["outline_created", "deck_created", "deck_shared", "comment_added"]);
