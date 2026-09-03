"use client";

import type { Answer, Player } from "@/lib/supabase/database.types";

interface RevealPanelProps {
  answers: Answer[];
  players: Player[];
}

const BADGE: Record<string, { cls: string; emoji: string }> = {
  "1": { cls: "bg-primary-100 text-primary-700", emoji: "🙂" },
  "0": { cls: "bg-slate-100 text-slate-500", emoji: "🤔" },
  "-1": { cls: "bg-red-100 text-red-600", emoji: "😠" },
};

/** 공개 단계: 누가 어떤 답변을 썼고 몇 점을 받았는지 한 번에. 점수 내림차순. */
export function RevealPanel({ answers, players }: RevealPanelProps) {
  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "(퇴장)";

  const ordered = [...answers].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );

  return (
    <div className="card animate-fade-in-up space-y-3">
      <p className="text-sm font-semibold text-slate-700">결과 공개</p>
      <ul className="space-y-2">
        {ordered.map((a, idx) => (
          <li
            key={a.id}
            className="animate-fade-in-up rounded-xl border border-slate-200 p-3"
            style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">
                {nameOf(a.player_id)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  BADGE[String(a.score ?? 0)].cls
                }`}
              >
                <span aria-hidden>{BADGE[String(a.score ?? 0)].emoji}</span>
                {(a.score ?? 0) > 0 ? "+" : ""}
                {a.score ?? 0}
              </span>
            </div>
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
