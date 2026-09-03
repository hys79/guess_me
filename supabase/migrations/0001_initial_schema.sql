-- =============================================================================
-- guess_me : 초기 스키마
-- 닉네임 기반 실시간 추측 게임. Supabase Auth 미사용, player_id 는 클라이언트가
-- localStorage 에 보관한다.
--
-- 이 파일은 여러 번 실행해도 안전하도록(idempotent) 작성되어 있다.
-- 완전히 처음부터 다시 만들고 싶으면 아래 4줄의 주석을 풀어 먼저 실행한다.
-- -----------------------------------------------------------------------------
-- drop table if exists public.answers, public.rounds, public.players,
--                       public.questions_bank, public.rooms cascade;
-- drop type  if exists public.round_status;
-- drop type  if exists public.room_status;
-- =============================================================================

-- gen_random_uuid() 용 (Supabase 에는 보통 이미 활성화되어 있음)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUM 타입 (이미 있으면 건너뜀)
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

-- -----------------------------------------------------------------------------
-- rooms : 게임 방
-- -----------------------------------------------------------------------------
create table if not exists public.rooms (
  id                uuid         primary key default gen_random_uuid(),
  code              text         not null unique,                 -- 참가용 짧은 코드 (예: "AB3K")
  host_nickname     text         not null,
  target_score      smallint     not null default 10
                                 check (target_score between 1 and 20),
  answer_time_limit smallint     null                             -- null = 무제한
                                 check (answer_time_limit between 5 and 100),
  status            public.room_status not null default 'waiting',
  created_at        timestamptz  not null default now()
);

comment on column public.rooms.code is '참가용 짧은 코드';
comment on column public.rooms.answer_time_limit is '답변 제한 시간(초, 5~100). null 이면 무제한.';

-- -----------------------------------------------------------------------------
-- players : 방 참가자
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- questions_bank : 기본 질문 목록 (CSV 에서 임포트)
-- -----------------------------------------------------------------------------
create table if not exists public.questions_bank (
  id            bigint generated always as identity primary key,
  question_text text not null unique
);

-- -----------------------------------------------------------------------------
-- rounds : 한 라운드 = 방장(target_player)에 대한 하나의 질문
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- answers : 라운드별 참가자 답변 + 방장 채점
--   score: null = 미채점 / 1 = 🙂 좋아요 / 0 = 🤔 글쎄요 / -1 = 😠 별로예요
-- -----------------------------------------------------------------------------
create table if not exists public.answers (
  id           uuid        primary key default gen_random_uuid(),
  round_id     uuid        not null references public.rounds (id)  on delete cascade,
  player_id    uuid        not null references public.players (id) on delete cascade,
  answer_text  text        not null,
  score        smallint    null check (score in (-1, 0, 1)),
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists answers_round_id_idx on public.answers (round_id);

-- =============================================================================
-- RLS
-- 인증이 없으므로 anon 키로 모든 접근이 이루어진다. 파티 게임 특성상
-- 여기서는 anon 에게 전체 CRUD 를 허용한다. (프로덕션에서 악용 방지가
-- 필요하면 Edge Function / RPC 뒤로 쓰기를 옮기는 것을 권장)
-- =============================================================================
alter table public.rooms          enable row level security;
alter table public.players        enable row level security;
alter table public.questions_bank enable row level security;
alter table public.rounds         enable row level security;
alter table public.answers        enable row level security;

drop policy if exists "anon full access - rooms"      on public.rooms;
drop policy if exists "anon full access - players"    on public.players;
drop policy if exists "anon read - questions_bank"    on public.questions_bank;
drop policy if exists "anon full access - rounds"     on public.rounds;
drop policy if exists "anon full access - answers"    on public.answers;

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

-- =============================================================================
-- Realtime
-- 변경 사항을 구독자에게 브로드캐스트. REPLICA IDENTITY FULL 을 주어
-- UPDATE/DELETE 이벤트에서도 이전/전체 row 를 받을 수 있게 한다.
-- =============================================================================
alter table public.rooms    replica identity full;
alter table public.players  replica identity full;
alter table public.rounds   replica identity full;
alter table public.answers  replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'players', 'rounds', 'answers'] loop
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
