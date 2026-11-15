-- =============================================================================
-- 0004 : 게임 "노래 맞히기" (game_type = 'song')
--
-- 출제자가 유튜브 링크 + 시작 지점 + 재생 길이 + 정답을 입력하면, 모두가 같은 구간을
-- 듣고(영상은 가려짐) 제목을 맞히는 게임. 출제자는 참가 순서대로 돌아간다.
--
-- ■ 규칙 (숫자를 바꾸려면 song_points / 아래 RPC 와 src/games/song/rules.ts 를 같이 고칠 것)
--   - 정답 인정: 출제자가 입력한 "정답" 하나. 공백·구두점·대소문자·전각/반각(NFKC)은
--     무시하고 "정확히 일치"해야 한다. (영어↔한글 표기는 자동 변환이 불가능하다)
--   - 점수: 정답을 맞힌 순서대로. 맞히는 사람(출제자를 뺀 참가자)이 N명이면
--     1등 N점, 2등 N−1점, … 최소 1점. 출제자는 0점. 힌트는 점수에 영향을 주지 않는다.
--   - 정답이 아닌 답안은 모두에게 공개된다(song_attempts). 출제자는 기준에 가깝거나
--     재밌다고 판단되면 아량껏 정답으로 인정할 수 있고(song_accept_attempt), 인정되면
--     자동 정답과 똑같이 순서대로 점수를 받는다.
--   - 라운드 끝: 전원 정답 / 제한시간 종료 / 출제자가 강제로 끝냄 → 정답 공개.
--     (클라이언트는 정답 공개 때 노래를 끊지 않고 계속 들려준다)
--   - 종료: 누군가 목표 점수에 도달하면 그 라운드를 마치고 게임 종료.
--     목표 점수 = rooms.target_score, 제한시간 = rooms.answer_time_limit(재생 시작부터).
--
-- ■ 게임 모드 (rooms.game_mode — Guess Me 와 같은 컬럼을 쓴다)
--   king     👑 왕 모드     : 방장이 계속 출제자. 방장을 뺀 사람 중 목표 점수에 도달한 사람이
--                            우승자(rooms.winner_player_id)가 되고, 방장이 "왕위 넘기기"
--                            (song_promote_host)를 누르면 우승자가 새 방장이 되어 점수를
--                            초기화한 채 대기실로 돌아간다.
--   everyone 🔄 다같이 모드 : 출제자가 참가 순서대로 돌아간다. 최고 점수자(동점이면 공동 우승),
--                            방장이 "다시 시작"(song_start_game)으로 새 판을 시작한다.
--
-- ■ 보안 원칙 — 정답은 클라이언트에 내려가지 않는다
--   - 정답은 song_round_secrets 에만 있고 anon 은 이 테이블에 접근 자체가 불가(RLS 정책 없음).
--   - 정답 비교 / 글자 수·초성 힌트 계산은 전부 security definer RPC 안에서 한다.
--   - 자동 정답 / 출제자가 인정한 답안은 텍스트를 저장하지 않는다(null) — 다른 참가자가
--     그 답을 베끼거나, 인정된 표기로 정답을 짐작하지 못하게 하기 위해서다.
--     공개되는 것은 정답이 아닌(아직 인정되지 않은) 답안의 텍스트뿐이다.
--   - song_rounds.answer_display 는 라운드가 끝난 뒤에만 채워진다.
--   - song_rounds / song_hints / song_guesses 는 anon 이 읽기만 가능, 쓰기는 RPC 로만.
--   (한계: 영상 id 는 재생을 위해 클라이언트가 알아야 하므로, 개발자 도구를 열면 제목을
--    알아낼 수 있다. 친구끼리 쓰는 게임이라는 전제.)
--
-- ■ 라운드 흐름 (song_rounds.status)
--   setup    출제자가 문제 입력 중           ── song_submit_round ──▶
--   ready    모두 "준비"(모바일 소리 잠금 해제) ── song_start_round ──▶
--   playing  3초 카운트다운 뒤 동시에 재생, 정답 제출 / 힌트 ── song_finish_round ──▶
--   revealed 정답 공개, 다음 출제자가 song_next_round 로 다음 문제
--   (모두 맞히면 song_submit_guess 안에서 자동으로 revealed 로 넘어간다)
--
-- 공통 인프라는 0001_common.sql. rooms.status 는 이 게임에서
--   waiting(대기실) → question(진행 중) → finished(종료) 만 쓴다.
-- 여러 번 실행해도 안전하다(idempotent).
--
-- 이 게임만 처음부터 다시 만들려면:
-- drop table if exists public.song_attempts, public.song_hint_requests, public.song_ready, public.song_guesses,
--                      public.song_hints, public.song_round_secrets, public.song_rounds cascade;
-- drop function if exists
--   public.song_normalize(text), public.song_points(int, int),
--   public.song_server_time(), public.song_finish_internal(uuid),
--   public.song_start_game(uuid, uuid),
--   public.song_submit_round(uuid, uuid, text, int, int, text),
--   public.song_start_round(uuid, uuid), public.song_reveal_hint(uuid, uuid, text),
--   public.song_submit_guess(uuid, uuid, text), public.song_award_internal(uuid, uuid),
--   public.song_accept_attempt(uuid, uuid), public.song_finish_round(uuid, uuid),
--   public.song_next_round(uuid, uuid), public.song_promote_host(uuid, uuid),
--   public.song_reset_round(uuid, uuid),
--   public.song_on_leave(public.players, public.rooms, uuid) cascade;
-- =============================================================================

