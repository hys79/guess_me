import { guessMeUI } from "@/games/guess-me/ui";
import { songUI } from "@/games/song/ui";
import type { GameId } from "@/games/registry";
import type { GameUI } from "@/games/types";

/**
 * 게임 id → 화면/행동 구현. (메타데이터는 games/registry.ts)
 * 클라이언트 컴포넌트를 import 하므로 서버 컴포넌트에서는 쓰지 말 것.
 */
export const GAME_UI: Record<GameId, GameUI> = {
  guess_me: guessMeUI,
  song: songUI,
};

export function getGameUI(id: string | null | undefined): GameUI | null {
  return id && id in GAME_UI ? GAME_UI[id as GameId] : null;
}
