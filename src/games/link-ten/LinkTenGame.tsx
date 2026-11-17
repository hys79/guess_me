"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Board } from "./components/Board";
import { Hud } from "./components/Hud";
import { RankingPanel } from "./components/RankingPanel";
import { ResultCard } from "./components/ResultCard";
import { useLinkTen } from "./hooks/useLinkTen";
import { fetchToday, loadBest, localKstToday } from "./lib/ranking";
import { LINK_TEN } from "./rules";

const RULES = [
  "숫자 타일을 드래그해서 선으로 이어요. 대각선도 되고, 같은 타일을 다시 지나거나 줄을 엇갈리게 긋는 건 안 돼요.",
  `2칸 이상 이어서 합이 ${LINK_TEN.targetSum}이 되면 타일 테두리가 빛나요. 그때 손을 떼면 사라져요.`,
  "사라진 자리는 위에서 새 타일이 채워요.",
  `${LINK_TEN.comboWindowMs / 1000}초 안에 이어서 성공하면 콤보가 쌓여요. 점수는 콤보 단계(1~${LINK_TEN.maxCombo}단계)에 비례해요.`,
];

const BACK_LINK = "text-sm text-slate-400 hover:text-primary-600";

export default function LinkTenGame() {
  const router = useRouter();
  const g = useLinkTen();
  const [today, setToday] = useState(localKstToday());
  const [registered, setRegistered] = useState<{ nickname: string; day: string } | null>(null);
  const [rankKey, setRankKey] = useState(0);
  // 이 기기의 최고 점수 — 판을 시작할 때 한 번만 읽는다(진행 중 매 프레임 읽지 않게)
  const [best, setBest] = useState(0);

  // 시작 화면에서 보여 줄 오늘의 랭킹 날짜(서버 기준)
  useEffect(() => {
    let alive = true;
    void fetchToday().then((d) => alive && setToday(d));
    return () => {
      alive = false;
    };
  }, []);

  const startGame = () => {
    setRegistered(null);
    setBest(loadBest());
    g.start();
  };

  // ---------------------------------------------------------------- 시작 화면
  if (g.phase === "ready") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-10 sm:px-6 sm:py-12 animate-fade-in">
        <Link href="/" className={`mb-6 self-start ${BACK_LINK}`}>
          ← 처음으로
        </Link>

        <header className="mb-6 text-center">
          <p className="text-5xl" aria-hidden>
            🔗
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-primary-700">
            Link Ten
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {LINK_TEN.durationSec}초 동안 합이 {LINK_TEN.targetSum}이 되게 이어 보세요
          </p>
        </header>

        <section className="card mb-4 flex flex-col gap-2">
          <h2 className="text-sm font-bold text-slate-900">게임 방법</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-slate-600">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="text-primary-500" aria-hidden>
                  •
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" onClick={startGame} className="btn-primary mb-6 w-full py-3 text-base">
          ▶ 게임 시작
        </button>

        <RankingPanel day={today} refreshKey={rankKey} />
      </main>
    );
  }

  // ---------------------------------------------------------- 플레이 / 결과
  const playing = g.phase === "countdown" || g.phase === "playing";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link href="/" className={BACK_LINK}>
          ← 처음으로
        </Link>
        {/* 우상단 사운드 버튼과 겹치지 않게 자리 확보 */}
        <span className="h-10 w-10" aria-hidden />
      </div>

      {playing && (
        <Hud
          score={g.score}
          timeLeftMs={g.timeLeftMs}
          streak={g.streak}
          comboLeftMs={g.comboLeftMs}
          best={best}
        />
      )}

      {g.grid && (
        <div className="relative">
          <Board
            grid={g.grid}
            path={g.path}
            valid={g.valid}
            ghosts={g.ghosts}
            floaters={g.floaters}
            shaking={g.shaking}
            flash={g.flash}
            interactive={g.phase === "playing"}
            covered={g.phase === "countdown" || g.phase === "over"}
            onStart={g.pointerStart}
            onMove={g.pointerMove}
            onEnd={g.pointerEnd}
          />

          {g.phase === "countdown" && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <span
                key={g.countdown}
                className="animate-pop text-8xl font-extrabold text-primary-600 drop-shadow"
              >
                {g.countdown}
              </span>
            </div>
          )}
        </div>
      )}

      {g.phase === "over" && (
        <>
          <ResultCard
            key={g.runId}
            score={g.score}
            moves={g.moves}
            bestCombo={g.bestCombo}
            newBest={g.newBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            onRegistered={(nickname, day) => {
              setRegistered({ nickname, day });
              setRankKey((k) => k + 1);
            }}
          />

          {registered && (
            <RankingPanel
              day={registered.day}
              refreshKey={rankKey}
              highlight={registered.nickname}
            />
          )}
        </>
      )}
    </main>
  );
}
