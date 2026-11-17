"use client";

import { memo, useMemo, type PointerEvent } from "react";
import { LINK_TEN } from "../rules";
import type { Cell, Grid, Tile } from "../engine";
import type { Floater, Ghost } from "../hooks/useLinkTen";

const { rows, cols } = LINK_TEN;

/**
 * 숫자별 3D 블록 색 — 파스텔 무지개.
 * top = 윗면 하이라이트, base = 본색, edge = 블록 아랫면(두께) 색, text = 숫자 색.
 * 위에서 아래로 밝은색 → 본색 → 살짝 짙은색으로 번지는 그라데이션 + 안쪽 빛/그림자 + 아랫면 두께 +
 * 바닥 그림자 + 윗면 광택으로 도톰하게 솟아오른 느낌을 낸다.
 */
const TILE_PALETTE: Record<number, { top: string; base: string; edge: string; text: string }> = {
  1: { top: "#ffe6ea", base: "#ffb8c6", edge: "#e07a92", text: "#b3304d" },
  2: { top: "#ffeddf", base: "#ffc8a0", edge: "#e0925a", text: "#b3521a" },
  3: { top: "#fff7cf", base: "#ffe582", edge: "#dfb93f", text: "#8c6a00" },
  4: { top: "#f1fcd0", base: "#d0ef8c", edge: "#9ac450", text: "#587a10" },
  5: { top: "#dcf9e9", base: "#a3e7c3", edge: "#62bc90", text: "#1d7a4e" },
  6: { top: "#daf7fc", base: "#9ee3f1", edge: "#58b7cb", text: "#16708a" },
  7: { top: "#e0f0ff", base: "#a9d3fb", edge: "#639fdb", text: "#1f5f9e" },
  8: { top: "#e8e8ff", base: "#bdbaf6", edge: "#8985d8", text: "#4540a8" },
  9: { top: "#fae3fc", base: "#e8b4f0", edge: "#b97ac6", text: "#8a2e9b" },
};

