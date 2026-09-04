/** 게임 규칙 관련 상수 (스키마의 CHECK 제약과 일치시킬 것) */

export const TARGET_SCORE_MIN = 1;
export const TARGET_SCORE_MAX = 20;
export const TARGET_SCORE_DEFAULT = 10;

export const ANSWER_TIME_LIMIT_MIN = 5; // 초
export const ANSWER_TIME_LIMIT_MAX = 100; // 초
/** null = 무제한 */
export const ANSWER_TIME_LIMIT_DEFAULT: number | null = 30;

export const ROOM_CODE_LENGTH = 4;

export const NICKNAME_MAX_LENGTH = 12;

/** 게임 시작에 필요한 최소 인원 */
export const MIN_PLAYERS_TO_START = 2;

export const GAME_MODE_INFO = {
  king: {
    label: "왕 모드",
    emoji: "👑",
    description: "방장이 왕이 되어 혼자 질문을 해요",
  },
  everyone: {
    label: "다같이 모드",
    emoji: "🔄",
    description: "모든 참여자가 순서대로 돌아가며 질문을 해요",
  },
} as const;
