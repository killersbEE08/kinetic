"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import "@/components/marketing/marketing.css";
import { AnnouncementBar, Nav } from "@/components/marketing/Nav";
import { Gallery } from "@/components/marketing/Showcase";
import { Footer } from "@/components/marketing/Stories";
import { CATEGORIES, TEMPLATES, type TemplateCategory } from "@/lib/deck/templates";

function TemplatesInner() {
  const type = useSearchParams().get("type");
  const initial = CATEGORIES.includes(type as TemplateCategory) ? (type as TemplateCategory) : "all";
  return <Gallery key={initial} heading={false} initial={initial} />;
}

export default function TemplatesPage() {
  return (
    <div className="m-root">
      <AnnouncementBar />
      <Nav />
      <main id="main">
        <section className="m-ruled border-b border-[var(--m-line)] bg-white">
          <div className="m-frame py-20 text-center md:px-10">
            <p className="m-eyebrow mb-4">Templates</p>
            <h1 className="m-h1 mx-auto max-w-[820px]">
              {TEMPLATES.length} sample decks, ready to <span className="m-accent">play</span>
            </h1>
            <p className="m-lead mx-auto mt-5 max-w-[620px]">Pitches, launches, proposals, lessons and reports. Every company and number is fictional. Open one, present it, or copy it to your decks and edit.</p>
          </div>
        </section>
        <Suspense fallback={<Gallery heading={false} />}>
          <TemplatesInner />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
