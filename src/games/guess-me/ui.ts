import { GuessMeRoom } from "@/games/guess-me/GuessMeRoom";
import { GuessMeCreateOptions } from "@/games/guess-me/CreateOptions";
import { GAME_MODE_INFO } from "@/games/guess-me/constants";
import { startGuessMeGame } from "@/games/guess-me/lib/start";
import {
  ANSWER_TIME_LIMIT_DEFAULT,
  TARGET_SCORE_DEFAULT,
} from "@/lib/constants";
import type { GameUI } from "@/games/types";

export const guessMeUI: GameUI = {
  Room: GuessMeRoom,
  CreateOptions: GuessMeCreateOptions,
  defaultSettings: {
    targetScore: TARGET_SCORE_DEFAULT,
    answerTimeLimit: ANSWER_TIME_LIMIT_DEFAULT,
    gameMode: "king",
  },
  lobbyInfo(room) {
    const info = GAME_MODE_INFO[room.game_mode];
    return {
      badge: `${info.emoji} ${info.label}`,
      description: info.description,
      stats: [
        { label: "목표 점수", value: `${room.target_score}점` },
        {
          label: "답변 제한시간",
          value:
            room.answer_time_limit === null
              ? "무제한"
              : `${room.answer_time_limit}초`,
        },
      ],
    };
  },
  startGame: (room) => startGuessMeGame(room.id),
};
