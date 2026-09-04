"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RangeField } from "@/components/RangeField";
import { useSound } from "@/lib/audio/SoundProvider";
import { createRoom, GameError } from "@/lib/rooms";
import type { RoomMode } from "@/lib/supabase/database.types";
import {
  ANSWER_TIME_LIMIT_DEFAULT,
  ANSWER_TIME_LIMIT_MAX,
  ANSWER_TIME_LIMIT_MIN,
  GAME_MODE_INFO,
  NICKNAME_MAX_LENGTH,
  TARGET_SCORE_DEFAULT,
  TARGET_SCORE_MAX,
  TARGET_SCORE_MIN,
} from "@/lib/constants";

const MODE_ORDER: RoomMode[] = ["king", "everyone"];

export default function CreateRoomPage() {
  const router = useRouter();
  const { play } = useSound();

  const [nickname, setNickname] = useState("");
  const [gameMode, setGameMode] = useState<RoomMode>("king");
  const [targetScore, setTargetScore] = useState(TARGET_SCORE_DEFAULT);
  const [timeLimit, setTimeLimit] = useState(
    ANSWER_TIME_LIMIT_DEFAULT ?? 30,
  );
  const [unlimited, setUnlimited] = useState(
    ANSWER_TIME_LIMIT_DEFAULT === null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { room } = await createRoom({
        hostNickname: nickname,
        targetScore,
        answerTimeLimit: unlimited ? null : timeLimit,
        gameMode,
      });
      play("submit");
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(
        err instanceof GameError
          ? err.message
          : "알 수 없는 오류가 발생했습니다.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12 animate-fade-in">
      <Link
        href="/"
        className="mb-6 text-sm text-slate-400 hover:text-primary-600"
      >
        ← 처음으로
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-primary-700">방 만들기</h1>

      <form onSubmit={handleSubmit} className="card animate-fade-in-up space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            닉네임
          </label>
          <input
            className="input-field"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={`최대 ${NICKNAME_MAX_LENGTH}자`}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            게임 모드
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MODE_ORDER.map((mode) => {
              const info = GAME_MODE_INFO[mode];
              const active = gameMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGameMode(mode)}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-xl border-2 border-primary-500 bg-primary-50 p-3 text-left shadow-sm"
                      : "rounded-xl border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-primary-200"
                  }
                >
                  <span className="text-xl">{info.emoji}</span>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {info.label}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {GAME_MODE_INFO[gameMode].description}
          </p>
        </div>

        <RangeField
          label="목표 점수"
          value={targetScore}
          min={TARGET_SCORE_MIN}
          max={TARGET_SCORE_MAX}
          unit="점"
          onChange={setTargetScore}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              답변 제한시간
            </span>
            <button
              type="button"
              onClick={() => setUnlimited((v) => !v)}
              className={
                unlimited
                  ? "rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500"
              }
            >
              무제한
            </button>
          </div>
          <RangeField
            label={unlimited ? "무제한" : ""}
            value={timeLimit}
            min={ANSWER_TIME_LIMIT_MIN}
            max={ANSWER_TIME_LIMIT_MAX}
            unit="초"
            disabled={unlimited}
            onChange={setTimeLimit}
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn-primary w-full py-3 text-base"
          disabled={submitting || nickname.trim().length === 0}
        >
          {submitting ? "생성 중..." : "방 만들기"}
        </button>
      </form>
    </main>
  );
}
