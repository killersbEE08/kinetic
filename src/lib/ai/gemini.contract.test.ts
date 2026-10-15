// Contract test: sends every JSON schema the app uses to the configured Gemini model.
// Catches the kind of break seen on 15 Oct 2026 (model started rejecting schema bounds).
// Runs nightly in CI and on demand: GEMINI_API_KEY=... pnpm test:gemini
import { describe, expect, it } from "vitest";
import { EDIT_ELEMENTS_JSON_SCHEMA, EDIT_SLIDES_JSON_SCHEMA, OUTLINE_JSON_SCHEMA, SLIDES_JSON_SCHEMA } from "./prompts";
import { looseSchema } from "./schema-loose";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

describe.skipIf(!KEY)(`Gemini contract (${MODEL})`, () => {
  const schemas = { outline: OUTLINE_JSON_SCHEMA, slides: SLIDES_JSON_SCHEMA, editSlides: EDIT_SLIDES_JSON_SCHEMA, editElements: EDIT_ELEMENTS_JSON_SCHEMA };
  for (const [name, schema] of Object.entries(schemas)) {
    it(`accepts the ${name} schema`, async () => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY! },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Return a minimal valid example for a 3 slide talk about tea." }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: looseSchema(schema), maxOutputTokens: 2048 },
        }),
      });
      const text = await res.text();
      expect(res.status, text.slice(0, 300)).toBe(200);
    }, 60_000);
  }
});
