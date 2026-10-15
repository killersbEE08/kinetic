import { z } from "zod";
import { handle, HttpError, json, readJson, requireUser, ensureProfile } from "@/lib/server/auth";
import { config } from "@/lib/server/env";
import { createCheckout } from "@/lib/billing/dodo";

const Body = z.object({ plan: z.enum(["pro", "team"]), seats: z.number().int().min(1).max(500).optional() });

// POST /api/billing/checkout — creates a Dodo Payments checkout session for the signed-in user.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  await ensureProfile(user);
  if (!config.dodoEnabled()) throw new HttpError(503, "Payments are not configured yet.", "billing_disabled");
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "Choose a plan.", "invalid_input");
  const app = config.appUrl();
  const url = await createCheckout({
    plan: body.data.plan,
    seats: body.data.seats,
    userId: user.userId,
    email: user.email,
    returnUrl: `${app}/billing/return`,
    cancelUrl: `${app}/pricing`,
  });
  return json({ url });
});
