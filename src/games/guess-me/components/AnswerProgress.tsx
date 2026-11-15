"use client";

import type { Answer, Player } from "@/lib/supabase/database.types";

interface AnswerProgressProps {
  /** 답변 대상 플레이어 (방장 제외) */
  responders: Player[];
  answers: Answer[];
}

/**
 * 수집 단계 답변 현황. 답변 "내용"은 보여주지 않고 누가 제출했는지만 표시한다.
 */
export function AnswerProgress({ responders, answers }: AnswerProgressProps) {
  const answeredIds = new Set(answers.map((a) => a.player_id));
  const doneCount = responders.filter((p) => answeredIds.has(p.id)).length;

  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700">답변 현황</p>
        <p className="text-xs text-slate-400">
          {doneCount} / {responders.length}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 text-sm">
        {responders.map((p) => {
          const done = answeredIds.has(p.id);
          return (
            <li
              key={p.id}
              className={
                done
                  ? "flex items-center gap-1.5 rounded-md bg-primary-50 px-2 py-1 text-primary-700"
                  : "flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-slate-400"
              }
            >
              <span>{done ? "✓" : "…"}</span>
              <span className="truncate">{p.nickname}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
