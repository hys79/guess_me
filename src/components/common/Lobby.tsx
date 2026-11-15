"use client";

import { useState } from "react";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import type { GameMeta } from "@/games/registry";
import type { GameUI } from "@/games/types";
import type { StoredPlayer } from "@/lib/player";
import type { Player, Room } from "@/lib/supabase/database.types";

interface LobbyProps {
  room: Room;
  players: Player[];
  stored: StoredPlayer;
  code: string;
  game: GameMeta;
  ui: GameUI;
  isHost: boolean;
  onLeave: () => void | Promise<void>;
}

/** 대기실 — 어떤 게임이든 공통. 게임별 요약은 ui.lobbyInfo, 시작 동작은 ui.startGame. */
export function Lobby({
  room,
  players,
  stored,
  code,
  game,
  ui,
  isHost,
  onLeave,
}: LobbyProps) {
  const { play } = useSound();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = ui.lobbyInfo(room);
  const enoughPlayers = players.length >= game.minPlayers;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 시 무시 */
    }
  }

  async function handleStart() {
    if (starting) return;
    play("roundStart");
    setStarting(true);
    setError(null);
    try {
      await ui.startGame(room, stored.playerId);
      // 성공하면 room.status 가 'waiting' 을 벗어나 이 화면 자체가 사라지지만,
      // 실시간 반영이 늦는 경우까지 대비해 항상 finally 에서 정리한다.
    } catch (err) {
      setError(err instanceof GameError ? err.message : "시작에 실패했습니다.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-14 sm:px-6 sm:pt-12 animate-fade-in">
      <div className="mb-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          참가 코드
        </p>
        <button
          onClick={handleCopy}
          className="mt-1 text-4xl font-extrabold tracking-[0.3em] text-primary-700 transition-transform active:scale-95 sm:text-5xl"
          title="클릭하면 복사"
        >
          {code}
        </button>
        <p className="mt-1 h-4 text-xs text-primary-500">
          {copied ? "복사됨!" : "코드를 눌러 복사"}
        </p>
      </div>

      <div className="card mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-700">
            {game.icon} {game.name}
          </span>
          {info.badge ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
              {info.badge}
            </span>
          ) : null}
        </div>
        <p className="text-center text-xs text-slate-400">{info.description}</p>
        <div className="flex justify-around border-t border-slate-100 pt-3 text-center text-sm">
          {info.stats.map((s) => (
            <div key={s.label}>
              <p className="text-slate-400">{s.label}</p>
              <p className="text-lg font-bold text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700">참가자</h2>
          <span className="text-xs text-slate-400">{players.length}명</span>
        </div>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-800">{p.nickname}</span>
              <span className="flex gap-1">
                {p.is_host ? (
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                    방장
                  </span>
                ) : null}
                {p.id === stored.playerId ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    나
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {isHost ? (
        <div className="space-y-2">
          <button
            onClick={handleStart}
            disabled={!enoughPlayers || starting}
            className="btn-primary w-full py-3 text-base"
          >
            {starting ? "시작 중..." : "게임 시작"}
          </button>
          {!enoughPlayers ? (
            <p className="text-center text-xs text-slate-400">
              최소 {game.minPlayers}명이 있어야 시작할 수 있습니다.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          방장이 게임을 시작하기를 기다리는 중...
        </p>
      )}

      <button
        onClick={onLeave}
        className="mx-auto mt-6 text-xs text-slate-400 hover:text-red-500"
      >
        방 나가기
      </button>
    </main>
  );
}
