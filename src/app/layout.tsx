import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dynamic Portfolio Dashboard | Octa Byte AI",
  description: "Dynamic Portfolio Dashboard tracking live Indian stock holdings with Yahoo Finance and Google Finance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
