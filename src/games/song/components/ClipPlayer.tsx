"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { YouTubeFrame } from "@/games/song/components/YouTubeFrame";
import {
  YT_STATE,
  applyMusicAudio,
  describeYTError,
  type YTPlayer,
} from "@/games/song/lib/youtube";
import { useSound } from "@/lib/audio/SoundProvider";
import type { SongRound } from "@/lib/supabase/database.types";

interface ClipPlayerProps {
  /** video_id / start_sec / duration_sec 가 채워진 ready | playing 라운드 */
  round: SongRound;
  /** 서버시각 − 내시각 (ms). 재생 시작 시각을 내 시계로 바꾸는 데 쓴다 */
  offsetMs: number;
  /** "준비"(소리 잠금 해제)가 끝났을 때 — 호출 쪽이 DB 에 준비 표시를 남긴다 */
  onArmed: () => void;
  /** 유튜브가 이 브라우저에서의 재생을 막았을 때(오류 코드) — 호출 쪽이 출제자에게 알린다 */
  onPlayError?: (code: number) => void;
}

/**
 * 푸는 사람의 플레이어. 영상은 불투명 오버레이로 가리고 소리만 낸다.
 *
 * 1) 준비   : 모바일은 사용자 터치 없이 소리를 못 낸다 → "준비" 버튼의 터치 안에서
 *            음소거 재생 → 재생이 시작되면 바로 멈추는 식으로 플레이어를 "잠금 해제"해 둔다.
 * 2) 재생   : 서버가 정한 started_at 을 내 시계로 바꿔 그 순간에 구간 시작 지점으로
 *            이동 + 소리 켜고 재생, duration 뒤에 멈춘다. 늦게 들어오면 경과한 만큼 건너뛴다.
 * 3) 다시듣기: 끝난 뒤에는 내 기기에서만 구간을 다시 들을 수 있다(점수·시간과 무관).
 */
