import { describe, expect, it } from "vitest";
import { commentAlert, fmtMs, openedAlert, SLACK_WEBHOOK_RX, slackEscape, slideTitles, viewedAlert } from "./alerts";
import { ActivityEvent, EventProps } from "./events";

describe("share alerts", () => {
  it("names the link, never an address", () => {
    expect(openedAlert({ linkName: "Acme investors", deckTitle: "Seed round", device: "phone" }).title).toBe('Acme investors opened "Seed round"');
    expect(openedAlert({ linkName: "", deckTitle: "Seed round" }).title).toBe('Someone opened "Seed round"');
    expect(openedAlert({ linkName: "Acme", email: "ana@acme.test", deckTitle: "X" }).title).toContain("ana@acme.test");
  });

  it("summarises a visit with the slide that held attention", () => {
    const a = viewedAlert({ linkName: "Acme", deckTitle: "Q3", totalMs: 130_000, slideCount: 12, slidesSeen: 9, perSlide: [{ index: 1, ms: 20_000 }, { index: 3, ms: 58_000 }], titles: ["Q3", "Problem", "Plan", "Pricing"] });
    expect(a.title).toBe('Acme viewed "Q3" for 2m 10s');
    expect(a.body).toBe("Most time on slide 4, Pricing (58s). Saw 9 of 12 slides.");
  });

  it("formats comments and durations", () => {
    expect(commentAlert({ author: "Ana", deckTitle: "Q3", slideNumber: 2, body: "Is   this\nright?" })).toEqual({ title: 'Ana commented on slide 2 of "Q3"', body: "Is this right?" });
    expect(fmtMs(4_000)).toBe("4s");
    expect(fmtMs(3_725_000)).toBe("1h 2m");
  });

  it("only accepts Slack incoming webhooks", () => {
    expect(SLACK_WEBHOOK_RX.test("https://hooks.slack.com/services/T000/B000/abcdefghij")).toBe(true);
    expect(SLACK_WEBHOOK_RX.test("https://evil.example/services/T000")).toBe(false);
    expect(SLACK_WEBHOOK_RX.test("http://hooks.slack.com/services/T000/B000/abc")).toBe(false);
    expect(slackEscape("<a & b>")).toBe("&lt;a &amp; b&gt;");
  });

  it("reads slide headlines from a snapshot", () => {
    expect(slideTitles([{ elements: [{ type: "text", role: "body", content: "b" }, { type: "text", role: "h1", content: "Title" }] }, {}])).toEqual(["Title", ""]);
    expect(slideTitles(null)).toEqual([]);
  });
});

describe("activity events", () => {
  it("accepts small flat props and rejects content-sized values", () => {
    expect(ActivityEvent.safeParse({ name: "timing", props: { what: "generate", ms: 4200, ok: true } }).success).toBe(true);
    expect(ActivityEvent.safeParse({ name: "deck_edited", deckId: "dk_12345678" }).success).toBe(true);
    expect(ActivityEvent.safeParse({ name: "unknown_event" }).success).toBe(false);
    expect(EventProps.safeParse({ note: "x".repeat(41) }).success).toBe(false);
    expect(EventProps.safeParse(Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${"abcdefghijklm"[i]}`, i]))).success).toBe(false);
  });
});
