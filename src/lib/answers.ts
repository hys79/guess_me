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