export function ClipPlayer({ round, offsetMs, onArmed, onPlayError }: ClipPlayerProps) {
  const videoId = round.video_id as string;
  const startSec = round.start_sec ?? 0;
  const durationSec = round.duration_sec ?? 10;

  const playerRef = useRef<YTPlayer | null>(null);
  const armingRef = useRef(false);
  const armTimeoutRef = useRef<number | null>(null);
  const startTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const playedKeyRef = useRef<string | null>(null);

  const onArmedRef = useRef(onArmed);
  onArmedRef.current = onArmed;
  const onPlayErrorRef = useRef(onPlayError);
  onPlayErrorRef.current = onPlayError;

  // 사운드 설정(전체 음소거 · 음악 소리). 타이머 안에서도 최신 값을 쓰도록 ref 로 들고 있는다
  const { muted, musicVolume } = useSound();
  const audioRef = useRef({ muted, volume: musicVolume });
  audioRef.current = { muted, volume: musicVolume };

  const [apiReady, setApiReady] = useState(false);
  const [arming, setArming] = useState(false);
  const [armed, setArmed] = useState(false);
  const [audible, setAudible] = useState(false); // 지금 소리가 나는 중
  const [finished, setFinished] = useState(false); // 이번 구간 재생을 마쳤다
  const [listening, setListening] = useState(false); // 정답 공개 후 "노래 듣기"를 직접 눌렀다
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const revealed = round.status === "revealed";

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  // 언마운트(라운드 전환 포함 — 호출 쪽이 key={round.id} 로 새로 만든다) 시 정리
  useEffect(
    () => () => {
      clearTimer(armTimeoutRef);
      clearTimer(startTimerRef);
      clearTimer(stopTimerRef);
    },
    [],
  );

  // 카운트다운 표시용 시계
  useEffect(() => {
    if (round.status !== "playing") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [round.status]);

  const handleReady = useCallback((p: YTPlayer) => {
    playerRef.current = p;
    p.mute();
    setApiReady(true);
  }, []);

  const handleState = useCallback(
    (state: number) => {
      // 잠금 해제 중에 실제 재생이 시작됐다 → 바로 멈추고 "준비 완료"
      if (armingRef.current && state === YT_STATE.PLAYING) {
        armingRef.current = false;
        clearTimer(armTimeoutRef);
        const p = playerRef.current;
        p?.pauseVideo();
        p?.seekTo(startSec, true);
        setArming(false);
        setArmed(true);
        onArmedRef.current();
      }
    },
    [startSec],
  );

  const handleError = useCallback((code: number) => {
    setError(describeYTError(code));
    setArming(false);
    armingRef.current = false;
    onPlayErrorRef.current?.(code);
  }, []);

  /** "준비" 버튼 — 반드시 사용자 터치 이벤트 안에서 불려야 한다 */
  function arm() {
    const p = playerRef.current;
    if (!p || armed || arming) return;
    armingRef.current = true;
    setArming(true);
    setError(null);
    p.mute();
    p.seekTo(startSec, true);
    p.playVideo();
    clearTimer(armTimeoutRef);
    armTimeoutRef.current = window.setTimeout(() => {
      if (!armingRef.current) return;
      armingRef.current = false;
      setArming(false);
      setError("소리를 켜지 못했어요. 한 번 더 눌러 주세요.");
    }, 6000);
  }

  const stopPlayback = useCallback(() => {
    clearTimer(stopTimerRef);
    playerRef.current?.pauseVideo();
    setAudible(false);
    setFinished(true);
  }, []);

  // 재생 시작 시각이 되면 구간을 튼다 (준비가 끝난 경우에만)
  useEffect(() => {
    if (round.status !== "playing" || !round.started_at || !armed) return;
    const key = `${round.id}:${round.started_at}`;
    if (playedKeyRef.current === key) return; // 이미 이 라운드를 틀었다

    const startLocal = Date.parse(round.started_at) - offsetMs;
    const endLocal = startLocal + durationSec * 1000;

    const begin = () => {
      const p = playerRef.current;
      if (!p || playedKeyRef.current === key) return;
      playedKeyRef.current = key;
      const elapsed = Math.max(0, (Date.now() - startLocal) / 1000);
      p.seekTo(startSec + elapsed, true);
      applyMusicAudio(p, audioRef.current);
      p.playVideo();
      setAudible(true);
      setFinished(false);
      clearTimer(stopTimerRef);
      stopTimerRef.current = window.setTimeout(
        stopPlayback,
        Math.max(0, endLocal - Date.now()),
      );
    };

    const now = Date.now();
    if (now >= endLocal) {
      // 너무 늦게 들어왔다 — 이미 끝난 구간
      playedKeyRef.current = key;
      setFinished(true);
      return;
    }
    if (now >= startLocal) {
      begin();
      return;
    }
    clearTimer(startTimerRef);
    startTimerRef.current = window.setTimeout(begin, startLocal - now);
    return () => clearTimer(startTimerRef);
  }, [
    round.id,
    round.status,
    round.started_at,
    armed,
    offsetMs,
    durationSec,
    startSec,
    stopPlayback,
  ]);

  // 정답 공개: 구간이 끝났다고 노래를 끊지 않고 이어서 들려준다.
  //  - 구간 재생 중이면 그대로 둔다(정지 타이머만 해제)
  //  - 이미 멈췄다면 멈춘 자리에서 계속 재생한다
  useEffect(() => {
    if (!revealed) return;
    clearTimer(startTimerRef);
    clearTimer(stopTimerRef);
    if (!armed) return;
    const p = playerRef.current;
    if (!p) return;
    applyMusicAudio(p, audioRef.current);
    p.playVideo();
    setAudible(true);
    setFinished(false);
  }, [revealed, armed]);

  // 소리가 나는 중에 설정 창에서 음소거/음악 소리를 바꾸면 바로 반영한다
  useEffect(() => {
    if (!audible) return;
    const p = playerRef.current;
    if (p) applyMusicAudio(p, { muted, volume: musicVolume });
  }, [audible, muted, musicVolume]);

  /** 준비 못 한 사람이 정답 공개 때 직접 듣기 — 이 버튼 터치가 곧 사용자 제스처다 */
  function listenNow() {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(startSec, true);
    applyMusicAudio(p, audioRef.current);
    p.playVideo();
    setListening(true);
  }

  function replay() {
    const p = playerRef.current;
    if (!p || !armed) return;
    clearTimer(stopTimerRef);
    p.seekTo(startSec, true);
    applyMusicAudio(p, audioRef.current);
    p.playVideo();
    setAudible(true);
    setFinished(false);
    stopTimerRef.current = window.setTimeout(stopPlayback, durationSec * 1000);
  }

  // --- 오버레이 문구 ---------------------------------------------------------
  const startLocalMs = round.started_at
    ? Date.parse(round.started_at) - offsetMs
    : null;
  const countdown =
    round.status === "playing" &&
    startLocalMs !== null &&
    nowMs < startLocalMs &&
    armed
      ? Math.ceil((startLocalMs - nowMs) / 1000)
      : 0;

  let overlay: React.ReactNode = null;
  // 정답 공개 때는 영상을 가리지 않는다(버튼만 반투명하게 얹는다)
  let translucent = false;

  if (error) {
    overlay = (
      <>
        <p className="px-4 text-center text-sm text-red-200">{error}</p>
        <p className="mt-1 px-4 text-center text-xs text-slate-300">
          출제자에게 알렸어요. 출제자가 다른 영상으로 바꿀 수도 있어요.
        </p>
        {apiReady && !armed && !revealed ? (
          <button type="button" onClick={arm} className="btn-secondary mt-3">
            다시 시도
          </button>
        ) : null}
      </>
    );
  } else if (!apiReady) {
    overlay = <p className="text-sm text-slate-300">플레이어 불러오는 중…</p>;
  } else if (revealed) {
    if (!armed && !listening) {
      translucent = true;
      overlay = (
        <button type="button" onClick={listenNow} className="btn-primary px-6">
          🎵 노래 듣기
        </button>
      );
    }
  } else if (!armed) {
    overlay = (
      <>
        <p className="mb-3 px-4 text-center text-sm text-slate-200">
          {round.status === "playing"
            ? "이미 시작됐어요! 소리를 켜고 합류하세요"
            : "버튼을 눌러 소리를 준비해 주세요"}
        </p>
        <button
          type="button"
          onClick={arm}
          disabled={arming}
          className="btn-primary px-6"
        >
          {arming
            ? "준비 중…"
            : round.status === "playing"
              ? "🔊 소리 켜고 참여"
              : "🎧 준비"}
        </button>
      </>
    );
  } else if (round.status === "ready") {
    overlay = (
      <>
        <p className="text-3xl">✅</p>
        <p className="mt-2 text-sm text-slate-200">
          준비 완료! 출제자가 시작하길 기다리는 중…
        </p>
      </>
    );
  } else if (countdown > 0) {
    overlay = (
      <p
        key={countdown}
        className="animate-pop text-7xl font-extrabold tabular-nums text-white"
      >
        {countdown}
      </p>
    );
  } else if (audible) {
    overlay = (
      <>
        <p className="animate-timer-pulse text-4xl">🎵</p>
        <p className="mt-2 text-sm text-slate-200">재생 중… 잘 들어보세요</p>
      </>
    );
  } else if (finished) {
    overlay = (
      <>
        <p className="mb-3 text-sm text-slate-200">구간이 끝났어요</p>
        <button type="button" onClick={replay} className="btn-secondary px-6">
          🔁 다시 듣기
        </button>
      </>
    );
  } else {
    overlay = <p className="text-sm text-slate-300">곧 시작해요…</p>;
  }

  return (
    <YouTubeFrame
      videoId={videoId}
      onReady={handleReady}
      onStateChange={handleState}
      onError={handleError}
    >
      {/* 영상을 가리는 오버레이 — 정답 공개 전에는 완전 불투명, 클릭도 막는다 */}
      {overlay ? (
        <div
          className={
            translucent
              ? "absolute inset-0 flex flex-col items-center justify-center bg-black/40"
              : "absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900"
          }
        >
          {overlay}
        </div>
      ) : null}
    </YouTubeFrame>
  );
}
