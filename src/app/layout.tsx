import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "First-Time Voters Study | Concave Insights",
  description:
    "Independent academic research on factors shaping first-time voter behaviour in the 2024 Lok Sabha election. Run by Concave Insights.",
  openGraph: {
    title: "First-Time Voters Study | Concave Insights",
    description:
      "Independent academic research on factors shaping first-time voter behaviour in the 2024 Lok Sabha election.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
