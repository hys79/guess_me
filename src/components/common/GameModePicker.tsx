"use client";

import type { RoomMode } from "@/lib/supabase/database.types";

interface ModeInfo {
  label: string;
  emoji: string;
  description: string;
}

interface GameModePickerProps {
  value: RoomMode;
  onChange: (mode: RoomMode) => void;
  info: Record<RoomMode, ModeInfo>;
}

const MODE_ORDER: RoomMode[] = ["king", "everyone"];

/** 왕 모드 / 다같이 모드 선택 (Guess Me · 노래 맞히기 공통). 설명은 게임마다 다르게 넘긴다. */
export function GameModePicker({ value, onChange, info }: GameModePickerProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        게임 모드
      </label>
      <div className="grid grid-cols-2 gap-2">
        {MODE_ORDER.map((mode) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-xl border-2 border-primary-500 bg-primary-50 p-3 text-left shadow-sm"
                  : "rounded-xl border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-primary-200"
              }
            >
              <span className="text-xl">{info[mode].emoji}</span>
              <p className="mt-1 text-sm font-bold text-slate-800">
                {info[mode].label}
              </p>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">{info[value].description}</p>
    </div>
  );
}
