"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";

/** 방장이 게임을 시작한다: rooms.status 를 'question' 으로 전환. */
export async function startGuessMeGame(roomId: string): Promise<void> {
  const { data, error } = await supabase
    .from("rooms")
    .update({ status: "question" })
    .eq("id", roomId)
    .select("id")
    .maybeSingle();
  if (error) throw new GameError(error.message);
  // RLS 등으로 행이 하나도 갱신되지 않으면 에러 없이 조용히 성공 응답이 온다.
  // 그러면 화면이 영원히 "시작 중..." 에 멈추므로 여기서 명시적으로 실패 처리한다.
  if (!data) {
    throw new GameError("방 시작에 실패했습니다. 새로고침 후 다시 시도하세요.");
  }
}
