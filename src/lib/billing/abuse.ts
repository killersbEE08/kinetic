// Common throwaway email domains. A backstop: Clerk's "Block disposable email domains" setting
// keeps a much larger, updated list and should be on. Add more with DISPOSABLE_EMAIL_DOMAINS
// (comma-separated) without a deploy of this file.
export const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "1secmail.com", "1secmail.net", "1secmail.org", "20minutemail.com", "33mail.com",
  "anonaddy.me", "armyspy.com", "burnermail.io", "byom.de", "cuvox.de", "dayrep.com", "discard.email", "dispostable.com",
  "einrot.com", "emailfake.com", "emailondeck.com", "emltmp.com", "esiix.com", "fakeinbox.com", "fakemail.net", "fakemailgenerator.com",
  "fleckens.hu", "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.info",
  "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "grr.la", "gustr.com", "harakirimail.com", "inboxkitten.com",
  "jourrapide.com", "linshiyouxiang.net", "mail.tm", "mailcatch.com", "maildrop.cc", "mailinator.com", "mailinator.net",
  "mailnesia.com", "mailnull.com", "mailpoof.com", "mailsac.com", "mintemail.com", "moakt.com", "mohmal.com", "mytemp.email",
  "nada.email", "pokemail.net", "rhyta.com", "sharklasers.com", "spam4.me", "spamgourmet.com", "superrito.com", "teleworm.us",
  "temp-mail.io", "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.net", "tempmail.plus", "tempmailaddress.com",
  "tempmailo.com", "tempr.email", "throwawaymail.com", "tmail.ws", "tmpmail.net", "tmpmail.org", "trashmail.com", "trashmail.de",
  "trashmail.net", "trbvm.com", "wwjmp.com", "xojxe.com", "yoggm.com", "yopmail.com", "yopmail.fr", "yopmail.net",
]);

export function emailDomain(email: string | null | undefined): string | null {
  const d = email?.split("@")[1]?.trim().toLowerCase();
  return d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/** True for a known throwaway domain or any subdomain of one. */
export function isDisposable(domain: string | null, extra: string[] = []): boolean {
  if (!domain) return false;
  const all = extra.length ? new Set([...DISPOSABLE_DOMAINS, ...extra.map((x) => x.trim().toLowerCase()).filter(Boolean)]) : DISPOSABLE_DOMAINS;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (all.has(parts.slice(i).join("."))) return true;
  return false;
}

/** The network an address belongs to: IPv4 /24 or IPv6 /48. Null for unknown or private addresses. */
export function networkPrefix(ip: string): string | null {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return null;
    return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  }
  if (ip.includes(":")) {
    const groups = ip.toLowerCase().split("::")[0].split(":").filter(Boolean);
    if (!groups.length || groups[0].startsWith("fe8") || groups[0].startsWith("fc") || groups[0].startsWith("fd") || ip === "::1") return null;
    while (groups.length < 3) groups.push("0");
    return `${groups.slice(0, 3).join(":")}::/48`;
  }
  return null;
}
