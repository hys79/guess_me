"use client";

import { useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  SongRound,
  SongHint,
  SongGuess,
  SongAttempt,
  SongReady,
  SongHintRequest,
} from "@/lib/supabase/database.types";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

/**
 * 노래 맞히기 한 방의 라운드 진행 상태를 실시간 구독한다.
 * (방/참가자는 방 페이지 셸의 useRoomBase 가 이미 구독하고 있다)
 *
 *  - song_rounds        : room_id = roomId       (라운드 상태 전환)
 *  - song_hints         : round_id = 현재 라운드  (공개된 힌트)
 *  - song_guesses       : round_id = 현재 라운드  (정답자 + 받은 점수)
 *  - song_attempts      : round_id = 현재 라운드  (제출된 답안 피드)
 *  - song_ready         : round_id = 현재 라운드  (준비 완료한 사람)
 *  - song_hint_requests : round_id = 현재 라운드  (힌트 요청)
 */
export function useSongState(roomId: string | null) {
  const rounds = useRealtimeTable<SongRound>({
    table: "song_rounds",
    filter: roomId ? { column: "room_id", value: roomId } : null,
    enabled: Boolean(roomId),
    fetchInitial: async () => {
      if (!roomId) return [];
      const { data, error } = await supabase
        .from("song_rounds")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentRound = useMemo<SongRound | null>(() => {
    if (rounds.rows.length === 0) return null;
    return rounds.rows.reduce((latest, r) =>
      r.created_at > latest.created_at ? r : latest,
    );
  }, [rounds.rows]);

  const roundFilter = currentRound
    ? { column: "round_id", value: currentRound.id }
    : null;

  const hints = useRealtimeTable<SongHint>({
    table: "song_hints",
    filter: roundFilter,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("song_hints")
        .select("*")
        .eq("round_id", currentRound.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const guesses = useRealtimeTable<SongGuess>({
    table: "song_guesses",
    filter: roundFilter,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("song_guesses")
        .select("*")
        .eq("round_id", currentRound.id)
        .order("place", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const attempts = useRealtimeTable<SongAttempt>({
    table: "song_attempts",
    filter: roundFilter,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("song_attempts")
        .select("*")
        .eq("round_id", currentRound.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ready = useRealtimeTable<SongReady>({
    table: "song_ready",
    filter: roundFilter,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("song_ready")
        .select("*")
        .eq("round_id", currentRound.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const requests = useRealtimeTable<SongHintRequest>({
    table: "song_hint_requests",
    filter: roundFilter,
    enabled: Boolean(currentRound),
    fetchInitial: async () => {
      if (!currentRound) return [];
      const { data, error } = await supabase
        .from("song_hint_requests")
        .select("*")
        .eq("round_id", currentRound.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 라운드 전환 직후 이전 라운드 행이 잠깐 남는 경우를 막는다
  const roundId = currentRound?.id ?? null;
  const mine = <T extends { round_id: string }>(rows: T[]) =>
    rows.filter((r) => r.round_id === roundId);

  return {
    currentRound,
    hints: mine(hints.rows),
    guesses: mine(guesses.rows).sort((a, b) => a.place - b.place),
    attempts: mine(attempts.rows).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    ready: mine(ready.rows),
    requests: mine(requests.rows),
    loading: rounds.loading,
    error:
      rounds.error ||
      hints.error ||
      guesses.error ||
      attempts.error ||
      ready.error ||
      requests.error ||
      null,
  };
}
