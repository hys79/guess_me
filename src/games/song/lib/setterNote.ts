"use client";

/**
 * 출제자가 방금 낸 정답을 "내 화면에서만" 보여 주기 위한 메모.
 * 정답은 서버에서 다시 읽을 수 없으므로(보안), 제출 순간 이 브라우저 탭에만 저장해 둔다.
 * 새로고침까지는 살아남고, 탭을 닫으면 사라진다.
 */

export interface SetterNote {
  title: string;
}

const keyFor = (roundId: string) => `song:setter-note:${roundId}`;

export function saveSetterNote(roundId: string, note: SetterNote): void {
  try {
    window.sessionStorage.setItem(keyFor(roundId), JSON.stringify(note));
  } catch {
    /* 저장 못 해도 게임에는 지장 없다 */
  }
}

export function loadSetterNote(roundId: string): SetterNote | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(roundId));
    return raw ? (JSON.parse(raw) as SetterNote) : null;
  } catch {
    return null;
  }
}
