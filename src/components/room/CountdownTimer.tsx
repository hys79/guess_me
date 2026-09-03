"use client";

import { useEffect, useRef, useState } from "react";
import { useSound } from "@/lib/audio/SoundProvider";

interface CountdownTimerProps {
  /** 라운드 시작 시각 (rounds.created_at, ISO 문자열) */
  startedAt: string;
  /** 제한 시간(초) */
  seconds: number;
  onExpire?: () => void;
}

/**
 * startedAt + seconds 를 마감으로 남은 시간을 표시한다.
 * 서버 시각(rounds.created_at) 기준이라 클라이언트 간 오차가 크지 않다.
 * 마지막 5초에는 강조(파란→빨강, 펄스, 틱 사운드).
 */
export function CountdownTimer({
  startedAt,
  seconds,
  onExpire,
}: CountdownTimerProps) {
  const { play } = useSound();
  const deadline = new Date(startedAt).getTime() + seconds * 1000;

  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );
  const lastTickSecRef = useRef<number>(Infinity);

  useEffect(() => {
    let firedExpire = false;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);

      const sec = Math.ceil(left / 1000);
      if (sec <= 5 && sec >= 1 && sec !== lastTickSecRef.current) {
        lastTickSecRef.current = sec;
        play("tick");
      }

      if (left === 0 && !firedExpire) {
        firedExpire = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline, onExpire, play]);

  const remainingSec = Math.ceil(remainingMs / 1000);
  const ratio = seconds > 0 ? remainingMs / (seconds * 1000) : 0;
  const expired = remainingMs === 0;
  const danger = expired || remainingSec <= 5;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-500">남은 시간</span>
        <span
          className={`font-bold tabular-nums ${
            danger ? "text-red-500" : "text-primary-700"
          } ${!expired && remainingSec <= 5 ? "inline-block animate-timer-pulse" : ""}`}
        >
          {expired ? "시간 종료" : `${remainingSec}초`}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
            danger ? "bg-red-400" : "bg-primary-500"
          }`}
          style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
        />
      </div>
    </div>
  );
}
