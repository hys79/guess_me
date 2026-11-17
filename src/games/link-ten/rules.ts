/**
 * Link Ten — 규칙/점수 상수 (한 곳에서만 조정한다).
 *
 * 숫자 타일(1~9)을 드래그로 이어 합이 정확히 10이 되면 제거. 제거된 자리는 위에서 새 타일이
 * 떨어져 항상 판이 꽉 차 있다. 점수는 "연속 성공(콤보) 단계"에만 비례한다 — 타일을 몇 개 썼는지,
 * 어떤 숫자였는지는 점수에 영향이 없다.
 */

export const LINK_TEN = {
  rows: 8,
  cols: 8,
  /** 게임 시간(초) */
  durationSec: 60,
  /** 시작 전 카운트다운(초) */
  countdownSec: 3,
  /** 확정에 필요한 최소 타일 수 */
  minTiles: 2,
  /** 이어 붙인 합이 정확히 이 값이어야 제거된다 */
  targetSum: 10,
  /** 타일 숫자 범위 */
  minValue: 1,
  maxValue: 9,
  /** 이 시간 안에 다음 성공을 이어가면 콤보가 유지된다(ms) */
  comboWindowMs: 3000,
  /** 콤보 최대 단계 (1~5단계) */
  maxCombo: 5,
  /** 1단계당 점수. n단계로 성공하면 n × 이 값을 얻는다 */
  pointsPerStage: 10,
  /** 랭킹에 남길 닉네임 길이 (SQL 의 five_link_submit 과 일치) */
  nicknameMax: 12,
} as const;

/** streak = 이번 성공이 몇 번째 연속인지(1부터). 단계는 1~maxCombo 로 제한된다. */
export function comboStage(streak: number): number {
  return Math.min(Math.max(Math.floor(streak), 1), LINK_TEN.maxCombo);
}

/** 이번 성공으로 얻는 점수 — 콤보 단계에만 비례 (1단계 10점 … 5단계 50점) */
export function moveScore(streak: number): number {
  return comboStage(streak) * LINK_TEN.pointsPerStage;
}

export function isValidSum(sum: number, n: number): boolean {
  return n >= LINK_TEN.minTiles && sum === LINK_TEN.targetSum;
}
