"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSongState } from "@/games/song/hooks/useSongState";
import { useServerClock } from "@/games/song/hooks/useServerClock";
import {
  finishSongRound,
  markSongReady,
  nextSongRound,
  reportSongPlaybackError,
  startSongRound,
} from "@/games/song/lib/songs";
import { SongSetup } from "@/games/song/components/SongSetup";
import { SetterPanel } from "@/games/song/components/SetterPanel";
import { ClipPlayer } from "@/games/song/components/ClipPlayer";
import { GuessPanel } from "@/games/song/components/GuessPanel";
import { HintList } from "@/games/song/components/HintList";
import { AnswerFeed } from "@/games/song/components/AnswerFeed";
import { RevealCard } from "@/games/song/components/RevealCard";
import { SongFinished } from "@/games/song/components/SongFinished";
import { songRuleLines } from "@/games/song/rules";
import { Scoreboard } from "@/components/common/Scoreboard";
import { CountdownTimer } from "@/components/common/CountdownTimer";
import { useSound } from "@/lib/audio/SoundProvider";
import type { GameRoomProps } from "@/games/types";
import type { Player } from "@/lib/supabase/database.types";

const PAGE =
  "mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-8 pt-14 sm:px-6 sm:pt-12";

/** next_questioner(SQL)와 같은 규칙: 참가 순서상 다음 사람, 마지막이면 맨 처음 */
function nextSetterOf(ordered: Player[], setterId: string | null): Player | null {
  if (ordered.length === 0) return null;
  const idx = ordered.findIndex((p) => p.id === setterId);
  if (idx === -1) return ordered[0];
  return ordered[(idx + 1) % ordered.length];
}

