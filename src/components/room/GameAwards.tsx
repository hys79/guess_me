"use client";

import type { GameAward } from "@/lib/awards";

interface GameAwardsProps {
  award: GameAward | null;
}

/** 게임 종료 화면: "좋아요"를 가장 많이 받은 답변 하나. 없으면 렌더링 안 함. */
export function GameAwards({ award }: GameAwardsProps) {
  if (!award) return null;

  return (
    <div className="card animate-fade-in-up space-y-2">
      <p className="text-sm font-semibold text-slate-700">
        ❤️ 가장 많은 공감을 받은 답변
      </p>
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">
            {award.askerNickname}
          </span>
          : &ldquo;{award.questionText}&rdquo;
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-semibold text-primary-700">
            {award.authorNickname}
          </span>
          :{" "}
          {award.answerText || (
            <span className="text-slate-400">(빈 답변)</span>
          )}
        </p>
        <p className="mt-1.5 text-right text-xs text-slate-400">
          ❤️ {award.count}
        </p>
      </div>
    </div>
  );
}
