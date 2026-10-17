import { describe, expect, it } from "vitest";
import { emailDomain, isDisposable, networkPrefix } from "./abuse";
import { creditNote } from "./credits";

describe("free-tier abuse signals", () => {
  it("spots throwaway email domains, including subdomains", () => {
    expect(isDisposable(emailDomain("a@mailinator.com"))).toBe(true);
    expect(isDisposable(emailDomain("a@x.yopmail.com"))).toBe(true);
    expect(isDisposable(emailDomain("a@gmail.com"))).toBe(false);
    expect(isDisposable(emailDomain("a@notmailinator.com"))).toBe(false);
    expect(isDisposable("newtemp.io", ["newtemp.io"])).toBe(true);
    expect(emailDomain("not-an-email")).toBeNull();
  });

  it("groups addresses by network, never keeping the full address", () => {
    expect(networkPrefix("49.36.120.7")).toBe("49.36.120.0/24");
    expect(networkPrefix("49.36.120.200")).toBe("49.36.120.0/24");
    expect(networkPrefix("2401:4900:1c2a:5d1::7")).toBe("2401:4900:1c2a::/48");
    expect(networkPrefix("10.0.0.4")).toBeNull();
    expect(networkPrefix("192.168.1.1")).toBeNull();
    expect(networkPrefix("unknown")).toBeNull();
  });

  it("explains reduced credits", () => {
    expect(creditNote(null)).toBeNull();
    expect(creditNote({ reason: "starter", full: 100, unlockAt: "2026-10-19T08:00:00Z" })).toMatch(/^Starter credits\. You get the full 100 on .+, or as soon as you share a deck\.$/);
    expect(creditNote({ reason: "crowded", full: 100, unlockAt: null })).toBe("Starter credits. You get the full 100 soon.");
    expect(creditNote({ reason: "disposable", full: 100, unlockAt: null })).toMatch(/permanent email/);
  });
});
