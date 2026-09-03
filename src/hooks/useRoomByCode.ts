"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Room } from "@/lib/supabase/database.types";

/** 참가 코드로 방을 1회 조회해 roomId 를 얻는다. (이후 실시간 구독은 useGameState 담당) */
export function useRoomByCode(roomCode: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(Boolean(roomCode));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setRoom(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("rooms")
      .select("*")
      .eq("code", roomCode.toUpperCase())
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setRoom(data ?? null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  return { room, roomId: room?.id ?? null, loading, error };
}
