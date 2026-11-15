"use client";

import { useEffect } from "react";

interface TurnNoticeProps {
  open: boolean;
  nickname: string;
  onClose: () => void;
}

/** 다같이 모드: 내 차례가 되었을 때 뜨는 알림 팝업. */
export function TurnNotice({ open, nickname, onClose }: TurnNoticeProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-white p-7 text-center shadow-xl animate-slide-up sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="내 차례"
      >
        <div className="mx-auto mb-3 flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-primary-50 text-4xl">
          🎤
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {nickname}님, 당신 차례예요!
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          이번 라운드의 질문자가 되었습니다. 질문을 보내주세요.
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="btn-primary mt-6 w-full py-3 text-base"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
