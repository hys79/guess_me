"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRoomByCode } from "@/hooks/useRoomByCode";
import { useRoomBase } from "@/hooks/useRoomBase";
import { getStoredPlayer, type StoredPlayer } from "@/lib/player";
import { leaveRoom } from "@/lib/rooms";
import { useSound } from "@/lib/audio/SoundProvider";
import { getGameMeta } from "@/games/registry";
import { getGameUI } from "@/games/ui";
import { Lobby } from "@/components/common/Lobby";

/**
 * 방 페이지 셸 — 어떤 게임이든 공통인 부분만 맡는다:
 *   방/참가자 실시간 구독 · 입장 여부 확인 · 대기실 · 방 나가기 · 게임별 화면 선택.
 * 게임 시작 이후의 화면은 rooms.game_type 으로 고른 게임 모듈(games/<id>)이 그린다.
 */
export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const [stored, setStored] = useState<StoredPlayer | null | undefined>(
    undefined,
  );
  useEffect(() => {
    setStored(getStoredPlayer(code));
  }, [code]);

  const { room: initialRoom, roomId, loading: roomLoading } = useRoomByCode(code);
  const base = useRoomBase(roomId);
  const room = base.room ?? initialRoom;
  const players = base.players;

  const me = useMemo(
    () =>
      stored ? (players.find((p) => p.id === stored.playerId) ?? null) : null,
    [players, stored],
  );

  const meta = getGameMeta(room?.game_type);
  const ui = getGameUI(room?.game_type);

  // 게임이 자기 소리를 쓰면(노래 맞히기) 배경음악을 끈다
  const { setBgmSuppressed } = useSound();
  const suppressBgm = meta ? !meta.bgm : false;
  useEffect(() => {
    setBgmSuppressed(suppressBgm);
    return () => setBgmSuppressed(false);
  }, [suppressBgm, setBgmSuppressed]);

  async function handleLeave() {
    if (stored) await leaveRoom(code, stored.playerId);
    router.push("/");
  }

  // --- 로딩 / 예외 처리 -------------------------------------------------------
  if (stored === undefined || roomLoading) {
    return <CenterNote>불러오는 중...</CenterNote>;
  }

  if (!room) {
    return (
      <CenterNote>
        <p className="mb-4">존재하지 않는 방입니다. (코드: {code})</p>
        <Link href="/" className="btn-secondary">
          처음으로
        </Link>
      </CenterNote>
    );
  }

  if (!stored || (!me && !base.loading)) {
    return (
      <CenterNote>
        <p className="mb-4">이 방에 아직 참가하지 않았습니다.</p>
        <Link href={`/join?code=${code}`} className="btn-primary">
          이 방에 참가하기
        </Link>
      </CenterNote>
    );
  }

  if (!meta || !ui) {
    return (
      <CenterNote>
        <p className="mb-4">
          이 앱 버전에서 지원하지 않는 게임이에요. (game_type: {room.game_type})
        </p>
        <Link href="/" className="btn-secondary">
          처음으로
        </Link>
      </CenterNote>
    );
  }

  // --- 대기실 (공통) -----------------------------------------------------------
  if (room.status === "waiting") {
    return (
      <Lobby
        room={room}
        players={players}
        stored={stored}
        code={code}
        game={meta}
        ui={ui}
        isHost={Boolean(me?.is_host)}
        onLeave={handleLeave}
      />
    );
  }

  // --- 게임 진행 · 종료 (게임별) --------------------------------------------------
  const GameRoom = ui.Room;
  return (
    <GameRoom
      room={room}
      players={players}
      stored={stored}
      code={code}
      onLeave={handleLeave}
    />
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center text-slate-600">
      {children}
    </main>
  );
}
