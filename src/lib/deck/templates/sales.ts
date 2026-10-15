// Four sales proposals. All companies, customers and numbers are fictional.
import { big, body, chartFocus, close, compare, iconGrid, kpis, product, split, statement, timeline, title, titleImage, type DeckTemplate } from "./dsl";

export const SALES: DeckTemplate[] = [
  {
    id: "bramble-retail",
    name: "Bramble HR proposal for a retail chain",
    company: "Bramble HR",
    category: "sales",
    summary: "An onboarding proposal that restates the buyer's problem and proposes a pilot.",
    themeId: "studio",
    intensity: "calm",
    brand: { name: "Bramble", primary: "#15803D", font: "display", mark: "leaf", pattern: "leaf" },
    highlights: [0, 3, 5],
    slides: [
      titleImage("Bramble for Northstar Retail", "Faster onboarding for 1,200 store staff a year", "aisle"),
      iconGrid("What we heard from your team", [
        ["clock", "Up to 9 days", "New hires wait that long for a first shift"],
        ["file-text", "Paper in every store", "Forms are collected and posted by hand"],
        ["calendar", "Admin Mondays", "Store managers lose a day each week"],
      ], "Use their words from the discovery call."),
      statement("New hires ready for their first shift in two days."),
      product(
        "Onboarding on the phone they already have",
        {
          device: "phone",
          screen: {
            app: "Bramble",
            heading: "Welcome to Northstar, Riya",
            rows: [
              { label: "Offer letter", sub: "Signed on Monday", tag: "Done", tone: "ok" },
              { label: "ID and bank details", sub: "Checked the same day", tag: "Done", tone: "ok" },
              { label: "Store safety video", sub: "12 minutes", tag: "Next", tone: "info" },
            ],
            cta: "First shift: Wednesday 9:00",
          },
        },
        [
          ["smartphone", "Offer and documents signed on the phone"],
          ["shield-check", "ID and bank details checked the same day"],
          ["graduation-cap", "Training assigned before day one"],
        ],
      ),
      kpis("Results at similar retailers", [["Days to first shift", 2], ["Paper forms removed", 100, "%"], ["Manager hours saved a month", 14]]),
      timeline("Rollout plan", [
        ["Week 1", "Set up 10 pilot stores"],
        ["Month 1", "Weekly check-ins with your HR team"],
        ["Month 2", "Roll out to all 140 stores"],
        ["Month 3", "Payroll integration live"],
      ]),
      body("Pricing", "₹180 per active employee per month, billed annually. The pilot in 10 stores is free for 30 days."),
      close("Next step: start the pilot on 1 November", "We'll set up the first 10 stores with your HR team in one week.", "sales@bramble.example"),
    ],
  },
  {
    id: "corvid-hospital",
    name: "Corvid access control proposal for a hospital",
    company: "Corvid Security",
    category: "sales",
    summary: "A security proposal with a product view, timeline and audit-focused comparison.",
    themeId: "night",
    intensity: "standard",
    brand: { name: "Corvid", primary: "#3B82F6", font: "grotesk", mark: "shield-check", pattern: "grid" },
    highlights: [0, 2, 3],
    slides: [
      titleImage("Corvid for St. Agnes Hospital", "Access control for 3 sites and 2,400 staff", "corridor-2"),
      iconGrid("Your priorities", [
        ["lock", "Restrict by role", "Pharmacy and records rooms for the right staff"],
        ["key-round", "Remove access fast", "On the day someone leaves"],
        ["award", "Pass the audit", "Clean access records for accreditation"],
      ]),
      product(
        "Every door, every badge, one log",
        {
          device: "browser",
          url: "stagnes.corvid.example/doors/pharmacy-2",
          screen: {
            app: "Corvid",
            heading: "Pharmacy store · Level 2",
            rows: [
              { label: "Nurse badge 2231", sub: "07:58 entry", tag: "Allowed", tone: "ok" },
              { label: "Contractor 0412", sub: "08:14 entry attempt", tag: "Denied", tone: "warn" },
              { label: "Leaver: J. Thomas", sub: "Access removed 6 min after the HR update", tag: "Removed", tone: "info" },
            ],
            cta: "Export audit report",
          },
        },
        [
          ["door-open", "Badges and phones open doors by role"],
          ["refresh-cw", "HR changes update access within minutes"],
          ["file-text", "Every entry logged for audits"],
        ],
      ),
      big(6, " min", "From HR change to updated door access", "Median across our hospital customers"),
      compare("Today versus with Corvid", ["Today", ["Keys and shared door codes", "Manual audit logs"]], ["With Corvid", ["Role-based badges", "Audit report in one click"]]),
      kpis("Hospital customers", [["Hospitals", 48], ["Doors managed", 31000], ["Audit findings on access", 0]]),
      timeline("Ten weeks to all three sites", [
        ["Weeks 1 to 2", "Survey doors and network"],
        ["Weeks 3 to 6", "Readers at the main site"],
        ["Weeks 7 to 10", "Roll out to both clinics"],
      ]),
      close("Proposal valid until 30 November", "Includes hardware, installation and three years of support.", "hospitals@corvid.example"),
    ],
  },
  {
    id: "lumen-solar",
    name: "Lumen Solar proposal for warehouses",
    company: "Lumen Solar",
    category: "sales",
    summary: "A rooftop solar proposal with per-site generation and financing options.",
    themeId: "paper",
    intensity: "standard",
    brand: { name: "Lumen Solar", primary: "#B45309", font: "sans", mark: "sun", pattern: "rays" },
    highlights: [0, 2, 3],
    slides: [
      titleImage("Rooftop solar for Meridian Logistics", "A proposal for 5 warehouses in Gujarat", "solar-field"),
      big(38, "%", "Lower electricity bill", "Estimated year-one saving across all 5 sites"),
      chartFocus("Surat generates the most power", "bar", ["Surat", "Vadodara", "Rajkot", "Bharuch", "Anand"], [410, 360, 290, 240, 180], " MWh", [410, " MWh", "Estimated yearly generation at Surat"]),
      split("Everything from design to cleaning", "solar-roof", [
        ["file-text", "Design, permits and grid connection"],
        ["sun", "Panels, inverters and mounting"],
        ["wrench", "Monitoring and cleaning for 10 years"],
      ]),
      compare("Financing options", ["Buy", ["Payback in 4.1 years", "You own the system"]], ["Lease", ["No upfront cost", "Fixed rate per unit for 15 years"]]),
      timeline("Project timeline", [
        ["Week 1", "Site surveys"],
        ["Week 6", "Permits and design done"],
        ["Week 14", "Installation complete"],
        ["Week 15", "Live monitoring starts"],
      ]),
      close("Next step: site surveys", "We can survey all five sites in the first week of December.", "projects@lumensolar.example"),
    ],
  },
  {
    id: "parcelpoint-d2c",
    name: "Parcelpoint proposal for a D2C brand",
    company: "Parcelpoint",
    category: "sales",
    summary: "A same-day delivery proposal built around the buyer's own numbers.",
    themeId: "signal",
    intensity: "expressive",
    brand: { name: "Parcelpoint", primary: "#FB7185", font: "grotesk", mark: "package", pattern: "blocks" },
    highlights: [0, 3, 4],
    slides: [
      title("Parcelpoint for Kaya Skincare", "Same-day delivery in 6 metro cities"),
      split("What we learned on our call", "warehouse", [
        ["map-pin", "58% of your orders come from 6 cities"],
        ["clock", "Customers wait 3 to 5 days today"],
        ["wallet", "Returns cost you ₹140 per order"],
      ]),
      statement("Order by 2 pm, delivered by 9 pm."),
      product(
        "Your customers watch it arrive",
        {
          device: "phone",
          screen: {
            app: "Parcelpoint",
            heading: "Order KY-20931",
            rows: [
              { label: "Ordered", sub: "1:42 pm", tag: "Done", tone: "ok" },
              { label: "Packed at Andheri hub", sub: "3:05 pm", tag: "Done", tone: "ok" },
              { label: "Out for delivery", sub: "Arriving by 9 pm", tag: "Live", tone: "info" },
            ],
            cta: "Track on the map",
          },
        },
        [
          ["boxes", "Ship stock to our city warehouses"],
          ["link-2", "Connect your store in one click"],
          ["truck", "Same-day delivery appears at checkout"],
        ],
      ),
      kpis("What brands like yours see", [["Repeat purchase rate", 19, "%"], ["Fewer delivery complaints", 42, "%"], ["Return cost per order", 85, "₹"]]),
      iconGrid("Pricing", [
        ["truck", "Same-day", "₹65 per order"],
        ["package", "Next-day", "₹45 per order"],
        ["calendar", "No minimums", "For the first three months"],
      ]),
      close("Next step: a 30-day trial in Mumbai", "We can go live within two weeks of receiving stock.", "brands@parcelpoint.example"),
    ],
  },
];
