"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";
import type { Answer, AnswerScore } from "@/lib/supabase/database.types";

/**
 * 답변 제출/수정 (collecting 단계).
 * unique(round_id, player_id) 위에 upsert 하므로 마감 전엔 몇 번이든 고쳐 쓸 수 있다.
 */
export async function submitAnswer(input: {
  roundId: string;
  playerId: string;
  text: string;
}): Promise<Answer> {
  const text = input.text.trim();
  if (!text) throw new GameError("답변을 입력하세요.");

  const { data, error } = await supabase
    .from("answers")
    .upsert(
      {
        round_id: input.roundId,
        player_id: input.playerId,
        answer_text: text,
        score: null,
        is_editing: false,
      },
      { onConflict: "round_id,player_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new GameError(error?.message ?? "답변 제출에 실패했습니다.");
  }
  return data;
}

/**
 * 참여자가 제출 후 "수정 중" 상태로 들어가거나 빠져나올 때 호출.
 * 수정 중인 참여자가 있으면 다른 사람이 다 제출해도 자동으로 채점 단계로
 * 넘어가지 않는다. (시간 만료 시에는 무시하고 넘어감)
 */
export async function setAnswerEditing(input: {
  answerId: string;
  isEditing: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from("answers")
    .update({ is_editing: input.isEditing })
    .eq("id", input.answerId);
  if (error) throw new GameError(error.message);
}

/** 방장 채점 (scoring 단계). 공개 전까지는 몇 번이든 다시 매길 수 있다. */
export async function scoreAnswer(input: {
  answerId: string;
  score: AnswerScore;
}): Promise<void> {
  const { error } = await supabase
    .from("answers")
    .update({ score: input.score })
    .eq("id", input.answerId);
  if (error) throw new GameError(error.message);
}
