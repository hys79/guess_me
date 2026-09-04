"use client";

import { useEffect, useState } from "react";
import { restartEveryoneGame, promoteHost } from "@/lib/rounds";
import { GameError } from "@/lib/rooms";
import { fetchGameAwards, type GameAward } from "@/lib/awards";
import { Scoreboard } from "./Scoreboard";
import { GameAwards } from "./GameAwards";
import type { Player, RoomMode } from "@/lib/supabase/database.types";

interface GameFinishedProps {
  roomId: string;
  gameMode: RoomMode;
  winnerId: string | null;
  players: Player[];
  targetScore: number;
  mePlayerId: string;
  /** 다음 단계로 넘기는 버튼 노출 여부 (왕 모드: 현재 방장 / 다같이 모드: 방 관리자) */
  canContinue: boolean;
}

/**
 * 목표 점수 도달자가 나와 게임이 끝났을 때의 결과 화면.
 *  - 왕 모드     : 도달자가 새 방장이 됨 → "왕위 넘기기" (promote_host, 대기실로)
 *  - 다같이 모드 : "다시 시작" → restart_everyone_game (대기실 없이 바로 다음 게임)
 */
export function GameFinished({
  roomId,
  gameMode,
  winnerId,
  players,
  targetScore,
  mePlayerId,
  canContinue,
}: GameFinishedProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awards, setAwards] = useState<GameAward[]>([]);

  // 다음 단계로 넘어가며 라운드/답변/리액션이 지워지기 전에, 게임 종료 시점에
  // 한 번만 집계한다.
  useEffect(() => {
    let cancelled = false;
    fetchGameAwards(roomId, players).then((result) => {
      if (!cancelled) setAwards(result);
    });
    return () => {
      cancelled = true;
    };
    // roomId 가 바뀌는(=새 게임이 끝나는) 시점에만 다시 집계하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const winner = players.find((p) => p.id === winnerId) ?? null;

  async function handleContinue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (gameMode === "king") {
        if (!winnerId) throw new GameError("우승자 정보를 찾을 수 없습니다.");
        await promoteHost(roomId, winnerId);
      } else {
        await restartEveryoneGame(roomId);
      }
    } catch (err) {
      setError(
        err instanceof GameError ? err.message : "처리에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-pop space-y-2 text-center">
        <p className="text-4xl">{gameMode === "king" ? "👑" : "🎉"}</p>
        <p className="text-lg font-bold text-slate-900">
          {winner ? (
            <>
              <span className="text-primary-700">{winner.nickname}</span>
              {gameMode === "king" ? "님이 왕위를 잇습니다!" : "님 우승!"}
            </>
          ) : (
            "게임 종료!"
          )}
        </p>
        <p className="text-sm text-slate-500">
          목표 {targetScore}점에 가장 먼저 도달했습니다.
        </p>
      </div>

      <GameAwards awards={awards} />

      <Scoreboard
        players={players}
        targetScore={targetScore}
        mePlayerId={mePlayerId}
      />

      {canContinue ? (
        <div className="space-y-2">
          <button
            onClick={handleContinue}
            disabled={busy}
            className="btn-primary w-full py-3 text-base"
          >
            {busy
              ? "처리 중..."
              : gameMode === "king"
                ? "👑 왕위 넘기기"
                : "🔄 다시 시작"}
          </button>
          <p className="text-center text-xs text-slate-400">
            {gameMode === "king"
              ? `${winner ? winner.nickname + "님이 " : ""}새 방장이 되어 대기실로 돌아갑니다.`
              : `${winner ? winner.nickname + "님부터 " : ""}새 게임을 시작합니다.`}
          </p>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          {gameMode === "king"
            ? "방장이 왕위를 넘기기를 기다리는 중..."
            : "방장이 다시 시작하기를 기다리는 중..."}
        </p>
      )}
    </div>
  );
}
