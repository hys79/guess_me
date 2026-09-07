-- =============================================================================
-- guess_me : 통합 스키마 (single source of truth)
--
-- 닉네임 기반 실시간 추측 파티 게임. Supabase Auth 미사용 — player_id 는
-- 클라이언트가 localStorage 에 보관하고, 모든 접근은 anon 키로 이뤄진다.
--
-- 이 한 파일이 이전의 0001~0012 마이그레이션을 전부 대체한다(스쿼시).
-- 히스토리는 git 에 남아 있고, 새 환경에서는 이 파일 하나만 실행하면 된다.
-- 전부 여러 번 실행해도 안전하도록(idempotent) 작성했다.
--
-- 완전히 처음부터 다시 만들려면 아래 블록의 주석을 풀어 먼저 실행한다.
-- -----------------------------------------------------------------------------
-- drop table if exists public.answer_reactions, public.answers, public.rounds,
--                      public.players, public.questions_bank, public.rooms cascade;
-- drop function if exists
--   public.gen_room_code(), public.pick_random_question(),
--   public.advance_to_scoring(uuid), public.next_questioner(uuid, uuid),
--   public.finalize_round(uuid), public.promote_host(uuid, uuid),
--   public.restart_everyone_game(uuid), public.handle_player_leave() cascade;
-- drop type if exists public.room_mode, public.round_status, public.room_status;
-- =============================================================================

-- gen_random_uuid() 용 (Supabase 에는 보통 이미 활성화되어 있음)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUM 타입
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.room_status as enum
    ('waiting', 'question', 'scoring', 'reveal', 'finished');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.round_status as enum ('collecting', 'scoring', 'revealed');
exception when duplicate_object then null;
end $$;

-- king = 왕 모드(질문자 = 방장 고정) / everyone = 다같이 모드(질문자 순환)
do $$ begin
  create type public.room_mode as enum ('king', 'everyone');
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 함수: 참가용 방 코드 생성 (테이블보다 먼저 — rooms.code 의 default 로 쓰인다)
-- 헷갈리는 글자(0/O, 1/I) 를 제외한 4자리 코드. 충돌 시 재시도.
-- =============================================================================
create or replace function public.gen_room_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- =============================================================================
-- 테이블
-- =============================================================================

-- rooms : 게임 방
create table if not exists public.rooms (
  id                uuid         primary key default gen_random_uuid(),
  code              text         not null unique default public.gen_room_code(),
  host_nickname     text         not null,
  target_score      smallint     not null default 10
                                 check (target_score between 1 and 20),
  answer_time_limit smallint     null                       -- null = 무제한
                                 check (answer_time_limit between 5 and 100),
  status            public.room_status not null default 'waiting',
  game_mode         public.room_mode   not null default 'king',
  -- 아래 두 컬럼은 FK 를 걸지 않은 "소프트 참조"다. players 행 삭제 시 FK 내부
  -- 트리거와 handle_player_leave 트리거의 실행 순서에 의존하지 않기 위해서다
  -- (정합성은 handle_player_leave 가 직접 관리한다).
  current_questioner_id uuid     null,
  winner_player_id      uuid     null,
  created_at        timestamptz  not null default now()
);

comment on column public.rooms.code is '참가용 짧은 코드';
comment on column public.rooms.answer_time_limit is '답변 제한 시간(초, 5~100). null 이면 무제한.';
comment on column public.rooms.current_questioner_id is '현재 라운드의 질문자(=답변 대상) player id. 소프트 참조.';
comment on column public.rooms.winner_player_id is '목표 점수 도달로 게임이 끝났을 때의 우승자. 소프트 참조.';

-- players : 방 참가자
create table if not exists public.players (
  id         uuid        primary key default gen_random_uuid(),
  room_id    uuid        not null references public.rooms (id) on delete cascade,
  nickname   text        not null,
  score      integer     not null default 0,
  is_host    boolean     not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, nickname)
);

create index if not exists players_room_id_idx on public.players (room_id);
-- 방 당 방장은 한 명
create unique index if not exists players_one_host_per_room_idx
  on public.players (room_id)
  where is_host;

