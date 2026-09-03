import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SoundProvider } from "@/lib/audio/SoundProvider";
import { SettingsButton } from "@/components/audio/SettingsButton";

export const metadata: Metadata = {
  title: "guess me",
  description: "닉네임 기반 실시간 추측 게임",
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
