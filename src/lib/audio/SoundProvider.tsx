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
  /** 배경음악 파일이 실제로 로드되어 재생 가능한지 */
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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULTS);
  const [bgmAvailable, setBgmAvailable] = useState(false);
  const [gestureDone, setGestureDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 최초 마운트 시 저장값 로드
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

  // BGM <audio> 엘리먼트 준비
  useEffect(() => {
    const el = new Audio(BGM_SRC);
    el.loop = true;
    el.preload = "auto";
    el.volume = settings.muted ? 0 : settings.bgmVolume * BGM_GAIN_SCALE;
    const onCanPlay = () => setBgmAvailable(true);
    const onError = () => setBgmAvailable(false);
    el.addEventListener("canplaythrough", onCanPlay);
    el.addEventListener("error", onError);
    audioRef.current = el;
    return () => {
      el.pause();
      el.removeEventListener("canplaythrough", onCanPlay);
      el.removeEventListener("error", onError);
      audioRef.current = null;
    };
    // 마운트 시 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BGM 볼륨/뮤트 반영
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = settings.muted ? 0 : settings.bgmVolume * BGM_GAIN_SCALE;
  }, [settings.muted, settings.bgmVolume]);

  // 첫 사용자 제스처에서 오디오 잠금 해제 + BGM 재생 시도
  useEffect(() => {
    if (gestureDone) return;
    const handler = () => {
      setGestureDone(true);
      unlockAudio();
      const el = audioRef.current;
      if (el && !settings.muted && bgmAvailable) {
        el.play().catch(() => undefined);
      }
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [gestureDone, settings.muted, bgmAvailable]);

  // 제스처 이후 뮤트/가용성 변화에 따라 BGM 재생/정지
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !gestureDone) return;
    if (!settings.muted && bgmAvailable) {
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [gestureDone, settings.muted, bgmAvailable]);

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
    // Provider 밖에서도 안전하게 no-op
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
