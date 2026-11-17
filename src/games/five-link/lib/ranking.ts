"use client";

import { supabase } from "@/lib/supabase/client";
import type { FiveLinkScore } from "@/lib/supabase/database.types";

/** 한국 시간 기준 오늘(YYYY-MM-DD) — 서버를 못 부를 때의 대체값 */
export function localKstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 서버가 알려 주는 오늘 날짜(한국 시간). 실패하면 기기 시계로 대신한다. */
export async function fetchToday(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("five_link_today");
    if (error || typeof data !== "string") return localKstToday();
    return data;
  } catch {
    return localKstToday();
  }
}

export type RankRow = Pick<FiveLinkScore, "nickname" | "score" | "moves" | "best_combo">;

export async function fetchTop(day: string, limit = 10): Promise<RankRow[]> {
  const { data, error } = await supabase
    .from("five_link_scores")
    .select("nickname, score, moves, best_combo")
    .eq("day", day)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RankRow[];
}

/** 등록 후 그날 내 순위를 돌려준다 */
export async function submitScore(args: {
  day: string;
  nickname: string;
  score: number;
  moves: number;
  bestCombo: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("five_link_submit", {
    p_day: args.day,
    p_nickname: args.nickname,
    p_score: args.score,
    p_moves: args.moves,
    p_best_combo: args.bestCombo,
  });
  if (error) throw error;
  return Number(data);
}

// ---------------------------------------------------------------------------
// 기기에 저장하는 값 (닉네임, 최고 점수)
// ---------------------------------------------------------------------------

const NICK_KEY = "five_link:nickname";
const BEST_KEY = "five_link:best";

export function loadNickname(): string {
  try {
    return window.localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveNickname(nickname: string): void {
  try {
    window.localStorage.setItem(NICK_KEY, nickname);
  } catch {
    /* ignore */
  }
}

/** 이 기기에서의 최고 점수 */
export function loadBest(): number {
  try {
    const n = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** 새 기록이면 저장하고 true */
export function saveBest(score: number): boolean {
  if (score <= loadBest()) return false;
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* ignore */
  }
  return true;
}
