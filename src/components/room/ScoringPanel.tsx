"use client";

import { useMemo, useState } from "react";
import { scoreAnswer } from "@/lib/answers";
import { seededShuffle } from "@/lib/shuffle";
import { useSound } from "@/lib/audio/SoundProvider";
import type { Answer, AnswerScore } from "@/lib/supabase/database.types";

interface ScoringPanelProps {
  roundId: string;
  answers: Answer[];
}

const OPTIONS: {
  value: AnswerScore;
  emoji: string;
  label: string;
}[] = [
  { value: 1, emoji: "👍", label: "좋아요" },
  { value: 0, emoji: "👎", label: "별로예요" },
];

/**
 * 방장 채점 UI. 답변은 round.id 시드로 결정적으로 섞이며(재렌더에도 순서 고정),
 * 작성자 정보는 어디에도 노출되지 않는다.
 */
export function ScoringPanel({ roundId, answers }: ScoringPanelProps) {
  const { play } = useSound();
  const [pending, setPending] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const canonical = [...answers].sort((a, b) => a.id.localeCompare(b.id));
    return seededShuffle(canonical, roundId);
  }, [answers, roundId]);

  const scoredCount = answers.filter((a) => a.score !== null).length;

  async function handleScore(answerId: string, score: AnswerScore) {
    setPending(answerId + score);
    play(score > 0 ? "scorePlus" : "scoreMinus");
    try {
      await scoreAnswer({ answerId, score });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700">
          답변 채점 (작성자 비공개)
        </p>
        <p className="text-xs text-slate-400">
          {scoredCount} / {answers.length}
        </p>
      </div>

      <ol className="space-y-3">
        {ordered.map((a, idx) => (
          <li
            key={a.id}
            className="animate-fade-in-up rounded-xl border border-slate-200 p-3"
            style={{ animationDelay: `${Math.min(idx, 6) * 40}ms` }}
          >
            <div className="mb-2 flex gap-2">
              <span className="text-xs font-bold text-slate-400">
                {idx + 1}.
              </span>
              <p className="flex-1 whitespace-pre-wrap text-sm text-slate-800">
                {a.answer_text || (
                  <span className="text-slate-400">(빈 답변)</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {OPTIONS.map((opt) => {
                const active = a.score === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleScore(a.id, opt.value)}
                    disabled={pending !== null}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-pressed={active}
                    className={
                      active
                        ? "flex flex-1 animate-pop flex-col items-center gap-0.5 rounded-lg bg-primary-600 px-2 py-2 text-white shadow-sm"
                        : "flex flex-1 flex-col items-center gap-0.5 rounded-lg border border-slate-300 px-2 py-2 text-slate-500 transition-colors hover:border-primary-400 hover:bg-primary-50 active:scale-95"
                    }
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="text-[11px] font-semibold">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-center text-xs text-slate-400">
        모든 답변에 점수를 매기면 자동으로 공개됩니다.
      </p>
    </div>
  );
}
