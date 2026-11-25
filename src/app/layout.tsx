import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Impersonator",
  description: "Talk to personas built only from what real people actually said.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Fill the screen edge to edge on notched phones; padding uses env(safe-area-inset-*).
  viewportFit: "cover",
  // Let the on-screen keyboard shrink the layout so the chat composer stays visible.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