-- questions_bank : 기본 질문 목록 (레거시 — 앱은 이제 public/questions.csv 를
-- 직접 읽는다. pick_random_question() 폴백용으로만 남겨 둠)
create table if not exists public.questions_bank (
  id            bigint generated always as identity primary key,
  question_text text not null unique
);

-- rounds : 한 라운드 = 질문자(target_player)에 대한 하나의 질문
create table if not exists public.rounds (
  id               uuid         primary key default gen_random_uuid(),
  room_id          uuid         not null references public.rooms (id)   on delete cascade,
  question_text    text         not null,
  target_player_id uuid         not null references public.players (id) on delete cascade,
  status           public.round_status not null default 'collecting',
  created_at       timestamptz  not null default now()
);

create index if not exists rounds_room_id_idx      on public.rounds (room_id);
create index if not exists rounds_room_created_idx on public.rounds (room_id, created_at desc);

-- answers : 라운드별 참가자 답변 + 질문자 채점
--   score: null = 미채점 / 1 = 👍 좋아요 / 0 = 👎 별로예요
create table if not exists public.answers (
  id           uuid        primary key default gen_random_uuid(),
  round_id     uuid        not null references public.rounds (id)  on delete cascade,
  player_id    uuid        not null references public.players (id) on delete cascade,
  answer_text  text        not null,
  score        smallint    null check (score in (0, 1)),
  submitted_at timestamptz not null default now(),
  is_editing   boolean     not null default false,
  unique (round_id, player_id)
);

create index if not exists answers_round_id_idx on public.answers (round_id);

