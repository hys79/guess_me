"use client";

import { useState } from "react";
import { likeAnswer, unlikeAnswer, LIKE_EMOJI } from "@/lib/reactions";
import { useSound } from "@/lib/audio/SoundProvider";
import type { AnswerReaction } from "@/lib/supabase/database.types";

interface ReactionBarProps {
  roundId: string;
  answerId: string;
  myPlayerId: string;
  /** 이 답변에 달린 좋아요만 (answer_id 로 미리 필터링된 목록) */
  reactions: AnswerReaction[];
}

/** 결과 공개 화면에서 답변 하나에 다는 "좋아요"(❤️) 버튼. 다시 누르면 취소. */
export function ReactionBar({
  roundId,
  answerId,
  myPlayerId,
  reactions,
}: ReactionBarProps) {
  const { play } = useSound();
  const [pending, setPending] = useState(false);

  const liked = reactions.some((r) => r.player_id === myPlayerId);
  const count = reactions.length;

  async function handleClick() {
    if (pending) return;
    setPending(true);
    play("click");
    try {
      if (liked) {
        await unlikeAnswer({ answerId, playerId: myPlayerId });
      } else {
        await likeAnswer({ roundId, answerId, playerId: myPlayerId });
      }
    } catch {
      /* 부가 기능이라 실패해도 조용히 무시 */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title="좋아요"
        aria-label="좋아요"
        aria-pressed={liked}
        className={
          liked
            ? "inline-flex items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 transition-transform active:scale-95"
            : "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-500 transition-colors hover:border-primary-200 hover:bg-primary-50/60 active:scale-95"
        }
      >
        <span aria-hidden>{LIKE_EMOJI}</span>
        <span>좋아요</span>
        {count > 0 ? <span className="tabular-nums">{count}</span> : null}
      </button>
    </div>
  );
}
