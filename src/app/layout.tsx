import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, Source_Serif_4, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { CloudBackendProvider, DemoBackendProvider } from "@/lib/client/backend";
import { ErrorReporter } from "@/lib/client/report";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], display: "swap" });
// Brand heading fonts for slides.
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], display: "swap" });

// Public address. Set NEXT_PUBLIC_APP_URL to https://deckiq.app in production.
const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://deckiq.app").replace(/\/+$/, "");
const description = "Paste your notes or a memo. DeckIQ builds an animated deck you can edit, present, and share.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "DeckIQ: presentations that move", template: "%s · DeckIQ" },
  description,
  applicationName: "DeckIQ",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "DeckIQ", url: "/", title: "DeckIQ: presentations that move", description },
  twitter: { card: "summary_large_image", title: "DeckIQ: presentations that move", description },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

// Sign-in is enabled only when a Clerk publishable key is configured at build time.
// Without it the app runs in demo mode: decks stay in this browser and AI runs offline.
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <body className="min-h-dvh">
      <ErrorReporter />
      {clerkKey ? <CloudBackendProvider>{children}</CloudBackendProvider> : <DemoBackendProvider>{children}</DemoBackendProvider>}
    </body>
  );
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${grotesk.variable} ${display.variable}`}>
      {clerkKey ? (
        <ClerkProvider publishableKey={clerkKey} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/">
          {body}
        </ClerkProvider>
      ) : (
        body
      )}
    </html>
  );
}
