/**
 * public/questions.csv 의 질문들을 questions_bank 테이블로 임포트한다.
 *
 * 실행:  npm run import:questions
 * 필요:  .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * CSV 형식: 첫 줄은 헤더(question), 이후 한 줄에 질문 하나.
 * 각 줄은 방장 닉네임을 앞에 붙일 "뒷부분"만 담는다. 예) "님이 가장 좋아하는 노래는 무엇인가요?"
 * 이미 존재하는 질문은 (question_text unique 제약 + upsert 로) 건너뛴다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL 와 SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에 설정하세요.",
  );
  process.exit(1);
}

/** 아주 단순한 1컬럼 CSV 파서 (따옴표로 감싼 값과 escaped 따옴표 지원) */
function parseSingleColumnCsv(raw: string): string[] {
  const lines = raw
    .replace(/^﻿/, "") // UTF-8 BOM 제거
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows = lines.map((line) => {
    if (line.startsWith('"') && line.endsWith('"')) {
      return line.slice(1, -1).replace(/""/g, '"');
    }
    return line;
  });

  // 헤더 제거
  if (["question", "question_text"].includes(rows[0]?.toLowerCase() ?? "")) {
    rows.shift();
  }
  return Array.from(new Set(rows));
}

async function main() {
  const csvPath = resolve(process.cwd(), "public/questions.csv");
  const questions = parseSingleColumnCsv(readFileSync(csvPath, "utf8"));

  if (questions.length === 0) {
    console.log("임포트할 질문이 없습니다.");
    return;
  }

  const supabase = createClient(url!, serviceKey!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("questions_bank")
    .upsert(
      questions.map((question_text) => ({ question_text })),
      { onConflict: "question_text", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    console.error("임포트 실패:", error.message);
    process.exit(1);
  }

  console.log(
    `질문 ${questions.length}개 처리 완료. 신규 삽입: ${data?.length ?? 0}개.`,
  );
}

main();
