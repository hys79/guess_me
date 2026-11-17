"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSound } from "@/lib/audio/SoundProvider";
import {
  canExtend,
  clearPath,
  createGrid,
  hasMove,
  pathSum,
  reshuffle,
  sameCell,
  Spawner,
  type Cell,
  type Grid,
  type Tile,
} from "../engine";
import { LINK_TEN, comboStage, isValidSum, moveScore } from "../rules";
import { saveBest } from "../lib/ranking";

export type Phase = "ready" | "countdown" | "playing" | "over";

/** 제거되어 사라지는 중인 타일 (연출용) */
export interface Ghost {
  key: number;
  tile: Tile;
  r: number;
  c: number;
  /** 이 제거의 콤보 단계(1~5) — 조각 수/세기 */
  power: number;
}

/** 제거 지점에 떠올랐다 사라지는 "+점수" */
export interface Floater {
  id: number;
  text: string;
  /** 칸 단위 좌표 */
  x: number;
  y: number;
  /** 콤보 배율이 붙은 경우 강조 */
  hot: boolean;
}

/** 경로 선택 중 손가락이 "이 칸에 들어왔다"고 인정하는 반지름(칸 단위). 대각선 모서리 오인식 방지. */
const START_RADIUS = 0.48;
const EXTEND_RADIUS = 0.4;
/** 빠른 드래그에서 칸을 건너뛰지 않도록 포인터 이동 구간을 이 간격(칸 단위)으로 쪼개 검사 */
const SAMPLE_STEP = 0.2;

function hitCell(x: number, y: number, radius: number): Cell | null {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (r < 0 || r >= LINK_TEN.rows || c < 0 || c >= LINK_TEN.cols) return null;
  const dx = x - (c + 0.5);
  const dy = y - (r + 0.5);
  return dx * dx + dy * dy <= radius * radius ? { r, c } : null;
}

