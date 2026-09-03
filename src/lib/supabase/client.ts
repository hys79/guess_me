"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요.",
  );
}

/**
 * 브라우저 전역 싱글턴 Supabase 클라이언트.
 * Auth 를 쓰지 않으므로 세션 저장/자동 갱신을 끈다.
 * HMR 로 모듈이 여러 번 평가돼도 realtime 연결이 중복되지 않도록 globalThis 에 캐시한다.
 */
declare global {
  // eslint-disable-next-line no-var
  var __guessMeSupabase__: SupabaseClient<Database> | undefined;
}

export const supabase: SupabaseClient<Database> =
  globalThis.__guessMeSupabase__ ??
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__guessMeSupabase__ = supabase;
}