-- =============================================================================
-- 테이블
-- =============================================================================

-- song_rounds : 한 라운드 = 출제자 1명이 낸 문제 1개
create table if not exists public.song_rounds (
  id             uuid        primary key default gen_random_uuid(),
  room_id        uuid        not null references public.rooms (id) on delete cascade,
  -- 출제자. FK 를 걸지 않은 소프트 참조 — 출제자가 나갔을 때의 정리는 song_on_leave 가 한다.
  setter_id      uuid        not null,
  status         text        not null default 'setup'
                             check (status in ('setup', 'ready', 'playing', 'revealed')),
  video_id       text        null,          -- 유튜브 영상 id (11자)
  start_sec      integer     null,          -- 재생 시작 지점(초)
  duration_sec   integer     null,          -- 재생 길이(초)
  started_at     timestamptz null,          -- 재생 시작 시각(서버 기준, 카운트다운 포함)
  deadline_at    timestamptz null,          -- 정답 마감 시각. null = 무제한
  answer_display text        null,          -- 정답 표시용. 라운드가 끝난 뒤에만 채워진다
  revealed_at    timestamptz null,
  created_at     timestamptz not null default now()
);

create index if not exists song_rounds_room_created_idx
  on public.song_rounds (room_id, created_at desc);

-- song_round_secrets : 정답. anon 은 접근 불가(정책 없음) — RPC(security definer)만 읽고 쓴다.
create table if not exists public.song_round_secrets (
  round_id uuid   primary key references public.song_rounds (id) on delete cascade,
  title    text   not null,
  accepted text[] not null          -- 정규화된 인정 답안 (지금은 정답 하나)
);

-- 가수 입력은 없앴다 (이전 버전에서 만든 테이블 정리)
alter table public.song_round_secrets drop column if exists artist;

