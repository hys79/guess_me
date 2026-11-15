"use client";

import { RoomSettingsFields } from "@/components/common/RoomSettingsFields";
import { GameModePicker } from "@/components/common/GameModePicker";
import { SONG_MODE_INFO, SONG_RULES, songRuleLines } from "@/games/song/rules";
import type { CreateOptionsProps } from "@/games/types";

/** 노래 맞히기 방 만들기 옵션: 게임 모드 + 목표 점수 + 정답 제한시간 + 규칙 안내 */
export function SongCreateOptions({ value, onChange }: CreateOptionsProps) {
  const mode = value.gameMode ?? "king";

  return (
    <>
      <GameModePicker
        value={mode}
        onChange={(gameMode) => onChange({ ...value, gameMode })}
        info={SONG_MODE_INFO}
      />

      <RoomSettingsFields
        value={value}
        onChange={onChange}
        targetMin={SONG_RULES.targetMin}
        targetMax={SONG_RULES.targetMax}
        timeLabel="정답 제한시간 (재생 시작부터)"
      />
      <ul className="space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        {songRuleLines(mode).map((line) => (
          <li key={line}>· {line}</li>
        ))}
        <li>· 제한시간 없이 하면 출제자가 정답을 공개할 때까지 계속돼요</li>
      </ul>
    </>
  );
}
