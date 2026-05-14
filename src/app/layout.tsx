import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Datamapr — Map any source to HubSpot",
  description:
    "Map CSV, Airtable, and other sources to HubSpot contacts, companies, deals, or tickets.",
  openGraph: {
    title: "Datamapr — Map any source to HubSpot",
    description:
      "Map CSV, Airtable, and other sources to HubSpot contacts, companies, deals, or tickets.",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
