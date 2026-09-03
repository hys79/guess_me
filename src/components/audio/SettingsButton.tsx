"use client";

import { useState } from "react";
import { useSound } from "@/lib/audio/SoundProvider";
import { SettingsDialog } from "./SettingsDialog";

/** 모든 화면 우상단에 떠 있는 사운드 설정 진입 버튼 */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const sound = useSound();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="사운드 설정 열기"
        className="fixed right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:text-primary-600 active:scale-95"
        style={{
          right: "max(0.75rem, env(safe-area-inset-right))",
          top: "max(0.75rem, env(safe-area-inset-top))",
        }}
      >
        {sound.muted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 9v6h4l5 4V5L8 9H4z"
              fill="currentColor"
            />
            <path
              d="M16 9l5 6M21 9l-5 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path
              d="M16.5 8.5a5 5 0 010 7M19 6a9 9 0 010 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
