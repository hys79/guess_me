"use client";

import { useState } from "react";
import { acceptSongAttempt } from "@/games/song/lib/songs";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type {
  Player,
  SongAttempt,
  SongGuess,
} from "@/lib/supabase/database.types";

interface AnswerFeedProps {
  attempts: SongAttempt[];
  guesses: SongGuess[];
  players: Player[];
  /**
   * 출제자의 player id 를 넘기면 정답이 아닌 답안마다 "인정" 버튼이 생긴다
   * (기준에 가깝거나 재밌는 답을 아량껏 정답으로 인정). 그 밖에는 읽기 전용.
   */
  acceptAs?: string | null;
  /** 답안이 하나도 없을 때 안내 문구를 보여 줄지 (출제자 화면) */
  showEmpty?: boolean;
}

/**
 * 이번 라운드에 제출된 답안 피드 — 출제자 · 맞히는 사람 모두가 본다.
 * 자동 정답 / 인정된 답안은 텍스트 없이 "정답!"으로만 표시된다 (다른 사람이 베끼거나
 * 정답을 짐작하지 못하게). 정답이 아닌 답안의 텍스트만 공개된다.
 */
export function AnswerFeed({
  attempts,
  guesses,
  players,
  acceptAs = null,
  showEmpty = false,
}: AnswerFeedProps) {
  const { play } = useSound();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.nickname ?? "(퇴장)";
  const guessOf = (playerId: string) => guesses.find((g) => g.player_id === playerId);

  async function handleAccept(attemptId: string) {
    if (!acceptAs || busyId) return;
    setBusyId(attemptId);
    setError(null);
    play("click");
    try {
      await acceptSongAttempt(attemptId, acceptAs);
      play("scorePlus");
    } catch (err) {
      setError(err instanceof GameError ? err.message : "인정하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  if (attempts.length === 0) {
    return showEmpty ? (
      <div className="card text-center text-sm text-slate-400">
        💬 아직 제출된 답안이 없어요
      </div>
    ) : null;
  }

  // 최신 답안이 위로
  const items = [...attempts].reverse();

  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700">
          💬 답안 현황{" "}
          <span className="font-normal text-slate-400">({attempts.length})</span>
        </p>
        {acceptAs ? (
          <p className="text-xs text-slate-400">재밌거나 비슷하면 인정해 주세요</p>
        ) : null}
      </div>

      <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {items.map((a) => {
          const guess = guessOf(a.player_id);

          if (a.status === "correct" || a.status === "accepted") {
            return (
              <li
                key={a.id}
                className="animate-fade-in-up flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">
                  {a.status === "correct" ? "✅" : "🤝"}{" "}
                  <span className="font-semibold">{nameOf(a.player_id)}</span>{" "}
                  <span className="text-primary-700">
                    {a.status === "correct" ? "정답!" : "출제자가 정답으로 인정!"}
                  </span>
                </span>
                {guess ? (
                  <span className="font-bold tabular-nums text-primary-700">
                    +{guess.points}
                  </span>
                ) : null}
              </li>
            );
          }

          // pending — 정답이 아닌 답안. 이미 다른 답안으로 맞힌 사람의 것이면 흐리게
          const done = Boolean(guess);
          return (
            <li
              key={a.id}
              className={`animate-fade-in-up flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm ${
                done ? "opacity-50" : ""
              }`}
            >
              <span className="min-w-0 break-words text-slate-700">
                <span className="font-semibold text-slate-800">{nameOf(a.player_id)}</span>
                <span className="text-slate-400"> : </span>
                {a.answer_text}
              </span>
              {acceptAs && !done ? (
                <button
                  type="button"
                  onClick={() => handleAccept(a.id)}
                  disabled={busyId !== null}
                  className="shrink-0 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
                >
                  {busyId === a.id ? "..." : "✅ 인정"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
