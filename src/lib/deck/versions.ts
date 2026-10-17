// Version history helpers shared by the server, the demo backend and the editor.
import type { Deck } from "./schema";
import type { PatchOp } from "./patch";

export type VersionKind = "created" | "auto" | "before-ai" | "named" | "before-restore";

export interface VersionMeta {
  id: string;
  version: number;
  kind: VersionKind;
  label: string | null;
  createdAt: string;
  title: string;
  slideCount: number;
}

/** Keep at most this many automatic snapshots per deck. Named versions are never trimmed. */
export const MAX_AUTO_VERSIONS = 50;
/** An automatic snapshot is taken every this many saved edits. */
export const AUTO_EVERY = 25;

/**
 * Which snapshot (if any) to take of the deck *before* applying an edit.
 * `prevVersion` is the version the edit is based on.
 */
export function snapshotBefore(prevVersion: number, author: "user" | "ai"): VersionKind | null {
  if (author === "ai") return "before-ai";
  if (prevVersion > 0 && prevVersion % AUTO_EVERY === 0) return "auto";
  return null;
}

/** Ops that turn `current` into `target` in one undoable step (ids and version stay). */
export function restoreOps(current: Deck, target: Deck): PatchOp[] {
  const ops: PatchOp[] = [
    { op: "replace", path: "/title", value: target.title },
    { op: "replace", path: "/themeId", value: target.themeId },
    { op: "replace", path: "/motionIntensity", value: target.motionIntensity },
    { op: "replace", path: "/slides", value: structuredClone(target.slides) },
  ];
  if (target.brand) ops.push({ op: "add", path: "/brand", value: structuredClone(target.brand) });
  else if (current.brand) ops.push({ op: "remove", path: "/brand" });
  return ops;
}

export const VERSION_KIND_LABEL: Record<VersionKind, string> = {
  created: "Deck created",
  auto: "Autosaved version",
  "before-ai": "Before an AI edit",
  named: "Saved version",
  "before-restore": "Before restoring",
};
