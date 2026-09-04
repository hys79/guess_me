"use client";

import { useState } from "react";
import { ReactionBar } from "./ReactionBar";
import type { Answer, AnswerReaction, Player } from "@/lib/supabase/database.types";

interface RevealPanelProps {
  answers: Answer[];
  players: Player[];
  reactions: AnswerReaction[];
  myPlayerId: string;
}

const BADGE: Record<string, { cls: string; emoji: string; label: string }> = {
  "1": { cls: "bg-primary-100 text-primary-700", emoji: "👍", label: "좋아요" },
  "0": { cls: "bg-slate-100 text-slate-500", emoji: "👎", label: "별로예요" },
};

/** 공개 단계: 누가 어떤 답변을 썼고 몇 점을 받았는지 한 번에. 점수 내림차순. 접을 수 있다(기본 펼침). */
export function RevealPanel({
  answers,
  players,
  reactions,
  myPlayerId,
}: RevealPanelProps) {
  const [open, setOpen] = useState(true);

  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "(퇴장)";

  const ordered = [...answers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="card animate-fade-in-up space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-slate-700">
          결과 공개{" "}
          <span className="font-normal text-slate-400">
            ({ordered.length})
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <ul className="space-y-2" hidden={!open}>
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
                {BADGE[String(a.score ?? 0)].label}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {a.answer_text || (
                <span className="text-slate-400">(빈 답변)</span>
              )}
            </p>
            <ReactionBar
              roundId={a.round_id}
              answerId={a.id}
              myPlayerId={myPlayerId}
              reactions={reactions.filter((r) => r.answer_id === a.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