/** 두 #rrggbb 색을 t(0~1) 비율로 섞는다 — 아랫부분 그림자색을 만들 때 쓴다 */
function mix(a: string, b: string, t: number) {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** 블록 한 칸의 면 스타일. 선택되면 눌려 들어간 모양 + 테두리(합 10 이면 황금빛으로 빛남). */
function faceStyle(v: number, selected: boolean, valid: boolean): React.CSSProperties {
  const p = TILE_PALETTE[v];
  const shade = mix(p.base, p.edge, 0.4);
  const ring = selected
    ? valid
      ? "0 0 0 3px #fbbf24, 0 0 14px 4px rgba(251,191,36,0.9), "
      : "0 0 0 2px #2563eb, "
    : "";
  const body = selected
    ? `inset 0 2px 1px rgba(255,255,255,0.7), inset 0 -2px 3px ${shade}, 0 1px 0 ${p.edge}`
    : `inset 0 2px 1px rgba(255,255,255,0.9), inset 0 -4px 5px ${shade}, 0 3px 0 ${p.edge}, 0 6px 7px rgba(15,23,42,0.18)`;
  return {
    background: `linear-gradient(180deg, ${p.top} 0%, ${p.base} 56%, ${shade} 100%)`,
    color: p.text,
    textShadow: "0 1px 0 rgba(255,255,255,0.75), 0 -1px 0 rgba(0,0,0,0.05)",
    boxShadow: ring + body,
    transform: selected ? "translateY(3px) scale(0.94)" : undefined,
  };
}

/** 제거 때 튀는 조각 색 */
const PARTICLE_COLORS: Record<number, string> = {
  1: "bg-rose-300",
  2: "bg-orange-300",
  3: "bg-amber-300",
  4: "bg-lime-300",
  5: "bg-emerald-300",
  6: "bg-cyan-300",
  7: "bg-sky-300",
  8: "bg-indigo-300",
  9: "bg-fuchsia-300",
};

interface BoardProps {
  grid: Grid;
  path: Cell[];
  /** 지금 선택이 확정 가능한 합(10)인가 → 테두리를 빛나게 */
  valid: boolean;
  ghosts: Ghost[];
  floaters: Floater[];
  shaking: boolean;
  /** 높은 콤보에서 판 전체를 번쩍이게 하는 신호 (id 가 바뀔 때마다 재생) */
  flash: { id: number; stage: number } | null;
  /** 입력 가능한 상태인가(플레이 중) */
  interactive: boolean;
  /** 카운트다운 중에는 판을 가린다 */
  covered: boolean;
  onStart: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

function cellStyle(r: number, c: number) {
  return {
    width: `${100 / cols}%`,
    height: `${100 / rows}%`,
    transform: `translate(${c * 100}%, ${r * 100}%)`,
  };
}

/** 새 타일이 떨어지는 데 걸리는 시간(초) — 멀리서 떨어질수록 길다 */
function dropDuration(drop: number) {
  return Math.min(0.42 + drop * 0.055, 0.8);
}

function TileView({
  tile,
  selected,
  valid,
  ghost,
}: {
  tile: Tile;
  selected: boolean;
  valid: boolean;
  ghost?: boolean;
}) {
  // 낙하 시작 지연은 타일이 떨어질 때 정해져 있다(아래 칸부터, 왼쪽 열부터 물결처럼)
  const delayMs = tile.delay ?? 0;
  const dropping = !ghost && tile.drop ? tile.drop : 0;
  const dur = dropDuration(dropping);
  return (
    // 아래쪽 여백(pb)은 블록의 두께(아랫면)와 그림자가 들어갈 자리
    <div
      className="relative h-full w-full px-[3px] pb-[6px] pt-[3px]"
      style={
        dropping
          ? ({
              transformOrigin: "50% 100%",
              // 새 타일은 위에서 나타나고(tile-drop), 기존 타일은 보이는 채로 밀려 내려온다(tile-shift)
              animation: `${tile.fresh ? "tile-drop" : "tile-shift"} ${dur}s linear ${delayMs}ms both`,
              ["--drop-y" as string]: `${-dropping * 100}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {dropping > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[18%] bottom-[55%] h-[85%] origin-bottom rounded-full bg-gradient-to-t from-primary-200/80 to-transparent"
          style={{ animation: `tile-trail ${dur}s linear ${delayMs}ms both` }}
        />
      )}
      <div
        data-sel={selected ? (valid ? "valid" : "on") : undefined}
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] text-[clamp(1rem,5.4vw,1.6rem)] font-extrabold tabular-nums transition-[transform,box-shadow] duration-100 ${ghost ? "animate-tile-out" : ""}`}
        style={faceStyle(tile.v, selected, valid)}
      >
        {/* 윗면 광택 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[9%] top-[5%] h-[38%] rounded-full bg-gradient-to-b from-white/80 to-white/0"
        />
        <span className="relative">{tile.v}</span>
      </div>
    </div>
  );
}

/** 제거된 타일 자리에서 사방으로 튀는 조각. 콤보 단계(power)가 높을수록 많고 멀리 날아간다. */
function Burst({ v, power }: { v: number; power: number }) {
  const n = 5 + power * 2;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + (i % 2) * 0.35;
        const dist = 26 + (i % 3) * 12 + power * 6;
        const sparkle = power >= 3 && i % 3 === 0;
        return (
          <span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-1/2 -ml-1 -mt-1 rounded-full ${sparkle ? "h-1.5 w-1.5 bg-amber-300" : "h-2 w-2 " + PARTICLE_COLORS[v]}`}
            style={
              {
                animation: `particle-burst ${0.45 + (i % 3) * 0.08}s ease-out both`,
                ["--dx" as string]: `${Math.round(Math.cos(angle) * dist)}px`,
                ["--dy" as string]: `${Math.round(Math.sin(angle) * dist)}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

function BoardImpl({
  grid,
  path,
  valid,
  ghosts,
  floaters,
  shaking,
  flash,
  interactive,
  covered,
  onStart,
  onMove,
  onEnd,
}: BoardProps) {
  const selected = useMemo(() => {
    const ids = new Set<number>();
    for (const { r, c } of path) ids.add(grid[r][c].id);
    return ids;
  }, [grid, path]);

  const tiles = useMemo(() => {
    const out: { tile: Tile; r: number; c: number }[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) out.push({ tile: grid[r][c], r, c });
    }
    return out;
  }, [grid]);

  const toCells = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cols,
      y: ((e.clientY - rect.top) / rect.height) * rows,
    };
  };

  const linePoints = path.map((p) => `${p.c + 0.5},${p.r + 0.5}`).join(" ");

  return (
    <div
      className={`relative aspect-square w-full touch-none select-none overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-200 to-slate-100 shadow-inner ${shaking ? "animate-board-shake" : ""}`}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = toCells(e);
        onStart(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!interactive) return;
        const p = toCells(e);
        onMove(p.x, p.y);
      }}
      onPointerUp={() => interactive && onEnd()}
      onPointerCancel={() => interactive && onEnd()}
      // 손을 창 밖에서 떼는 등 pointerup 을 놓쳐도 선택이 남아 있지 않게 (정상 종료 뒤에는 빈 경로라 무해)
      onLostPointerCapture={() => interactive && onEnd()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {tiles.map(({ tile, r, c }) => (
        <div
          key={tile.id}
          className="absolute left-0 top-0"
          style={cellStyle(r, c)}
        >
          {/* fall 이 바뀌면(같은 타일이 또 떨어질 때) 새로 마운트해서 낙하 연출을 처음부터 다시 재생 */}
          <TileView
            key={tile.fall ?? 0}
            tile={tile}
            selected={selected.has(tile.id)}
            valid={valid}
          />
        </div>
      ))}

      {ghosts.map((g) => (
        <div
          key={`ghost-${g.key}`}
          className="pointer-events-none absolute left-0 top-0"
          style={cellStyle(g.r, g.c)}
        >
          <TileView tile={{ ...g.tile, drop: undefined }} selected={false} valid={false} ghost />
          <Burst v={g.tile.v} power={g.power} />
        </div>
      ))}

      {path.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${cols} ${rows}`}
          preserveAspectRatio="none"
        >
          <polyline
            points={linePoints}
            fill="none"
            stroke={valid ? "#f59e0b" : "#2563eb"}
            strokeOpacity={0.75}
            strokeWidth={0.16}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {floaters.map((f) => (
        <div
          key={f.id}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(f.x / cols) * 100}%`, top: `${(f.y / rows) * 100}%` }}
        >
          <span
            className={`score-delta inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-extrabold shadow ${f.hot ? "bg-amber-400 text-amber-950" : "bg-primary-600 text-white"}`}
          >
            {f.text}
          </span>
        </div>
      ))}

      {flash && flash.stage >= 3 && (
        <div
          key={flash.id}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={
            {
              background:
                "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.85), rgba(251,191,36,0) 72%)",
              animation: "board-flash 0.5s ease-out both",
              ["--flash" as string]: 0.18 + (flash.stage - 3) * 0.14,
            } as React.CSSProperties
          }
        />
      )}

      {covered && (
        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-md" aria-hidden />
      )}
    </div>
  );
}

export const Board = memo(BoardImpl);