-- answer_reactions : 결과 공개 화면에서 답변에 남기는 "좋아요"(❤️).
-- 사람당 답변 하나에 1개 — 다시 누르면 취소(클라이언트가 upsert/delete).
create table if not exists public.answer_reactions (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.rounds  (id) on delete cascade,
  answer_id  uuid        not null references public.answers (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  emoji      text        not null default '❤️' check (emoji = '❤️'),
  created_at timestamptz not null default now(),
  unique (answer_id, player_id)
);

comment on table public.answer_reactions is
  '결과 공개 화면에서 참가자가 답변에 남기는 좋아요(❤️). 사람당 답변 하나에 1개.';

create index if not exists answer_reactions_round_id_idx  on public.answer_reactions (round_id);
create index if not exists answer_reactions_answer_id_idx on public.answer_reactions (answer_id);

-- rooms.code 는 위에서 인라인 default 로 만들어지지만, 예전 스키마로 만들어진
-- 테이블에는 default 가 없을 수 있으므로 한 번 더 못 박는다.
alter table public.rooms alter column code set default public.gen_room_code();

-- -----------------------------------------------------------------------------
-- 예전 스키마로 이미 만들어진 DB 를 현재 정의로 맞추는 보정
-- (create table if not exists 는 기존 테이블을 건드리지 않으므로 필요하다)
-- -----------------------------------------------------------------------------

-- answer_time_limit: 첫 배포본 상한은 60 이었다 → 100 으로.
alter table public.rooms drop constraint if exists rooms_answer_time_limit_check;
alter table public.rooms add constraint rooms_answer_time_limit_check
  check (answer_time_limit between 5 and 100);

-- game_mode / 소프트 참조 컬럼이 없던 시절 대비
alter table public.rooms add column if not exists game_mode public.room_mode not null default 'king';
alter table public.rooms add column if not exists current_questioner_id uuid;
alter table public.rooms add column if not exists winner_player_id uuid;

-- answers.is_editing 가 없던 시절 대비
alter table public.answers add column if not exists is_editing boolean not null default false;

-- answers.score: 3단계 채점(-1/0/1) 시절의 -1 행을 0(👎)으로 옮긴 뒤 범위를 좁힌다.
update public.answers set score = 0 where score = -1;
alter table public.answers drop constraint if exists answers_score_check;
alter table public.answers add constraint answers_score_check check (score in (0, 1));

-- answer_reactions.emoji: 3종(😆/😮/👏) 또는 그 이전 이모지 행을 모두 ❤️ 로 통일.
-- *** 이 두 줄을 지우면 안 된다 *** — 아래 CHECK 제약이 기존 행과 충돌해
-- 스크립트 전체가 롤백된다(점수 -1 -> 0 을 옮길 때와 똑같은 이유).
alter table public.answer_reactions alter column emoji set default '❤️';
update public.answer_reactions set emoji = '❤️' where emoji <> '❤️';
alter table public.answer_reactions drop constraint if exists answer_reactions_emoji_check;
alter table public.answer_reactions
  add constraint answer_reactions_emoji_check check (emoji = '❤️');

-- =============================================================================
-- RPC 함수
--
-- 라운드 진행 상태 전환:
--   collecting --advance_to_scoring--> scoring --finalize_round--> revealed
-- 모든 전환 함수는 라운드 row 를 FOR UPDATE 로 잠그고 현재 status 를 확인한
-- 뒤에만 동작하므로, 여러 클라이언트가 동시에 호출해도 실제 전환은 한 번만
-- 일어난다(멱등).
-- =============================================================================

-- 무작위 질문 1개 (레거시 폴백)
create or replace function public.pick_random_question()
returns text
language sql
stable
as $$
  select question_text
  from public.questions_bank
  order by random()
  limit 1;
$$;

-- collecting -> scoring
-- 미제출자(질문자 제외)는 빈 답변('')을 0점(👎)으로 채우고, 남은 "수정 중"
-- 플래그를 정리한 뒤 채점 단계로 넘어간다.
create or replace function public.advance_to_scoring(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
  v_status  public.round_status;
begin
  select room_id, status into v_room_id, v_status
  from public.rounds
  where id = p_round_id
  for update;

  if not found or v_status <> 'collecting' then
    return;
  end if;

  insert into public.answers (round_id, player_id, answer_text, score)
  select p_round_id, pl.id, '', 0
  from public.players pl
  where pl.room_id = v_room_id
    -- target_player_id 가 이 라운드의 질문자(왕/다같이 모드 공통)다
    and pl.id <> (select target_player_id from public.rounds where id = p_round_id)
    and not exists (
      select 1 from public.answers a
      where a.round_id = p_round_id and a.player_id = pl.id
    );

  update public.answers set is_editing = false
  where round_id = p_round_id and is_editing;

  update public.rounds set status = 'scoring' where id = p_round_id;
  update public.rooms  set status = 'scoring' where id = v_room_id;
end;
$$;

-- 참가 순서(created_at)상 p_current_id 다음 플레이어. 없으면(마지막이면) 맨 처음으로.
create or replace function public.next_questioner(p_room_id uuid, p_current_id uuid)
returns uuid
language sql
stable
as $$
  with cur as (
    select created_at, id from public.players where id = p_current_id
  )
  select coalesce(
    (
      select p.id
      from public.players p, cur
      where p.room_id = p_room_id
        and (p.created_at, p.id) > (cur.created_at, cur.id)
      order by p.created_at asc, p.id asc
      limit 1
    ),
    (
      select id from public.players
      where room_id = p_room_id
      order by created_at asc, id asc
      limit 1
    )
  );
$$;

-- scoring -> revealed : 점수 반영 + 모드별 다음 단계 결정
--   두 모드 모두, 목표 점수(target_score) 도달자가 있으면 서버가 직접 판정해
--   status='finished' + winner_player_id 를 기록한다(게임 종료 화면으로).
--     왕 모드     : 방장(질문자)은 승자 후보에서 제외. 도달자가 없으면 reveal 유지.
--                   이후 화면의 "왕위 넘기기" → promote_host 로 새 방장 승격.
--     다같이 모드 : 도달자가 없으면 질문자를 다음 사람으로 회전시키고 reveal 유지.
create or replace function public.finalize_round(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_room_id  uuid;
  v_status   public.round_status;
  v_unscored int;
  v_mode     public.room_mode;
  v_target   smallint;
  v_winner   uuid;
  v_next     uuid;
  v_current_questioner uuid;
begin
  select room_id, status into v_room_id, v_status
  from public.rounds
  where id = p_round_id
  for update;

  if not found or v_status <> 'scoring' then
    return;
  end if;

  select count(*) into v_unscored
  from public.answers
  where round_id = p_round_id and score is null;

  if v_unscored > 0 then
    return;
  end if;

  update public.players p
  set score = p.score + agg.delta
  from (
    select player_id, sum(score)::int as delta
    from public.answers
    where round_id = p_round_id
    group by player_id
  ) agg
  where p.id = agg.player_id;

  update public.rounds set status = 'revealed' where id = p_round_id;

  select game_mode, target_score into v_mode, v_target
  from public.rooms where id = v_room_id;

  if v_mode = 'king' then
    -- 방장(질문자) 본인은 승자 후보에서 제외
    select id into v_winner
    from public.players
    where room_id = v_room_id and is_host = false and score >= v_target
    order by score desc, random()
    limit 1;

    if v_winner is not null then
      update public.rooms
      set status = 'finished', winner_player_id = v_winner
      where id = v_room_id;
    else
      update public.rooms set status = 'reveal' where id = v_room_id;
    end if;
  else
    select id into v_winner
    from public.players
    where room_id = v_room_id and score >= v_target
    order by score desc, random()
    limit 1;

    if v_winner is not null then
      update public.rooms
      set status = 'finished', winner_player_id = v_winner
      where id = v_room_id;
    else
      select target_player_id into v_current_questioner
      from public.rounds where id = p_round_id;

      select public.next_questioner(v_room_id, v_current_questioner) into v_next;

      update public.rooms
      set status = 'reveal', current_questioner_id = v_next
      where id = v_room_id;
    end if;
  end if;
end;
$$;

-- 왕 모드 승격: 새 방장 지정 + 점수 초기화 + 이전 라운드 정리 + 대기실 복귀
create or replace function public.promote_host(p_room_id uuid, p_new_host uuid)
returns void
language plpgsql
as $$
declare
  v_nickname text;
begin
  select nickname into v_nickname
  from public.players
  where id = p_new_host and room_id = p_room_id;

  if not found then
    return;
  end if;

  update public.players set is_host = false
  where room_id = p_room_id and is_host = true;

  update public.players set is_host = true
  where id = p_new_host;

  update public.players set score = 0
  where room_id = p_room_id;

  -- 이전 게임의 라운드/답변 정리 (answers 는 cascade). 남겨 두면 클라이언트가
  -- "가장 최근 라운드"로 이전 게임의 공개 화면을 계속 띄운다.
  delete from public.rounds where room_id = p_room_id;

  update public.rooms
  set status = 'waiting',
      host_nickname = v_nickname,
      current_questioner_id = p_new_host
  where id = p_room_id;
end;
$$;

-- 다같이 모드 재시작: 점수 초기화 + 이전 라운드 정리 + 직전 우승자부터 질문
-- 시작(대기실을 거치지 않고 곧바로 'question' 으로).
create or replace function public.restart_everyone_game(p_room_id uuid)
returns void
language plpgsql
as $$
declare
  v_winner uuid;
  v_first  uuid;
begin
  select winner_player_id into v_winner
  from public.rooms where id = p_room_id for update;

  if not found then
    return;
  end if;

  update public.players set score = 0 where room_id = p_room_id;

  delete from public.rounds where room_id = p_room_id;

  select id into v_first
  from public.players where room_id = p_room_id
  order by created_at asc limit 1;

  update public.rooms
  set status = 'question',
      current_questioner_id = coalesce(v_winner, v_first)
  where id = p_room_id;
end;
$$;

-- 플레이어 탈주 처리 (관리자 승계 + 질문자 승계, 왕/다같이 모드 공통)
create or replace function public.handle_player_leave()
returns trigger
language plpgsql
as $$
declare
  v_room record;
  v_new_host uuid;
  v_new_questioner uuid;
  v_remaining int;
begin
  select * into v_room from public.rooms where id = old.room_id for update;
  if not found then
    return old;
  end if;

  select count(*) into v_remaining from public.players where room_id = old.room_id;
  if v_remaining = 0 then
    return old;
  end if;

  -- 관리자(방장) 승계: 나간 사람이 관리자였으면 최고 점수(동점 랜덤)에게
  if old.is_host then
    select id into v_new_host
    from public.players where room_id = old.room_id
    order by score desc, random() limit 1;

    if v_new_host is not null then
      update public.players set is_host = true where id = v_new_host;
      update public.rooms set host_nickname = (
        select nickname from public.players where id = v_new_host
      ) where id = old.room_id;
    end if;
  end if;

  -- 질문자 승계: 나간 사람이 현재 질문자였으면 (또는 아직 지정 전인데 관리자였으면)
  if v_room.current_questioner_id = old.id
     or (v_room.current_questioner_id is null and old.is_host) then
    if v_room.game_mode = 'king' then
      v_new_questioner := v_new_host;
    else
      select p.id into v_new_questioner
      from public.players p
      where p.room_id = old.room_id
        and (p.created_at, p.id) > (old.created_at, old.id)
      order by p.created_at asc, p.id asc
      limit 1;

      if v_new_questioner is null then
        select id into v_new_questioner
        from public.players where room_id = old.room_id
        order by created_at asc, id asc limit 1;
      end if;
    end if;

    update public.rooms
    set current_questioner_id = v_new_questioner,
        status = case
          when status not in ('waiting', 'finished') then 'waiting'
          else status
        end
    where id = old.room_id;
  end if;

  return old;
end;
$$;

-- 옛 트리거/함수 정리 후 재생성
drop trigger  if exists players_reassign_host on public.players;
drop trigger  if exists players_handle_leave  on public.players;
drop function if exists public.reassign_host_on_leave();

create trigger players_handle_leave
  after delete on public.players
  for each row execute function public.handle_player_leave();

grant execute on function public.gen_room_code()                  to anon;
grant execute on function public.pick_random_question()           to anon;
grant execute on function public.advance_to_scoring(uuid)         to anon;
grant execute on function public.next_questioner(uuid, uuid)      to anon;
grant execute on function public.finalize_round(uuid)             to anon;
grant execute on function public.promote_host(uuid, uuid)         to anon;
grant execute on function public.restart_everyone_game(uuid)      to anon;

-- =============================================================================
-- RLS
-- 인증이 없으므로 anon 키로 모든 접근이 이뤄진다. 파티 게임 특성상 anon 에게
-- 전체 CRUD 를 허용한다(questions_bank 만 읽기 전용). 프로덕션에서 악용 방지가
-- 필요하면 쓰기를 Edge Function / RPC 뒤로 옮기는 것을 권장.
-- =============================================================================
alter table public.rooms            enable row level security;
alter table public.players          enable row level security;
alter table public.questions_bank   enable row level security;
alter table public.rounds           enable row level security;
alter table public.answers          enable row level security;
alter table public.answer_reactions enable row level security;

drop policy if exists "anon full access - rooms"            on public.rooms;
drop policy if exists "anon full access - players"          on public.players;
drop policy if exists "anon read - questions_bank"          on public.questions_bank;
drop policy if exists "anon full access - rounds"           on public.rounds;
drop policy if exists "anon full access - answers"          on public.answers;
drop policy if exists "anon full access - answer_reactions" on public.answer_reactions;

create policy "anon full access - rooms"
  on public.rooms for all to anon using (true) with check (true);
create policy "anon full access - players"
  on public.players for all to anon using (true) with check (true);
create policy "anon read - questions_bank"
  on public.questions_bank for select to anon using (true);
create policy "anon full access - rounds"
  on public.rounds for all to anon using (true) with check (true);
create policy "anon full access - answers"
  on public.answers for all to anon using (true) with check (true);
create policy "anon full access - answer_reactions"
  on public.answer_reactions for all to anon using (true) with check (true);

-- =============================================================================
-- Realtime
-- 변경 사항을 구독자에게 브로드캐스트. REPLICA IDENTITY FULL 로 UPDATE/DELETE
-- 이벤트에서도 전체 row 를 받는다. (questions_bank 는 실시간 대상 아님)
-- =============================================================================
alter table public.rooms            replica identity full;
alter table public.players          replica identity full;
alter table public.rounds           replica identity full;
alter table public.answers          replica identity full;
alter table public.answer_reactions replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'players', 'rounds', 'answers', 'answer_reactions'] loop
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
