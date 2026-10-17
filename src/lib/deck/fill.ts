// Fills a deck that was opened before generation finished (see lib/client/genjob.ts).
// Pure: given the deck as it is now, what arrived, and what was put in each position, returns
// the patch ops to apply. Slides the user changed are never overwritten.
import type { PatchOp } from "./patch";
import type { Deck, Slide } from "./schema";

export const WRITING_TEXT = "Writing this slide…";
export const isWritingSlide = (s: Slide | undefined) => !!s?.elements.some((e) => e.type === "text" && e.content === WRITING_TEXT);

export interface FillState {
  /** Slide id for each position in the outline. */
  ids: string[];
  /** What was last put in the deck for each position. */
  inserted: (Slide | undefined)[];
  /** Slides streamed in since the last fill. */
  arrived: Map<number, Slide>;
  /** The finished deck (transitions, photos). Supersedes `arrived`. */
  final: Slide[] | null;
}

const same = (a: Slide | undefined, b: Slide | undefined) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

export function planFill(deck: Deck, st: FillState): { ops: PatchOp[]; inserted: (Slide | undefined)[]; kept: number } {
  const ops: PatchOp[] = [];
  const inserted = [...st.inserted];
  const order = deck.slides.map((s) => s.id);
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  let kept = 0;

  const updates = new Map(st.arrived);
  st.final?.forEach((s, pos) => updates.set(pos, s));

  for (const [pos, next] of [...updates.entries()].sort((a, b) => a[0] - b[0])) {
    const id = st.ids[pos];
    const at = order.indexOf(id);
    if (at < 0) continue; // the user deleted it
    const current = byId.get(id);
    if (same(current, next)) {
      inserted[pos] = next;
      continue;
    }
    if (same(current, inserted[pos])) {
      ops.push({ op: "replace", path: `/slides/${at}`, value: next });
      byId.set(id, next);
      inserted[pos] = next;
    } else if (isWritingSlide(inserted[pos])) {
      // The user typed into the stand-in: keep their version and add the real slide after it.
      const copy = { ...next, id: `${id.slice(0, 28)}w${pos}`.slice(0, 32) };
      if (order.length >= 100 || order.includes(copy.id)) continue;
      ops.push({ op: "add", path: `/slides/${at + 1}`, value: copy });
      order.splice(at + 1, 0, copy.id);
      byId.set(copy.id, copy);
      inserted[pos] = next;
    } else {
      kept++; // the user edited the real slide: keep their version
    }
  }
  return { ops, inserted, kept };
}
