// Curated icon set (Lucide, ISC licence). Names are stored in decks; the renderer maps them
// to components. Keep this list small so only these icons end up in the bundle.
export const ICON_NAMES = [
  "receipt", "smartphone", "circle-check", "clock", "triangle-alert", "zap", "factory", "gauge", "fish",
  "thermometer", "qr-code", "snowflake", "calendar", "bell", "users", "stethoscope", "truck",
  "battery-charging", "map-pin", "file-text", "scale", "search", "cloud", "wifi-off", "refresh-cw",
  "utensils", "credit-card", "git-pull-request", "server", "database", "chart-line", "chart-column",
  "shield-check", "key-round", "door-open", "sun", "package", "shopping-bag", "book-open", "leaf",
  "droplets", "lightbulb", "target", "list-checks", "rocket", "trending-up", "wallet", "building",
  "heart", "globe", "lock", "layers", "timer", "banknote", "hand-coins", "store", "boxes", "briefcase",
  "graduation-cap", "calculator", "link-2", "table-2", "eye", "message-square", "award", "flag",
  "wrench", "landmark", "piggy-bank", "percent", "activity",
] as const;

export type IconName = (typeof ICON_NAMES)[number];
