"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGuessMeState } from "@/games/guess-me/hooks/useGuessMeState";
import { advanceToScoring, finalizeRound } from "@/games/guess-me/lib/rounds";
import { useSound } from "@/lib/audio/SoundProvider";
import { QuestionDisplay } from "@/games/guess-me/components/QuestionDisplay";
import { QuestionerPanel } from "@/games/guess-me/components/QuestionerPanel";
import { AnswerInput } from "@/games/guess-me/components/AnswerInput";
import { AnswerProgress } from "@/games/guess-me/components/AnswerProgress";
import { AnswersReadonly } from "@/games/guess-me/components/AnswersReadonly";
import { ScoringPanel } from "@/games/guess-me/components/ScoringPanel";
import { RevealPanel } from "@/games/guess-me/components/RevealPanel";
import { GameFinished } from "@/games/guess-me/components/GameFinished";
import { TurnNotice } from "@/games/guess-me/components/TurnNotice";
import { Scoreboard } from "@/components/common/Scoreboard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { GameRoomProps } from "@/games/types";

/**
 * Guess Me 의 "게임 시작 이후" 화면 전체 (진행 · 종료).
 * 대기실·방 로딩·입장 확인은 방 페이지 셸이 처리한다.
 */
export function GuessMeRoom({ room, players, stored, code, onLeave }: GameRoomProps) {
  const game = useGuessMeState(room.id);
  const isHost = Boolean(players.find((p) => p.id === stored.playerId)?.is_host);

  // --- 질문자(= 답변 대상) 계산 ---------------------------------------------
  // 왕 모드: 항상 방장. 다같이 모드: rooms.current_questioner_id 가 순환시킨다.
  // 값이 아직 없으면(게임 시작 직후 등) 방장으로 폴백한다 — 두 모드 모두 첫
  // 질문자는 방장이므로 이 폴백은 항상 정답이다.
  const hostPlayer = players.find((p) => p.is_host) ?? null;
  const questionerId = room.current_questioner_id ?? hostPlayer?.id ?? null;
  const questionerPlayer = players.find((p) => p.id === questionerId) ?? null;
  const isQuestioner = Boolean(questionerId && stored.playerId === questionerId);

  // --- 라운드 상태 자동 전환 (현재 질문자 클라이언트가 주도, RPC 는 멱등) ----
  // 시그니처(진행 카운트)가 바뀌면 재시도 가능 → 랙/경합에도 자가 복구된다.
  const advanceSigRef = useRef("");
  const finalizeSigRef = useRef("");

  const round = game.currentRound;

  useEffect(() => {
    if (!isQuestioner || !round) return;

    // 현재 라운드 소속 답변만 (라운드 전환 직후 이전 답변이 잠깐 남는 경우 방어)
    const roundAnswers = game.answers.filter((a) => a.round_id === round.id);

    if (round.status === "collecting") {
      const responders = players.filter((p) => p.id !== questionerId);
      if (responders.length === 0) return;
      const answered = new Set(roundAnswers.map((a) => a.player_id));
      const done = responders.filter((p) => answered.has(p.id)).length;
      // 수정 중인 참여자가 있으면(시간이 남아 있는 한) 자동으로 넘어가지 않는다.
      const someoneEditing = roundAnswers.some((a) => a.is_editing);
      const sig = `${round.id}:${done}/${responders.length}`;
      if (
        done === responders.length &&
        !someoneEditing &&
        advanceSigRef.current !== sig
      ) {
        advanceSigRef.current = sig;
        void advanceToScoring(round.id).catch(() => {
          advanceSigRef.current = "";
        });
      }
    }

    if (round.status === "scoring") {
      const scored = roundAnswers.filter((a) => a.score !== null).length;
      const sig = `${round.id}:${scored}/${roundAnswers.length}`;
      if (
        roundAnswers.length > 0 &&
        scored === roundAnswers.length &&
        finalizeSigRef.current !== sig
      ) {
        finalizeSigRef.current = sig;
        void finalizeRound(round.id).catch(() => {
          finalizeSigRef.current = "";
        });
      }
    }
  }, [isQuestioner, questionerId, round, players, game.answers]);

  const handleExpire = useCallback(() => {
    if (!isQuestioner || !round || round.status !== "collecting") return;
    const sig = `${round.id}:expire`;
    if (advanceSigRef.current === sig) return;
    advanceSigRef.current = sig;
    void advanceToScoring(round.id).catch(() => {
      advanceSigRef.current = "";
    });
  }, [isQuestioner, round]);

  // --- 사운드 트리거 ------------------------------------------------------
  const { play } = useSound();
  const roundStartRef = useRef<string | null>(null);
  const phaseRef = useRef<string | null>(null);
  const finishRef = useRef<string | null>(null);

  useEffect(() => {
    if (round && round.status === "collecting" && roundStartRef.current !== round.id) {
      roundStartRef.current = round.id;
      play("roundStart");
    }
    const phase = round ? `${round.id}:${round.status}` : null;
    if (phase && phaseRef.current !== phase) {
      if (round?.status === "revealed") play("reveal");
      phaseRef.current = phase;
    }
  }, [round, play]);

  // 게임 종료(목표 점수 도달자 확정, 왕/다같이 모드 공통) 시 승리음
  useEffect(() => {
    if (room.status !== "finished") return;
    if (finishRef.current !== room.id) {
      finishRef.current = room.id;
      play("win");
    }
  }, [room.status, room.id, play]);

  // 다같이 모드: 내가 새로 질문자가 되면 알림 팝업 + 사운드
  const turnTrackRef = useRef<{ initialized: boolean; value: string | null }>({
    initialized: false,
    value: null,
  });
  const [turnNoticeOpen, setTurnNoticeOpen] = useState(false);
  useEffect(() => {
    if (room.game_mode !== "everyone") return;
    const cqid = room.current_questioner_id;
    const track = turnTrackRef.current;

    if (!track.initialized) {
      track.initialized = true;
      track.value = cqid;
      return; // 최초 관측은 알림 없이 기록만
    }

    if (track.value !== cqid) {
      track.value = cqid;
      if (cqid && cqid === stored.playerId) {
        setTurnNoticeOpen(true);
        play("yourTurn");
      }
    }
  }, [room.game_mode, room.current_questioner_id, stored.playerId, play]);

  const [confirmClose, setConfirmClose] = useState(false);

  // 수집 단계가 아니게 되면 확인 팝업은 닫는다
  useEffect(() => {
    if (!round || round.status !== "collecting") setConfirmClose(false);
  }, [round]);

  // --- 게임 종료 화면 (목표 점수 도달자 확정, 왕/다같이 모드 공통) -----------
  if (room.status === "finished") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-8 pt-14 sm:px-6 sm:pt-12">
        <GameFinished
          roomId={room.id}
          gameMode={room.game_mode}
          winnerId={room.winner_player_id}
          players={players}
          targetScore={room.target_score}
          mePlayerId={stored.playerId}
          canContinue={isHost}
        />
        <button
          onClick={onLeave}
          className="mx-auto mt-2 text-xs text-slate-400 hover:text-red-500"
        >
          방 나가기
        </button>

        <TurnNotice
          open={turnNoticeOpen}
          nickname={stored.nickname}
          onClose={() => setTurnNoticeOpen(false)}
        />
      </main>
    );
  }

  // --- 게임 진행 화면 ------------------------------------------------------
  const responders = players.filter((p) => p.id !== questionerId);
  // 현재 라운드 소속 답변만 사용 (라운드 전환 직후 이전 답변 잔상 방어)
  const roundAnswers = round
    ? game.answers.filter((a) => a.round_id === round.id)
    : [];
  const roundReactions = round
    ? game.reactions.filter((r) => r.round_id === round.id)
    : [];
  const myAnswer =
    roundAnswers.find((a) => a.player_id === stored.playerId) ?? null;

  const phaseLabel =
    room.status === "scoring"
      ? "채점 중"
      : room.status === "reveal"
        ? "결과 공개"
        : round
          ? "답변 수집 중"
          : "질문 준비 중";

  const transitionKey = round
    ? `${round.id}:${round.status}`
    : `noround:${room.status}`;

  const answeredIds = new Set(roundAnswers.map((a) => a.player_id));
  const allAnswered =
    responders.length > 0 && responders.every((p) => answeredIds.has(p.id));
  const someoneEditing = roundAnswers.some((a) => a.is_editing);

  const runManualClose = () => {
    if (!round || round.status !== "collecting") return;
    advanceSigRef.current = `${round.id}:manual`;
    void advanceToScoring(round.id).catch(() => {
      advanceSigRef.current = "";
    });
  };

  // 질문자가 "답변 마감하고 채점 시작" 을 눌렀을 때
  const handleManualClose = () => {
    if (!round || round.status !== "collecting") return;
    play("click");
    if (!allAnswered || someoneEditing) {
      setConfirmClose(true); // 확인 팝업으로
      return;
    }
    runManualClose();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-8 pt-14 sm:px-6 sm:pt-12">
      <div className="flex items-center justify-between gap-2 pr-10 text-xs text-slate-400">
        <span className="shrink-0">
          방 <span className="font-bold text-slate-500">{code}</span>
        </span>
        {room.game_mode === "everyone" && questionerPlayer ? (
          <span className="truncate text-slate-400">
            🎤 {questionerPlayer.nickname}님 차례
          </span>
        ) : null}
        <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-600">
          {phaseLabel}
        </span>
      </div>

      {round ? (
        <QuestionDisplay
          round={round}
          timeLimit={
            round.status === "collecting" ? room.answer_time_limit : null
          }
          onExpire={handleExpire}
        />
      ) : (
        <div className="card animate-fade-in text-center text-sm text-slate-500">
          {isQuestioner
            ? "질문을 보내 첫 라운드를 시작하세요."
            : `${questionerPlayer?.nickname ?? "질문자"}님이 질문을 준비 중입니다...`}
        </div>
      )}

      <div key={transitionKey} className="flex animate-fade-in-up flex-col gap-4">
        {round?.status === "collecting" ? (
          <>
            {!isQuestioner ? (
              <AnswerInput
                roundId={round.id}
                playerId={stored.playerId}
                myAnswer={myAnswer}
                locked={false}
              />
            ) : null}
            <AnswerProgress responders={responders} answers={roundAnswers} />
            {isQuestioner ? (
              <button
                onClick={handleManualClose}
                className="btn-secondary w-full text-sm"
              >
                답변 마감하고 채점 시작
              </button>
            ) : null}
          </>
        ) : null}

        {round?.status === "scoring" ? (
          isQuestioner ? (
            <ScoringPanel roundId={round.id} answers={roundAnswers} />
          ) : (
            <>
              <div className="card text-center text-sm text-slate-500">
                {questionerPlayer?.nickname ?? "질문자"}님이 채점 중입니다...
              </div>
              <AnswersReadonly
                answers={roundAnswers}
                players={players}
                title="제출된 답변"
              />
            </>
          )
        ) : null}

        {round?.status === "revealed" ? (
          <>
            <RevealPanel
              answers={roundAnswers}
              players={players}
              reactions={roundReactions}
              myPlayerId={stored.playerId}
            />
            {isQuestioner && questionerPlayer ? (
              <QuestionerPanel
                roomId={room.id}
                questionerId={questionerPlayer.id}
                questionerNickname={questionerPlayer.nickname}
              />
            ) : (
              <div className="card text-center text-sm text-slate-500">
                {questionerPlayer?.nickname ?? "다음 질문자"}님을 기다리는 중...
              </div>
            )}
          </>
        ) : null}

        {isQuestioner && questionerPlayer && !round ? (
          <QuestionerPanel
            roomId={room.id}
            questionerId={questionerPlayer.id}
            questionerNickname={questionerPlayer.nickname}
          />
        ) : null}
      </div>

      <Scoreboard
        players={players}
        targetScore={room.target_score}
        mePlayerId={stored.playerId}
        questionerId={room.game_mode === "everyone" ? questionerId : null}
      />

      <button
        onClick={onLeave}
        className="mx-auto mt-2 text-xs text-slate-400 hover:text-red-500"
      >
        방 나가기
      </button>

      <ConfirmDialog
        open={confirmClose}
        title="아직 답변이 다 안 왔어요"
        message={"모든 참여자가 답변을 작성하지 않았습니다.\n그래도 채점을 시작할까요?"}
        confirmLabel="채점 시작"
        cancelLabel="조금 더 기다리기"
        onConfirm={() => {
          setConfirmClose(false);
          play("click");
          runManualClose();
        }}
        onClose={() => setConfirmClose(false)}
      />

      <TurnNotice
        open={turnNoticeOpen}
        nickname={stored.nickname}
        onClose={() => setTurnNoticeOpen(false)}
      />
    </main>
  );
}
