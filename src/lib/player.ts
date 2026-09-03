"use client";

/**
 * 플레이어 식별 (Supabase Auth 미사용).
 *
 * 방(code) 별로 내가 만든 player row 의 id 와 nickname 을 localStorage 에 저장한다.
 * 새로고침/재접속 시 이 값으로 "나"를 복원한다.
 */

export interface StoredPlayer {
  playerId: string;
  nickname: string;
  isHost: boolean;
}

const KEY_PREFIX = "guess_me:player:";

function keyFor(roomCode: string): string {
  return KEY_PREFIX + roomCode.toUpperCase();
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredPlayer(roomCode: string): StoredPlayer | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPlayer>;
    if (!parsed.playerId || !parsed.nickname) return null;
    return {
      playerId: parsed.playerId,
      nickname: parsed.nickname,
      isHost: Boolean(parsed.isHost),
    };
  } catch {
    return null;
  }
}

export function setStoredPlayer(roomCode: string, player: StoredPlayer): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(keyFor(roomCode), JSON.stringify(player));
}

export function clearStoredPlayer(roomCode: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(keyFor(roomCode));
}

/** 내가 참가 중인 모든 방 코드 목록 (로비의 "다시 참가하기" 등에 사용) */
export function listJoinedRoomCodes(): string[] {
  if (!isBrowser()) return [];
  const codes: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(KEY_PREFIX)) codes.push(k.slice(KEY_PREFIX.length));
  }
  return codes;
}