/** active 인 동안 250ms 마다 현재 시각(ms)을 갱신한다 */
function useNowMs(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * 노래 맞히기의 "게임 시작 이후" 화면 전체 (진행 · 종료).
 * 대기실·방 로딩·입장 확인은 방 페이지 셸이 처리한다.
 */
export function SongRoom({ room, players, stored, code, onLeave }: GameRoomProps) {
  const song = useSongState(room.id);
  const offsetMs = useServerClock();
  const { play } = useSound();

  const orderedPlayers = useMemo(
    () =>
      [...players].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      ),
    [players],
  );

  const round = song.currentRound;
  const roundId = round?.id ?? null;
  const roundStatus = round?.status ?? null;
  const deadlineAt = round?.deadline_at ?? null;

  const isHost = Boolean(players.find((p) => p.id === stored.playerId)?.is_host);
  const setter = round ? (orderedPlayers.find((p) => p.id === round.setter_id) ?? null) : null;
  const isSetter = Boolean(round && round.setter_id === stored.playerId);
  const responders = orderedPlayers.filter((p) => p.id !== round?.setter_id);
  const isKing = room.game_mode === "king";
  // 왕 모드: 출제자는 계속 방장 / 다같이 모드: 참가 순서대로 돌아간다
  const nextSetter = isKing
    ? (orderedPlayers.find((p) => p.is_host) ?? null)
    : nextSetterOf(orderedPlayers, round?.setter_id ?? null);
  const setterMissing = Boolean(round && round.status !== "revealed" && !setter);

  const nowMs = useNowMs(roundStatus === "playing");
  const serverNowMs = nowMs + offsetMs;
  const clipStarted =
    roundStatus === "playing" &&
    round?.started_at != null &&
    serverNowMs >= Date.parse(round.started_at);

  // --- 자동 진행 (RPC 는 전부 멱등이라 중복 호출돼도 안전하다) -------------------

  // 출제자: 모든 참가자가 "준비"하면 자동으로 재생 시작
  const startSigRef = useRef("");
  useEffect(() => {
    if (!isSetter || !roundId || roundStatus !== "ready") return;
    if (responders.length === 0) return;
    // 영상을 재생하지 못한다고 보고한 사람이 있으면 자동 시작하지 않는다 (출제자가 정한다)
    if (song.ready.some((r) => r.error_code !== null)) return;
    const readyIds = new Set(song.ready.map((r) => r.player_id));
    if (!responders.every((p) => readyIds.has(p.id))) return;
    if (startSigRef.current === roundId) return;
    startSigRef.current = roundId;
    void startSongRound(roundId, stored.playerId).catch(() => {
      startSigRef.current = "";
    });
  }, [isSetter, roundId, roundStatus, responders, song.ready, stored.playerId]);

  // 정답 마감 시각이 지나면 라운드를 끝낸다. 출제자가 바로, 다른 사람은 몇 초 뒤
  // 대신 (출제자가 자리를 비운 경우의 안전망 — 서버가 조건을 다시 확인한다)
  useEffect(() => {
    if (!roundId || roundStatus !== "playing" || !deadlineAt) return;
    const deadlineLocal = Date.parse(deadlineAt) - offsetMs;
    const grace = isSetter ? 0 : 3000 + Math.random() * 1500;
    const id = window.setTimeout(
      () => {
        void finishSongRound(roundId, stored.playerId).catch(() => {});
      },
      Math.max(0, deadlineLocal - Date.now()) + grace,
    );
    return () => window.clearTimeout(id);
  }, [roundId, roundStatus, deadlineAt, offsetMs, isSetter, stored.playerId]);

  // --- 사운드 트리거 (라운드/상태마다 한 번만) ------------------------------------
  const soundRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    const seen = soundRef.current;
    const once = (kind: string, key: string | null, fn: () => void) => {
      if (key && seen[kind] !== key) {
        seen[kind] = key;
        fn();
      }
    };
    once("setup", isSetter && roundStatus === "setup" ? roundId : null, () =>
      play("yourTurn"),
    );
    once("playing", roundStatus === "playing" ? roundId : null, () => play("roundStart"));
    once("revealed", roundStatus === "revealed" ? roundId : null, () => play("reveal"));
    once("finished", room.status === "finished" ? room.id : null, () => play("win"));
  }, [isSetter, roundId, roundStatus, room.status, room.id, play]);

  const finished = room.status === "finished";
  const myGuess = round
    ? (song.guesses.find((g) => g.player_id === stored.playerId) ?? null)
    : null;
  const hintRequested = song.requests.some((r) => r.player_id === stored.playerId);

  const leaveButton = (
    <button
      onClick={onLeave}
      className="mx-auto mt-2 text-xs text-slate-400 hover:text-red-500"
    >
      방 나가기
    </button>
  );

  // --- 진행 화면 ------------------------------------------------------------------
  const phaseLabel = !round
    ? "준비 중"
    : round.status === "setup"
      ? "출제 중"
      : round.status === "ready"
        ? "준비 대기"
        : round.status === "playing"
          ? "정답 맞히는 중"
          : "정답 공개";

  let body: React.ReactNode;

  if (!round) {
    body = (
      <div className="card space-y-3 text-center text-sm text-slate-500">
        <p>{song.loading ? "불러오는 중..." : "문제를 준비하고 있어요..."}</p>
        {!song.loading && isHost ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void nextSongRound(room.id, stored.playerId).catch(() => {})}
          >
            첫 문제 시작
          </button>
        ) : null}
      </div>
    );
  } else if (setterMissing) {
    body = (
      <div className="card space-y-3 text-center text-sm text-slate-500">
        <p>출제자가 방을 나갔어요.</p>
        {isHost ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void nextSongRound(room.id, stored.playerId).catch(() => {})}
          >
            다음 출제자로 넘기기
          </button>
        ) : (
          <p>방장이 다음 출제자로 넘기길 기다리는 중...</p>
        )}
      </div>
    );
  } else if (round.status === "setup") {
    body = isSetter ? (
      <SongSetup
        key={round.id}
        roundId={round.id}
        playerId={stored.playerId}
        roomTimeLimit={room.answer_time_limit}
      />
    ) : (
      <div className="card animate-fade-in space-y-3">
        <p className="text-center text-sm text-slate-600">
          🎤 <span className="font-bold">{setter?.nickname}</span>님이 문제를 내는 중이에요…
        </p>
        <ul className="space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          {songRuleLines(room.game_mode).map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>
    );
  } else if (round.status === "ready") {
    body = isSetter ? (
      <SetterPanel
        round={round}
        playerId={stored.playerId}
        responders={responders}
        ready={song.ready}
        requests={song.requests}
        guesses={song.guesses}
      />
    ) : null; // 참가자는 위쪽 고정 위치의 플레이어(ClipPlayer)가 이 단계를 보여 준다
  } else if (round.status === "playing") {
    body = (
      <>
        {round.started_at && room.answer_time_limit !== null ? (
          <div className="card">
            <CountdownTimer
              startedAt={round.started_at}
              seconds={room.answer_time_limit}
              offsetMs={offsetMs}
            />
          </div>
        ) : (
          <div className="card text-center text-xs text-slate-400">
            제한시간 없음 — 출제자가 정답을 공개하면 라운드가 끝나요
          </div>
        )}

        {isSetter ? (
          <>
            <AnswerFeed
              attempts={song.attempts}
              guesses={song.guesses}
              players={players}
              acceptAs={stored.playerId}
              showEmpty
            />
            <SetterPanel
              round={round}
              playerId={stored.playerId}
              responders={responders}
              ready={song.ready}
              requests={song.requests}
              guesses={song.guesses}
            />
            <HintList hints={song.hints} />
          </>
        ) : (
          <>
            <HintList hints={song.hints} />
            <GuessPanel
              roundId={round.id}
              playerId={stored.playerId}
              open={clipStarted}
              myGuess={myGuess}
              hintRequested={hintRequested}
            />
            <AnswerFeed
              attempts={song.attempts}
              guesses={song.guesses}
              players={players}
            />
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        <RevealCard
          round={round}
          roomId={room.id}
          playerId={stored.playerId}
          players={players}
          guesses={song.guesses}
          nextSetter={nextSetter}
          isHost={isHost}
          finished={finished}
        />
        <AnswerFeed attempts={song.attempts} guesses={song.guesses} players={players} />
      </>
    );
  }

  // 플레이어는 단계(ready → playing → revealed)가 바뀌어도 사라지면 안 된다 — 준비(소리 잠금
  // 해제) 상태와 재생 위치가 날아가기 때문. 그래서 단계별로 remount 되는 아래 영역 밖에
  // 고정해 두고 round.id 로만 새로 만든다. 출제자는 정답을 아니까 공개 전에는 플레이어가 없다.
  const showPlayer =
    Boolean(round) &&
    !setterMissing &&
    round !== null &&
    (round.status === "ready" || round.status === "playing" || round.status === "revealed") &&
    (!isSetter || round.status === "revealed");

  return (
    <main className={PAGE}>
      {finished ? null : (
        <div className="flex items-center justify-between gap-2 pr-10 text-xs text-slate-400">
          <span className="shrink-0">
            방 <span className="font-bold text-slate-500">{code}</span>
          </span>
          {setter ? (
            <span className="truncate text-slate-400">🎤 {setter.nickname}님 출제</span>
          ) : null}
          <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-600">
            {phaseLabel}
          </span>
        </div>
      )}

      {showPlayer && round ? (
        <ClipPlayer
          key={round.id}
          round={round}
          offsetMs={offsetMs}
          onArmed={() => void markSongReady(round.id, stored.playerId).catch(() => {})}
          onPlayError={(code) =>
            void reportSongPlaybackError(round.id, stored.playerId, code).catch(() => {})
          }
        />
      ) : null}

      {finished ? (
        <>
          {/* 마지막 라운드의 정답 공개 + 이어지는 노래, 그 아래에 최종 결과 */}
          {round && round.status === "revealed" ? (
            <RevealCard
              round={round}
              roomId={room.id}
              playerId={stored.playerId}
              players={players}
              guesses={song.guesses}
              nextSetter={nextSetter}
              isHost={isHost}
              finished
            />
          ) : null}
          {round && round.status === "revealed" ? (
            <AnswerFeed attempts={song.attempts} guesses={song.guesses} players={players} />
          ) : null}
          <SongFinished
            roomId={room.id}
            gameMode={room.game_mode}
            winnerId={room.winner_player_id}
            players={players}
            targetScore={room.target_score}
            mePlayerId={stored.playerId}
            isHost={isHost}
          />
        </>
      ) : (
        <>
          <div
            key={round ? `${round.id}:${round.status}` : "noround"}
            className="flex animate-fade-in-up flex-col gap-4"
          >
            {body}
          </div>

          <Scoreboard
            players={players}
            targetScore={room.target_score}
            mePlayerId={stored.playerId}
            questionerId={round?.setter_id ?? null}
          />
        </>
      )}

      {leaveButton}
    </main>
  );
}
