import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import { SITE_HEADER } from "@/lib/site";
import { ThemeProvider } from "next-themes";
import { AuthGate } from "@/components/auth-gate";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coldbrew",
  description: "Personalized cold email from ICPs, enrichment and editable prompts",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Keep the sidebar collapsed or expanded across reloads (the sidebar writes this cookie on toggle).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  // The sending dashboard (config.xxx.com, or /config) has its own colours and its own shell (app/config/layout.tsx).
  const site = (await headers()).get(SITE_HEADER) === "config" ? "config" : "app";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased${site === "config" ? " dispatch" : ""}`}
    >
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <AuthProvider>
              <AuthGate sidebarOpen={sidebarOpen} site={site}>{children}</AuthGate>
            </AuthProvider>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
