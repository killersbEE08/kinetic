// Minimal RFC 6902 JSON Patch with inverse generation (for undo) and
// scope enforcement (so AI edits can never touch slides outside the user's selection).
import { Deck } from "./schema";

export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };

export class PatchError extends Error {}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function parsePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new PatchError(`Invalid JSON pointer: ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => {
      if (FORBIDDEN_KEYS.has(s)) throw new PatchError(`Forbidden key in path: ${s}`);
      return s;
    });
}

export function toPointer(parts: (string | number)[]): string {
  return parts.map((p) => "/" + String(p).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}

type Container = Record<string, unknown> | unknown[];

function resolveParent(doc: unknown, parts: string[]): { parent: Container; key: string } {
  if (parts.length === 0) throw new PatchError("Cannot operate on the document root");
  let node: unknown = doc;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) throw new PatchError(`Path not found: ${part}`);
      node = node[idx];
    } else if (node && typeof node === "object") {
      if (!Object.prototype.hasOwnProperty.call(node, part)) throw new PatchError(`Path not found: ${part}`);
      node = (node as Record<string, unknown>)[part];
    } else {
      throw new PatchError(`Path not found: ${part}`);
    }
  }
  if (!node || typeof node !== "object") throw new PatchError("Parent is not a container");
  return { parent: node as Container, key: parts[parts.length - 1] };
}

function getAt(doc: unknown, path: string): unknown {
  let node: unknown = doc;
  for (const part of parsePointer(path)) {
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) throw new PatchError(`Path not found: ${path}`);
      node = node[idx];
    } else if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, part)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      throw new PatchError(`Path not found: ${path}`);
    }
  }
  return node;
}

function arrayIndex(arr: unknown[], key: string, forInsert: boolean): number {
  if (forInsert && key === "-") return arr.length;
  const idx = Number(key);
  const max = forInsert ? arr.length : arr.length - 1;
  if (!/^\d+$/.test(key) || idx > max) throw new PatchError(`Invalid array index: ${key}`);
  return idx;
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

/** Applies one op in place and returns the inverse op(s), in the order they must be applied to undo. */
function applyOne(doc: unknown, op: PatchOp): PatchOp[] {
  switch (op.op) {
    case "test": {
      if (JSON.stringify(getAt(doc, op.path)) !== JSON.stringify(op.value)) throw new PatchError(`Test failed at ${op.path}`);
      return [];
    }
    case "add": {
      const parts = parsePointer(op.path);
      const { parent, key } = resolveParent(doc, parts);
      if (Array.isArray(parent)) {
        const idx = arrayIndex(parent, key, true);
        parent.splice(idx, 0, clone(op.value));
        return [{ op: "remove", path: toPointer([...parts.slice(0, -1), idx]) }];
      }
      const existed = Object.prototype.hasOwnProperty.call(parent, key);
      const previous = parent[key];
      parent[key] = clone(op.value);
      return existed ? [{ op: "replace", path: op.path, value: previous }] : [{ op: "remove", path: op.path }];
    }
    case "remove": {
      const parts = parsePointer(op.path);
      const { parent, key } = resolveParent(doc, parts);
      if (Array.isArray(parent)) {
        const idx = arrayIndex(parent, key, false);
        const [removed] = parent.splice(idx, 1);
        return [{ op: "add", path: op.path, value: removed }];
      }
      if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new PatchError(`Path not found: ${op.path}`);
      const removed = parent[key];
      delete parent[key];
      return [{ op: "add", path: op.path, value: removed }];
    }
    case "replace": {
      const parts = parsePointer(op.path);
      const { parent, key } = resolveParent(doc, parts);
      if (Array.isArray(parent)) {
        const idx = arrayIndex(parent, key, false);
        const previous = parent[idx];
        parent[idx] = clone(op.value);
        return [{ op: "replace", path: op.path, value: previous }];
      }
      if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new PatchError(`Path not found: ${op.path}`);
      const previous = parent[key];
      parent[key] = clone(op.value);
      return [{ op: "replace", path: op.path, value: previous }];
    }
    case "move": {
      if (op.path.startsWith(op.from + "/")) throw new PatchError("Cannot move a value into itself");
      const value = getAt(doc, op.from);
      const undoRemove = applyOne(doc, { op: "remove", path: op.from });
      const undoAdd = applyOne(doc, { op: "add", path: op.path, value });
      return [...undoAdd, ...undoRemove];
    }
    case "copy": {
      const value = getAt(doc, op.from);
      return applyOne(doc, { op: "add", path: op.path, value: clone(value) });
    }
  }
}

export interface ApplyResult<T> {
  doc: T;
  inverse: PatchOp[];
}

/** Applies ops to a copy of `doc`. Throws PatchError if any op fails (doc is untouched). */
export function applyPatch<T>(doc: T, ops: PatchOp[]): ApplyResult<T> {
  const next = structuredClone(doc);
  const inverse: PatchOp[] = [];
  for (const op of ops) inverse.unshift(...applyOne(next, op));
  return { doc: next, inverse };
}

/** Applies ops and validates the resulting deck against the schema. */
export function applyDeckPatch(deck: Deck, ops: PatchOp[]): ApplyResult<Deck> {
  const { doc, inverse } = applyPatch(deck, ops);
  const parsed = Deck.safeParse(doc);
  if (!parsed.success) {
    throw new PatchError(`Patch produces an invalid deck: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return { doc: parsed.data, inverse };
}

