// Four product launch decks. All companies and numbers are fictional.
import { big, chartFocus, close, compare, iconGrid, imageStatement, kpis, product, statement, steps, title, titleImage, type DeckTemplate } from "./dsl";

export const LAUNCH: DeckTemplate[] = [
  {
    id: "orbit-offline",
    name: "Orbit Notes offline mode launch",
    company: "Orbit Notes",
    category: "launch",
    summary: "Announcing offline mode: what's new, why, and how to turn it on.",
    themeId: "mono",
    intensity: "standard",
    brand: { name: "Orbit Notes", primary: "#7C3AED", font: "sans", mark: "layers", pattern: "orbits" },
    highlights: [0, 2, 1],
    slides: [
      title("Offline mode for Orbit Notes", "Write, search and sync without a connection. Available today."),
      imageStatement("Your notes now work on the train, the plane and the field site.", "desk-2"),
      product(
        "Everything you need, even with no signal",
        {
          device: "phone",
          screen: {
            app: "Orbit Notes",
            heading: "Offline · 3 notebooks saved",
            rows: [
              { label: "Site visit, Block C", sub: "Edited 4 minutes ago", tag: "Saved", tone: "ok" },
              { label: "Client call notes", sub: "2 photos attached", tag: "Saved", tone: "ok" },
              { label: "Inspection checklist", sub: "Will sync when you're online", tag: "Pending", tone: "warn" },
            ],
            cta: "Search all notes",
          },
        },
        [
          ["wifi-off", "Every note stored on the device"],
          ["search", "Search works across all notebooks"],
          ["refresh-cw", "Changes merge when you reconnect"],
        ],
      ),
      iconGrid("Why we built it", [
        ["message-square", "Top request", "Asked for in our last three surveys"],
        ["wifi-off", "Weak signal", "One in four sessions starts on a weak connection"],
        ["briefcase", "Field work", "Site teams lose notes when they lose signal"],
      ]),
      big(25, "%", "Of sessions start on a weak connection", "From app telemetry over the last 90 days"),
      steps("Turn it on in three steps", [
        ["wrench", "Open Settings, then Storage"],
        ["list-checks", "Choose the notebooks to keep offline"],
        ["cloud", "Orbit downloads them in the background"],
      ]),
      kpis("Beta results", [["Beta users", 5200], ["Sync conflicts per 1,000 edits", 0.4], ["Satisfaction out of 5", 4.7]]),
      close("Available today on all paid plans", "Free plans get offline access to one notebook.", "orbitnotes.example/offline"),
    ],
  },
  {
    id: "pantry-split",
    name: "Pantry POS split bills launch",
    company: "Pantry POS",
    category: "launch",
    summary: "A restaurant feature launch with pilot results and rollout details.",
    themeId: "paper",
    intensity: "standard",
    brand: { name: "Pantry POS", primary: "#C2410C", font: "display", mark: "utensils", pattern: "blocks" },
    highlights: [0, 2, 3],
    slides: [
      titleImage("Split bills in Pantry POS", "Tables can split by item, by seat or evenly, and pay by UPI", "restaurant"),
      iconGrid("The problem at the table", [
        ["users", "Every evening", "Groups ask to split almost every night"],
        ["calculator", "Done by hand", "Staff work out shares on the bill"],
        ["clock", "Slow turns", "Mistakes slow tables on busy nights"],
      ]),
      product(
        "One bill, many payments",
        {
          device: "phone",
          screen: {
            app: "Pantry POS",
            heading: "Table 12 · ₹3,840",
            rows: [
              { label: "Guest 1", sub: "Paneer tikka, lime soda", value: "₹1,120", tag: "Paid", tone: "ok" },
              { label: "Guest 2", sub: "Biryani, raita", value: "₹1,360", tag: "Paid", tone: "ok" },
              { label: "Guest 3", sub: "Dal makhani, naan", value: "₹1,360", tag: "Scan UPI", tone: "info" },
            ],
            cta: "Split evenly instead",
          },
        },
        [
          ["receipt", "Tap Split on the open bill"],
          ["users", "Drag items to each guest"],
          ["qr-code", "Each guest scans their own UPI code"],
        ],
      ),
      big(4, " min", "Faster table turnover", "Average across 30 pilot restaurants on Friday and Saturday nights"),
      compare("Before and after", ["Before", ["One bill, one card", "Staff work out shares"]], ["After", ["One bill, many payments", "Pantry works out shares"]]),
      kpis("Pilot numbers", [["Restaurants", 30], ["Bills split", 11400], ["Split errors reported", 0]]),
      close("Rolling out to all restaurants this month", "No extra fee. Update the app to version 5.2 to start.", "pantrypos.example/split"),
    ],
  },
  {
    id: "relay-previews",
    name: "Relay preview environments launch",
    company: "Relay",
    category: "launch",
    summary: "A developer-tool launch with setup steps, beta data and pricing.",
    themeId: "night",
    intensity: "expressive",
    brand: { name: "Relay", primary: "#60A5FA", font: "grotesk", mark: "git-pull-request", pattern: "grid" },
    highlights: [0, 2, 5],
    slides: [
      title("Preview environments in Relay", "A live copy of your app for every pull request"),
      statement("Review the change running, not just the diff."),
      product(
        "A URL for every pull request",
        {
          device: "browser",
          url: "pr-482.preview.relay.example",
          screen: {
            app: "Relay",
            heading: "Pull request #482 · New checkout",
            rows: [
              { label: "web", sub: "Built in 2m 41s", tag: "Ready", tone: "ok" },
              { label: "api", sub: "Seeded with test data", tag: "Ready", tone: "ok" },
              { label: "worker", sub: "Starting up", tag: "Booting", tone: "info" },
            ],
            cta: "Open preview",
          },
        },
        [
          ["link-2", "A unique URL for every pull request"],
          ["database", "Seeded test data, reset on each push"],
          ["timer", "Shuts down when the branch merges"],
        ],
      ),
      steps("Set up in three steps", [
        ["file-text", "Add the Relay file to your repository"],
        ["server", "Choose the services each preview needs"],
        ["git-pull-request", "Open a pull request and share the link"],
      ]),
      big(9, " min", "Median time to a ready preview", "Across 3,100 previews during the beta"),
      chartFocus("Reviews finish faster with previews", "bar", ["Without", "With"], [26, 15], " h", [15, " h", "Median hours from open to merge with previews"]),
      iconGrid("Pricing", [
        ["users", "Team plan", "Previews included"],
        ["building", "Business plan", "Previews included, with single sign-on"],
        ["timer", "Usage", "$0.04 per environment hour"],
      ]),
      close("Available today", "Turn it on from the project settings page.", "docs.relay.example/previews"),
    ],
  },
  {
    id: "strata-alerts",
    name: "Strata alerts launch",
    company: "Strata Analytics",
    category: "launch",
    summary: "Announcing metric alerts, with an example dashboard and beta results.",
    themeId: "grid",
    intensity: "standard",
    brand: { name: "Strata", primary: "#DC2626", font: "sans", mark: "activity", pattern: "waves" },
    highlights: [0, 3, 4],
    slides: [
      title("Alerts in Strata", "Get told when a metric moves, not a week later"),
      iconGrid("Why teams miss changes", [
        ["eye", "Nobody is looking", "Dashboards only help when someone checks"],
        ["calendar", "Weekly is too late", "Reviews catch problems days after they start"],
        ["bell", "Noisy thresholds", "Fixed limits fire too often and get muted"],
      ]),
      steps("How alerts work", [
        ["target", "Pick any metric on a dashboard"],
        ["activity", "Strata learns its normal range"],
        ["bell", "You get a message when it leaves it"],
      ]),
      product(
        "Thursday's drop, caught the same morning",
        {
          device: "browser",
          url: "strata.example/alerts/daily-signups",
          screen: {
            app: "Strata",
            heading: "Daily sign-ups dropped 37%",
            chart: [1020, 1040, 1010, 640, 610, 980, 1030],
            chartLabel: "Sign-ups per day, Monday to Sunday",
            rows: [
              { label: "Alert sent", sub: "Thursday 09:12 to #growth", tag: "Slack", tone: "info" },
              { label: "Normal range", sub: "960 to 1,090 a day", tag: "Learned", tone: "muted" },
              { label: "Also moved", sub: "Paid search clicks fell 41%", tag: "Related", tone: "warn" },
            ],
          },
        },
        [
          ["chart-line", "The chart and its normal range"],
          ["link-2", "Related metrics that moved too"],
          ["message-square", "Email, Slack or Microsoft Teams"],
        ],
      ),
      kpis("Beta results", [["Teams", 180], ["Alerts sent", 9400], ["Marked useful", 87, "%"]]),
      chartFocus("Beta teams spotted drops days sooner", "bar", ["Weekly review", "Strata alerts"], [3.4, 0.3], " days", [0.3, " days", "Median time to spot a drop with alerts"]),
      compare("Alerts versus thresholds", ["Fixed thresholds", ["One number for every day", "Fire on normal weekends"]], ["Strata alerts", ["Learn daily and weekly patterns", "Fire only on real changes"]]),
      close("Included in every plan from today", "Set up your first alert in under a minute.", "strata.example/alerts"),
    ],
  },
];
