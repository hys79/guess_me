/**
 * Five Link — 순수 게임 엔진 (React/DOM 의존 없음).
 * 판 생성, 경로 규칙, 제거 + 중력 + 리필, 가능한 수 탐색을 담당한다.
 */
import { FIVE_LINK, isValidSum } from "./rules";

export interface Tile {
  /** 렌더 키 — 판 안에서 유일, 한 번 정해지면 안 바뀐다(떨어지는 애니메이션용) */
  id: number;
  v: number;
  /** 떨어져 내려오는 칸 수(새 타일은 판 위에서, 기존 타일은 아래 칸이 비어서). 없으면 제자리 */
  drop?: number;
  /** 낙하 시작 지연(ms) — 정해 두면 이후 렌더에서 애니메이션이 다시 시작되지 않는다 */
  delay?: number;
  /** true 면 이번에 새로 채워진 타일(위에서 나타남), false/없음이면 기존 타일이 밀려 내려오는 것 */
  fresh?: boolean;
  /** 몇 번째 낙하인지 — 렌더 키로 써서, 같은 타일이 다시 떨어질 때 애니메이션을 새로 시작한다 */
  fall?: number;
}

/** grid[r][c] — r 은 위에서 아래로 0..rows-1 */
export type Grid = Tile[][];

export interface Cell {
  r: number;
  c: number;
}

// ---------------------------------------------------------------------------
// 난수 — 시드가 같으면 같은 판이 나온다 (게임은 매번 랜덤 시드를 쓰지만, 시드 고정으로 재현·테스트가 가능)
// ---------------------------------------------------------------------------

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32비트 시드 (FNV-1a) */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function randomValue(rng: Rng): number {
  const { minValue, maxValue } = FIVE_LINK;
  return minValue + Math.floor(rng() * (maxValue - minValue + 1));
}

/**
 * 보충 타일 공급기. 열마다 독립된 난수 흐름을 쓰므로, 같은 시드면
 * "n 번째로 채워지는 타일"이 플레이 순서와 무관하게 같다(재현·테스트용).
 */
export class Spawner {
  private streams: Rng[];
  private nextId = 1;

  constructor(seed: number) {
    this.streams = Array.from({ length: FIVE_LINK.cols }, (_, c) =>
      mulberry32(hashSeed(`${seed}:${c}`)),
    );
  }

