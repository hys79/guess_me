"use client";

import { useState } from "react";
import { nextSongRound } from "@/games/song/lib/songs";
import { formatTime } from "@/games/song/lib/youtube";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type { Player, SongGuess, SongRound } from "@/lib/supabase/database.types";

interface RevealCardProps {
  round: SongRound; // revealed
  roomId: string;
  playerId: string;
  players: Player[];
  guesses: SongGuess[];
  /** 다음 출제자 (참가 순서상 이번 출제자 다음 사람) */
  nextSetter: Player | null;
  isHost: boolean;
  /** 이 라운드로 게임이 끝났다 — "다음 문제" 대신 종료 화면이 이어진다 */
  finished?: boolean;
}

/** 정답 공개: 정답 · 원본 영상 링크 · 누가 몇 점 받았는지 · 다음 문제 버튼 */
export function RevealCard({
  round,
  roomId,
  playerId,
  players,
  guesses,
  nextSetter,
  isHost,
  finished = false,
}: RevealCardProps) {
  const { play } = useSound();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.nickname ?? "(퇴장)";
  const canAdvance = isHost || nextSetter?.id === playerId;
  const watchUrl = round.video_id
    ? `https://www.youtube.com/watch?v=${round.video_id}&t=${round.start_sec ?? 0}s`
    : null;

  async function handleNext() {
    if (busy) return;
    setBusy(true);
    setError(null);
    play("click");
    try {
      await nextSongRound(roomId, playerId);
    } catch (err) {
      setError(err instanceof GameError ? err.message : "다음으로 넘어가지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card animate-pop space-y-4">
      <div className="text-center">
        <p className="text-xs font-medium text-slate-400">정답</p>
        <p className="mt-1 text-2xl font-extrabold text-primary-700">
          {round.answer_display ?? "—"}
        </p>
        {watchUrl ? (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-slate-400 underline hover:text-primary-600"
          >
            ▶ 원본 영상 열기 ({formatTime(round.start_sec ?? 0)}부터)
          </a>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">이번 라운드 결과</p>
        {guesses.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-400">
            아무도 맞히지 못했어요 😢
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {guesses.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-1.5"
              >
                <span className="text-slate-700">
                  <span className="mr-1.5 text-xs font-bold text-primary-600">
                    {g.place}등
                  </span>
                  {nameOf(g.player_id)}
                </span>
                <span className="font-bold tabular-nums text-primary-700">+{g.points}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {finished ? null : canAdvance ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleNext}
            disabled={busy}
            className="btn-primary w-full py-3 text-base"
          >
            {busy ? "넘어가는 중..." : "다음 문제 →"}
          </button>
          <p className="text-center text-xs text-slate-400">
            다음 출제자: {nextSetter ? nextSetter.nickname : "—"}
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          {nextSetter ? `${nextSetter.nickname}님이` : "다음 출제자가"} 다음 문제를
          준비하길 기다리는 중...
        </p>
      )}
    </div>
  );
}
