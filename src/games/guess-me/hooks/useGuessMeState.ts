"use client";

import { useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  Round,
  Answer,
  AnswerReaction,
} from "@/lib/supabase/database.types";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

/**
 * Guess Me 한 방의 "라운드 진행" 상태를 실시간 구독한다.
 * (방/참가자는 방 페이지 셸의 useRoomBase 가 이미 구독하고 있다)
 *
 * 구독 대상:
 *  - rounds    : room_id = roomId     (라운드 진행/전환 반영)
 *  - answers   : round_id = 현재 라운드 (답변 도착 / 채점 결과 반영)
 *  - reactions : round_id = 현재 라운드 (공개 화면 좋아요 실시간 반영)
 */
export function useGuessMeState(roomId: string | null) {
  const rounds = useRealtimeTable<Round>({
    table: "rounds",
    filter: roomId ? { column: "room_id", value: roomId } : null,
    enabled: Boolean(roomId),
    fetchInitial: async () => {
      if (!roomId) return [];
      const { data, error } = await supabase
        .from("rounds")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentRound = useMemo<Round | null>(() => {
    if (rounds.rows.length === 0) return null;
    return rounds.rows.reduce((latest, r) =>
      r.created_at > latest.created_at ? r : latest,
    );
  }, [rounds.rows]);

  const answers = useRealtimeTable<Answer>({
    table: "answers",
    filter: currentRound ? { column: "round_id", value: currentRound.id } : null,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("answers")
        .select("*")
        .eq("round_id", currentRound.id)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reactions = useRealtimeTable<AnswerReaction>({
    table: "answer_reactions",
    filter: currentRound ? { column: "round_id", value: currentRound.id } : null,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("answer_reactions")
        .select("*")
        .eq("round_id", currentRound.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    currentRound,
    answers: answers.rows,
    reactions: reactions.rows,
    loading: rounds.loading || answers.loading || reactions.loading,
    error: rounds.error || answers.error || reactions.error || null,
  };
}
