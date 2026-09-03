"use client";

import { useEffect } from "react";
import { useSound } from "@/lib/audio/SoundProvider";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function VolumeRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-400">
          {Math.round(value * 100)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary-100 accent-primary-600 disabled:cursor-not-allowed"
      />
    </div>
  );
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const sound = useSound();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl animate-slide-up sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="사운드 설정"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">사운드 설정</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              전체 음소거
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={sound.muted}
              aria-label="전체 음소거"
              onClick={() => sound.setMuted(!sound.muted)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                sound.muted ? "bg-primary-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  sound.muted ? "translate-x-[1.375rem]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <VolumeRow
            label="배경음악"
            value={sound.bgmVolume}
            onChange={sound.setBgmVolume}
            disabled={sound.muted}
          />
          {!sound.bgmAvailable ? (
            <p className="-mt-3 text-xs text-slate-400">
              배경음악 파일이 아직 없습니다. <code>public/audio/bgm.mp3</code> 에
              mp3 를 넣으면 자동 재생됩니다.
            </p>
          ) : null}

          <VolumeRow
            label="효과음"
            value={sound.sfxVolume}
            onChange={sound.setSfxVolume}
            disabled={sound.muted}
          />

          <button
            type="button"
            onClick={() => sound.play("scorePlus")}
            disabled={sound.muted}
            className="btn-secondary w-full py-2 text-sm"
          >
            효과음 테스트
          </button>
        </div>
      </div>
    </div>
  );
}
