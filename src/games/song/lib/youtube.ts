"use client";

/**
 * YouTube IFrame Player API 래퍼 (API 키 불필요).
 * 외부 타입 패키지를 쓰지 않고, 우리가 쓰는 부분만 최소한으로 선언한다.
 */

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  /** 영상 전체 길이(초). 메타데이터가 로드되기 전에는 0 */
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { target: YTPlayer; data: number }) => void;
    onError?: (e: { target: YTPlayer; data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** iframe_api 스크립트를 한 번만 불러온다. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 쓸 수 있습니다."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);

  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("YouTube 플레이어를 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

/**
 * 사용자의 사운드 설정(전체 음소거 · 음악 소리)을 유튜브 플레이어에 적용한다.
 * 소리가 나야 하는 순간(구간 재생·다시 듣기·정답 공개)마다 이 함수를 부른다.
 * (iOS Safari 는 프로그램으로 바꾼 볼륨을 무시한다 — 그때는 기기 음량 버튼이 기준이다)
 */
export function applyMusicAudio(
  player: YTPlayer,
  audio: { muted: boolean; volume: number },
): void {
  if (audio.muted || audio.volume <= 0) {
    player.mute();
    return;
  }
  player.unMute();
  player.setVolume(Math.round(Math.min(1, audio.volume) * 100));
}

/** 플레이어 오류 코드 → 사용자용 문구 (문제 추적을 위해 코드도 같이 보여 준다) */
export function describeYTError(code: number): string {
  switch (code) {
    case 2:
      return "올바르지 않은 영상 주소예요. (오류 2)";
    case 5:
      return "이 브라우저에서는 영상을 재생할 수 없어요. (오류 5)";
    case 100:
      return "영상을 찾을 수 없거나 비공개예요. (오류 100)";
    case 101:
    case 150:
      return `이 영상은 외부 재생이 막혀 있어요. 다른 영상을 골라주세요. (오류 ${code})`;
    case -1:
      return "YouTube 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
    default:
      return `영상을 불러오지 못했어요. (오류 ${code})`;
  }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function parseUrl(raw: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/** 유튜브 링크(youtu.be / watch?v= / shorts / embed / live / music.youtube.com) 또는 11자 id 에서 영상 id 를 뽑는다. */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return raw;

  const url = parseUrl(raw);
  if (!url) return null;
  const host = url.hostname.replace(/^(www|m|music)\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && VIDEO_ID.test(v)) return v;
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** 링크의 t= / start= (83, 1m23s) 를 초로. 없으면 null. */
export function extractStartSec(input: string): number | null {
  const url = parseUrl(input.trim());
  if (!url) return null;
  const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** oEmbed 조회 결과 */
export type VideoLookup =
  | { kind: "ok"; title: string; author: string }
  /** 외부 재생(임베드)이 막힌 영상 — 연령 제한·음원사 차단 등. oEmbed 가 401/403 을 돌려준다 */
  | { kind: "blocked" }
  | { kind: "missing" }
  /** 네트워크/CORS 등으로 알 수 없음 — 호출 쪽은 다른 검사로 계속 진행하면 된다 */
  | { kind: "unknown" };

/**
 * oEmbed 로 영상 제목/채널을 가져온다. 출제 폼에서 제목 자동 입력과, "재생이 막힌 영상"을
 * 플레이어를 띄우기도 전에 걸러내는 데 쓴다.
 */
export async function lookupVideo(videoId: string): Promise<VideoLookup> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    );
    if (res.status === 401 || res.status === 403) return { kind: "blocked" };
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "unknown" };
    const json = (await res.json()) as { title?: string; author_name?: string };
    return json.title
      ? { kind: "ok", title: json.title, author: json.author_name ?? "" }
      : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}
