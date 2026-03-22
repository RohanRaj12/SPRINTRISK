import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google"; // Switch to Inter for a cleaner look
import { Sidebar } from "@/components/layout/sidebar";
import { AgentPanel } from "@/components/layout/agent-panel";
import { DemoModeProvider } from "@/lib/demo-mode-context";
import "./globals.css";

const inter = Inter({
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
        className={`${inter.variable} font-sans antialiased text-foreground bg-background selection:bg-primary/20`}
      >
        <DemoModeProvider>
          <div className="flex h-screen w-full overflow-hidden">
            <Sidebar />
            <main className="flex-1 relative flex flex-col bg-background/50">
              {children}
            </main>
            <AgentPanel />
          </div>
        </DemoModeProvider>
      </body>
    </html>
  );
}
