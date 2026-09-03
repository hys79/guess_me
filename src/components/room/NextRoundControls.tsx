"use client";

import { useState } from "react";
import { promoteHost } from "@/lib/rounds";
import { GameError } from "@/lib/rooms";
import { HostQuestionPanel } from "./HostQuestionPanel";
import type { Player } from "@/lib/supabase/database.types";

interface NextRoundControlsProps {
  roomId: string;
  hostPlayer: Player;
  players: Player[];
  targetScore: number;
}

/**
 * 공개 후 방장 화면.
 *  - target_score 도달자(방장 제외)가 있으면 → 그 사람에게 방장을 넘기고 대기실로
 *  - 없으면 → 다음 라운드(랜덤/직접) 질문 패널
 */
export function NextRoundControls({
  roomId,
  hostPlayer,
  players,
  targetScore,
}: NextRoundControlsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reacher = players
    .filter((p) => p.id !== hostPlayer.id && p.score >= targetScore)
    .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at))[0];

  async function handlePromote() {
    if (!reacher || busy) return;
    setBusy(true);
    setError(null);
    try {
      await promoteHost(roomId, reacher.id);
    } catch (err) {
      setError(
        err instanceof GameError ? err.message : "방장 교체에 실패했습니다.",
      );
      setBusy(false);
    }
  }

  if (reacher) {
    return (
      <div className="card space-y-3 text-center">
        <p className="text-sm text-slate-600">
          <span className="font-bold text-primary-700">
            {reacher.nickname}
          </span>
          님이 {targetScore}점에 도달했습니다!
        </p>
        <p className="text-xs text-slate-400">
          이제 이 사람이 새 방장이 되어 대기실에서 다음 라운드를 시작합니다.
          <br />
          모든 참가자의 누적 점수는 0으로 초기화됩니다.
        </p>
        <button
          onClick={handlePromote}
          disabled={busy}
          className="btn-primary w-full py-3 text-base"
        >
          {busy ? "넘기는 중..." : `👑 ${reacher.nickname}님에게 방장 넘기기`}
        </button>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <HostQuestionPanel
      roomId={roomId}
      hostPlayerId={hostPlayer.id}
      hostNickname={hostPlayer.nickname}
    />
  );
}
