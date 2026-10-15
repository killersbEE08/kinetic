import { handle, HttpError, json, requireUser } from "@/lib/server/auth";
import { config } from "@/lib/server/env";
import { createPortalLink } from "@/lib/billing/dodo";

// POST /api/billing/portal — link to Dodo's customer portal (cancel, change card, invoices).
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { data } = await user.db.from("profiles").select("dodo_customer_id").eq("user_id", user.userId).maybeSingle();
  if (!data?.dodo_customer_id) throw new HttpError(404, "You don't have a paid plan yet.", "no_customer");
  const url = await createPortalLink(data.dodo_customer_id, `${config.appUrl()}/dashboard`);
  return json({ url });
});
