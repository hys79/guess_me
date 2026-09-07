"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";

/** 답변 공감에 쓰는 단일 이모지 */
export const LIKE_EMOJI = "❤️";

/** 답변에 "좋아요"를 남긴다. 사람당 답변 하나에 1개(upsert). */
export async function likeAnswer(input: {
  roundId: string;
  answerId: string;
  playerId: string;
}): Promise<void> {
  const { error } = await supabase.from("answer_reactions").upsert(
    {
      round_id: input.roundId,
      answer_id: input.answerId,
      player_id: input.playerId,
      emoji: LIKE_EMOJI,
    },
    { onConflict: "answer_id,player_id" },
  );
  if (error) throw new GameError(error.message);
}

/** "좋아요"를 취소한다(같은 버튼을 다시 눌렀을 때). */
export async function unlikeAnswer(input: {
  answerId: string;
  playerId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("answer_reactions")
    .delete()
    .eq("answer_id", input.answerId)
    .eq("player_id", input.playerId);
  if (error) throw new GameError(error.message);
}
