"use client";

import type { GameAward } from "@/lib/awards";

interface GameAwardsProps {
  awards: GameAward[];
}

/** 게임 종료 화면: 이모지 반응 기준 "이번 게임 어워드" 간단 요약. 없으면 렌더링 안 함. */
export function GameAwards({ awards }: GameAwardsProps) {
  if (awards.length === 0) return null;

  return (
    <div className="card animate-fade-in-up space-y-3">
      <p className="text-sm font-semibold text-slate-700">
        🏆 이번 게임 리액션 어워드
      </p>
      <ul className="space-y-2">
        {awards.map((a, idx) => (
          <li
            key={a.emoji}
            className="animate-fade-in-up rounded-xl border border-slate-200 p-3"
            style={{ animationDelay: `${idx * 80}ms` }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                {a.emoji}
              </span>
              <span className="text-sm font-bold text-slate-800">
                {a.title}
              </span>
              <span className="ml-auto shrink-0 text-xs text-slate-400">
                {a.emoji} {a.count}회
              </span>
            </div>
            <p className="text-xs text-slate-500">
              질문 ·{" "}
              <span className="font-medium text-slate-600">
                {a.askerNickname}
              </span>
              님: &ldquo;{a.questionText}&rdquo;
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold text-primary-700">
                {a.authorNickname}
              </span>
              :{" "}
              {a.answerText || (
                <span className="text-slate-400">(빈 답변)</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
