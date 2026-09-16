import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SuperBall · Provably Fair Draw",
  description:
    "A luxury 1/50 draw powered by drand — the League of Entropy public randomness beacon. Every 3 minutes. Every result is independently verifiable.",
  icons: {
    icon: [
      { url: "/logo-192.png", type: "image/png", sizes: "192x192" },
      { url: "/logo-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/logo-512.png", sizes: "512x512" }],
    shortcut: ["/logo-192.png"],
  },
  openGraph: {
    title: "SuperBall · Provably Fair Draw",
    description:
      "Every 3 minutes, a new winning number is drawn from the drand beacon. Token holders are auto-assigned numbers; winners get paid on-chain instantly.",
    images: [
      {
        url: "/header.png",
        width: 1500,
        height: 500,
        alt: "SuperBall",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperBall · Provably Fair Draw",
    description:
      "Provably-fair on-chain lottery on Robinhood Chain. Every 3 minutes.",
    images: ["/header.png"],
    site: "@superballonrh",
    creator: "@superballonrh",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
