"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RangeField } from "@/components/RangeField";
import { YouTubeFrame } from "@/games/song/components/YouTubeFrame";
import { submitSongRound } from "@/games/song/lib/songs";
import { saveSetterNote } from "@/games/song/lib/setterNote";
import {
  applyMusicAudio,
  describeYTError,
  extractStartSec,
  extractVideoId,
  formatTime,
  lookupVideo,
  YT_STATE,
  type YTPlayer,
} from "@/games/song/lib/youtube";
import { SONG_RULES } from "@/games/song/rules";
import { GameError } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";

interface SongSetupProps {
  roundId: string;
  playerId: string;
  /** 방의 정답 제한시간(초). 재생 길이는 이 값을 넘을 수 없다. null = 무제한 */
  roomTimeLimit: number | null;
}

/**
 * 영상 재생 가능 여부 검사 상태.
 *  - ok    : 실제로 재생이 시작되는 것까지 확인했다 (준비 완료만으로는 부족하다 — 연령 제한/
 *            음원사 차단 영상은 플레이어가 "준비"된 뒤 재생을 시도할 때 비로소 막힌다)
 *  - warn  : 자동 확인은 못 했다(브라우저가 자동재생을 막는 등). 미리듣기로 직접 확인하게 한다
 *  - error : 막힌 영상. 문제를 낼 수 없다
 */
type EmbedState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "warn" }
  | { kind: "error"; message: string };

const BLOCKED_MESSAGE =
  "이 영상은 외부 재생이 막혀 있어요 (연령 제한이나 저작권자 설정). 다른 영상을 골라주세요.";

/** "(Official MV)" / "[가사]" 같은 꼬리표를 떼어 정답 후보를 깔끔하게 만든다 */
function cleanVideoTitle(title: string): string {
  return title
    .replace(
      /\s*[([【][^)\]】]*(official|mv|m\/v|audio|lyrics?|video|가사|뮤직비디오|live)[^)\]】]*[)\]】]/gi,
      "",
    )
    .trim();
}

