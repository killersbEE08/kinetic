// Abuse report reasons, shared by the report forms and the API.
export const ABUSE_REASONS = ["spam", "phishing", "malware", "harassment", "illegal", "copyright", "other"] as const;
export type AbuseReason = (typeof ABUSE_REASONS)[number];

export const REASON_LABEL: Record<AbuseReason, string> = {
  spam: "Spam or advertising",
  phishing: "Phishing or a scam (asks for passwords, payments or personal details)",
  malware: "Links to malware",
  harassment: "Harassment or hate",
  illegal: "Illegal content",
  copyright: "Copyright or trademark infringement",
  other: "Something else",
};

/** Reasons that make sense for a single comment. */
export const COMMENT_REASONS: AbuseReason[] = ["spam", "harassment", "phishing", "other"];
