import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { FloatingChat } from "@/components/layout/floating-chat";
import { ToastOverlay } from "@/components/layout/toast-overlay";
import { AuthProvider } from "@/lib/auth-context";
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
  description: "AI-powered sprint risk intelligence",
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
        <AuthProvider>
          <div className="flex h-screen w-full overflow-hidden">
            <Sidebar />
            <main className="flex-1 relative flex flex-col bg-background/50 overflow-hidden">
              {children}
            </main>
            <FloatingChat />
            <ToastOverlay />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
