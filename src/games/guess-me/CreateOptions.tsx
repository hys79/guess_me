"use client";

import { RoomSettingsFields } from "@/components/common/RoomSettingsFields";
import { GameModePicker } from "@/components/common/GameModePicker";
import { GAME_MODE_INFO } from "@/games/guess-me/constants";
import type { CreateOptionsProps } from "@/games/types";

/** Guess Me 방 만들기 옵션: 게임 모드 + 목표 점수 + 답변 제한시간 */
export function GuessMeCreateOptions({ value, onChange }: CreateOptionsProps) {
  return (
    <>
      <GameModePicker
        value={value.gameMode ?? "king"}
        onChange={(gameMode) => onChange({ ...value, gameMode })}
        info={GAME_MODE_INFO}
      />

      <RoomSettingsFields
        value={value}
        onChange={onChange}
        timeLabel="답변 제한시간"
      />
    </>
  );
}
