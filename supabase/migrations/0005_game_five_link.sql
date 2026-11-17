-- =============================================================================
-- 0005 : Link Ten (1인용) — 하루 단위 랭킹
--
-- 게임 자체는 브라우저에서만 돌아간다(방/플레이어 없음). 서버가 하는 일은 딱 둘:
--   1) 오늘 날짜(한국 시간)를 알려 준다 — 랭킹 날짜가 기기 시계에 흔들리지 않게
--   2) 하루 랭킹 기록 — 닉네임별 그날 최고 점수만 남긴다
--
-- ⚠ 점수는 브라우저가 보내므로 조작할 수 있다(친구끼리 하는 용도). 서버는 말이 안 되는
--   값만 걸러 낸다(상한/횟수). 완전한 방어는 이동 기록을 서버가 재생해 검증해야 한다.
--
-- 이 파일은 0001_common.sql 과 무관하다(rooms/players 를 쓰지 않는다). 여러 번 실행해도 안전.
-- 정리: 기록이 7일을 넘기면 제출이 일어날 때마다 함께 지운다(pg_cron 불필요).
--
-- 초기화(이 게임 기록만 삭제):  truncate public.five_link_scores;
-- =============================================================================

create table if not exists public.five_link_scores (
  day          date        not null,
  -- 대소문자/앞뒤 공백을 무시한 키 — 같은 닉네임은 하루에 한 줄
  nickname_key text        not null,
  nickname     text        not null,
  score        int         not null,
  moves        int         not null,
  best_combo   int         not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (day, nickname_key),
  constraint five_link_scores_nickname_len check (char_length(nickname) between 1 and 12),
  constraint five_link_scores_score_range  check (score between 0 and 30000),
  constraint five_link_scores_moves_range  check (moves between 0 and 400)
);

-- 하루 순위 조회용
create index if not exists five_link_scores_day_score_idx
  on public.five_link_scores (day, score desc);

-- ---------------------------------------------------------------------------
-- 오늘 날짜 (한국 시간)
-- ---------------------------------------------------------------------------
create or replace function public.five_link_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- ---------------------------------------------------------------------------
-- 랭킹 등록 — 닉네임별 그날 최고 점수만 남긴다.
--   p_day : 플레이한 판의 날짜. 오늘 또는 어제(자정 직전에 시작한 판)만 받는다.
--   반환   : 그날 내 순위(1부터, 동점은 같은 순위)
-- ---------------------------------------------------------------------------
create or replace function public.five_link_submit(
  p_day        date,
  p_nickname   text,
  p_score      int,
  p_moves      int,
  p_best_combo int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.five_link_today();
  v_nick  text := btrim(coalesce(p_nickname, ''));
  v_key   text;
  v_rank  int;
begin
  if char_length(v_nick) < 1 or char_length(v_nick) > 12 then
    raise exception 'invalid nickname';
  end if;
  if p_day is null or p_day < v_today - 1 or p_day > v_today then
    raise exception 'invalid day';
  end if;
  if p_score is null or p_score < 1 or p_score > 30000 then
    raise exception 'invalid score';
  end if;
  if p_moves is null or p_moves < 1 or p_moves > 400 then
    raise exception 'invalid moves';
  end if;

  v_key := lower(v_nick);

  insert into public.five_link_scores as s
    (day, nickname_key, nickname, score, moves, best_combo)
  values
    (p_day, v_key, v_nick, p_score, p_moves, greatest(1, least(coalesce(p_best_combo, 1), 999)))
  on conflict (day, nickname_key) do update
    set score      = excluded.score,
        moves      = excluded.moves,
        best_combo = excluded.best_combo,
        nickname   = excluded.nickname,
        updated_at = now()
    where excluded.score > s.score;

  -- 오래된 기록 정리 (7일)
  delete from public.five_link_scores where day < v_today - 7;

  select 1 + count(*) into v_rank
  from public.five_link_scores
  where day = p_day
    and score > (select score from public.five_link_scores
                 where day = p_day and nickname_key = v_key);

  return v_rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한 / RLS : 읽기는 누구나, 쓰기는 five_link_submit 으로만
-- ---------------------------------------------------------------------------
grant execute on function public.five_link_today()                           to anon;
grant execute on function public.five_link_submit(date, text, int, int, int) to anon;

alter table public.five_link_scores enable row level security;

drop policy if exists "anon read - five_link_scores" on public.five_link_scores;
create policy "anon read - five_link_scores"
  on public.five_link_scores for select to anon using (true);

revoke insert, update, delete on public.five_link_scores from anon, authenticated;
