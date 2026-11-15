"use client";

import { useState } from "react";
import { promoteSongHost, startSongGame } from "@/games/song/lib/songs";
import { Scoreboard } from "@/components/common/Scoreboard";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type { Player, RoomMode } from "@/lib/supabase/database.types";

interface SongFinishedProps {
  roomId: string;
  gameMode: RoomMode;
  /** 서버가 정한 우승자 (rooms.winner_player_id) */
  winnerId: string | null;
  players: Player[];
  targetScore: number;
  mePlayerId: string;
  isHost: boolean;
}

/**
 * 게임 종료.
 *  - 왕 모드     : 우승자가 왕위를 잇는다 → 방장의 "왕위 넘기기"(새 방장 + 점수 초기화 + 대기실)
 *  - 다같이 모드 : 최고 점수자(동점이면 공동 우승) → 방장의 "다시 시작"
 */
export function SongFinished({
  roomId,
  gameMode,
  winnerId,
  players,
  targetScore,
  mePlayerId,
  isHost,
}: SongFinishedProps) {
  const { play } = useSound();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const king = gameMode === "king";
  const winner = players.find((p) => p.id === winnerId) ?? null;

  const topScore = players.reduce((m, p) => Math.max(m, p.score), 0);
  const winners = players.filter((p) => p.score === topScore && topScore > 0);

  async function handleContinue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    play("click");
    try {
      if (king) await promoteSongHost(roomId, mePlayerId);
      else await startSongGame(roomId, mePlayerId);
    } catch (err) {
      setError(err instanceof GameError ? err.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-pop space-y-2 text-center">
        <p className="text-4xl">{king ? "👑" : "🏆"}</p>
        <p className="text-lg font-bold text-slate-900">
          {king ? (
            winner ? (
              <>
                <span className="text-primary-700">{winner.nickname}</span>
                님이 왕위를 잇습니다!
              </>
            ) : (
              "게임 종료!"
            )
          ) : winners.length > 0 ? (
            <>
              <span className="text-primary-700">
                {winners.map((w) => w.nickname).join(", ")}
              </span>
              {winners.length > 1 ? "님 공동 우승!" : "님 우승!"}
            </>
          ) : (
            "게임 종료!"
          )}
        </p>
        <p className="text-sm text-slate-500">
          목표 {targetScore}점에 가장 먼저 도달했어요.
        </p>
      </div>

      <Scoreboard
        players={players}
        targetScore={targetScore}
        mePlayerId={mePlayerId}
      />

      {isHost ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleContinue}
            disabled={busy}
            className="btn-primary w-full py-3 text-base"
          >
            {busy ? "처리 중..." : king ? "👑 왕위 넘기기" : "🔄 다시 시작"}
          </button>
          <p className="text-center text-xs text-slate-400">
            {king
              ? `${winner ? winner.nickname + "님이 " : ""}새 방장이 되어 대기실로 돌아가요. 점수는 초기화돼요.`
              : "점수를 초기화하고 방장부터 다시 출제해요."}
          </p>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          {king
            ? "방장이 왕위를 넘기기를 기다리는 중..."
            : "방장이 다시 시작하기를 기다리는 중..."}
        </p>
      )}
    </div>
  );
}
