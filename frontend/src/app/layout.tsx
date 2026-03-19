import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { AgentPanel } from "@/components/layout/agent-panel";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sprint Guardian",
  description: "AI-first sprint health and issue tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen w-screen overflow-hidden flex`}
      >
        <Sidebar className="shrink-0" />
        <main className="flex-1 min-w-0 bg-background h-full">
          {children}
        </main>
        <AgentPanel />
      </body>
    </html>
  );
}
