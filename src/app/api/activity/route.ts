import { z } from "zod";
import { ActivityEvent, SERVER_EVENTS } from "@/lib/events";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/auth";
import { recordEvents } from "@/lib/server/events";
import { logJson } from "@/lib/server/monitor";

const Body = z.object({ events: z.array(ActivityEvent).min(1).max(25) });

// POST /api/activity: product events from the browser (present, download, first edit, timings).
// Events the server already records itself are ignored. Timings are also logged as JSON lines.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  const body = Body.safeParse(await readJson(req, 20_000));
  if (!body.success) throw new HttpError(400, "Invalid events.", "invalid_input");
  const now = Date.now();
  const events = body.data.events
    .filter((e) => !SERVER_EVENTS.has(e.name))
    // Clock skew guard: keep the browser's time only if it is within the last hour.
    .map((e) => ({ ...e, at: e.at && Math.abs(now - new Date(e.at).getTime()) < 3_600_000 ? e.at : undefined }));
  for (const e of events) if (e.name === "timing") logJson("info", { event: "timing", ...e.props });
  await recordEvents(user, events);
  return new Response(null, { status: 204 });
});