/** 출제자 전용: 유튜브 링크 · 구간 · 정답을 입력해 문제를 낸다. */
export function SongSetup({ roundId, playerId, roomTimeLimit }: SongSetupProps) {
  const { play, muted, musicVolume } = useSound();

  const maxDuration = Math.min(SONG_RULES.clipMax, roomTimeLimit ?? SONG_RULES.clipMax);
  const [url, setUrl] = useState("");
  const [startSec, setStartSec] = useState(0); // 기본값은 영상 맨 앞
  const [videoLength, setVideoLength] = useState<number | null>(null); // 영상 전체 길이(초)
  const [duration, setDuration] = useState(
    Math.min(SONG_RULES.clipDefault, maxDuration),
  );
  const [title, setTitle] = useState("");
  const [embed, setEmbed] = useState<EmbedState>({ kind: "idle" });
  const [channel, setChannel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 사용자가 직접 손댄 칸은 자동 입력으로 덮어쓰지 않는다
  const touched = useRef({ title: false });
  const previewRef = useRef<YTPlayer | null>(null);
  const previewTimer = useRef<number | null>(null);
  const verifyingRef = useRef(false);
  const verifyTimer = useRef<number | null>(null);
  const blockedMsgRef = useRef<string | null>(null); // oEmbed 로 이미 "못 쓰는 영상"이라고 확인됨 — 그때의 안내 문구

  const videoId = useMemo(() => extractVideoId(url), [url]);

  // 시작 지점 슬라이더의 범위: 구간이 영상 끝을 넘지 않게. 영상 길이는 재생이 시작돼야 알 수 있다
  // (자동 확인이 안 된 경우에만 10분까지로 대신한다)
  const sliderEnabled = videoLength !== null || embed.kind === "warn";
  const startMax =
    videoLength !== null
      ? Math.max(0, Math.floor(videoLength) - duration)
      : embed.kind === "warn"
        ? 600
        : 0;

  // 구간 길이를 늘려 영상 끝을 넘게 되면 시작 지점을 당겨 준다
  useEffect(() => {
    if (videoLength !== null && startSec > startMax) setStartSec(startMax);
  }, [videoLength, startSec, startMax]);

  function clearVerify() {
    verifyingRef.current = false;
    if (verifyTimer.current !== null) {
      window.clearTimeout(verifyTimer.current);
      verifyTimer.current = null;
    }
  }

  // 링크가 바뀌면: 검사 상태 초기화 + 시작 지점/제목 자동 채우기 + 막힌 영상 조기 감지
  useEffect(() => {
    previewRef.current = null;
    blockedMsgRef.current = null;
    clearVerify();
    setChannel(null);
    setVideoLength(null);
    setStartSec(0);
    if (!videoId) {
      setEmbed({ kind: "idle" });
      return;
    }
    setEmbed({ kind: "checking" });

    // 링크에 t=83 같은 시작 시각이 붙어 있으면 그 지점에서 시작 (영상 길이를 알게 되면 범위로 보정)
    const fromUrl = extractStartSec(url);
    if (fromUrl !== null) setStartSec(fromUrl);

    let cancelled = false;
    void lookupVideo(videoId).then((info) => {
      if (cancelled) return;
      if (info.kind === "blocked" || info.kind === "missing") {
        const message =
          info.kind === "blocked" ? BLOCKED_MESSAGE : describeYTError(100);
        blockedMsgRef.current = message;
        clearVerify();
        setEmbed({ kind: "error", message });
      } else if (info.kind === "ok") {
        setChannel(info.author || null);
        if (!touched.current.title) setTitle(cleanVideoTitle(info.title));
      }
    });
    return () => {
      cancelled = true;
    };
    // url 전체가 아니라 영상이 바뀔 때만 다시 검사한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(
    () => () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
      if (verifyTimer.current !== null) window.clearTimeout(verifyTimer.current);
    },
    [],
  );

  /** 플레이어가 준비되면 소리 없이 잠깐 틀어 보고, 재생이 시작되는지 확인한다 */
  function startVerify(p: YTPlayer) {
    if (blockedMsgRef.current) return;
    previewRef.current = p;
    verifyingRef.current = true;
    p.mute();
    p.seekTo(startSec, true);
    p.playVideo();
    verifyTimer.current = window.setTimeout(() => {
      if (!verifyingRef.current) return;
      verifyingRef.current = false;
      p.pauseVideo();
      const len = p.getDuration();
      if (len > 0) setVideoLength(len);
      setEmbed((cur) => (cur.kind === "checking" ? { kind: "warn" } : cur));
    }, 8000);
  }

  function handlePreviewState(state: number) {
    if (state !== YT_STATE.PLAYING || blockedMsgRef.current) return;
    if (verifyingRef.current) {
      clearVerify();
      previewRef.current?.pauseVideo(); // 확인용 무음 재생은 바로 멈춘다
    }
    const len = previewRef.current?.getDuration() ?? 0;
    if (len > 0) setVideoLength(len);
    setEmbed({ kind: "ok" });
  }

  function playPreview() {
    const p = previewRef.current;
    if (!p) return;
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    p.seekTo(startSec, true);
    applyMusicAudio(p, { muted, volume: musicVolume });
    p.playVideo();
    previewTimer.current = window.setTimeout(
      () => p.pauseVideo(),
      duration * 1000,
    );
  }

  const canSubmit =
    Boolean(videoId) &&
    embed.kind !== "error" &&
    embed.kind !== "checking" &&
    title.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !videoId) return;
    setSubmitting(true);
    setError(null);
    play("click");
    try {
      await submitSongRound({
        roundId,
        playerId,
        videoId,
        startSec,
        durationSec: duration,
        title: title.trim(),
      });
      saveSetterNote(roundId, { title: title.trim() });
      play("submit");
      // 화면 전환은 실시간으로 round.status 가 ready 로 바뀌면 호출 쪽이 처리한다
    } catch (err) {
      setError(err instanceof GameError ? err.message : "문제를 제출하지 못했어요.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-fade-in-up space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">🎤 문제 내기</h2>
        <p className="mt-1 text-xs text-slate-400">
          유튜브 링크와 들려줄 구간, 정답을 정해주세요. 정답은 서버에만 저장되고
          다른 참가자에게는 보이지 않아요.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          유튜브 링크
        </label>
        <input
          className="input-field"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://youtu.be/…  또는 watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {url.trim() && !videoId ? (
          <p className="mt-1.5 text-xs text-red-500">
            유튜브 영상 링크를 알아보지 못했어요.
          </p>
        ) : null}
      </div>

      {videoId ? (
        <div className="space-y-2">
          <YouTubeFrame
            videoId={videoId}
            onReady={startVerify}
            onStateChange={handlePreviewState}
            onError={(code) => {
              clearVerify();
              setEmbed({
                kind: "error",
                message: blockedMsgRef.current ?? describeYTError(code),
              });
            }}
          />
          {embed.kind === "checking" ? (
            <p className="text-xs text-slate-400">재생할 수 있는 영상인지 확인 중…</p>
          ) : null}
          {embed.kind === "warn" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              재생 여부를 자동으로 확인하지 못했어요. 아래 미리듣기로 소리가 나는지
              직접 확인한 뒤 문제를 내주세요.
            </p>
          ) : null}
          {embed.kind === "error" ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {embed.message}
            </p>
          ) : null}
          {embed.kind === "ok" || embed.kind === "warn" ? (
            <button
              type="button"
              onClick={playPreview}
              className="btn-secondary w-full text-sm"
            >
              ▶ 미리듣기 ({formatTime(startSec)}부터 {duration}초)
            </button>
          ) : null}
          {channel ? (
            <p className="text-xs text-slate-400">채널: {channel}</p>
          ) : null}
        </div>
      ) : null}

      <RangeField
        label={`시작 지점 · ${formatTime(startSec)}`}
        value={startSec}
        min={0}
        max={startMax}
        unit="초"
        format={formatTime}
        disabled={!sliderEnabled}
        onChange={setStartSec}
      />
      {!sliderEnabled ? (
        <p className="-mt-3 text-xs text-slate-400">
          영상을 확인하면 시작 지점을 고를 수 있어요.
        </p>
      ) : null}

      <RangeField
        label="재생 길이"
        value={duration}
        min={SONG_RULES.clipMin}
        max={maxDuration}
        unit="초"
        onChange={setDuration}
      />
      {roomTimeLimit !== null && maxDuration < SONG_RULES.clipMax ? (
        <p className="-mt-3 text-xs text-slate-400">
          방의 제한시간({roomTimeLimit}초)보다 길게 틀 수는 없어요.
        </p>
      ) : null}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          정답
        </label>
        <input
          className="input-field"
          placeholder="예: Love Dive"
          maxLength={100}
          value={title}
          onChange={(e) => {
            touched.current.title = true;
            setTitle(e.target.value);
          }}
        />
        <p className="mt-1.5 text-xs text-slate-400">
          이 답과 정확히 같게 써야 정답이에요. 띄어쓰기·대소문자·특수문자는 알아서 무시되지만,
          영어와 한글 표기는 서로 다른 답이에요. 영상 제목이 자동으로 들어갔다면 노래 제목만
          남기고 고쳐주세요.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary w-full py-3 text-base"
      >
        {submitting ? "제출 중..." : "문제 내기"}
      </button>
    </form>
  );
}
