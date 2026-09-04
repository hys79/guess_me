"use client";

import { supabase } from "@/lib/supabase/client";
import type { Player, ReactionEmoji } from "@/lib/supabase/database.types";

export interface GameAward {
  emoji: ReactionEmoji;
  title: string;
  count: number;
  answerText: string;
  authorNickname: string;
  questionText: string;
  askerNickname: string;
}

const AWARD_TITLES: Record<ReactionEmoji, string> = {
  "😆": "가장 웃겼던 답변",
  "😮": "가장 놀라웠던 답변",
  "👏": "가장 공감을 많이 받은 답변",
};

/** 어워드로 뽑을 순서 (화면에 보여줄 순서와 동일) */
const EMOJI_ORDER: ReactionEmoji[] = ["😆", "😮", "👏"];

/**
 * 방금 끝난 게임(현재 room 에 남아 있는 모든 라운드) 전체에서, 이모지 종류별로
 * 가장 많이 받은 답변 하나씩을 뽑는다. 동점이면 무작위로 하나 고르고, 아무도
 * 그 이모지를 안 눌렀으면(0회) 해당 어워드는 아예 뺀다.
 *
 * "다시 시작"이 rounds 를 지우기 전, GameFinished 화면에서 한 번만 호출한다.
 */
export async function fetchGameAwards(
  roomId: string,
  players: Player[],
): Promise<GameAward[]> {
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, question_text, target_player_id")
    .eq("room_id", roomId);
  if (!rounds || rounds.length === 0) return [];

  const roundIds = rounds.map((r) => r.id);

  const { data: answers } = await supabase
    .from("answers")
    .select("id, round_id, player_id, answer_text")
    .in("round_id", roundIds);
  if (!answers || answers.length === 0) return [];

  const { data: reactions } = await supabase
    .from("answer_reactions")
    .select("answer_id, emoji")
    .in("round_id", roundIds);
  if (!reactions || reactions.length === 0) return [];

  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "(퇴장)";
  const roundOf = (roundId: string) => rounds.find((r) => r.id === roundId);
  const answerOf = (answerId: string) =>
    answers.find((a) => a.id === answerId);

  const awards: GameAward[] = [];

  for (const emoji of EMOJI_ORDER) {
    const counts = new Map<string, number>();
    for (const r of reactions) {
      if (r.emoji !== emoji) continue;
      counts.set(r.answer_id, (counts.get(r.answer_id) ?? 0) + 1);
    }

    const max = counts.size > 0 ? Math.max(...counts.values()) : 0;
    if (max <= 0) continue; // 아무도 이 이모지를 안 눌렀으면 어워드 생략

    const topAnswerIds = [...counts.entries()]
      .filter(([, count]) => count === max)
      .map(([answerId]) => answerId);
    const winnerId =
      topAnswerIds[Math.floor(Math.random() * topAnswerIds.length)];

    const answer = answerOf(winnerId);
    const round = answer ? roundOf(answer.round_id) : undefined;
    if (!answer || !round) continue;

    awards.push({
      emoji,
      title: AWARD_TITLES[emoji],
      count: max,
      answerText: answer.answer_text,
      authorNickname: nameOf(answer.player_id),
      questionText: round.question_text,
      askerNickname: nameOf(round.target_player_id),
    });
  }

  return awards;
}
