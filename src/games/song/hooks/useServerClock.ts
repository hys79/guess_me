"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * 서버 시계와 내 시계의 차이(ms) = 서버시각 − 내시각.
 * 모두가 같은 순간에 재생을 시작하려면 "서버 시각으로 적힌 재생 시작 시각"을 내 시계로
 * 바꿔야 한다:  내시각 = 서버시각 − offset.
 *
 * song_server_time RPC 를 여러 번 호출해 왕복시간(RTT)이 가장 짧은 표본을 쓴다
 * (왕복이 짧을수록 "서버가 시각을 찍은 순간"이 내가 응답을 받은 순간에 가깝다).
 */
export async function measureServerOffset(samples = 5): Promise<number | null> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc("song_server_time");
    const t1 = Date.now();
    if (error || !data) continue;
    const rtt = t1 - t0;
    const offset = new Date(data).getTime() + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best ? best.offset : null;
}

/** 방에 들어와 있는 동안 한 번 맞추고(그리고 2분마다 다시) 결과를 돌려준다. 실패하면 0(보정 없음). */
export function useServerClock(): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const offset = await measureServerOffset();
      if (!cancelled && offset !== null) setOffsetMs(offset);
    };
    void run();
    const id = window.setInterval(run, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return offsetMs;
}