// ---------- Scope enforcement (PRD AI-7) ----------

export type EditScope =
  | { kind: "deck" }
  | { kind: "slide"; slideIds: string[] }
  | { kind: "element"; slideId: string; elementIds: string[] };

/**
 * Returns null if every op stays inside the scope; otherwise a human-readable reason.
 * Paths are checked against the deck *before* the patch is applied.
 */
export function checkScope(deck: Deck, ops: PatchOp[], scope: EditScope): string | null {
  for (const op of ops) {
    const paths = "from" in op ? [op.path, op.from] : [op.path];
    for (const path of paths) {
      const parts = parsePointer(path);
      // Ids are immutable for everyone.
      if (parts[parts.length - 1] === "id") return `Changing ids is not allowed (${path})`;
      if (parts[0] === "version") return "The version field is managed by the server";

      if (scope.kind === "deck") {
        if (!["slides", "title", "motionIntensity", "themeId"].includes(parts[0])) return `Path outside deck: ${path}`;
        continue;
      }

      // Slide scope may insert a new slide directly after a selected slide (e.g. "split this slide").
      if (scope.kind === "slide" && op.op === "add" && path === op.path && parts[0] === "slides" && parts.length === 2) {
        const before = deck.slides[Number(parts[1]) - 1];
        if (before && scope.slideIds.includes(before.id)) continue;
        return `New slides can only be added after the selected slide (${path})`;
      }

      if (parts[0] !== "slides" || parts.length < 2) return `Edit reaches outside the selected slide (${path})`;
      const slide = deck.slides[Number(parts[1])];
      if (!slide) return `Unknown slide at ${path}`;

      if (scope.kind === "slide") {
        if (!scope.slideIds.includes(slide.id)) return `Slide ${Number(parts[1]) + 1} is outside the selection`;
        if (parts.length === 2 && op.op !== "replace") return `Only replacing the selected slide is allowed (${path})`;
        continue;
      }
      if (parts.length < 3) return `Edit reaches outside the selected element (${path})`;

      if (slide.id !== scope.slideId) return `Slide ${Number(parts[1]) + 1} is outside the selection`;
      if (parts[2] !== "elements" || parts.length < 4) return `Edit reaches outside the selected element (${path})`;
      const el = slide.elements[Number(parts[3])];
      if (!el || !scope.elementIds.includes(el.id)) return `Element at ${path} is outside the selection`;
    }
  }
  return null;
}
