"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSound } from "@/lib/audio/SoundProvider";
import { createRoom, GameError } from "@/lib/rooms";
import { NICKNAME_MAX_LENGTH } from "@/lib/constants";
import { getGameMeta } from "@/games/registry";
import { getGameUI } from "@/games/ui";
import type { RoomSettings } from "@/games/types";

function CreateForm({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { play } = useSound();

  const meta = getGameMeta(gameId);
  const ui = getGameUI(gameId);

  const [nickname, setNickname] = useState("");
  const [settings, setSettings] = useState<RoomSettings | null>(
    ui?.defaultSettings ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 알 수 없는 게임이면 홈으로
  useEffect(() => {
    if (!meta || !ui) router.replace("/");
  }, [meta, ui, router]);

  if (!meta || !ui || !settings) return null;
  const Options = ui.CreateOptions;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !meta || !settings) return;
    setError(null);
    setSubmitting(true);
    try {
      const { room } = await createRoom({
        gameType: meta.id,
        hostNickname: nickname,
        targetScore: settings.targetScore,
        answerTimeLimit: settings.answerTimeLimit,
        gameMode: settings.gameMode,
      });
      play("submit");
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(
        err instanceof GameError
          ? err.message
          : "알 수 없는 오류가 발생했습니다.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-primary-700">
        <span aria-hidden>{meta.icon}</span>
        {meta.name} · 방 만들기
      </h1>

      <form onSubmit={handleSubmit} className="card animate-fade-in-up space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            닉네임
          </label>
          <input
            className="input-field"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={`최대 ${NICKNAME_MAX_LENGTH}자`}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
        </div>

        <Options value={settings} onChange={setSettings} />

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn-primary w-full py-3 text-base"
          disabled={submitting || nickname.trim().length === 0}
        >
          {submitting ? "생성 중..." : "방 만들기"}
        </button>
      </form>
    </>
  );
}

function CreateRoomContent() {
  const gameId = useSearchParams().get("game") ?? "";
  // 게임이 바뀌면 설정 상태를 새로 시작하도록 key 를 건다
  return <CreateForm key={gameId} gameId={gameId} />;
}

export default function CreateRoomPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12 animate-fade-in">
      <Link
        href="/"
        className="mb-6 text-sm text-slate-400 hover:text-primary-600"
      >
        ← 처음으로
      </Link>
      <Suspense fallback={<div className="card">불러오는 중...</div>}>
        <CreateRoomContent />
      </Suspense>
    </main>
  );
}
