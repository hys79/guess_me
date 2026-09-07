"use client";

import { supabase } from "@/lib/supabase/client";
import type { Player } from "@/lib/supabase/database.types";

export interface GameAward {
  count: number;
  answerText: string;
  authorNickname: string;
  questionText: string;
  askerNickname: string;
}

/**
 * 방금 끝난 게임(현재 room 에 남아 있는 모든 라운드) 전체에서 "좋아요"를 가장
 * 많이 받은 답변 하나를 뽑는다. 동점이면 무작위로 하나 고르고, 좋아요가 하나도
 * 없으면 null 을 돌려준다(어워드 화면 자체를 숨긴다).
 *
 * "다시 시작"/"왕위 넘기기"가 rounds 를 지우기 전, GameFinished 화면에서 한 번만
 * 호출한다.
 */
export async function fetchGameAward(
  roomId: string,
  players: Player[],
): Promise<GameAward | null> {
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, question_text, target_player_id")
    .eq("room_id", roomId);
  if (!rounds || rounds.length === 0) return null;

  const roundIds = rounds.map((r) => r.id);

  const { data: answers } = await supabase
    .from("answers")
    .select("id, round_id, player_id, answer_text")
    .in("round_id", roundIds);
  if (!answers || answers.length === 0) return null;

  const { data: reactions } = await supabase
    .from("answer_reactions")
    .select("answer_id")
    .in("round_id", roundIds);
  if (!reactions || reactions.length === 0) return null;

  const counts = new Map<string, number>();
  for (const r of reactions) {
    counts.set(r.answer_id, (counts.get(r.answer_id) ?? 0) + 1);
  }

  const max = Math.max(...counts.values());
  if (max <= 0) return null;

  const topAnswerIds = [...counts.entries()]
    .filter(([, c]) => c === max)
    .map(([answerId]) => answerId);
  const winnerId =
    topAnswerIds[Math.floor(Math.random() * topAnswerIds.length)];

  const answer = answers.find((a) => a.id === winnerId);
  const round = answer
    ? rounds.find((r) => r.id === answer.round_id)
    : undefined;
  if (!answer || !round) return null;

  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "(퇴장)";

  return {
    count: max,
    answerText: answer.answer_text,
    authorNickname: nameOf(answer.player_id),
    questionText: round.question_text,
    askerNickname: nameOf(round.target_player_id),
  };
}
