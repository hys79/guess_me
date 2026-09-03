"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type TableName = "rooms" | "players" | "rounds" | "answers";

/** postgres_changes 콜백이 넘겨주는 payload 의 느슨한 형태 */
interface ChangePayload<Row> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Row | Record<string, never>;
  old: Partial<Row> | Record<string, never>;
}

interface Options<Row> {
  table: TableName;
  /** 예: { column: "room_id", value: roomId } — 없으면 테이블 전체 구독 */
  filter?: { column: string; value: string } | null;
  /** 최초 스냅샷 로드. 구독 시작 전에 한 번 호출된다. */
  fetchInitial: () => Promise<Row[]>;
  /** row 의 고유 키 (기본 row.id) */
  getKey?: (row: Row) => string;
  /** 구독을 비활성화 (필요 값이 아직 없을 때) */
  enabled?: boolean;
}

interface Result<Row> {
  rows: Row[];
  loading: boolean;
  error: string | null;
  /** 낙관적 업데이트나 강제 재조회용 */
  refetch: () => Promise<void>;
}

/**
 * 한 테이블의 (선택적으로 필터된) 행 집합을 Supabase Realtime 으로 실시간 동기화한다.
 *
 * - 마운트 시 fetchInitial() 로 스냅샷을 만든 뒤
 * - postgres_changes(INSERT/UPDATE/DELETE) 를 받아 로컬 배열을 갱신한다.
 * - filter/enabled 가 바뀌면 채널을 정리하고 다시 구독한다.
 */
export function useRealtimeTable<Row extends { id: string }>({
  table,
  filter = null,
  fetchInitial,
  getKey = (row) => row.id,
  enabled = true,
}: Options<Row>): Result<Row> {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 최신 콜백 참조 유지 (effect 재실행 방지)
  const fetchInitialRef = useRef(fetchInitial);
  const getKeyRef = useRef(getKey);
  fetchInitialRef.current = fetchInitial;
  getKeyRef.current = getKey;

  const filterKey = filter ? `${filter.column}=eq.${filter.value}` : "*";

  const load = useRef(async () => {});
  load.current = async () => {
    setLoading(true);
    setError(null);
    try {
      const initial = await fetchInitialRef.current();
      setRows(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return;
    }

    // filter/enabled 가 바뀌면(예: 현재 라운드 전환) 이전 필터의 행을 즉시 비운다.
    // 그렇지 않으면 새 fetch 가 끝나기 전까지 이전 라운드의 answers 가 남아
    // "2번째 라운드부터 답변 수집 없이 바로 채점으로 넘어가는" 버그가 생긴다.
    setRows([]);
    setLoading(true);

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const applyChange = (payload: ChangePayload<Row>) => {
      setRows((prev) => {
        const key = getKeyRef.current;
        if (payload.eventType === "INSERT") {
          const next = payload.new as Row;
          if (prev.some((r) => key(r) === key(next))) return prev;
          return [...prev, next];
        }
        if (payload.eventType === "UPDATE") {
          const next = payload.new as Row;
          return prev.map((r) => (key(r) === key(next) ? next : r));
        }
        if (payload.eventType === "DELETE") {
          const old = payload.old as Row;
          return prev.filter((r) => key(r) !== key(old));
        }
        return prev;
      });
    };

    void load.current().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`realtime:${table}:${filterKey}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            ...(filter ? { filter: filterKey } : {}),
          },
          (payload) => applyChange(payload as unknown as ChangePayload<Row>),
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            setError("실시간 연결 오류");
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // filterKey 는 filter 를 문자열로 요약한 값
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filterKey, enabled]);

  return {
    rows,
    loading,
    error,
    refetch: () => load.current(),
  };
}
