"use client";

/**
 * 랜덤 질문 소스.
 *
 * 앱에 번들되어 배포되는 public/questions.csv 를 직접 읽는다.
 * → CSV 를 수정하고 git push(재배포)만 하면 질문 목록이 바로 반영된다.
 *   (Supabase questions_bank 테이블은 더 이상 이 경로에서 쓰지 않는다.)
 *
 * CSV 형식: 첫 줄 헤더 `question`, 이후 한 줄에 "방장 닉네임 뒤에 붙일 문장" 하나.
 */

const CSV_URL = "/questions.csv";

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function parse(raw: string): string[] {
  return raw
    .replace(/^﻿/, "") // UTF-8 BOM 제거
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l, i) => !(i === 0 && l.toLowerCase() === "question"))
    .filter((l, i, arr) => arr.indexOf(l) === i);
}

async function loadQuestions(): Promise<string[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(CSV_URL, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`questions.csv 로드 실패 (${res.status})`);
      return res.text();
    })
    .then((text) => {
      cache = parse(text);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 방장 닉네임 뒤에 붙일 무작위 질문 문장. 로드 실패/빈 목록이면 null. */
export async function pickRandomQuestionSuffix(): Promise<string | null> {
  try {
    const list = await loadQuestions();
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  } catch {
    return null;
  }
}
