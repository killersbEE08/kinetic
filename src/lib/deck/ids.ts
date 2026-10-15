// URL-safe ids matching the schema's Id regex (lowercase, 8–32 chars).
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newId(prefix = "", length = 14): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out.slice(0, 32);
}
