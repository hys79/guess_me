"use client";

import { useEffect, useState } from "react";
import { fetchTop, type RankRow } from "../lib/ranking";

interface RankingPanelProps {
  day: string;
  /** 바뀔 때마다 다시 불러온다(등록 직후 등) */
  refreshKey?: number;
  /** 내 닉네임 — 강조 표시 */
  highlight?: string;
  limit?: number;
}

/** 같은 점수는 같은 순위(1,2,2,4 …) */
function withRanks(rows: RankRow[]) {
  return rows.map((row, i) => {
    let rank = i + 1;
    while (rank > 1 && rows[rank - 2].score === row.score) rank -= 1;
    return { ...row, rank };
  });
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function RankingPanel({ day, refreshKey = 0, highlight, limit = 10 }: RankingPanelProps) {
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!day) return;
    let alive = true;
    setFailed(false);
    fetchTop(day, limit)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [day, refreshKey, limit]);

  const me = highlight?.trim().toLowerCase();

  return (
    <section className="w-full" aria-label="오늘의 랭킹">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-900">🏆 오늘의 랭킹</h3>
        {day && <span className="text-xs text-slate-400">{day}</span>}
      </div>

      {failed ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          랭킹을 불러오지 못했어요. (SQL 0005 를 적용했는지 확인해 주세요)
        </p>
      ) : rows === null ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
          불러오는 중...
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!
        </p>
      ) : (
        <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {withRanks(rows).map((row) => {
            const mine = me !== undefined && row.nickname.trim().toLowerCase() === me;
            return (
              <li
                key={`${row.nickname}-${row.score}`}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${mine ? "bg-amber-50" : ""}`}
              >
                <span className="w-7 shrink-0 text-center font-bold text-slate-500">
                  {MEDALS[row.rank - 1] ?? row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                  {row.nickname}
                  {mine && <span className="ml-1 text-xs text-amber-600">(나)</span>}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-primary-700">
                  {row.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
