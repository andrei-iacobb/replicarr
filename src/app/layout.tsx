import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Replicarr",
  description: "Low-quality media replication with manual approval",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
