import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache binding yet: every page here is either static or client-rendered.
// Add an R2 incremental cache later if ISR is introduced.
export default defineCloudflareConfig({});
