import { z } from "zod";
import { GenerationInput, INTENSITIES, Outline } from "@/lib/deck/schema";
import { composeSlide } from "@/lib/deck/compose";
import { buildDeck } from "@/lib/deck/build";
import { getTheme } from "@/lib/deck/themes";
import { runQa } from "@/lib/deck/qa";
import { handle, HttpError, readJson, requireUser, ensureProfile } from "@/lib/server/auth";
import { sourceTextOf, writeSlides } from "@/lib/ai/server";

const Body = z.object({
  input: GenerationInput,
  outline: Outline,
  themeId: z.string().max(32),
  intensity: z.enum(INTENSITIES),
});

// POST /api/ai/generate — outline → deck, streamed as NDJSON so slides appear one by one (PRD GEN-1).
// Events: {type:"slide", index, slide} … {type:"done", deck, issues, engine} | {type:"error", error}
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "ai");
  await ensureProfile(user);
  const body = Body.safeParse(await readJson(req, 1_500_000));
  if (!body.success) throw new HttpError(400, "The outline is not valid. Go back a step and try again.", "invalid_input");
  const { input, outline, themeId, intensity } = body.data;
  const theme = getTheme(themeId);
  const source = sourceTextOf(input);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const { slides, engine } = await writeSlides(user, outline, input, (index, slotted) => {
          // Each streamed slide already passed the quality gates.
          const slide = composeSlide(slotted);
          const fixed = runQa({ id: "dkstreaming", version: 0, title: outline.title, themeId: theme.id, aspect: "16:9", motionIntensity: intensity, language: "en", slides: [slide] }, source).deck.slides[0];
          send({ type: "slide", index, slide: fixed });
        });
        const { deck, issues } = buildDeck({ title: outline.title, slides, themeId: theme.id, intensity, language: input.language, sourceText: source });
        send({ type: "done", deck, issues, engine });
      } catch (e) {
        const message = e instanceof HttpError ? e.message : "Generation stopped because of an error. Try again.";
        if (!(e instanceof HttpError)) console.error("[generate]", e);
        send({ type: "error", error: message, code: e instanceof HttpError ? e.code : "internal" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
