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
