"use client";

import { supabase } from "@/lib/supabase/client";
import type { Room, Player } from "@/lib/supabase/database.types";
import { useRealtimeTable } from "./useRealtimeTable";

/**
 * 어떤 게임이든 공통인 "방 + 참가자" 실시간 상태.
 * 게임별 상태(라운드·답변 등)는 각 게임의 훅이 따로 구독한다.
 */
export function useRoomBase(roomId: string | null) {
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

  return {
    room: room.rows[0] ?? null,
    players: players.rows,
    loading: room.loading || players.loading,
    error: room.error || players.error || null,
  };
}
