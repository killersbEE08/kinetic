import "server-only";
import type { Deck } from "@/lib/deck/schema";
import type { VersionKind, VersionMeta } from "@/lib/deck/versions";
import type { AuthedUser } from "./auth";

/**
 * Stores a snapshot of `doc`. Best effort: a missing table (migration not run yet) or a failed
 * insert is logged and never blocks the save it accompanies.
 */
export async function takeSnapshot(user: AuthedUser, deckId: string, doc: Deck, kind: VersionKind, label: string | null = null): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await user.db.from("deck_snapshots").insert({
    deck_id: deckId,
    version: doc.version,
    kind,
    label,
    title: doc.title.slice(0, 200),
    slide_count: doc.slides.length,
    doc,
    author_id: user.userId,
  });
  if (!error) return { ok: true };
  const missingTable = error.code === "PGRST205" || error.code === "42P01";
  if (!missingTable) console.warn("[versions] snapshot failed", error.code);
  return { ok: false, missingTable };
}

export function toVersionMeta(r: { id: number; version: number; kind: string; label: string | null; created_at: string; title: string; slide_count: number }): VersionMeta {
  return { id: String(r.id), version: r.version, kind: r.kind as VersionKind, label: r.label, createdAt: r.created_at, title: r.title, slideCount: r.slide_count };
}
