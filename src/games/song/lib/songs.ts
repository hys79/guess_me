"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";

/**
 * song_submit_guess 의 결과
 *  correct   정답과 일치 → 자동 정답 처리
 *  submitted 정답이 아님 → 모두에게 공개되고, 출제자가 인정하면 정답이 될 수 있다
 *  already   이미 맞힘
 *  early     재생 시작 전 / closed 이미 끝난 라운드
 */
export type SongGuessResult =
  | "correct"
  | "submitted"
  | "already"
  | "early"
  | "closed";

function fail(message: string): never {
  throw new GameError(message);
}

/** 대기실 "게임 시작" / 종료 후 "다시 시작" (방장). 방장이 첫 출제자가 된다. */
export async function startSongGame(
  roomId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_start_game", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

interface SubmitRoundInput {
  roundId: string;
  playerId: string;
  videoId: string;
  startSec: number;
  durationSec: number;
  title: string;
}

/** 출제자가 문제를 제출한다. 정답은 서버에만 저장되고 다시 내려오지 않는다. */
export async function submitSongRound(input: SubmitRoundInput): Promise<void> {
  const { error } = await supabase.rpc("song_submit_round", {
    p_round_id: input.roundId,
    p_player_id: input.playerId,
    p_video_id: input.videoId,
    p_start_sec: Math.round(input.startSec),
    p_duration_sec: Math.round(input.durationSec),
    p_title: input.title,
  });
  if (error) fail(error.message);
}

/** ready -> playing (3초 뒤 모두 같이 재생). 멱등. */
export async function startSongRound(
  roundId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_start_round", {
    p_round_id: roundId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/** 출제자가 직접 쓴 힌트를 공개한다 (점수에는 영향 없음). */
export async function revealSongHint(
  roundId: string,
  playerId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_reveal_hint", {
    p_round_id: roundId,
    p_player_id: playerId,
    p_content: content,
  });
  if (error) fail(error.message);
}

/** 답안 제출. 정답 비교는 전부 서버에서 하고, 정답이 아니면 답안이 모두에게 공개된다. */
export async function submitSongGuess(
  roundId: string,
  playerId: string,
  text: string,
): Promise<SongGuessResult> {
  const { data, error } = await supabase.rpc("song_submit_guess", {
    p_round_id: roundId,
    p_player_id: playerId,
    p_text: text,
  });
  if (error) fail(error.message);
  return (data as SongGuessResult | null) ?? "closed";
}

/** 출제자가 공개된 답안을 정답으로 인정한다 (자동 정답과 똑같이 순서대로 점수를 받는다). */
export async function acceptSongAttempt(
  attemptId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_accept_attempt", {
    p_attempt_id: attemptId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/** playing -> revealed. 출제자 / 마감 시각 경과 / 전원 정답일 때만 실제로 전환된다(멱등). */
export async function finishSongRound(
  roundId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_finish_round", {
    p_round_id: roundId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/** 정답 공개 뒤 다음 문제로 (다음 출제자 또는 방장). */
export async function nextSongRound(
  roomId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_next_round", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/**
 * 이 브라우저가 영상을 재생하지 못했다고 출제자에게 알린다 (연령 제한·지역 제한 등으로
 * 출제자 화면에서는 잘 나와도 다른 사람은 막힐 수 있다). 출제자는 영상을 바꿀 수 있다.
 */
export async function reportSongPlaybackError(
  roundId: string,
  playerId: string,
  errorCode: number,
): Promise<void> {
  const { error } = await supabase
    .from("song_ready")
    .upsert(
      { round_id: roundId, player_id: playerId, error_code: errorCode },
      { onConflict: "round_id,player_id" },
    );
  if (error) fail(error.message);
}

/** 시작 전(ready)에 출제자가 영상을 다시 고른다 — 문제·정답·준비 상태가 비워지고 출제 화면으로 돌아간다. */
export async function resetSongRound(
  roundId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_reset_round", {
    p_round_id: roundId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/** (왕 모드) 방장이 왕위를 넘긴다 — 우승자가 새 방장이 되고 점수가 초기화된 채 대기실로. */
export async function promoteSongHost(
  roomId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("song_promote_host", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if (error) fail(error.message);
}

/** "준비" 완료 표시 (브라우저 소리 잠금을 푼 뒤). 이미 있으면 무시. */
export async function markSongReady(
  roundId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("song_ready")
    .upsert(
      { round_id: roundId, player_id: playerId },
      { onConflict: "round_id,player_id", ignoreDuplicates: true },
    );
  if (error) fail(error.message);
}

/** 출제자에게 힌트를 요청한다 (힌트가 공개되면 요청은 서버가 비운다). */
export async function requestSongHint(
  roundId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("song_hint_requests")
    .upsert(
      { round_id: roundId, player_id: playerId },
      { onConflict: "round_id,player_id", ignoreDuplicates: true },
    );
  if (error) fail(error.message);
}
