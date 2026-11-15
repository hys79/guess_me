"use client";

import { useEffect, useRef, useState } from "react";
import { submitSongGuess, requestSongHint } from "@/games/song/lib/songs";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type { SongGuess } from "@/lib/supabase/database.types";

interface GuessPanelProps {
  roundId: string;
  playerId: string;
  /** 재생 시작 전(카운트다운)에는 입력만 막아 둔다 */
  open: boolean;
  /** 내가 이미 맞혔다면 그 기록 */
  myGuess: SongGuess | null;
  /** 내가 이미 힌트를 요청해 두었는가 */
  hintRequested: boolean;
}

type Feedback = null | { kind: "info"; text: string };

/** 푸는 사람 전용: 정답 입력 + 힌트 요청. 비교는 서버가 하고, 오답은 어디에도 남지 않는다. */
export function GuessPanel({
  roundId,
  playerId,
  open,
  myGuess,
  hintRequested,
}: GuessPanelProps) {
  const { play } = useSound();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  function flash(next: Feedback) {
    setFeedback(next);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 1800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const guess = text.trim();
    if (!guess || busy || !open || myGuess) return;
    setBusy(true);
    try {
      const result = await submitSongGuess(roundId, playerId, guess);
      if (result === "correct") {
        play("scorePlus");
        setText("");
        setFeedback(null);
      } else if (result === "submitted") {
        // 정답이 아니어도 답안은 모두에게 공개된다 — 출제자가 인정해 줄 수도 있다
        play("submit");
        setText("");
        flash({
          kind: "info",
          text: "📨 답안을 보냈어요. 정답이 아니어도 출제자가 인정해 줄 수 있어요! (내 답안은 최근 2개까지만 보여요)",
        });
      } else if (result === "early") {
        flash({ kind: "info", text: "아직 재생 전이에요." });
      } else if (result === "closed") {
        flash({ kind: "info", text: "이 라운드는 이미 끝났어요." });
      }
    } catch (err) {
      flash({
        kind: "info",
        text: err instanceof GameError ? err.message : "제출하지 못했어요.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleHintRequest() {
    if (hintRequested) return;
    play("click");
    try {
      await requestSongHint(roundId, playerId);
    } catch {
      /* 부가 기능 — 실패해도 조용히 */
    }
  }

  if (myGuess) {
    return (
      <div className="card animate-pop space-y-1 text-center">
        <p className="text-3xl">🎉</p>
        <p className="text-lg font-bold text-primary-700">정답! +{myGuess.points}점</p>
        <p className="text-xs text-slate-400">
          {myGuess.place}번째로 맞혔어요. 다른 사람들이 맞히길 기다리는 중…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <div className="flex gap-2">
        <input
          className="input-field"
          placeholder={open ? "노래 제목을 입력하세요 (모두에게 보여요)" : "곧 시작해요…"}
          value={text}
          disabled={!open}
          maxLength={100}
          autoComplete="off"
          autoCorrect="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={!open || busy || text.trim().length === 0}
          className="btn-primary shrink-0 px-5"
        >
          제출
        </button>
      </div>

      <div className="flex min-h-[1.5rem] items-center justify-between gap-2">
        <p className="animate-fade-in text-sm text-slate-500">
          {feedback?.text ?? ""}
        </p>
        <button
          type="button"
          onClick={handleHintRequest}
          disabled={hintRequested || !open}
          className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-60"
        >
          {hintRequested ? "🙋 힌트 요청함" : "🙋 힌트 주세요"}
        </button>
      </div>
    </form>
  );
}