  newId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  spawn(col: number, drop?: number, delay?: number): Tile {
    return {
      id: this.newId(),
      v: randomValue(this.streams[col]),
      drop,
      delay,
      fresh: drop ? true : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// 판 생성
// ---------------------------------------------------------------------------

export function createGrid(spawner: Spawner): Grid {
  const { rows, cols } = FIVE_LINK;
  const grid: Grid = Array.from({ length: rows }, () => new Array<Tile>(cols));
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      grid[r][c] = spawner.spawn(c);
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// 경로 규칙
// ---------------------------------------------------------------------------

export const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;

export function isAdjacent(a: Cell, b: Cell): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
}

/**
 * path 의 끝에서 next 로 한 칸 이어 갈 수 있는가.
 *  - 8방향 인접
 *  - 이미 지난 칸 불가 (= 이미 그은 줄 위로 지나가는 것 불가)
 *  - 대각선 줄이 이미 그은 반대쪽 대각선 줄과 X 자로 엇갈리는 것도 불가
 */
export function canExtend(path: readonly Cell[], next: Cell): boolean {
  const { rows, cols } = FIVE_LINK;
  if (next.r < 0 || next.r >= rows || next.c < 0 || next.c >= cols) return false;
  if (path.length === 0) return true;
  const last = path[path.length - 1];
  if (!isAdjacent(last, next)) return false;
  if (path.some((p) => sameCell(p, next))) return false;

  if (last.r !== next.r && last.c !== next.c) {
    // 대각선 이동: 같은 2x2 블록의 반대 대각선 두 칸이 이미 연이어 연결돼 있으면 X 교차
    const a: Cell = { r: last.r, c: next.c };
    const b: Cell = { r: next.r, c: last.c };
    for (let i = 0; i + 1 < path.length; i += 1) {
      const p = path[i];
      const q = path[i + 1];
      if ((sameCell(p, a) && sameCell(q, b)) || (sameCell(p, b) && sameCell(q, a))) {
        return false;
      }
    }
  }
  return true;
}

export function pathSum(grid: Grid, path: readonly Cell[]): number {
  let sum = 0;
  for (const { r, c } of path) sum += grid[r][c].v;
  return sum;
}

// ---------------------------------------------------------------------------
// 제거 + 중력 + 리필
// ---------------------------------------------------------------------------

export interface ClearResult {
  grid: Grid;
  /** 제거된 타일(위치 포함) — 사라지는 연출용 */
  removed: { tile: Tile; r: number; c: number }[];
}

export function clearPath(grid: Grid, path: readonly Cell[], spawner: Spawner): ClearResult {
  const { rows, cols } = FIVE_LINK;
  const removedKey = new Set(path.map((p) => p.r * cols + p.c));
  const removed = path.map(({ r, c }) => ({ tile: grid[r][c], r, c }));

  /** 열마다 "왼쪽 열부터 물결처럼" 시작 시각을 어긋나게 하는 간격(ms) */
  const COL_WAVE = 22;

  const next: Grid = Array.from({ length: rows }, () => new Array<Tile>(cols));
  for (let c = 0; c < cols; c += 1) {
    const kept: { tile: Tile; oldRow: number }[] = [];
    for (let r = 0; r < rows; r += 1) {
      if (!removedKey.has(r * cols + c)) kept.push({ tile: grid[r][c], oldRow: r });
    }
    const k = rows - kept.length;

    // 남은 타일은 순서를 유지한 채 아래로 — 내려온 칸 수만큼 같은 낙하 연출을 준다(아래 타일이 먼저)
    const column: Tile[] = new Array<Tile>(rows);
    kept.forEach(({ tile, oldRow }, i) => {
      const newRow = k + i;
      const d = newRow - oldRow;
      column[newRow] =
        d > 0
          ? {
              ...tile,
              drop: d,
              delay: c * COL_WAVE + (rows - 1 - newRow) * 18,
              fresh: false,
              fall: (tile.fall ?? 0) + 1,
            }
          : tile; // 제자리인 타일은 그대로 둔다(아직 떨어지는 중이어도 연출이 끊기지 않게)
    });

    // 새 타일: j = 0 이 가장 아래에 놓이므로 가장 먼저 떨어지고, 위로 갈수록 조금씩 늦다
    for (let j = 0; j < k; j += 1) {
      column[k - 1 - j] = spawner.spawn(c, k, c * COL_WAVE + 40 + j * 70);
    }
    for (let r = 0; r < rows; r += 1) next[r][c] = column[r];
  }
  return { grid: next, removed };
}

// ---------------------------------------------------------------------------
// 가능한 수 탐색 — 막힘 방지용 안전장치 (힌트로는 노출하지 않는다)
// ---------------------------------------------------------------------------

/**
 * 이어 만들 수 있는 유효 경로(합 10)가 하나라도 있는가.
 * 타일이 모두 1 이상이라 합이 10을 넘으면 더 볼 필요가 없고, 길이도 최대 10칸이다.
 */
export function hasMove(grid: Grid, maxLen: number = FIVE_LINK.targetSum): boolean {
  const { rows, cols } = FIVE_LINK;
  const path: Cell[] = [];

  const dfs = (sum: number): boolean => {
    if (isValidSum(sum, path.length)) return true;
    if (sum >= FIVE_LINK.targetSum || path.length >= maxLen) return false;
    const last = path[path.length - 1];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const next: Cell = { r: last.r + dr, c: last.c + dc };
        if (!canExtend(path, next)) continue;
        path.push(next);
        const found = dfs(sum + grid[next.r][next.c].v);
        path.pop();
        if (found) return true;
      }
    }
    return false;
  };

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      path.push({ r, c });
      const found = dfs(grid[r][c].v);
      path.pop();
      if (found) return true;
    }
  }
  return false;
}

/** 막혔을 때: 모든 타일을 새로 뽑는다(드문 경우). 가능한 수가 생길 때까지 반복. */
export function reshuffle(grid: Grid, spawner: Spawner): Grid {
  const { rows, cols } = FIVE_LINK;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rng = mulberry32((Date.now() + attempt * 977) >>> 0);
    const next: Grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        id: spawner.newId(),
        v: randomValue(rng),
        drop: rows,
        delay: (rows - 1 - r) * 40 + c * 22,
        fresh: true,
      })),
    );
    if (hasMove(next)) return next;
  }
  return grid;
}
