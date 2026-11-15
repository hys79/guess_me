"use client";

import { useEffect, useState } from "react";
import {
  finishSongRound,
  resetSongRound,
  revealSongHint,
  startSongRound,
} from "@/games/song/lib/songs";
import { loadSetterNote, type SetterNote } from "@/games/song/lib/setterNote";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type {
  Player,
  SongGuess,
  SongHintRequest,
  SongReady,
  SongRound,
} from "@/lib/supabase/database.types";

interface SetterPanelProps {
  round: SongRound; // ready | playing
  playerId: string;
  responders: Player[];
  ready: SongReady[];
  requests: SongHintRequest[];
  guesses: SongGuess[];
}

/** 출제자 전용: 준비 현황 · 시작 · 힌트 공개 · 정답 공개. */
export function SetterPanel({
  round,
  playerId,
  responders,
  ready,
  requests,
  guesses,
}: SetterPanelProps) {
  const { play } = useSound();
  const [note, setNote] = useState<SetterNote | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote(loadSetterNote(round.id));
  }, [round.id]);

  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    play("click");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof GameError ? err.message : "처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  // 재생 오류를 보고한 사람(연령 제한·지역 제한 등 — 출제자 화면에서 잘 나와도 막힐 수 있다)
  const failedRows = ready.filter(
    (r) => r.error_code !== null && responders.some((p) => p.id === r.player_id),
  );
  const failedIds = new Set(failedRows.map((r) => r.player_id));
  const failedNames = responders.filter((p) => failedIds.has(p.id)).map((p) => p.nickname);
  const readyIds = new Set(
    ready.filter((r) => r.error_code === null).map((r) => r.player_id),
  );
  const readyCount = responders.filter((p) => readyIds.has(p.id)).length;
  const answeredIds = new Set(guesses.map((g) => g.player_id));

  const answerCard = note ? (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <p className="text-xs text-slate-400">내가 낸 정답 (나만 보여요)</p>
      <p className="font-semibold text-slate-800">{note.title}</p>
    </div>
  ) : null;

  // --- 준비 단계 -------------------------------------------------------------
  if (round.status === "ready") {
    return (
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-slate-700">참가자 준비 현황</p>
          <p className="text-sm font-bold tabular-nums text-primary-700">
            {readyCount}/{responders.length}
          </p>
        </div>
        <ul className="space-y-1 text-sm">
          {responders.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span className="text-slate-700">{p.nickname}</span>
              {failedIds.has(p.id) ? (
                <span className="text-amber-600">
                  ⚠️ 재생 불가 (오류 {failedRows.find((r) => r.player_id === p.id)?.error_code})
                </span>
              ) : (
                <span className={readyIds.has(p.id) ? "text-primary-600" : "text-slate-300"}>
                  {readyIds.has(p.id) ? "✅ 준비됨" : "대기 중"}
                </span>
              )}
            </li>
          ))}
        </ul>
        {answerCard}
        {failedNames.length > 0 ? (
          <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <p>
              ⚠️ <span className="font-semibold">{failedNames.join(", ")}</span>님은 이 영상을
              재생하지 못해요. 연령 제한이나 지역 제한은 사람마다 달라서, 출제자 화면에서는
              잘 나와도 다른 사람은 막힐 수 있어요. 자동 시작은 멈췄어요.
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("reset", () => resetSongRound(round.id, playerId))}
              className="btn-secondary w-full text-sm"
            >
              🔄 다른 영상으로 바꾸기
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            모두 준비하면 자동으로 시작돼요. 기다리기 싫으면 바로 시작할 수도 있어요.
          </p>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("start", () => startSongRound(round.id, playerId))}
          className="btn-primary w-full py-3"
        >
          {readyCount === responders.length ? "▶ 시작" : "▶ 지금 바로 시작"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  // --- 재생·정답 단계 --------------------------------------------------------
  return (
    <div className="card space-y-4">
      {answerCard}

      {failedNames.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ <span className="font-semibold">{failedNames.join(", ")}</span>님은 이 영상을
          재생하지 못해요. (힌트를 많이 주거나 정답을 일찍 공개하는 게 좋을 수 있어요)
        </p>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-slate-700">정답 현황</p>
          <p className="text-sm font-bold tabular-nums text-primary-700">
            {guesses.length}/{responders.length}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {responders.map((p) => (
            <li
              key={p.id}
              className={
                answeredIds.has(p.id)
                  ? "rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700"
                  : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-400"
              }
            >
              {answeredIds.has(p.id) ? "✓ " : ""}
              {p.nickname}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-slate-700">힌트 주기</p>
          <p className="text-xs text-slate-400">
            {requests.length > 0 ? (
              <span className="font-semibold text-primary-600">
                🙋 힌트 요청 {requests.length}명
              </span>
            ) : (
              "막막해 보이면 힌트를 줘 보세요"
            )}
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const content = custom.trim();
            if (!content) return;
            void run("custom", async () => {
              await revealSongHint(round.id, playerId, content);
              setCustom("");
            });
          }}
        >
          <input
            className="input-field"
            placeholder="직접 힌트 쓰기 (예: 2022년 여름 노래)"
            maxLength={100}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy !== null || custom.trim().length === 0}
            className="btn-secondary shrink-0 px-4 text-sm"
          >
            보내기
          </button>
        </form>
      </div>

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run("finish", () => finishSongRound(round.id, playerId))}
        className="btn-secondary w-full text-sm"
      >
        정답 공개하고 라운드 끝내기
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
