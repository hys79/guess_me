"use client";

import type { Round } from "@/lib/supabase/database.types";
import { CountdownTimer } from "./CountdownTimer";

interface QuestionDisplayProps {
  round: Round;
  /** null = 무제한 */
  timeLimit: number | null;
  onExpire?: () => void;
}

/** 모든 플레이어에게 동시에 보이는 질문 카드 + (제한시간 있으면) 카운트다운 */
export function QuestionDisplay({
  round,
  timeLimit,
  onExpire,
}: QuestionDisplayProps) {
  return (
    <div
      key={round.id}
      className="card animate-fade-in-up space-y-4 border-primary-100 bg-gradient-to-b from-primary-50/60 to-white"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
        질문
      </p>
      <p className="text-lg font-bold leading-relaxed text-slate-900 sm:text-xl">
        {round.question_text}
      </p>

      {timeLimit === null ? (
        <p className="text-sm text-slate-400">답변 시간 제한 없음</p>
      ) : (
        <CountdownTimer
          startedAt={round.created_at}
          seconds={timeLimit}
          onExpire={onExpire}
        />
      )}
    </div>
  );
}
