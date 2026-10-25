import type { MetadataRoute } from "next";

const site = (process.env.NEXT_PUBLIC_APP_URL || "https://deckiq.app").replace(/\/+$/, "");

// Public marketing pages are indexed. The app, the API and private share links are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/d/", "/v/", "/dashboard", "/decks", "/new", "/assets", "/brand", "/shared", "/settings", "/redesign", "/billing/", "/sign-in", "/sign-up"],
    },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
