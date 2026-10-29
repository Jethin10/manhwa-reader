import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Chrome, Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PreferenceEffects } from "@/components/PreferenceEffects";
import { AppUpdate } from "@/components/AppUpdate";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Manhwa — Read in stunning quality", template: "%s · Manhwa" },
  description: "Read manhwa, manga and manhua online in the highest quality.",
  applicationName: "Manhwa",
  appleWebApp: { capable: true, title: "Manhwa", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
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
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <PreferenceEffects />
        <AppUpdate />
        <Suspense fallback={<Chrome path="" />}>
          <Header />
        </Suspense>
        <main className="app-main flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
