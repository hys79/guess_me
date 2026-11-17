"use client";

import { useState } from "react";
import { FIVE_LINK } from "../rules";
import { fetchToday, loadNickname, saveNickname, submitScore } from "../lib/ranking";

interface ResultCardProps {
  score: number;
  moves: number;
  bestCombo: number;
  newBest: boolean;
  onRetry: () => void;
  onHome: () => void;
  /** 등록 성공 시 부모가 오늘의 랭킹을 보여 주도록 알린다 */
  onRegistered: (nickname: string, day: string) => void;
}

/** 게임이 끝났을 때: 결과 + 다시 시작 / 랭킹 등록하기 / 처음으로 */
export function ResultCard({
  score,
  moves,
  bestCombo,
  newBest,
  onRetry,
  onHome,
  onRegistered,
}: ResultCardProps) {
  const [nickname, setNickname] = useState(() => loadNickname());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    const nick = nickname.trim();
    if (!nick || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 날짜는 서버(한국 시간) 기준 — 기기 시계에 좌우되지 않게
      const day = await fetchToday();
      const r = await submitScore({ day, nickname: nick, score, moves, bestCombo });
      saveNickname(nick);
      setRank(r);
      onRegistered(nick, day);
    } catch {
      setError("등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const canRegister = score > 0 && rank === null;

  return (
    <div className="card animate-pop flex flex-col items-center gap-4 text-center">
      <p className="text-sm font-semibold text-slate-500">시간 종료!</p>
      <div>
        <p className="text-5xl font-extrabold tabular-nums text-primary-700">
          {score.toLocaleString()}
        </p>
        {newBest && (
          <p className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-700">
            🎉 내 최고 기록!
          </p>
        )}
      </div>

      <dl className="flex gap-6 text-sm text-slate-500">
        <div>
          <dt className="text-xs">성공</dt>
          <dd className="text-base font-bold text-slate-900">{moves}번</dd>
        </div>
        <div>
          <dt className="text-xs">최대 콤보</dt>
          <dd className="text-base font-bold text-slate-900">{bestCombo}연속</dd>
        </div>
      </dl>

      {rank !== null && (
        <p className="w-full rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          ✅ 등록 완료! 오늘 {rank}위예요
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        <button type="button" onClick={onRetry} className="btn-primary w-full py-3 text-base">
          🔄 다시 시작
        </button>

        {canRegister && !open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-full py-3 text-base">
            🏆 랭킹 등록하기
          </button>
        )}

        {canRegister && open && (
          <form
            className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void register();
            }}
          >
            <input
              className="input-field text-center"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={FIVE_LINK.nicknameMax}
              placeholder={`닉네임 (최대 ${FIVE_LINK.nicknameMax}자)`}
              autoFocus
            />
            <button type="submit" disabled={busy || !nickname.trim()} className="btn-secondary w-full">
              {busy ? "등록 중..." : `🏆 ${score.toLocaleString()}점 등록`}
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <p className="text-xs text-slate-400">같은 닉네임은 하루에 최고 점수 한 줄만 남아요.</p>
          </form>
        )}

        {score <= 0 && (
          <p className="text-xs text-slate-400">점수가 있어야 랭킹에 등록할 수 있어요.</p>
        )}

        <button
          type="button"
          onClick={onHome}
          className="mx-auto mt-1 text-sm text-slate-400 hover:text-primary-600"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
