"use client";

import { supabase } from "@/lib/supabase/client";
import { GameError } from "@/lib/rooms";
import type { ReactionEmoji } from "@/lib/supabase/database.types";

/** 답변에 이모지 반응을 남기거나 바꾼다. 사람당 답변 하나에 반응은 1개(upsert). */
export async function setReaction(input: {
  roundId: string;
  answerId: string;
  playerId: string;
  emoji: ReactionEmoji;
}): Promise<void> {
  const { error } = await supabase.from("answer_reactions").upsert(
    {
      round_id: input.roundId,
      answer_id: input.answerId,
      player_id: input.playerId,
      emoji: input.emoji,
    },
    { onConflict: "answer_id,player_id" },
  );
  if (error) throw new GameError(error.message);
}

/** 같은 이모지를 다시 눌렀을 때(취소) 반응을 지운다. */
export async function clearReaction(input: {
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
