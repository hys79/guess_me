"use client";

import { LINK_TEN, comboStage, moveScore } from "../rules";

interface HudProps {
  score: number;
  timeLeftMs: number;
  /** 지금까지 이어진 연속 성공 횟수 */
  streak: number;
  comboLeftMs: number;
  best: number;
}

export function Hud({ score, timeLeftMs, streak, comboLeftMs, best }: HudProps) {
  const total = LINK_TEN.durationSec * 1000;
  const pct = Math.max(0, Math.min(100, (timeLeftMs / total) * 100));
  const secs = Math.ceil(timeLeftMs / 1000);
  const low = secs <= 10;
  const comboOn = comboLeftMs > 0 && streak >= 1;
  const stage = comboStage(streak);
  const maxed = stage >= LINK_TEN.maxCombo;
  // 콤보가 이어지면 다음 성공이 받을 점수
  const nextPoints = moveScore(streak + 1);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400">점수</p>
          <p className="text-3xl font-extrabold leading-none tabular-nums text-slate-900">
            {score.toLocaleString()}
          </p>
        </div>

        <div className="flex h-10 items-center">
          {comboOn && (
            <div
              key={streak}
              className="animate-pop flex min-w-[6.5rem] flex-col items-center rounded-xl bg-amber-100 px-3 py-1 text-amber-800"
            >
              <span className="text-xs font-extrabold leading-tight">
                COMBO {streak}
                {maxed ? " · MAX" : ""}
              </span>
              <span className="text-[11px] font-semibold leading-tight">
                다음 +{nextPoints}
              </span>
              <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-amber-200">
                <span
                  className="block h-full bg-amber-500"
                  style={{ width: `${(comboLeftMs / LINK_TEN.comboWindowMs) * 100}%` }}
                />
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="text-xs font-semibold text-slate-400">
            남은 시간{best > 0 ? ` · 최고 ${best.toLocaleString()}` : ""}
          </p>
          <p
            className={`text-3xl font-extrabold leading-none tabular-nums ${low ? "animate-timer-pulse text-red-500" : "text-slate-900"}`}
          >
            {secs}
          </p>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${low ? "bg-red-400" : "bg-primary-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
