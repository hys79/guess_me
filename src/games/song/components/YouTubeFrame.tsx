"use client";

import { useEffect, useRef } from "react";
import {
  loadYouTubeApi,
  type YTPlayer,
} from "@/games/song/lib/youtube";

interface YouTubeFrameProps {
  videoId: string;
  onReady?: (player: YTPlayer) => void;
  onStateChange?: (state: number) => void;
  /** YouTube 오류 코드 (-1 = API 자체를 못 불러옴) */
  onError?: (code: number) => void;
  /** 이 안에 오버레이 등을 겹쳐 넣을 수 있다 */
  children?: React.ReactNode;
}

/**
 * 16:9 영역에 유튜브 플레이어를 하나 만든다. 컨트롤·키보드·전체화면은 끈다.
 * 소리만 쓰는 게임이라 호출하는 쪽이 children 으로 불투명 오버레이를 덮어 영상을 가린다.
 * (유튜브 정책상 플레이어 자체는 DOM 에 그대로 남겨 둔다)
 */
export function YouTubeFrame({
  videoId,
  onReady,
  onStateChange,
  onError,
  children,
}: YouTubeFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  // 콜백은 ref 로 들고 있어 플레이어를 다시 만들지 않고도 항상 최신 것을 부른다
  const cb = useRef({ onReady, onStateChange, onError });
  cb.current = { onReady, onStateChange, onError };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let player: YTPlayer | null = null;

    // YT.Player 는 넘겨 준 엘리먼트를 iframe 으로 "교체"한다 → React 가 관리하는 노드를
    // 건드리지 않도록 전용 자식 노드를 만들어 넘긴다.
    const mount = document.createElement("div");
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (e) => {
              if (!cancelled) cb.current.onReady?.(e.target);
            },
            onStateChange: (e) => {
              if (!cancelled) cb.current.onStateChange?.(e.data);
            },
            onError: (e) => {
              if (!cancelled) cb.current.onError?.(e.data);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) cb.current.onError?.(-1);
      });

    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        /* 이미 정리됨 */
      }
      host.replaceChildren();
    };
  }, [videoId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
      <div
        ref={hostRef}
        className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full"
      />
      {children}
    </div>
  );
}
