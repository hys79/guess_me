import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SoundProvider } from "@/lib/audio/SoundProvider";
import { SettingsButton } from "@/components/audio/SettingsButton";
import { HUB_NAME, HUB_TAGLINE } from "@/games/registry";

export const metadata: Metadata = {
  title: HUB_NAME,
  description: HUB_TAGLINE,
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-white">
        <SoundProvider>
          {children}
          <SettingsButton />
        </SoundProvider>
      </body>
    </html>
  );
}
