import { SongRoom } from "@/games/song/SongRoom";
import { SongCreateOptions } from "@/games/song/CreateOptions";
import { startSongGame } from "@/games/song/lib/songs";
import { SONG_MODE_INFO, SONG_RULES } from "@/games/song/rules";
import type { GameUI } from "@/games/types";

export const songUI: GameUI = {
  Room: SongRoom,
  CreateOptions: SongCreateOptions,
  defaultSettings: {
    targetScore: SONG_RULES.targetDefault,
    answerTimeLimit: SONG_RULES.timeLimitDefault,
    gameMode: "king",
  },
  lobbyInfo(room) {
    const info = SONG_MODE_INFO[room.game_mode];
    return {
      badge: `${info.emoji} ${info.label}`,
      description: info.description,
      stats: [
        { label: "목표 점수", value: `${room.target_score}점` },
        {
          label: "정답 제한시간",
          value:
            room.answer_time_limit === null
              ? "무제한"
              : `${room.answer_time_limit}초`,
        },
      ],
    };
  },
  startGame: (room, playerId) => startSongGame(room.id, playerId),
};
