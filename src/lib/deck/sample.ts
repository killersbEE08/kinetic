// Sample content used by the landing page demo and the "Try a sample" button.
// Clearly fictional company ("Ledgerly") so nothing reads as a real customer claim.
import { buildDeck } from "./build";
import type { Deck } from "./schema";
import { offlineOutline, offlineSlides } from "../ai/offline";
import { stabilizeIds } from "./templates";

export const SAMPLE_PROMPT = "Seed pitch for Ledgerly, a bookkeeping app for small shops in India";

export const SAMPLE_NOTES = `Small shop owners in India spend about 6 hours a week on bookkeeping. Most still use paper ledgers and WhatsApp photos of receipts. Mistakes show up at GST filing time and cost them penalties.

Ledgerly reads receipts and bank SMS messages and turns them into GST-ready books. Owners check one screen each evening instead of a notebook.

How it works: Snap a photo of each receipt. Ledgerly matches it to the bank SMS. Approve the day's entries in one tap.

Revenue: $18k MRR. Paying shops: 1,240. Monthly growth: 22%. Churn: 2.1%

There are 63 million small businesses in India. We start with 4 million kirana and pharmacy shops in tier-2 cities.

We charge ₹499 per month per shop. Gross margin is 81%.

We are raising $1.5M to hire 6 engineers and reach 10,000 paying shops in 18 months.`;

export function sampleDeck(themeId = "mono"): Deck {
  const input = { prompt: SAMPLE_PROMPT, notes: SAMPLE_NOTES, deckType: "pitch" as const, slideCount: "auto" as const, audience: "Seed investors", language: "English" };
  const outline = offlineOutline(input);
  const { deck } = buildDeck({
    title: "Ledgerly",
    slides: offlineSlides({ ...outline, slides: outline.slides.map((s, i) => (i === 0 ? { ...s, title: "Ledgerly" } : s)) }),
    themeId,
    intensity: "standard",
    sourceText: SAMPLE_PROMPT + "\n" + SAMPLE_NOTES,
  });
  // Stable ids so server and client renders match.
  return stabilizeIds(deck, `sample-${themeId}`);
}
