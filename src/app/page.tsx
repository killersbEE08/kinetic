import "@/components/marketing/marketing.css";
import { AnnouncementBar, Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { ProofStrip } from "@/components/marketing/Overview";
import { StoryScroll } from "@/components/marketing/Story";
import { Checks, EditDemo } from "@/components/marketing/EditDemo";
import { Gallery, Platform, UseCases } from "@/components/marketing/Showcase";
import { ClosingCta, Faq, Footer, Stories } from "@/components/marketing/Stories";

// Landing page. The hero shows the product playing; the deck rows slide with the scroll; one
// pinned section turns a memo into an outline and then a slide whose builds follow the scroll.
// Motion rules: docs/06 §4 (entrance, scroll or interaction only; reduced motion respected).
export default function Home() {
  return (
    <div className="m-root">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <AnnouncementBar />
      <Nav />
      <main id="main">
        <Hero />
        <ProofStrip />
        <StoryScroll />
        <EditDemo />
        <Checks />
        <UseCases />
        <Platform />
        <Gallery />
        <Stories />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
