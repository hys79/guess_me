"use client";

import { useState } from "react";
import { createRandomRound, createCustomRound } from "@/lib/rounds";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";

interface HostQuestionPanelProps {
  roomId: string;
  hostPlayerId: string;
  hostNickname: string;
  /** 라운드 생성 성공 후 콜백 (선택) */
  onCreated?: () => void;
}

/**
 * 방장 전용. 두 가지로 라운드를 시작한다.
 *  1) 랜덤 질문   — public/questions.csv 에서 뽑아 "{닉네임}" + 문장 조합
 *  2) 직접 입력   — 자유 형식 질문 그대로
 */
export function HostQuestionPanel({
  roomId,
  hostPlayerId,
  hostNickname,
  onCreated,
}: HostQuestionPanelProps) {
  const { play } = useSound();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<null | "random" | "custom">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    kind: "random" | "custom",
    fn: () => Promise<unknown>,
  ) {
    if (busy) return;
    play("click");
    setBusy(kind);
    setError(null);
    try {
      await fn();
      setCustom("");
      onCreated?.();
    } catch (err) {
      setError(
        err instanceof GameError ? err.message : "질문 등록에 실패했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          질문 보내기 (방장)
        </p>
        <button
          onClick={() =>
            run("random", () =>
              createRandomRound({ roomId, hostPlayerId, hostNickname }),
            )
          }
          disabled={busy !== null}
          className="btn-primary w-full py-3 text-base"
        >
          {busy === "random" ? "뽑는 중..." : "🎲 랜덤 질문"}
        </button>
        <p className="mt-1 text-xs text-slate-400">
          예: {hostNickname}님이 가장 좋아하는 노래는 무엇인가요?
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-300">
        <span className="h-px flex-1 bg-slate-200" />
        또는
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("custom", () =>
            createCustomRound({
              roomId,
              hostPlayerId,
              questionText: custom,
            }),
          );
        }}
        className="space-y-2"
      >
        <label className="text-sm font-medium text-slate-700">
          직접 질문 입력
        </label>
        <textarea
          className="input-field min-h-[72px] resize-y"
          placeholder="자유 형식으로 질문을 작성하세요"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          disabled={busy !== null || custom.trim().length === 0}
          className="btn-secondary w-full py-2"
        >
          {busy === "custom" ? "보내는 중..." : "보내기"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
