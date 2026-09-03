"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { joinRoom, GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import { NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@/lib/constants";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { play } = useSound();

  const [code, setCode] = useState(
    (searchParams.get("code") ?? "").toUpperCase().slice(0, ROOM_CODE_LENGTH),
  );
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { room } = await joinRoom({ code, nickname });
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

  const codeReady = code.trim().length === ROOM_CODE_LENGTH;
  const nicknameReady = nickname.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="card animate-fade-in-up space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          참가 코드
        </label>
        <input
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          className="input-field text-center text-3xl font-bold uppercase tracking-[0.4em]"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          placeholder={"".padEnd(ROOM_CODE_LENGTH, "•")}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, ROOM_CODE_LENGTH),
            )
          }
          autoFocus
        />
      </div>

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
        />
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary w-full py-3 text-base"
        disabled={submitting || !codeReady || !nicknameReady}
      >
        {submitting ? "입장 중..." : "입장하기"}
      </button>
    </form>
  );
}

export default function JoinRoomPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12 animate-fade-in">
      <Link
        href="/"
        className="mb-6 text-sm text-slate-400 hover:text-primary-600"
      >
        ← 처음으로
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-primary-700">방 참가하기</h1>
      <Suspense fallback={<div className="card">불러오는 중...</div>}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
