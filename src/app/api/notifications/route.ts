import { z } from "zod";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";

// GET /api/notifications: the bell. Latest 30 alerts and how many are unread.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  const [list, unread] = await Promise.all([
    user.db.from("notifications").select("id, kind, deck_id, title, body, url, read_at, created_at").order("created_at", { ascending: false }).limit(30),
    user.db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error) dbError(list.error, "Could not load alerts.");
  return json({
    unread: unread.count ?? 0,
    items: (list.data ?? []).map((n) => ({ id: String(n.id), kind: n.kind, deckId: n.deck_id, title: n.title, body: n.body, url: n.url, read: !!n.read_at, createdAt: n.created_at })),
  });
});

const Read = z.object({ ids: z.array(z.string().regex(/^\d{1,18}$/)).max(100).optional(), all: z.boolean().optional() });

// POST /api/notifications: mark alerts read ({ ids } or { all: true }).
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  const body = Read.safeParse(await readJson(req, 4_000));
  if (!body.success || (!body.data.all && !body.data.ids?.length)) throw new HttpError(400, "Nothing to mark.", "invalid_input");
  const base = user.db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  const { error } = await (body.data.all ? base.eq("user_id", user.userId) : base.in("id", body.data.ids!.map(Number)));
  if (error) dbError(error, "Could not update alerts.");
  return json({ ok: true });
});
