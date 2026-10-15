// Plan catalog shown on the landing and pricing pages (docs/05 §4). Client-safe.
export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "",
    india: "₹0",
    blurb: "Try Kinetic on a real deck.",
    features: ["3 decks", "100 AI credits a month", "All 6 themes and 20 layouts", "Present in the browser"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$16",
    period: "per month, billed yearly ($20 monthly)",
    india: "₹499 a month",
    blurb: "For founders and marketers who present every week.",
    features: ["Unlimited decks", "2,000 AI credits a month", "Free-form AI edits with Gemini", "No Kinetic badge"],
  },
  {
    id: "team",
    name: "Team",
    price: "$30",
    period: "per seat per month, billed yearly",
    india: "₹999 per seat a month",
    blurb: "Shared decks for a team.",
    features: ["Everything in Pro", "4,000 AI credits per seat", "Seat-based billing", "Priority support"],
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];
