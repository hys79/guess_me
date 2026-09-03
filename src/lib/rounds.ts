"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";
import { pickRandomQuestionSuffix } from "@/lib/questions";
import type { Round } from "@/lib/supabase/database.types";

interface NewRoundBase {
  roomId: string;
  /** 라운드의 대상(= 방장) player id */
  hostPlayerId: string;
}

async function insertRound(
  roomId: string,
  hostPlayerId: string,
  questionText: string,
): Promise<Round> {
  const text = questionText.trim();
  if (!text) throw new GameError("질문이 비어 있습니다.");

  const { data, error } = await supabase
    .from("rounds")
    .insert({
      room_id: roomId,
      target_player_id: hostPlayerId,
      question_text: text,
      status: "collecting",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new GameError(error?.message ?? "라운드 생성에 실패했습니다.");
  }

  // 대기실/이전 상태에서 넘어온 경우 방 상태를 'question' 으로 맞춘다.
  await supabase
    .from("rooms")
    .update({ status: "question" })
    .eq("id", roomId)
    .neq("status", "question");

  return data;
}

/**
 * "랜덤 질문": public/questions.csv 에서 무작위 문장을 뽑아
 * "{방장 닉네임}" + 문장 을 조합해 라운드를 만든다.
 * (CSV 수정 후 재배포하면 바로 반영됨 — Supabase 설정 불필요)
 */
export async function createRandomRound(
  input: NewRoundBase & { hostNickname: string },
): Promise<Round> {
  let suffix: string | null = null;
  try {
    suffix = await pickRandomQuestionSuffix();
  } catch {
    // CSV 로드 실패 시 questions_bank RPC 로 폴백
    const { data } = await supabase.rpc("pick_random_question");
    suffix = data ?? null;
  }
  if (!suffix) {
    throw new GameError("질문 목록을 불러오지 못했습니다.");
  }
  const question = `${input.hostNickname}${suffix}`;
  return insertRound(input.roomId, input.hostPlayerId, question);
}

/**
 * "직접 입력": 방장이 자유 형식으로 작성한 질문 그대로 라운드를 만든다.
 * (닉네임을 붙이지 않는다)
 */
export async function createCustomRound(
  input: NewRoundBase & { questionText: string },
): Promise<Round> {
  return insertRound(input.roomId, input.hostPlayerId, input.questionText);
}

// --- 상태 전환 (DB RPC, 멱등) -------------------------------------------------

/** collecting -> scoring : 미제출자 빈 답변 채우고 채점 단계로. */
export async function advanceToScoring(roundId: string): Promise<void> {
  const { error } = await supabase.rpc("advance_to_scoring", {
    p_round_id: roundId,
  });
  if (error) throw new GameError(error.message);
}

/** scoring -> revealed : 누적 점수 반영 후 공개 단계로. */
export async function finalizeRound(roundId: string): Promise<void> {
  const { error } = await supabase.rpc("finalize_round", {
    p_round_id: roundId,
  });
  if (error) throw new GameError(error.message);
}

/** target_score 도달자를 새 방장으로 지정하고 대기실로 되돌린다. */
export async function promoteHost(
  roomId: string,
  newHostPlayerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("promote_host", {
    p_room_id: roomId,
    p_new_host: newHostPlayerId,
  });
  if (error) throw new GameError(error.message);
}
