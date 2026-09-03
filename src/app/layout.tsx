import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SoundProvider } from "@/lib/audio/SoundProvider";
import { SettingsButton } from "@/components/audio/SettingsButton";

export const metadata: Metadata = {
  title: "Guess Me!",
  description: "나를 가장 잘 아는 사람은 누구?",
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
