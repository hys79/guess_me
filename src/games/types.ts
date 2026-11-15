import type { ComponentType } from "react";
import type { StoredPlayer } from "@/lib/player";
import type { Player, Room, RoomMode } from "@/lib/supabase/database.types";

/** 방 생성 시 게임이 채우는 설정. rooms 의 공통 컬럼(+guess_me 전용 game_mode)에 대응한다. */
export interface RoomSettings {
  targetScore: number;
  /** null = 무제한 */
  answerTimeLimit: number | null;
  /** guess_me 전용 */
  gameMode?: RoomMode;
}

export interface CreateOptionsProps {
  value: RoomSettings;
  onChange: (next: RoomSettings) => void;
}

/** 방 페이지 셸이 게임 화면에 넘겨 주는 것 — 방/참가자 실시간 상태는 셸이 이미 구독 중이다. */
export interface GameRoomProps {
  room: Room;
  players: Player[];
  stored: StoredPlayer;
  /** 방 코드 (대문자) */
  code: string;
  /** 방 나가기 (플레이어 삭제 + 홈으로) */
  onLeave: () => void | Promise<void>;
}

/** 대기실 카드에 표시할 게임별 요약 */
export interface LobbyInfo {
  /** 게임 이름 옆에 붙는 작은 배지(예: guess_me 의 게임 모드). 필요 없으면 생략 */
  badge?: string;
  description: string;
  stats: { label: string; value: string }[];
}

/** 게임 하나가 허브에 제공해야 하는 것 */
export interface GameUI {
  /** waiting 이후(진행·종료) 화면 전체 */
  Room: ComponentType<GameRoomProps>;
  /** 방 만들기 화면의 게임별 옵션 */
  CreateOptions: ComponentType<CreateOptionsProps>;
  defaultSettings: RoomSettings;
  lobbyInfo(room: Room): LobbyInfo;
  /** 방장이 대기실에서 "게임 시작"을 눌렀을 때 */
  startGame(room: Room, playerId: string): Promise<void>;
}
