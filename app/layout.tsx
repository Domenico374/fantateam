import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantateam",
  description: "Piattaforma per il Fantacalcio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
