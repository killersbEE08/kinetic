import "server-only";
import { z } from "zod";
import { Id } from "@/lib/deck/schema";

// Comments on decks: shared row shape and request validation for the owner and viewer routes.

export const COMMENT_COLS = "id, deck_id, slide_id, element_id, parent_id, link_id, author_id, author_name, author_email, body, resolved_at, created_at";

export interface CommentRow {
  id: string;
  deck_id: string;
  slide_id: string;
  element_id: string | null;
  parent_id: string | null;
  link_id: string | null;
  author_id: string | null;
  author_name: string;
  author_email: string | null;
  body: string;
  resolved_at: string | null;
  created_at: string;
  share_links?: { name: string } | { name: string }[] | null;
}

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NewComment = z.object({
  slideId: Id,
  elementId: Id.optional(),
  parentId: z.string().regex(UUID_RX).optional(),
  body: z.string().trim().min(1).max(2000),
});

/** What the owner sees. Viewers get `forViewer` (no emails, no ids of other people). */
export function toComment(r: CommentRow, ownerId?: string) {
  const link = Array.isArray(r.share_links) ? r.share_links[0] : r.share_links;
  return {
    id: r.id,
    deckId: r.deck_id,
    slideId: r.slide_id,
    elementId: r.element_id,
    parentId: r.parent_id,
    linkId: r.link_id,
    linkName: link?.name ?? null,
    authorName: r.author_name,
    authorEmail: r.author_email,
    byOwner: !!ownerId && r.author_id === ownerId,
    body: r.body,
    resolved: !!r.resolved_at,
    createdAt: r.created_at,
  };
}

export function forViewer(r: CommentRow) {
  return { id: r.id, slideId: r.slide_id, parentId: r.parent_id, authorName: r.author_name, byOwner: !!r.author_id, body: r.body, resolved: !!r.resolved_at, createdAt: r.created_at };
}

/** Most comments one share link can collect (spam guard). */
export const MAX_COMMENTS_PER_LINK = 300;
