"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { playSfx, setSfxVolume, unlockAudio, type SfxName } from "./sfx";

/** 배경음악 파일 위치. 사용자가 직접 mp3 를 이 경로에 넣으면 된다. */
export const BGM_SRC = "/audio/bgm.mp3";

interface SoundSettings {
  muted: boolean;
  bgmVolume: number; // 0~1
  sfxVolume: number; // 0~1
}

interface SoundContextValue extends SoundSettings {
  /** 배경음악 파일이 실제로 존재/재생 가능한지 */
  bgmAvailable: boolean;
  setMuted: (v: boolean) => void;
  setBgmVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  play: (name: SfxName) => void;
}

const STORAGE_KEY = "guess_me:sound";
const DEFAULTS: SoundSettings = { muted: false, bgmVolume: 0.4, sfxVolume: 0.7 };

/**
 * 배경음악이 효과음보다 너무 크게 들려 실제 출력 게인을 슬라이더 값의 절반으로 낮춘다.
 * (슬라이더는 "상대적 배경음악 크기"로 동작)
 */
const BGM_GAIN_SCALE = 0.5;

const SoundContext = createContext<SoundContextValue | null>(null);

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function loadSettings(): SoundSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted: Boolean(parsed.muted),
      bgmVolume: clamp01(parsed.bgmVolume ?? DEFAULTS.bgmVolume),
      sfxVolume: clamp01(parsed.sfxVolume ?? DEFAULTS.sfxVolume),
    };
  } catch {
    return DEFAULTS;
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULTS);
  const [bgmAvailable, setBgmAvailable] = useState(false);
  const gestureRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 저장값 로드
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // 저장
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  // sfx 볼륨을 신스에 반영
  useEffect(() => {
    setSfxVolume(settings.muted ? 0 : settings.sfxVolume);
  }, [settings.muted, settings.sfxVolume]);

  const bgmTargetVolume = settings.muted
    ? 0
    : clamp01(settings.bgmVolume) * BGM_GAIN_SCALE;

  // <audio> 엘리먼트 1회 생성 + 파일 존재 확인
  useEffect(() => {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.src = BGM_SRC;
    audioRef.current = el;

    const onError = () => setBgmAvailable(false);
    const onLoaded = () => setBgmAvailable(true);
    el.addEventListener("error", onError);
    el.addEventListener("loadeddata", onLoaded);
    el.addEventListener("canplay", onLoaded);

    // HEAD 요청으로 파일 실제 존재 여부를 확실히 판별 (canplay 미발생 브라우저 대비)
    let aborted = false;
    fetch(BGM_SRC, { method: "HEAD" })
      .then((res) => {
        if (!aborted) setBgmAvailable(res.ok);
      })
      .catch(() => {
        if (!aborted) setBgmAvailable(false);
      });

    el.load();

    return () => {
      aborted = true;
      el.pause();
      el.removeEventListener("error", onError);
      el.removeEventListener("loadeddata", onLoaded);
      el.removeEventListener("canplay", onLoaded);
      audioRef.current = null;
    };
  }, []);

  // 볼륨/뮤트를 항상 반영
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = bgmTargetVolume;
  }, [bgmTargetVolume]);

  // 재생/정지 조건: 제스처 완료 + 파일 있음 + 뮤트 아님
  const syncPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (gestureRef.current && bgmAvailable && !settings.muted) {
      el.volume = bgmTargetVolume;
      void el.play().catch(() => {
        /* 아직 제스처 부족 등 — 다음 기회에 재시도 */
      });
    } else {
      el.pause();
    }
  }, [bgmAvailable, settings.muted, bgmTargetVolume]);

  useEffect(() => {
    syncPlayback();
  }, [syncPlayback]);

  // 첫 사용자 제스처에서 오디오 잠금 해제 + 재생 시작
  useEffect(() => {
    if (gestureRef.current) return;
    const handler = () => {
      gestureRef.current = true;
      unlockAudio();
      syncPlayback();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [syncPlayback]);

  const setMuted = useCallback(
    (v: boolean) => setSettings((s) => ({ ...s, muted: v })),
    [],
  );
  const setBgmVolume = useCallback(
    (v: number) => setSettings((s) => ({ ...s, bgmVolume: clamp01(v) })),
    [],
  );
  const setSfx = useCallback(
    (v: number) => setSettings((s) => ({ ...s, sfxVolume: clamp01(v) })),
    [],
  );
  const play = useCallback(
    (name: SfxName) => {
      if (settings.muted || settings.sfxVolume <= 0) return;
      playSfx(name);
    },
    [settings.muted, settings.sfxVolume],
  );

  const value = useMemo<SoundContextValue>(
    () => ({
      ...settings,
      bgmAvailable,
      setMuted,
      setBgmVolume,
      setSfxVolume: setSfx,
      play,
    }),
    [settings, bgmAvailable, setMuted, setBgmVolume, setSfx, play],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    return {
      muted: true,
      bgmVolume: 0,
      sfxVolume: 0,
      bgmAvailable: false,
      setMuted: () => undefined,
      setBgmVolume: () => undefined,
      setSfxVolume: () => undefined,
      play: () => undefined,
    };
  }
  return ctx;
}
