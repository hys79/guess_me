"use client";

import { useEffect, useState } from "react";
import { submitAnswer } from "@/lib/answers";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type { Answer } from "@/lib/supabase/database.types";

interface AnswerInputProps {
  roundId: string;
  playerId: string;
  /** 내 기존 답변 (있으면 수정 모드) */
  myAnswer: Answer | null;
  /** collecting 단계가 아니면 잠금 */
  locked: boolean;
}

export function AnswerInput({
  roundId,
  playerId,
  myAnswer,
  locked,
}: AnswerInputProps) {
  const { play } = useSound();
  const [text, setText] = useState(myAnswer?.answer_text ?? "");
  const [editing, setEditing] = useState(!myAnswer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 기기에서 제출/수정된 경우 동기화
  useEffect(() => {
    if (myAnswer && !editing) setText(myAnswer.answer_text);
  }, [myAnswer, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    try {
      await submitAnswer({ roundId, playerId, text });
      play("submit");
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof GameError ? err.message : "제출에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (locked && !myAnswer) {
    return (
      <div className="card text-center text-sm text-slate-500">
        답변을 제출하지 못했습니다. (시간 종료)
      </div>
    );
  }

  if (myAnswer && !editing) {
    return (
      <div className="card space-y-2">
        <p className="text-xs font-semibold text-primary-600">
          내 답변 제출 완료
        </p>
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {myAnswer.answer_text || <span className="text-slate-400">(빈 답변)</span>}
        </p>
        {!locked ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-slate-400 hover:text-primary-600"
          >
            시간 마감 전까지 수정 가능 →
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <label className="text-sm font-semibold text-slate-700">내 답변</label>
      <textarea
        className="input-field min-h-[80px] resize-y"
        placeholder="답변을 입력하세요"
        value={text}
        maxLength={300}
        disabled={busy || locked}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || locked || text.trim().length === 0}
        className="btn-primary w-full py-2"
      >
        {busy ? "제출 중..." : myAnswer ? "수정하기" : "제출하기"}
      </button>
    </form>
  );
}
