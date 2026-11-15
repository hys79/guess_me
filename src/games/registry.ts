/**
 * 게임 레지스트리 — "메타데이터만". 서버 컴포넌트(홈)에서도 가져다 쓸 수 있도록
 * 화면 컴포넌트를 import 하지 않는다. 화면/행동은 games/ui.ts 쪽에 있다.
 *
 * 새 게임 추가 = (1) 여기에 한 줄 (2) games/<id>/ 모듈 (3) games/ui.ts 에 한 줄
 * (4) supabase/migrations/ 에 게임 SQL 파일 1개.
 */

/** 허브 이름 (바뀔 수 있으니 한 곳에서만 쓴다) */
export const HUB_NAME = "미니게임 모음";
export const HUB_TAGLINE = "방 코드 하나로 친구들과 바로 한 판";

export type GameId = "guess_me" | "song";

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  icon: string;
  /** 카드에 표시하는 권장 인원 */
  players: string;
  /** 시작에 필요한 최소 인원 */
  minPlayers: number;
  /** false 면 이 게임 방에서는 배경음악을 끈다 (게임 자체가 소리를 쓰는 경우) */
  bgm: boolean;
}

export const GAMES: GameMeta[] = [
  {
    id: "guess_me",
    name: "Guess Me!",
    tagline: "나를 가장 잘 아는 사람은 누구?",
    icon: "🎯",
    players: "3명 이상 추천",
    minPlayers: 2,
    bgm: true,
  },
  {
    id: "song",
    name: "노래 맞히기",
    tagline: "짧은 구간만 듣고 제목을 맞혀라",
    icon: "🎧",
    players: "2명 이상",
    minPlayers: 2,
    bgm: false,
  },
];

export function getGameMeta(id: string | null | undefined): GameMeta | null {
  return GAMES.find((g) => g.id === id) ?? null;
}
