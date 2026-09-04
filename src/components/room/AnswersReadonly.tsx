"use client";

import type { Answer, Player } from "@/lib/supabase/database.types";

interface AnswersReadonlyProps {
  answers: Answer[];
  players: Player[];
  title?: string;
}

/**
 * 닉네임과 함께 답변을 보여주는 읽기 전용 목록.
 * 채점 단계에서 "대기 중인 참여자들끼리" 서로의 답변을 볼 때 사용한다.
 * (점수는 공개 단계 전까지 표시하지 않는다)
 */
export function AnswersReadonly({
  answers,
  players,
  title = "제출된 답변",
}: AnswersReadonlyProps) {
  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "(퇴장)";

  const ordered = [...answers].sort((a, b) =>
    a.submitted_at.localeCompare(b.submitted_at),
  );

  return (
    <div className="card animate-fade-in-up space-y-2">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <ul className="space-y-2">
        {ordered.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate-200 p-3">
            <p className="mb-1 text-sm font-bold text-slate-800">
              {nameOf(a.player_id)}
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {a.answer_text || (
                <span className="text-slate-400">(빈 답변)</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
