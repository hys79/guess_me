"use client";

import { useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  Room,
  Player,
  Round,
  Answer,
  AnswerReaction,
} from "@/lib/supabase/database.types";
import { useRealtimeTable } from "./useRealtimeTable";

/**
 * 한 방의 전체 게임 상태를 실시간 구독한다.
 *
 * 구독 대상:
 *  - rooms     : 해당 room 1건        (status, target_score 등 변경 반영)
 *  - players   : room_id = roomId     (점수판 실시간 갱신)
 *  - rounds    : room_id = roomId     (라운드 진행/전환 반영)
 *  - answers   : round_id = 현재 라운드 (답변 도착 / 채점 결과 반영)
 *  - reactions : round_id = 현재 라운드 (공개 화면 이모지 반응 실시간 반영)
 *
 * roomId 를 아직 모르면 roomCode 로 방을 먼저 찾도록 useRoomByCode 를 쓴다.
 */
export function useGameState(roomId: string | null) {
  const room = useRealtimeTable<Room>({
    table: "rooms",
    filter: roomId ? { column: "id", value: roomId } : null,
    enabled: Boolean(roomId),
    fetchInitial: async () => {
      if (!roomId) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });

  const players = useRealtimeTable<Player>({
    table: "players",
    filter: roomId ? { column: "room_id", value: roomId } : null,
    enabled: Boolean(roomId),
    fetchInitial: async () => {
      if (!roomId) return [];
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

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
    room: room.rows[0] ?? null,
    players: players.rows,
    rounds: rounds.rows,
    currentRound,
    answers: answers.rows,
    reactions: reactions.rows,
    loading:
      room.loading ||
      players.loading ||
      rounds.loading ||
      answers.loading ||
      reactions.loading,
    error:
      room.error ||
      players.error ||
      rounds.error ||
      answers.error ||
      reactions.error ||
      null,
    refetch: {
      room: room.refetch,
      players: players.refetch,
      rounds: rounds.refetch,
      answers: answers.refetch,
      reactions: reactions.refetch,
    },
  };
}