-- song_hints : 출제자가 직접 쓴 힌트 (공개된 순간부터 모두가 본다)
create table if not exists public.song_hints (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.song_rounds (id) on delete cascade,
  content    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists song_hints_round_idx on public.song_hints (round_id);

-- 글자 수·초성 자동 힌트는 없앴다 (이전 버전에서 만든 테이블 정리)
drop index if exists public.song_hints_auto_once_idx;
alter table public.song_hints drop column if exists kind;

-- song_guesses : 정답을 맞힌 기록 (오답은 저장하지 않는다 — 답안 텍스트도 저장하지 않는다)
create table if not exists public.song_guesses (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.song_rounds (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  place      integer     not null,       -- 몇 번째 정답자인가
  points     integer     not null,       -- 받은 점수
  hints_used integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists song_guesses_round_idx on public.song_guesses (round_id);

-- song_ready : "준비" 완료 표시 (브라우저 소리 재생 잠금을 푼 사람)
create table if not exists public.song_ready (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.song_rounds (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- 재생 오류 보고 (error_code): 이 사람의 브라우저가 영상을 재생하지 못했다 — 연령 제한·지역 제한
-- 처럼 시청자마다 다른 이유로 막힐 수 있어서, 출제자는 정상 재생돼도 누군가는 막힌다.
-- 출제자가 이걸 보고 영상을 바꿀 수 있게(song_reset_round) 알려 준다.
alter table public.song_ready add column if not exists error_code integer;

-- song_hint_requests : 힌트 요청 (출제자가 힌트를 공개하면 비워진다)
create table if not exists public.song_hint_requests (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.song_rounds (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- song_attempts : 제출된 답안 피드 — 모두가 볼 수 있다.
--   pending  정답이 아닌 답안. answer_text 가 공개되고 출제자가 인정할 수 있다
--   correct  자동으로 정답 처리됨 (answer_text 는 null)
--   accepted 출제자가 정답으로 인정함 (answer_text 는 null)
create table if not exists public.song_attempts (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.song_rounds (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  answer_text text       null,
  status     text        not null default 'pending'
                         check (status in ('pending', 'correct', 'accepted')),
  created_at timestamptz not null default now()
);

create index if not exists song_attempts_round_idx on public.song_attempts (round_id, created_at);

-- =============================================================================
-- 순수 헬퍼 함수 (부작용 없음)
-- =============================================================================

-- 정답 비교용 정규화: NFKC → 소문자 → 공백·구두점 제거
create or replace function public.song_normalize(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(normalize(coalesce(p_text, ''), NFKC)),
    '[[:space:][:punct:]]', '', 'g'
  );
$$;

-- 초성 힌트 기능은 없앴다 (이전 버전 정리)
drop function if exists public.song_chosung(text);

-- 정답 점수: 맞힌 순서대로. 맞히는 사람이 N명이면 1등 N점, 2등 N-1점, … 최소 1점.
-- (파라미터 이름이 바뀌어 create or replace 로는 덮을 수 없으니 이전 버전을 먼저 지운다)
drop function if exists public.song_points(int, int);
create function public.song_points(p_place int, p_total int)
returns int
language sql
immutable
as $$
  select greatest(1, p_total - p_place + 1);
$$;

-- 클라이언트 시계 보정용 서버 시각 (여러 번 재서 왕복시간이 가장 짧은 값을 쓴다)
create or replace function public.song_server_time()
returns timestamptz
language sql
volatile
as $$
  select clock_timestamp();
$$;

-- =============================================================================
-- 내부 함수: 라운드 마감 + 게임 종료 판정 (RPC 안에서만 호출)
-- =============================================================================
create or replace function public.song_finish_internal(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_target  smallint;
  v_mode    public.room_mode;
  v_title   text;
  v_winner  uuid;
begin
  select room_id into v_room_id from public.song_rounds where id = p_round_id;
  select title into v_title from public.song_round_secrets where round_id = p_round_id;

  update public.song_rounds
  set status = 'revealed',
      revealed_at = clock_timestamp(),
      answer_display = v_title
  where id = p_round_id;

  delete from public.song_hint_requests where round_id = p_round_id;

  -- 목표 점수에 도달한 사람이 있으면 게임 종료. 왕 모드에서는 방장(출제자)을 우승자 후보에서 뺀다.
  select target_score, game_mode into v_target, v_mode from public.rooms where id = v_room_id;
  if v_mode = 'king' then
    select id into v_winner
    from public.players
    where room_id = v_room_id and is_host = false and score >= v_target
    order by score desc, random()
    limit 1;
  else
    select id into v_winner
    from public.players
    where room_id = v_room_id and score >= v_target
    order by score desc, random()
    limit 1;
  end if;

  if v_winner is not null then
    update public.rooms
    set status = 'finished', winner_player_id = v_winner
    where id = v_room_id;
  end if;
end;
$$;

-- =============================================================================
-- RPC (모두 security definer — 호출자 player_id 는 인자로 받아 검증한다)
-- =============================================================================

-- 게임 시작 / 다시 시작 (방장만). 점수·이전 라운드를 비우고 방장이 첫 출제자가 된다.
create or replace function public.song_start_game(p_room_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms%rowtype;
  v_players int;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.game_type <> 'song' then
    raise exception '노래 맞히기 방이 아닙니다.';
  end if;
  if not exists (
    select 1 from public.players
    where id = p_player_id and room_id = p_room_id and is_host
  ) then
    raise exception '방장만 시작할 수 있습니다.';
  end if;
  if v_room.status not in ('waiting', 'finished') then
    return;                                   -- 이미 진행 중 (멱등)
  end if;

  select count(*) into v_players from public.players where room_id = p_room_id;
  if v_players < 2 then
    raise exception '최소 2명이 있어야 시작할 수 있습니다.';
  end if;

  update public.players set score = 0 where room_id = p_room_id;
  delete from public.song_rounds where room_id = p_room_id;   -- 하위 행은 cascade
  update public.rooms set status = 'question', winner_player_id = null where id = p_room_id;
  insert into public.song_rounds (room_id, setter_id) values (p_room_id, p_player_id);
end;
$$;

-- setup -> ready : 출제자가 문제를 제출한다 (정답은 secrets 에만 저장)
-- 예전 버전(가수·추가 답안 인자 포함)은 시그니처가 달라 따로 남으므로 먼저 지운다.
drop function if exists public.song_submit_round(uuid, uuid, text, int, int, text, text, text[]);
create or replace function public.song_submit_round(
  p_round_id     uuid,
  p_player_id    uuid,
  p_video_id     text,
  p_start_sec    int,
  p_duration_sec int,
  p_title        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.song_rounds%rowtype;
  v_limit smallint;
  v_title text;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found then
    raise exception '라운드를 찾을 수 없습니다.';
  end if;
  if v_round.setter_id <> p_player_id then
    raise exception '출제자만 문제를 낼 수 있습니다.';
  end if;
  if v_round.status <> 'setup' then
    raise exception '이미 문제가 제출되었습니다.';
  end if;

  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception '올바른 유튜브 영상이 아닙니다.';
  end if;
  if p_start_sec is null or p_start_sec < 0 or p_start_sec > 36000 then
    raise exception '시작 지점이 올바르지 않습니다.';
  end if;
  if p_duration_sec is null or p_duration_sec < 1 or p_duration_sec > 30 then
    raise exception '재생 길이는 1~30초여야 합니다.';
  end if;

  select answer_time_limit into v_limit from public.rooms where id = v_round.room_id;
  if v_limit is not null and p_duration_sec > v_limit then
    raise exception '재생 길이는 방의 제한시간(%초) 이하여야 합니다.', v_limit;
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' or char_length(v_title) > 100 then
    raise exception '정답을 1~100자로 입력하세요.';
  end if;
  if public.song_normalize(v_title) = '' then
    raise exception '정답에는 글자나 숫자가 하나 이상 있어야 합니다.';
  end if;

  insert into public.song_round_secrets (round_id, title, accepted)
  values (p_round_id, v_title, array[public.song_normalize(v_title)])
  on conflict (round_id) do update
    set title = excluded.title, accepted = excluded.accepted;

  update public.song_rounds
  set status = 'ready',
      video_id = p_video_id,
      start_sec = p_start_sec,
      duration_sec = p_duration_sec
  where id = p_round_id;
end;
$$;

-- ready -> playing : 3초 카운트다운 뒤의 시각을 재생 시작 시각으로 기록한다.
-- 모든 클라이언트가 이 시각에 맞춰 같이 재생을 시작한다.
create or replace function public.song_start_round(p_round_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   public.song_rounds%rowtype;
  v_limit   smallint;
  v_started timestamptz;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found or v_round.status <> 'ready' then
    return;                                   -- 이미 시작됨 (멱등)
  end if;
  if v_round.setter_id <> p_player_id then
    raise exception '출제자만 시작할 수 있습니다.';
  end if;

  select answer_time_limit into v_limit from public.rooms where id = v_round.room_id;
  v_started := clock_timestamp() + interval '3 seconds';

  update public.song_rounds
  set status = 'playing',
      started_at = v_started,
      deadline_at = case
        when v_limit is null then null
        else v_started + make_interval(secs => v_limit)
      end
  where id = p_round_id;
end;
$$;

-- 힌트 공개 (출제자만, 재생 중에만). 출제자가 직접 쓴 문장을 모두에게 보여 준다.
-- 힌트는 점수에 영향을 주지 않는다. 공개하면 쌓여 있던 "힌트 요청"은 비워진다.
drop function if exists public.song_reveal_hint(uuid, uuid, text, text);
create or replace function public.song_reveal_hint(
  p_round_id  uuid,
  p_player_id uuid,
  p_content   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   public.song_rounds%rowtype;
  v_content text;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found then
    raise exception '라운드를 찾을 수 없습니다.';
  end if;
  if v_round.setter_id <> p_player_id then
    raise exception '출제자만 힌트를 줄 수 있습니다.';
  end if;
  if v_round.status <> 'playing' then
    raise exception '재생 중에만 힌트를 줄 수 있습니다.';
  end if;

  v_content := btrim(coalesce(p_content, ''));
  if v_content = '' or char_length(v_content) > 100 then
    raise exception '힌트는 1~100자로 입력하세요.';
  end if;

  insert into public.song_hints (round_id, content) values (p_round_id, v_content);
  delete from public.song_hint_requests where round_id = p_round_id;
end;
$$;

-- 정답 처리 (내부): 이 라운드에서 맞힌 순서대로 점수를 주고, 전원이 맞혔으면 라운드를 마감한다.
-- 맞히는 사람(출제자를 뺀 참가자)이 N명이면 1등 N점, 2등 N-1점, … 최소 1점.
-- 호출하는 쪽이 라운드 행을 FOR UPDATE 로 잠근 상태여야 한다. 받은 점수를 돌려준다.
create or replace function public.song_award_internal(p_round_id uuid, p_player_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_setter  uuid;
  v_total   int;
  v_place   int;
  v_hints   int;
  v_points  int;
  v_done    int;
begin
  select room_id, setter_id into v_room_id, v_setter
  from public.song_rounds where id = p_round_id;

  select count(*) into v_total
  from public.players where room_id = v_room_id and id <> v_setter;
  select count(*) + 1 into v_place from public.song_guesses where round_id = p_round_id;
  select count(*) into v_hints from public.song_hints where round_id = p_round_id;
  v_points := public.song_points(v_place, v_total);

  insert into public.song_guesses (round_id, player_id, place, points, hints_used)
  values (p_round_id, p_player_id, v_place, v_points, v_hints);
  update public.players set score = score + v_points where id = p_player_id;

  -- 출제자를 뺀 전원이 맞혔으면 바로 마감 → 정답 공개
  select count(*) into v_done from public.song_guesses where round_id = p_round_id;
  if v_done >= v_total then
    perform public.song_finish_internal(p_round_id);
  end if;

  return v_points;
end;
$$;

-- 답안 제출. 결과 문자열을 돌려준다:
--   'correct'   정답과 일치 → 자동 정답 처리(점수 반영, 피드에는 "정답!"만 표시)
--   'submitted' 정답이 아님 → 모두에게 공개된다. 출제자가 인정하면 정답이 될 수 있다
--   'already'   이미 맞힘
--   'early'     재생 시작 전 / 'closed' 이미 끝난 라운드·마감 시각 경과
-- 공개 답안은 한 사람당 최근 2개까지만 남는다 — 새로 내면 오래된 것부터 자동으로 지워져서
-- "답안 현황"이 지저분해지지 않는다. (정답/인정 표시는 지우지 않는다)
create or replace function public.song_submit_guess(
  p_round_id  uuid,
  p_player_id uuid,
  p_text      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round    public.song_rounds%rowtype;
  v_accepted text[];
  v_n        text;
  v_text     text;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found or v_round.status <> 'playing' then
    return 'closed';
  end if;
  if v_round.setter_id = p_player_id
     or not exists (
       select 1 from public.players
       where id = p_player_id and room_id = v_round.room_id
     ) then
    raise exception '정답을 낼 수 없는 참가자입니다.';
  end if;
  if clock_timestamp() < v_round.started_at then
    return 'early';
  end if;
  if v_round.deadline_at is not null
     and clock_timestamp() > v_round.deadline_at + interval '1 second' then
    return 'closed';
  end if;
  if exists (
    select 1 from public.song_guesses
    where round_id = p_round_id and player_id = p_player_id
  ) then
    return 'already';
  end if;

  v_text := left(btrim(coalesce(p_text, '')), 100);
  if v_text = '' then
    return 'submitted';                       -- 빈 답안은 기록하지 않는다
  end if;

  -- 정답과 일치하면 자동 정답
  v_n := public.song_normalize(v_text);
  select accepted into v_accepted from public.song_round_secrets where round_id = p_round_id;
  if v_n <> '' and v_n = any(v_accepted) then
    insert into public.song_attempts (round_id, player_id, answer_text, status)
    values (p_round_id, p_player_id, null, 'correct');
    perform public.song_award_internal(p_round_id, p_player_id);
    return 'correct';
  end if;

  -- 정답이 아니면 모두에게 공개한다
  insert into public.song_attempts (round_id, player_id, answer_text, status)
  values (p_round_id, p_player_id, v_text, 'pending');

  -- 한 사람의 공개 답안은 가장 최근 2개까지만 남기고 오래된 것은 지운다
  -- (이 함수는 라운드 행을 잠근 채 돌기 때문에 동시에 내도 순서가 꼬이지 않는다)
  delete from public.song_attempts
  where id in (
    select id from public.song_attempts
    where round_id = p_round_id and player_id = p_player_id and status = 'pending'
    order by created_at desc, id desc
    offset 2
  );
  return 'submitted';
end;
$$;

-- 출제자가 공개된 답안을 정답으로 인정한다 (기준에 가깝거나 재밌을 때).
-- 인정되면 자동 정답과 똑같이 맞힌 순서대로 점수를 받는다. 진행 중인 라운드에서만 가능.
create or replace function public.song_accept_attempt(p_attempt_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_round    public.song_rounds%rowtype;
  v_att      public.song_attempts%rowtype;
begin
  select round_id into v_round_id from public.song_attempts where id = p_attempt_id;
  if not found then
    return;                                   -- 방금 새 답안이 올라와 자동으로 지워진 오래된 답안일 수 있다
  end if;

  select * into v_round from public.song_rounds where id = v_round_id for update;
  if v_round.setter_id <> p_player_id then
    raise exception '출제자만 답안을 인정할 수 있습니다.';
  end if;
  if v_round.status <> 'playing' then
    raise exception '진행 중인 라운드에서만 인정할 수 있습니다.';
  end if;

  -- 잠근 뒤에 다시 읽는다 (동시에 두 번 눌러도 한 번만 인정되도록)
  select * into v_att from public.song_attempts where id = p_attempt_id;
  if not found or v_att.status <> 'pending' then
    return;
  end if;
  if exists (
    select 1 from public.song_guesses
    where round_id = v_round_id and player_id = v_att.player_id
  ) then
    return;                                   -- 이미 맞힌 사람
  end if;

  update public.song_attempts set status = 'accepted', answer_text = null where id = p_attempt_id;
  perform public.song_award_internal(v_round_id, v_att.player_id);
end;
$$;

-- playing -> revealed : 출제자가 직접 끝내거나, 마감 시각이 지났거나, 전원이 맞혔을 때.
-- 조건이 안 맞으면 아무 일도 하지 않는다(멱등) — 누가 불러도 안전하다.
create or replace function public.song_finish_round(p_round_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.song_rounds%rowtype;
  v_total int;
  v_done  int;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found or v_round.status <> 'playing' then
    return;
  end if;

  select count(*) into v_total
  from public.players where room_id = v_round.room_id and id <> v_round.setter_id;
  select count(*) into v_done from public.song_guesses where round_id = p_round_id;

  if v_round.setter_id = p_player_id
     or (v_round.deadline_at is not null and clock_timestamp() >= v_round.deadline_at)
     or (v_total > 0 and v_done >= v_total) then
    perform public.song_finish_internal(p_round_id);
  end if;
end;
$$;

-- revealed -> 다음 라운드(setup). 다음 출제자 또는 방장이 부른다.
-- 출제자가 방을 나가 막혀 버린 진행 중 라운드는 방장이 건너뛸 수 있다.
create or replace function public.song_next_round(p_room_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room     public.rooms%rowtype;
  v_last     public.song_rounds%rowtype;
  v_has_last boolean;
  v_is_host  boolean;
  v_next     uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.game_type <> 'song' or v_room.status <> 'question' then
    return;
  end if;

  select is_host into v_is_host
  from public.players where id = p_player_id and room_id = p_room_id;
  if v_is_host is null then
    raise exception '이 방의 참가자가 아닙니다.';
  end if;

  select * into v_last from public.song_rounds
  where room_id = p_room_id order by created_at desc, id desc limit 1;
  v_has_last := found;

  if not v_has_last then
    -- 라운드가 하나도 없는 이상 상태 복구: 방장이 첫 출제자
    select id into v_next from public.players where room_id = p_room_id and is_host limit 1;
  elsif v_last.status = 'revealed' then
    -- 왕 모드: 출제자는 계속 방장 / 다같이 모드: 참가 순서대로 다음 사람
    if v_room.game_mode = 'king' then
      select id into v_next from public.players where room_id = p_room_id and is_host limit 1;
    else
      v_next := public.next_questioner(p_room_id, v_last.setter_id);
    end if;
    if not v_is_host and p_player_id <> v_next then
      raise exception '다음 출제자(또는 방장)만 진행할 수 있습니다.';
    end if;
  else
    -- 진행 중인 라운드: 출제자가 방에 없을 때만, 방장이 건너뛸 수 있다
    if not v_is_host
       or exists (select 1 from public.players where id = v_last.setter_id) then
      return;
    end if;
    delete from public.song_rounds where id = v_last.id;
    if v_room.game_mode = 'king' then
      select id into v_next from public.players where room_id = p_room_id and is_host limit 1;
    else
      v_next := public.next_questioner(p_room_id, v_last.setter_id);
    end if;
  end if;

  if v_next is not null then
    insert into public.song_rounds (room_id, setter_id) values (p_room_id, v_next);
  end if;
end;
$$;

-- (왕 모드) 왕위 넘기기: 우승자를 새 방장으로 세우고, 점수·이전 라운드를 지운 뒤 대기실로.
-- 방장만, 게임이 끝난 뒤에만 할 수 있다. (여러 번 불러도 한 번만 일어난다)
create or replace function public.song_promote_host(p_room_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room     public.rooms%rowtype;
  v_winner   uuid;
  v_nickname text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.game_type <> 'song' then
    raise exception '노래 맞히기 방이 아닙니다.';
  end if;
  if not exists (
    select 1 from public.players
    where id = p_player_id and room_id = p_room_id and is_host
  ) then
    raise exception '방장만 왕위를 넘길 수 있습니다.';
  end if;
  if v_room.status <> 'finished' or v_room.game_mode <> 'king' then
    return;
  end if;

  v_winner := v_room.winner_player_id;
  select nickname into v_nickname
  from public.players where id = v_winner and room_id = p_room_id;
  if not found then
    raise exception '우승자를 찾을 수 없습니다.';
  end if;

  update public.players set is_host = false where room_id = p_room_id and is_host;
  update public.players set is_host = true where id = v_winner;
  update public.players set score = 0 where room_id = p_room_id;
  delete from public.song_rounds where room_id = p_room_id;
  update public.rooms
  set status = 'waiting', host_nickname = v_nickname, winner_player_id = null
  where id = p_room_id;
end;
$$;

-- ready -> setup : 출제자가 영상을 다시 고른다 (시작 전에만). 참가자 중 누군가 영상을 재생하지
-- 못한다고 보고했을 때(song_ready.error_code) 쓴다. 문제·정답·준비 상태를 비우고 출제 화면으로.
create or replace function public.song_reset_round(p_round_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.song_rounds%rowtype;
begin
  select * into v_round from public.song_rounds where id = p_round_id for update;
  if not found then
    return;
  end if;
  if v_round.setter_id <> p_player_id then
    raise exception '출제자만 영상을 바꿀 수 있습니다.';
  end if;
  if v_round.status <> 'ready' then
    return;                                   -- 재생이 시작된 뒤에는 바꿀 수 없다
  end if;

  delete from public.song_round_secrets where round_id = p_round_id;
  delete from public.song_ready where round_id = p_round_id;
  update public.song_rounds
  set status = 'setup', video_id = null, start_sec = null, duration_sec = null
  where id = p_round_id;
end;
$$;

-- =============================================================================
-- 탈주 훅 — 0001 의 handle_player_leave 가 "<game_type>_on_leave" 규약으로 호출한다.
-- 진행 중인 라운드의 출제자가 나가면 그 라운드를 버리고, 다음 사람을 출제자로 세운다.
-- (이미 공개된 라운드면 아무것도 안 한다 — 다음 출제자는 song_next_round 가 정한다)
-- =============================================================================
create or replace function public.song_on_leave(
  p_old public.players,
  p_room public.rooms,
  p_new_host uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last public.song_rounds%rowtype;
  v_next uuid;
begin
  if p_room.status <> 'question' then
    return;
  end if;

  select * into v_last from public.song_rounds
  where room_id = p_old.room_id order by created_at desc, id desc limit 1;
  if not found or v_last.setter_id <> p_old.id or v_last.status = 'revealed' then
    return;
  end if;

  delete from public.song_rounds where id = v_last.id;

  if p_room.game_mode = 'king' then
    -- 왕 모드: 출제자는 방장이다. 방장이 나갔다면 공통 처리가 이미 새 방장을 정해 두었다.
    select id into v_next from public.players
    where room_id = p_old.room_id and is_host limit 1;
  else
    select p.id into v_next
    from public.players p
    where p.room_id = p_old.room_id
      and (p.created_at, p.id) > (p_old.created_at, p_old.id)
    order by p.created_at asc, p.id asc
    limit 1;
    if v_next is null then
      select id into v_next from public.players
      where room_id = p_old.room_id order by created_at asc, id asc limit 1;
    end if;
  end if;

  if v_next is not null then
    insert into public.song_rounds (room_id, setter_id) values (p_old.room_id, v_next);
  end if;
end;
$$;

-- 라운드 상태 전환·생성도 "활동"이다 (방치 방 정리 기준 갱신)
drop trigger if exists song_rounds_touch_activity on public.song_rounds;
create trigger song_rounds_touch_activity
  after insert or update on public.song_rounds
  for each row execute function public.touch_room_activity();

-- =============================================================================
-- 권한
-- =============================================================================
grant execute on function public.song_normalize(text)                                   to anon;
grant execute on function public.song_points(int, int)                                  to anon;
grant execute on function public.song_server_time()                                     to anon;
grant execute on function public.song_start_game(uuid, uuid)                            to anon;
grant execute on function public.song_submit_round(uuid, uuid, text, int, int, text) to anon;
grant execute on function public.song_start_round(uuid, uuid)                           to anon;
grant execute on function public.song_reveal_hint(uuid, uuid, text)                     to anon;
grant execute on function public.song_submit_guess(uuid, uuid, text)                    to anon;
grant execute on function public.song_accept_attempt(uuid, uuid)                        to anon;
grant execute on function public.song_finish_round(uuid, uuid)                          to anon;
grant execute on function public.song_next_round(uuid, uuid)                            to anon;
grant execute on function public.song_promote_host(uuid, uuid)                          to anon;
grant execute on function public.song_reset_round(uuid, uuid)                           to anon;

-- 내부 함수·훅은 직접 호출 차단 (security definer 인 RPC / handle_player_leave 만 부른다)
revoke execute on function public.song_finish_internal(uuid)
  from public, anon, authenticated;
revoke execute on function public.song_award_internal(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.song_on_leave(public.players, public.rooms, uuid)
  from public, anon, authenticated;

-- =============================================================================
-- RLS
--   song_round_secrets : 정책 없음 + 권한 회수 → anon 은 읽을 수도 쓸 수도 없다 (정답 보호)
--   song_rounds / song_hints / song_guesses / song_attempts : 읽기만. 쓰기는 RPC 로만.
--   song_ready / song_hint_requests : 정답과 무관하므로 자유롭게 (준비·요청 표시)
-- =============================================================================
alter table public.song_rounds         enable row level security;
alter table public.song_round_secrets  enable row level security;
alter table public.song_hints          enable row level security;
alter table public.song_guesses        enable row level security;
alter table public.song_ready          enable row level security;
alter table public.song_hint_requests  enable row level security;
alter table public.song_attempts       enable row level security;

revoke all on public.song_round_secrets from anon, authenticated;

drop policy if exists "anon read - song_rounds"                 on public.song_rounds;
drop policy if exists "anon read - song_hints"                  on public.song_hints;
drop policy if exists "anon read - song_guesses"                on public.song_guesses;
drop policy if exists "anon read - song_attempts"               on public.song_attempts;
drop policy if exists "anon full access - song_ready"           on public.song_ready;
drop policy if exists "anon full access - song_hint_requests"   on public.song_hint_requests;

create policy "anon read - song_rounds"
  on public.song_rounds for select to anon using (true);
create policy "anon read - song_hints"
  on public.song_hints for select to anon using (true);
create policy "anon read - song_guesses"
  on public.song_guesses for select to anon using (true);
create policy "anon read - song_attempts"
  on public.song_attempts for select to anon using (true);
create policy "anon full access - song_ready"
  on public.song_ready for all to anon using (true) with check (true);
create policy "anon full access - song_hint_requests"
  on public.song_hint_requests for all to anon using (true) with check (true);

-- =============================================================================
-- Realtime (song_round_secrets 는 절대 포함하지 않는다)
-- =============================================================================
alter table public.song_rounds        replica identity full;
alter table public.song_hints         replica identity full;
alter table public.song_guesses       replica identity full;
alter table public.song_ready         replica identity full;
alter table public.song_hint_requests replica identity full;
alter table public.song_attempts      replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array[
    'song_rounds', 'song_hints', 'song_guesses', 'song_ready', 'song_hint_requests',
    'song_attempts'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
