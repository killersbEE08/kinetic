import "@/components/marketing/marketing.css";
import { AnnouncementBar, Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { Overview, ProofStrip, TwoWays } from "@/components/marketing/Overview";
import { Checks, EditDemo } from "@/components/marketing/EditDemo";
import { Gallery, Platform, ThreeSteps, UseCases } from "@/components/marketing/Showcase";
import { ClosingCta, Faq, Footer, Stories } from "@/components/marketing/Stories";

// Landing page. Section order follows the design brief: quiet editorial space, then
// functional demos, proof, denser information, a dark contrast section and a bright CTA.
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
        <Overview />
        <TwoWays />
        <EditDemo />
        <Checks />
        <UseCases />
        <ThreeSteps />
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
