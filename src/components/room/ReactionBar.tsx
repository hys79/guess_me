"use client";

import { useState } from "react";
import { setReaction, clearReaction } from "@/lib/reactions";
import { useSound } from "@/lib/audio/SoundProvider";
import type { AnswerReaction, ReactionEmoji } from "@/lib/supabase/database.types";

interface ReactionBarProps {
  roundId: string;
  answerId: string;
  myPlayerId: string;
  /** 이 답변에 달린 반응만 (round 전체가 아니라 answer_id 로 미리 필터링된 목록) */
  reactions: AnswerReaction[];
}

const EMOJIS: { emoji: ReactionEmoji; label: string }[] = [
  { emoji: "😆", label: "웃겨요" },
  { emoji: "😮", label: "놀랐어요" },
  { emoji: "👏", label: "인정해요" },
];

/** 결과 공개 화면에서 답변 하나에 다는 이모지 반응 줄. 사람당 최대 1개(다시 누르면 취소). */
export function ReactionBar({
  roundId,
  answerId,
  myPlayerId,
  reactions,
}: ReactionBarProps) {
  const { play } = useSound();
  const [pending, setPending] = useState(false);

  const myReaction =
    reactions.find((r) => r.player_id === myPlayerId)?.emoji ?? null;

  const counts = new Map<ReactionEmoji, number>();
  for (const r of reactions) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }

  async function handleClick(emoji: ReactionEmoji) {
    if (pending) return;
    setPending(true);
    play("click");
    try {
      if (myReaction === emoji) {
        await clearReaction({ answerId, playerId: myPlayerId });
      } else {
        await setReaction({ roundId, answerId, playerId: myPlayerId, emoji });
      }
    } catch {
      /* 부가 기능이라 실패해도 조용히 무시 */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {EMOJIS.map(({ emoji, label }) => {
        const count = counts.get(emoji) ?? 0;
        const active = myReaction === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handleClick(emoji)}
            disabled={pending}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={
              active
                ? "flex items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 transition-transform active:scale-95"
                : "flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 transition-colors hover:border-primary-200 hover:bg-primary-50/60 active:scale-95"
            }
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
