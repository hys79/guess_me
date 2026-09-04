"use client";

import { useState } from "react";
import { restartEveryoneGame } from "@/lib/rounds";
import { GameError } from "@/lib/rooms";
import { Scoreboard } from "./Scoreboard";
import type { Player } from "@/lib/supabase/database.types";

interface GameFinishedProps {
  roomId: string;
  winnerId: string | null;
  players: Player[];
  targetScore: number;
  mePlayerId: string;
  /** 재시작 버튼 노출 여부 (방장에게만) */
  canRestart: boolean;
}

/** 다같이 모드: 목표 점수 도달자가 나와 게임이 끝났을 때의 결과 화면. */
export function GameFinished({
  roomId,
  winnerId,
  players,
  targetScore,
  mePlayerId,
  canRestart,
}: GameFinishedProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winner = players.find((p) => p.id === winnerId) ?? null;

  async function handleRestart() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await restartEveryoneGame(roomId);
    } catch (err) {
      setError(
        err instanceof GameError ? err.message : "재시작에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-pop space-y-2 text-center">
        <p className="text-4xl">🎉</p>
        <p className="text-lg font-bold text-slate-900">
          {winner ? (
            <>
              <span className="text-primary-700">{winner.nickname}</span>
              님 우승!
            </>
          ) : (
            "게임 종료!"
          )}
        </p>
        <p className="text-sm text-slate-500">
          목표 {targetScore}점에 가장 먼저 도달했습니다.
        </p>
      </div>

      <Scoreboard
        players={players}
        targetScore={targetScore}
        mePlayerId={mePlayerId}
      />

      {canRestart ? (
        <div className="space-y-2">
          <button
            onClick={handleRestart}
            disabled={busy}
            className="btn-primary w-full py-3 text-base"
          >
            {busy ? "재시작 중..." : "🔄 다시 시작 (점수 초기화)"}
          </button>
          <p className="text-center text-xs text-slate-400">
            {winner ? `${winner.nickname}님부터 ` : ""}
            새 게임을 시작합니다.
          </p>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          방장이 다시 시작하기를 기다리는 중...
        </p>
      )}
    </div>
  );
}
