"use client";

import type { SongHint } from "@/lib/supabase/database.types";

/** 출제자가 지금까지 공개한 힌트. 비어 있으면 아무것도 그리지 않는다. */
export function HintList({ hints }: { hints: SongHint[] }) {
  if (hints.length === 0) return null;
  return (
    <div className="card space-y-2">
      <p className="text-sm font-semibold text-slate-700">
        💬 힌트 <span className="font-normal text-slate-400">({hints.length})</span>
      </p>
      <ul className="space-y-1.5">
        {hints.map((h) => (
          <li
            key={h.id}
            className="animate-fade-in-up rounded-lg bg-primary-50 px-3 py-2 text-sm text-slate-800"
          >
            {h.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