export function useLinkTen() {
  const { play } = useSound();
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  // --- 화면에 그려지는 상태 ---
  const [phase, setPhase] = useState<Phase>("ready");
  const [runId, setRunId] = useState(0);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [path, setPath] = useState<Cell[]>([]);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestCombo, setBestCombo] = useState(1);
  const [comboDeadline, setComboDeadline] = useState(0);
  const [endAt, setEndAt] = useState(0);
  const [now, setNow] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [shaking, setShaking] = useState(false);
  const [flash, setFlash] = useState<{ id: number; stage: number } | null>(null);
  const [newBest, setNewBest] = useState(false);

  // --- 핸들러가 항상 최신 값을 보도록 ref 로도 들고 있는다 ---
  const phaseRef = useRef<Phase>("ready");
  const gridRef = useRef<Grid | null>(null);
  const pathRef = useRef<Cell[]>([]);
  const spawnerRef = useRef<Spawner | null>(null);
  const scoreRef = useRef(0);
  const movesRef = useRef(0);
  const streakRef = useRef(0);
  const bestComboRef = useRef(1);
  const comboDeadlineRef = useRef(0);
  const endAtRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const idRef = useRef(1);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastTickSecRef = useRef(-1);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      fn();
    }, ms);
    timersRef.current.add(t);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const setPathBoth = useCallback((p: Cell[]) => {
    pathRef.current = p;
    setPath(p);
  }, []);

  // ---------------------------------------------------------------------
  // 시작 / 종료
  // ---------------------------------------------------------------------
  const finish = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    lastPointRef.current = null;
    setPathBoth([]);
    setPhaseBoth("over");
    const isBest = saveBest(scoreRef.current);
    setNewBest(isBest);
    playRef.current(isBest ? "win" : "reveal");
  }, [setPathBoth, setPhaseBoth]);

  /** 매번 완전히 새로운(랜덤) 판으로 시작 */
  const start = useCallback(() => {
    if (phaseRef.current === "countdown" || phaseRef.current === "playing") return;
    clearTimers();

    const spawner = new Spawner(Math.floor(Math.random() * 0xffffffff));
    let first = createGrid(spawner);
    if (!hasMove(first)) first = reshuffle(first, spawner);
    spawnerRef.current = spawner;
    gridRef.current = first;
    setGrid(first);

    scoreRef.current = 0;
    movesRef.current = 0;
    streakRef.current = 0;
    bestComboRef.current = 1;
    comboDeadlineRef.current = 0;
    lastTickSecRef.current = -1;
    setScore(0);
    setMoves(0);
    setStreak(0);
    setBestCombo(1);
    setComboDeadline(0);
    setGhosts([]);
    setFloaters([]);
    setNewBest(false);
    setFlash(null);
    setPathBoth([]);
    setRunId((n) => n + 1);

    setPhaseBoth("countdown");

    // 3, 2, 1 → 시작
    let left = LINK_TEN.countdownSec;
    setCountdown(left);
    playRef.current("tick");
    const step = () => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        playRef.current("tick");
        later(step, 1000);
      } else {
        const t = Date.now();
        endAtRef.current = t + LINK_TEN.durationSec * 1000;
        setEndAt(endAtRef.current);
        setNow(t);
        setPhaseBoth("playing");
        playRef.current("roundStart");
      }
    };
    later(step, 1000);
  }, [clearTimers, later, setPathBoth, setPhaseBoth]);

  // 시계: 플레이 중 0.1초마다 갱신(남은 시간, 콤보 유지 시간, 종료 판정)
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const leftSec = Math.ceil((endAtRef.current - t) / 1000);
      if (leftSec <= 5 && leftSec > 0 && leftSec !== lastTickSecRef.current) {
        lastTickSecRef.current = leftSec;
        playRef.current("tick");
      }
      if (t >= endAtRef.current) finish();
    }, 100);
    return () => clearInterval(id);
  }, [phase, finish]);

  // ---------------------------------------------------------------------
  // 제거 확정
  // ---------------------------------------------------------------------
  const commit = useCallback(
    (cells: Cell[]) => {
      const g = gridRef.current;
      const spawner = spawnerRef.current;
      if (!g || !spawner) return;

      const t = Date.now();
      const continued = comboDeadlineRef.current > t;
      const streakNow = continued ? streakRef.current + 1 : 1;
      const gain = moveScore(streakNow);

      const result = clearPath(g, cells, spawner);
      let nextGrid = result.grid;
      if (!hasMove(nextGrid)) nextGrid = reshuffle(nextGrid, spawner);

      gridRef.current = nextGrid;
      setGrid(nextGrid);

      streakRef.current = streakNow;
      comboDeadlineRef.current = t + LINK_TEN.comboWindowMs;
      scoreRef.current += gain;
      movesRef.current += 1;
      if (streakNow > bestComboRef.current) bestComboRef.current = streakNow;
      setStreak(streakNow);
      setComboDeadline(comboDeadlineRef.current);
      setScore(scoreRef.current);
      setMoves(movesRef.current);
      setBestCombo(bestComboRef.current);

      // 연출: 사라지는 타일 + 떠오르는 점수
      const stage = comboStage(streakNow);
      const ghostBatch: Ghost[] = result.removed.map((x) => ({
        key: x.tile.id,
        power: stage,
        ...x,
      }));
      setGhosts((prev) => [...prev, ...ghostBatch]);
      later(() => {
        setGhosts((prev) => prev.filter((gh) => !ghostBatch.some((b) => b.key === gh.key)));
      }, 650);

      const id = idRef.current;
      idRef.current += 1;
      setFlash({ id, stage });
      const floater: Floater = {
        id,
        text: `+${gain}`,
        x: cells.reduce((a, p) => a + p.c + 0.5, 0) / cells.length,
        y: cells.reduce((a, p) => a + p.r + 0.5, 0) / cells.length,
        hot: stage >= 3,
      };
      setFloaters((prev) => [...prev, floater]);
      later(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 950);

      playRef.current("linkClear", streakNow);
    },
    [later],
  );

  // ---------------------------------------------------------------------
  // 입력 (좌표는 모두 "칸 단위": 0..cols, 0..rows)
  // ---------------------------------------------------------------------
  const extendTo = useCallback((x: number, y: number) => {
    const cell = hitCell(x, y, EXTEND_RADIUS);
    if (!cell) return;
    const cur = pathRef.current;
    const last = cur[cur.length - 1];
    if (!last || sameCell(last, cell)) return;

    // 바로 직전 칸으로 되돌아가면 마지막 한 칸을 취소
    if (cur.length >= 2 && sameCell(cur[cur.length - 2], cell)) {
      setPathBoth(cur.slice(0, -1));
      playRef.current("linkStep", cur.length - 1);
      return;
    }
    if (!canExtend(cur, cell)) return;
    const next = [...cur, cell];
    setPathBoth(next);
    playRef.current("linkStep", next.length);
  }, [setPathBoth]);

  const pointerStart = useCallback(
    (x: number, y: number) => {
      if (phaseRef.current !== "playing") return;
      const cell = hitCell(x, y, START_RADIUS);
      lastPointRef.current = { x, y };
      if (!cell) {
        setPathBoth([]);
        return;
      }
      setPathBoth([cell]);
      playRef.current("linkStep", 1);
    },
    [setPathBoth],
  );

  const pointerMove = useCallback(
    (x: number, y: number) => {
      if (phaseRef.current !== "playing" || pathRef.current.length === 0) return;
      const from = lastPointRef.current ?? { x, y };
      const dx = x - from.x;
      const dy = y - from.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
      for (let i = 1; i <= steps; i += 1) {
        extendTo(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
      }
      lastPointRef.current = { x, y };
    },
    [extendTo],
  );

  const pointerEnd = useCallback(() => {
    lastPointRef.current = null;
    const cells = pathRef.current;
    if (phaseRef.current !== "playing" || cells.length === 0) {
      setPathBoth([]);
      return;
    }
    const g = gridRef.current;
    setPathBoth([]);
    if (!g || cells.length < 2) return; // 한 칸만 눌렀다 뗀 것 — 조용히 무시
    if (isValidSum(pathSum(g, cells), cells.length)) {
      commit(cells);
    } else {
      playRef.current("linkFail");
      setShaking(true);
      later(() => setShaking(false), 320);
    }
  }, [commit, later, setPathBoth]);

  // 선택 중인 경로가 확정 가능한 합인지 (화면에서 테두리를 빛나게 하는 기준 — 합 숫자는 보여 주지 않는다)
  const valid = grid ? isValidSum(pathSum(grid, path), path.length) : false;

  const timeLeftMs = phase === "playing" ? Math.max(0, endAt - now) : phase === "over" ? 0 : LINK_TEN.durationSec * 1000;
  const comboLeftMs = phase === "playing" ? Math.max(0, comboDeadline - now) : 0;

  return {
    phase,
    runId,
    grid,
    path,
    valid,
    score,
    moves,
    streak,
    bestCombo,
    timeLeftMs,
    comboLeftMs,
    countdown,
    ghosts,
    floaters,
    shaking,
    flash,
    newBest,
    start,
    pointerStart,
    pointerMove,
    pointerEnd,
  };
}
