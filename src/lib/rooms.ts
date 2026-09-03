"use client";

import { supabase } from "@/lib/supabase/client";
import { setStoredPlayer, clearStoredPlayer } from "@/lib/player";
import { NICKNAME_MAX_LENGTH } from "@/lib/constants";
import type { Player, Room } from "@/lib/supabase/database.types";

export class GameError extends Error {}

function normalizeNickname(raw: string): string {
  const n = raw.trim().replace(/\s+/g, " ");
  if (!n) throw new GameError("닉네임을 입력하세요.");
  if (n.length > NICKNAME_MAX_LENGTH) {
    throw new GameError(`닉네임은 최대 ${NICKNAME_MAX_LENGTH}자입니다.`);
  }
  return n;
}

interface CreateRoomInput {
  hostNickname: string;
  targetScore: number;
  /** null = 무제한 */
  answerTimeLimit: number | null;
}

/** 방을 만들고 방장 플레이어를 등록한 뒤 localStorage 에 저장한다. */
export async function createRoom(
  input: CreateRoomInput,
): Promise<{ room: Room; player: Player }> {
  const nickname = normalizeNickname(input.hostNickname);

  // code 는 DB 기본값(gen_room_code())으로 자동 발급
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({
      host_nickname: nickname,
      target_score: input.targetScore,
      answer_time_limit: input.answerTimeLimit,
      status: "waiting",
    })
    .select("*")
    .single();

  if (roomError || !room) {
    throw new GameError(roomError?.message ?? "방 생성에 실패했습니다.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({ room_id: room.id, nickname, is_host: true })
    .select("*")
    .single();

  if (playerError || !player) {
    // 방장 등록 실패 시 방을 정리
    await supabase.from("rooms").delete().eq("id", room.id);
    throw new GameError(playerError?.message ?? "방장 등록에 실패했습니다.");
  }

  setStoredPlayer(room.code, {
    playerId: player.id,
    nickname: player.nickname,
    isHost: true,
  });

  return { room, player };
}

interface JoinRoomInput {
  code: string;
  nickname: string;
}

/**
 * 참가 코드로 입장한다. 같은 방 안 닉네임 중복은 막는다.
 * 진행 중인 게임에도 언제든 참가할 수 있다(일반 참가자로 합류).
 */
export async function joinRoom(
  input: JoinRoomInput,
): Promise<{ room: Room; player: Player }> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new GameError("참가 코드를 입력하세요.");
  const nickname = normalizeNickname(input.nickname);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (roomError) throw new GameError(roomError.message);
  if (!room) throw new GameError("존재하지 않는 참가 코드입니다.");

  // 사전 중복 체크 (UX 용). 최종 방어는 unique(room_id, nickname) 제약.
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("room_id", room.id)
    .eq("nickname", nickname)
    .maybeSingle();

  if (existing) {
    throw new GameError("이미 사용 중인 닉네임입니다. 다른 닉네임을 쓰세요.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({ room_id: room.id, nickname, is_host: false })
    .select("*")
    .single();

  if (playerError || !player) {
    if (playerError?.code === "23505") {
      throw new GameError("이미 사용 중인 닉네임입니다. 다른 닉네임을 쓰세요.");
    }
    throw new GameError(playerError?.message ?? "입장에 실패했습니다.");
  }

  setStoredPlayer(room.code, {
    playerId: player.id,
    nickname: player.nickname,
    isHost: false,
  });

  return { room, player };
}

/** 방을 나간다 (플레이어 row 삭제 + localStorage 정리). */
export async function leaveRoom(
  roomCode: string,
  playerId: string,
): Promise<void> {
  await supabase.from("players").delete().eq("id", playerId);
  clearStoredPlayer(roomCode);
}

/** 방장이 게임을 시작한다: rooms.status 를 'question' 으로 전환. */
export async function startGame(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ status: "question" })
    .eq("id", roomId);
  if (error) throw new GameError(error.message);
}
