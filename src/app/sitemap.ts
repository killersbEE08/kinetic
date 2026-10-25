import type { MetadataRoute } from "next";
import { TEMPLATES } from "@/lib/deck/templates";

const site = (process.env.NEXT_PUBLIC_APP_URL || "https://deckiq.app").replace(/\/+$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/templates`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    ...TEMPLATES.map((t) => ({ url: `${site}/t/${t.id}`, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
