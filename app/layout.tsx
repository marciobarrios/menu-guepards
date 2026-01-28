import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Menu Guepards",
  description: "Gestió de menús escolars",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ca">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
