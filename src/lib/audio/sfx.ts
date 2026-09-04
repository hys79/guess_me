"use client";

/**
 * 외부 오디오 파일 없이 Web Audio API 로 합성하는 효과음 모음.
 * AudioContext 는 최초 사용 시(사용자 제스처 이후) 생성/재개된다.
 */

export type SfxName =
  | "click"
  | "submit"
  | "roundStart"
  | "scorePlus" // 👍 좋아요
  | "scoreMinus" // 👎 별로예요
  | "reveal"
  | "win"
  | "tick"
  | "yourTurn"; // 다같이 모드: 내 차례가 됐을 때

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let currentVolume = 0.7;

/** 효과음 기본 출력을 슬라이더 값 대비 1.5배 키운다. (슬라이더는 "상대적 크기") */
const SFX_GAIN_SCALE = 1.5;

function effectiveGain() {
  return currentVolume * SFX_GAIN_SCALE;
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;

  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = effectiveGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** 0~1 */
export function setSfxVolume(v: number) {
  currentVolume = Math.max(0, Math.min(1, v));
  if (master && ctx) {
    master.gain.setTargetAtTime(effectiveGain(), ctx.currentTime, 0.02);
  }
}

/** 브라우저 자동재생 정책 대응: 첫 제스처에서 호출 */
export function unlockAudio() {
  ensureContext();
}

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  start?: number; // 상대 시작(초)
  dur?: number;
  gain?: number;
  glideTo?: number; // 종료 주파수(포르타멘토)
}

function tone(context: AudioContext, out: GainNode, o: ToneOpts) {
  const t0 = context.currentTime + (o.start ?? 0);
  const dur = o.dur ?? 0.15;
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, o.glideTo),
      t0 + dur,
    );
  }
  const peak = o.gain ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(
  context: AudioContext,
  out: GainNode,
  { start = 0, dur = 0.2, gain = 0.15 }: { start?: number; dur?: number; gain?: number },
) {
  const t0 = context.currentTime + start;
  const frames = Math.floor(context.sampleRate * dur);
  const buf = context.createBuffer(1, frames, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = context.createBufferSource();
  src.buffer = buf;
  const g = context.createGain();
  g.gain.value = gain;
  const lp = context.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  src.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(t0);
}

export function playSfx(name: SfxName) {
  const context = ensureContext();
  if (!context || !master) return;
  const out = master;

  switch (name) {
    case "click":
      tone(context, out, { freq: 420, type: "triangle", dur: 0.06, gain: 0.12 });
      break;
    case "submit":
      tone(context, out, { freq: 523.25, type: "sine", dur: 0.1 });
      tone(context, out, { freq: 783.99, type: "sine", start: 0.09, dur: 0.12 });
      break;
    case "roundStart":
      tone(context, out, { freq: 392, type: "triangle", dur: 0.12 });
      tone(context, out, { freq: 587.33, type: "triangle", start: 0.11, dur: 0.14 });
      tone(context, out, { freq: 784, type: "triangle", start: 0.24, dur: 0.18 });
      break;
    case "scorePlus":
      tone(context, out, { freq: 659.25, type: "sine", dur: 0.09 });
      tone(context, out, {
        freq: 987.77,
        type: "sine",
        start: 0.08,
        dur: 0.13,
        glideTo: 1174.66,
      });
      break;
    case "scoreMinus":
      tone(context, out, {
        freq: 330,
        type: "sawtooth",
        dur: 0.18,
        gain: 0.16,
        glideTo: 160,
      });
      break;
    case "reveal":
      tone(context, out, { freq: 523.25, type: "sine", dur: 0.16 });
      tone(context, out, { freq: 659.25, type: "sine", start: 0.12, dur: 0.16 });
      tone(context, out, { freq: 987.77, type: "sine", start: 0.24, dur: 0.28 });
      noiseBurst(context, out, { start: 0.24, dur: 0.3, gain: 0.06 });
      break;
    case "win":
      tone(context, out, { freq: 523.25, type: "triangle", dur: 0.14 });
      tone(context, out, { freq: 659.25, type: "triangle", start: 0.13, dur: 0.14 });
      tone(context, out, { freq: 783.99, type: "triangle", start: 0.26, dur: 0.14 });
      tone(context, out, { freq: 1046.5, type: "triangle", start: 0.39, dur: 0.36 });
      noiseBurst(context, out, { start: 0.39, dur: 0.4, gain: 0.05 });
      break;
    case "tick":
      tone(context, out, { freq: 880, type: "square", dur: 0.04, gain: 0.08 });
      break;
    case "yourTurn":
      tone(context, out, { freq: 587.33, type: "square", dur: 0.09, gain: 0.14 });
      tone(context, out, { freq: 880, type: "square", start: 0.1, dur: 0.09, gain: 0.14 });
      tone(context, out, { freq: 1174.66, type: "square", start: 0.2, dur: 0.16, gain: 0.16 });
      break;
  }
}
