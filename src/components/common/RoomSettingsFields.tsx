"use client";

import { RangeField } from "@/components/RangeField";
import {
  ANSWER_TIME_LIMIT_MAX,
  ANSWER_TIME_LIMIT_MIN,
  TARGET_SCORE_MAX,
  TARGET_SCORE_MIN,
} from "@/lib/constants";
import type { RoomSettings } from "@/games/types";

interface RoomSettingsFieldsProps {
  value: RoomSettings;
  onChange: (next: RoomSettings) => void;
  targetMin?: number;
  targetMax?: number;
  timeLabel?: string;
  /** false 면 "무제한" 토글을 숨긴다 */
  allowUnlimited?: boolean;
}

/** 모든 게임이 공유하는 방 설정: 목표 점수 + 제한시간(무제한 선택 가능). */
export function RoomSettingsFields({
  value,
  onChange,
  targetMin = TARGET_SCORE_MIN,
  targetMax = TARGET_SCORE_MAX,
  timeLabel = "제한시간",
  allowUnlimited = true,
}: RoomSettingsFieldsProps) {
  const unlimited = value.answerTimeLimit === null;
  // 무제한을 껐다 켜도 마지막으로 고른 숫자를 기억하도록 슬라이더 표시값을 분리한다
  const shownSeconds = value.answerTimeLimit ?? ANSWER_TIME_LIMIT_MIN;

  return (
    <>
      <RangeField
        label="목표 점수"
        value={value.targetScore}
        min={targetMin}
        max={targetMax}
        unit="점"
        onChange={(targetScore) => onChange({ ...value, targetScore })}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{timeLabel}</span>
          {allowUnlimited ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  answerTimeLimit: unlimited ? 30 : null,
                })
              }
              className={
                unlimited
                  ? "rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500"
              }
            >
              무제한
            </button>
          ) : null}
        </div>
        <RangeField
          label={unlimited ? "무제한" : ""}
          value={shownSeconds}
          min={ANSWER_TIME_LIMIT_MIN}
          max={ANSWER_TIME_LIMIT_MAX}
          unit="초"
          disabled={unlimited}
          onChange={(answerTimeLimit) => onChange({ ...value, answerTimeLimit })}
        />
      </div>
    </>
  );
}
