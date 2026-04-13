import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AIProvider } from "@/app/context/AIContext";
import AIDrawer from "@/app/components/AIDrawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harness Dashboard",
  description: "로컬 AI 기획 대시보드 — claude -p 연동",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <AIProvider>
          {children}
          <AIDrawer />
        </AIProvider>
      </body>
    </html>
  );
}
