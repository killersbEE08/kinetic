import "server-only";
import type { z } from "zod";
import { config, env } from "../server/env";
import { HttpError } from "../server/auth";

// Thin Gemini REST client (generateContent). Uses fetch only, so it runs on Cloudflare Workers.
// All vendor-specific code lives here (docs/04 §5.5 "model router").

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export interface JsonCallOptions<T> {
  system: string;
  user: string;
  /** JSON Schema sent to Gemini (only keywords Gemini supports). */
  jsonSchema: Record<string, unknown>;
  /** Zod schema used to validate the reply. */
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/**
 * Gemini refuses large schemas that carry length/count bounds (400 INVALID_ARGUMENT, seen with
 * gemini-3.8-flash). We send the schema without them; Zod still enforces every limit on our side.
 */
const BOUND_KEYS = new Set(["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"]);
export function looseSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(looseSchema);
  if (!s || typeof s !== "object") return s;
  return Object.fromEntries(Object.entries(s).filter(([k]) => !BOUND_KEYS.has(k)).map(([k, v]) => [k, looseSchema(v)]));
}

async function callOnce(model: string, body: unknown, timeoutMs: number): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY")! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    console.error("[gemini] http", res.status, data.error?.status, data.error?.message);
    if (res.status === 429) throw new HttpError(503, "The AI service is busy. Try again in a minute.", "ai_busy");
    throw new HttpError(502, "The AI service returned an error. Try again.", "ai_error");
  }
  if (data.promptFeedback?.blockReason) throw new HttpError(422, "The AI declined this request. Try rephrasing it.", "ai_blocked");
  const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new HttpError(502, "The AI returned an empty answer. Try again.", "ai_empty");
  return text;
}

/**
 * Calls Gemini in JSON mode and validates the result. On a validation failure it makes one
 * repair attempt that includes the error (docs/04 §5.2), then gives up.
 */
export async function geminiJson<T>(opts: JsonCallOptions<T>): Promise<T> {
  const model = config.geminiModel();
  const generationConfig = {
    responseMimeType: "application/json",
    responseJsonSchema: looseSchema(opts.jsonSchema),
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    temperature: 0.4,
  };
  const contents = [{ role: "user", parts: [{ text: opts.user }] }];
  const base = { systemInstruction: { parts: [{ text: opts.system }] }, contents, generationConfig };
  const timeout = opts.timeoutMs ?? 60_000;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const body =
      attempt === 0
        ? base
        : {
            ...base,
            contents: [
              ...contents,
              { role: "user", parts: [{ text: `Your previous answer was not valid: ${lastError.slice(0, 600)}. Reply again with JSON that matches the schema exactly.` }] },
            ],
          };
    const text = await callOnce(model, body, timeout);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      lastError = "the reply was not JSON";
      continue;
    }
    const parsed = opts.schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  console.error("[gemini] invalid output after repair:", lastError);
  throw new HttpError(502, "The AI's answer did not fit the slide format. Try again.", "ai_invalid");
}

export const geminiModelName = () => config.geminiModel();
