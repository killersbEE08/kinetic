import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/chrome";
import { ReportForm } from "@/components/app/ReportForm";

export const metadata: Metadata = { title: "Report a deck", description: "Report a shared DeckIQ deck that breaks the rules." };

const CONTACT = process.env.NEXT_PUBLIC_ABUSE_EMAIL;

// Public page for abuse reports: anyone can report a shared link, with or without an account.
export default function ReportPage() {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-12">
      <Wordmark />
      <h1 className="mt-8 text-[26px] font-semibold tracking-[-0.02em]">Report a shared deck</h1>
      <p className="mt-2 text-[15px] leading-[23px] text-ink-2">
        DeckIQ decks are made by our users. If a shared deck is a scam, asks for passwords or payment details, spreads malware, harasses someone, or breaks the law, tell us here. We review every report and remove links that break the rules.
      </p>
      <div className="mt-6 rounded-[14px] border border-line bg-surface p-6">
        <ReportForm askLink />
      </div>
      {CONTACT && (
        <p className="mt-6 text-[14px] text-ink-2">
          For legal requests (copyright, court orders), email <a className="font-medium text-accent hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      )}
      <p className="mt-6 text-[13px] text-ink-2">
        <Link href="/" className="hover:text-ink">Back to DeckIQ</Link>
      </p>
    </main>
  );
}
