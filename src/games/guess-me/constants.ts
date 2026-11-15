/** Guess Me 전용 상수 */

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
