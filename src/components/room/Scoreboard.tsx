"use client";

import { useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/supabase/database.types";

interface ScoreboardProps {
  players: Player[];
  targetScore: number;
  mePlayerId: string;
}

interface Delta {
  amount: number;
  key: number;
}

/** 상시 노출 누적 점수판. 점수가 바뀌면 행이 파랑/빨강으로 번쩍이고 +N/-N 이 떠오른다. */
export function Scoreboard({
  players,
  targetScore,
  mePlayerId,
}: ScoreboardProps) {
  const prevScores = useRef<Map<string, number>>(new Map());
  const [deltas, setDeltas] = useState<Record<string, Delta>>({});

  useEffect(() => {
    const next: Record<string, Delta> = {};
    let changed = false;
    for (const p of players) {
      const prev = prevScores.current.get(p.id);
      if (prev !== undefined && prev !== p.score) {
        next[p.id] = { amount: p.score - prev, key: Date.now() + Math.random() };
        changed = true;
      }
      prevScores.current.set(p.id, p.score);
    }
    // 사라진 플레이어 정리
    for (const id of Array.from(prevScores.current.keys())) {
      if (!players.some((p) => p.id === id)) prevScores.current.delete(id);
    }
    if (changed) {
      setDeltas((d) => ({ ...d, ...next }));
      const ids = Object.keys(next);
      const t = window.setTimeout(() => {
        setDeltas((d) => {
          const copy = { ...d };
          for (const id of ids) delete copy[id];
          return copy;
        });
      }, 1200);
      return () => window.clearTimeout(t);
    }
  }, [players]);

  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700">누적 점수</p>
        <p className="text-xs text-slate-400">목표 {targetScore}점</p>
      </div>
      <ul className="space-y-1 text-sm">
        {sorted.map((p) => {
          const reached = p.score >= targetScore;
          const delta = deltas[p.id];
          return (
            <li
              key={p.id}
              className={`relative flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors ${
                reached ? "bg-primary-50" : ""
              } ${
                delta
                  ? delta.amount > 0
                    ? "animate-score-up"
                    : "animate-score-down"
                  : ""
              }`}
            >
              <span className="flex items-center gap-1 text-slate-700">
                {p.is_host ? <span aria-hidden>👑</span> : null}
                <span className="font-medium">{p.nickname}</span>
                {p.id === mePlayerId ? (
                  <span className="text-slate-400"> (나)</span>
                ) : null}
              </span>

              <span className="relative flex items-center">
                {delta ? (
                  <span
                    key={delta.key}
                    className={`score-delta pointer-events-none absolute -top-1 right-8 text-xs font-bold ${
                      delta.amount > 0 ? "text-primary-600" : "text-red-500"
                    }`}
                  >
                    {delta.amount > 0 ? `+${delta.amount}` : delta.amount}
                  </span>
                ) : null}
                <span
                  className={`tabular-nums font-bold transition-colors ${
                    reached ? "text-primary-700" : "text-slate-600"
                  }`}
                >
                  {p.score}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
