import "server-only";
import type { AuthedUser } from "./auth";
import type { EventName, EventProps } from "@/lib/events";
import { logJson } from "./monitor";

let warnedMissing = false;

/**
 * Records a product event as the signed-in user. Best effort: a missing table (migration not
 * run) or a failed insert is logged once and never fails the request it belongs to.
 */
export async function recordEvents(user: AuthedUser, events: { name: EventName; deckId?: string; props?: EventProps; at?: string }[]): Promise<void> {
  if (!events.length) return;
  const rows = events.map((e) => ({ user_id: user.userId, name: e.name, deck_id: e.deckId ?? null, props: e.props ?? {}, ...(e.at ? { created_at: e.at } : {}) }));
  const { error } = await user.db.from("product_events").insert(rows);
  if (!error) return;
  const missing = error.code === "PGRST205" || error.code === "42P01";
  if (missing && warnedMissing) return;
  warnedMissing ||= missing;
  logJson("warn", { event: "activity_insert_failed", code: error.code, missing });
}

export const recordEvent = (user: AuthedUser, name: EventName, deckId?: string, props?: EventProps) => recordEvents(user, [{ name, deckId, props }]);
