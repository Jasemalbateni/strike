import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const tajawal = localFont({
  src: [
    { path: "./fonts/Tajawal-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Tajawal-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Tajawal-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Tajawal-ExtraBold.ttf", weight: "800", style: "normal" },
  ],
  variable: "--font-tajawal",
  display: "swap",
});

const barlow = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/BarlowCondensed-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/BarlowCondensed-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

const bukra = localFont({
  src: [{ path: "./fonts/29LTBukra-ExtraBold.otf", weight: "800", style: "normal" }],
  variable: "--font-bukra",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "STRIKE — بوابة الفريق", template: "%s · STRIKE" },
  description: "البوابة الداخلية لفريق أكاديمية سترايك",
  icons: { icon: "/brand/strike-logo-navy.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1C2D5A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${barlow.variable} ${bukra.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
