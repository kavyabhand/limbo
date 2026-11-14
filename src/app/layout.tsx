import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// On Vercel, fall back to the project's production domain so link previews work without extra setup.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const appUrl = process.env.APP_URL ?? (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Limbo", template: "%s · Limbo" },
  description: "Trip stuck in limbo? Enter your flight, train or bus and talk to everyone else on it. No sign-up.",
  applicationName: "Limbo",
  openGraph: { type: "website", siteName: "Limbo" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0d" },
  ],
};

// Applies saved theme / text size before first paint so there is no flash.
const prefsScript = `try{var p=JSON.parse(localStorage.getItem("limbo:prefs")||"{}");var d=document.documentElement;if(p.theme&&p.theme!=="auto")d.dataset.theme=p.theme;if(p.text&&p.text!=="normal")d.dataset.text=p.text;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
