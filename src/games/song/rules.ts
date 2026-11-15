/**
 * 노래 맞히기 규칙 상수.
 * 점수 계산은 DB(song_points)가 하고 이 값은 화면 안내용이다 — 규칙을 바꾸려면
 * supabase/migrations/0004_game_song.sql 의 song_points 와 반드시 같이 고칠 것.
 */
export const SONG_RULES = {
  /** 출제 구간 길이(초) */
  clipMin: 1,
  clipMax: 30,
  clipDefault: 3,
  /** 재생 시작 전 카운트다운(초) — DB 의 song_start_round 와 같아야 한다 */
  leadInSec: 3,
  /** 목표 점수 범위 */
  targetMin: 3,
  targetMax: 20,
  targetDefault: 10,
  /** 정답 제한시간 기본값(초) — 재생 시작부터 센다 */
  timeLimitDefault: 60,
} as const;

/**
 * DB 의 song_points 와 같은 계산 (UI 안내용).
 * 맞히는 사람(출제자를 뺀 참가자)이 total 명이면 1등 total 점, 2등 total-1 점, … 최소 1점.
 */
export function songPoints(place: number, total: number): number {
  return Math.max(1, total - place + 1);
}

/** 게임 모드 (Guess Me 와 같은 이름의 두 가지) */
export const SONG_MODE_INFO = {
  king: {
    label: "왕 모드",
    emoji: "👑",
    description:
      "방장이 계속 문제를 내요. 목표 점수에 먼저 도달한 사람이 왕위를 이어받아요",
  },
  everyone: {
    label: "다같이 모드",
    emoji: "🔄",
    description: "모든 참여자가 참가 순서대로 돌아가며 문제를 내요",
  },
} as const;

/** 한 줄 요약 (방 만들기 / 출제 대기 화면에서 공통으로 쓴다). 모드마다 한 줄이 다르다. */
export function songRuleLines(mode: "king" | "everyone"): string[] {
  return [
    "먼저 맞힌 순서대로 점수를 받아요 (맞히는 사람이 4명이면 1등 4점, 2등 3점, …)",
    "전원이 맞히거나, 제한시간이 끝나거나, 출제자가 끝내면 정답이 공개되고 노래가 이어서 나와요",
    mode === "king"
      ? "방장이 계속 출제자예요. 목표 점수에 먼저 도달한 사람이 왕위를 이어받아요"
      : "출제자는 참가 순서대로 돌아가요. 목표 점수에 먼저 도달하면 게임이 끝나요",
  ];
}
