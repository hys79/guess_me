"use client";

import { memo, useMemo, type PointerEvent } from "react";
import { FIVE_LINK } from "../rules";
import type { Cell, Grid, Tile } from "../engine";
import type { Floater, Ghost } from "../hooks/useFiveLink";

const { rows, cols } = FIVE_LINK;

/**
 * 숫자별 색 — 흰색에 가까운 파스텔 무지개. 배경은 거의 흰색, 옅은 테두리와 또렷한 숫자색으로 구분한다.
 * (Tailwind 가 클래스를 찾을 수 있게 전부 문자열 그대로 적는다)
 */
const TILE_COLORS: Record<number, string> = {
  1: "bg-rose-50 border-rose-200 text-rose-500",
  2: "bg-orange-50 border-orange-200 text-orange-500",
  3: "bg-amber-50 border-amber-200 text-amber-600",
  4: "bg-lime-50 border-lime-200 text-lime-600",
  5: "bg-emerald-50 border-emerald-200 text-emerald-500",
  6: "bg-cyan-50 border-cyan-200 text-cyan-600",
  7: "bg-sky-50 border-sky-200 text-sky-500",
  8: "bg-indigo-50 border-indigo-200 text-indigo-500",
  9: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-500",
};

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
  /** 지금 선택이 확정 가능한 합(5의 배수)인가 → 테두리를 빛나게 */
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
  const state = selected
    ? valid
      ? "scale-90 ring-[3px] ring-amber-400 shadow-[0_0_14px_3px_rgba(251,191,36,0.9)]"
      : "scale-90 ring-2 ring-primary-500"
    : "";
  const dropping = !ghost && tile.drop ? tile.drop : 0;
  const dur = dropDuration(dropping);
  return (
    <div
      className="relative h-full w-full p-[3px]"
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
        className={`relative flex h-full w-full items-center justify-center rounded-xl border text-[clamp(1rem,5.4vw,1.6rem)] font-extrabold tabular-nums shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-[transform,box-shadow] duration-100 ${TILE_COLORS[tile.v]} ${state} ${ghost ? "animate-tile-out" : ""}`}
      >
        {tile.v}
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
      className={`relative aspect-square w-full touch-none select-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${shaking ? "animate-board-shake" : ""}`}
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
