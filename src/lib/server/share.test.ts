import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ env: (k: string) => (k === "SHARE_SIGNING_SECRET" ? "test-secret-that-is-long-enough-123" : undefined) }));

const share = await import("./share");

describe("share links", () => {
  it("makes unguessable ids that pass the id check", () => {
    const ids = new Set(Array.from({ length: 50 }, () => share.newShareId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(share.SHARE_ID_RX.test(id)).toBe(true);
    expect(share.SHARE_ID_RX.test("../../etc")).toBe(false);
  });

  it("viewer session tokens only work for their own link and session", async () => {
    const t = await share.sessionToken("linkA", 42);
    expect(await share.verifySessionToken("linkA", t)).toBe(42);
    expect(await share.verifySessionToken("linkB", t)).toBeNull();
    expect(await share.verifySessionToken("linkA", t.replace(/^42\./, "43."))).toBeNull();
    expect(await share.verifySessionToken("linkA", t.slice(0, -2) + "xx")).toBeNull();
    expect(await share.verifySessionToken("linkA", null)).toBeNull();
    expect(await share.verifySessionToken("linkA", "0.abc")).toBeNull();
  });

  it("hashes passwords with a salt and checks them", async () => {
    const a = await share.hashPassword("hunter22");
    const b = await share.hashPassword("hunter22");
    expect(a).not.toBe(b);
    expect(a.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await share.verifyPassword("hunter22", a)).toBe(true);
    expect(await share.verifyPassword("hunter23", a)).toBe(false);
    expect(await share.verifyPassword("hunter22", "plain-text")).toBe(false);
  });

  it("only serves photos that are in the shared snapshot", () => {
    const snap = { brand: { logo: "asset:as1111111111" }, slides: [{ elements: [{ type: "image", src: "asset:as2222222222" }, { type: "image", src: "https://images.unsplash.com/photo-1" }] }] };
    const ids = share.snapshotAssetIds(snap);
    expect([...ids].sort()).toEqual(["as1111111111", "as2222222222"]);
  });

  it("knows when a link is live", () => {
    expect(share.linkLive({ revoked_at: null, expires_at: null })).toBe(true);
    expect(share.linkLive({ revoked_at: new Date().toISOString(), expires_at: null })).toBe(false);
    expect(share.linkLive({ revoked_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    expect(share.deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("phone");
  });
});
