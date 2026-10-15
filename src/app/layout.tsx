import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, Source_Serif_4, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { CloudBackendProvider, DemoBackendProvider } from "@/lib/client/backend";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], display: "swap" });
// Brand heading fonts for slides.
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kinetic: presentations that move", template: "%s · Kinetic" },
  description: "Paste your notes or a memo. Kinetic builds an animated deck you can edit, present, and share.",
  applicationName: "Kinetic",
};

export const viewport: Viewport = {
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
