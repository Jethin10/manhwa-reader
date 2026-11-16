import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import { Suspense } from "react";
import { Chrome, Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PreferenceEffects } from "@/components/PreferenceEffects";
import { AppUpdate } from "@/components/AppUpdate";
import { Toaster } from "@/components/Toaster";
import { DownloadResumer } from "@/components/DownloadResumer";
import "./globals.css";

// One brand grotesk for everything (GitHub's Mona Sans, by Degarism): restrained like the
// faces Netflix and Apple run on, with a width axis for titles and the wordmark.
const mona = Mona_Sans({
  variable: "--font-brand",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: { default: "Kairo — Anime, movies and manhwa", template: "%s · Kairo" },
  description: "Watch anime and movies, and read manhwa and manga, in one place.",
  applicationName: "Kairo",
  appleWebApp: { capable: true, title: "Kairo", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  // Same as the Referrer-Policy header (next.config.ts): Asura's image CDN refuses other sites.
  referrer: "no-referrer",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mona.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <PreferenceEffects />
        <AppUpdate />
        <Suspense fallback={<Chrome path="" />}>
          <Header />
        </Suspense>
        <main className="app-main flex-1">{children}</main>
        <Footer />
        <Toaster />
        <DownloadResumer />
      </body>
    </html>
  );
}
