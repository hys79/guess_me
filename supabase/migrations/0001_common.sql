-- =============================================================================
-- 0001 : 공통 (모든 게임이 공유하는 방 / 참가자 인프라)
--
-- 미니게임 허브의 뼈대. 게임별 규칙·테이블은 여기 두지 않고 게임마다 파일 1개로
-- 분리한다 (0003_game_guess_me.sql, 0004_game_song.sql, ...).
--
--   rooms   : 방. game_type 으로 어떤 게임의 방인지 구분한다.
--             target_score / answer_time_limit 은 대부분의 게임이 쓰는 공통 설정.
--             rooms.status 는 'waiting'(대기실) / 'finished'(종료) 가 공통 의미이고
--             그 사이 값(question·scoring·reveal)은 각 게임이 필요한 만큼만 쓴다.
--   players : 참가자. score 를 공통 점수판으로 쓴다.
--
-- 새 게임을 추가할 때 이 파일을 고칠 필요는 없다. 탈주 처리는 규약으로 확장한다:
--   handle_player_leave 가 "<game_type>_on_leave(players, rooms, uuid)" 함수가 있으면
--   호출해 준다. (게임 파일에서 그 함수만 정의하면 된다)
--
-- Supabase Auth 미사용 — player_id 는 클라이언트가 localStorage 에 보관하고,
-- 모든 접근은 anon 키로 이뤄진다. 전부 여러 번 실행해도 안전하다(idempotent).
--
-- 완전히 처음부터 다시 만들려면 모든 게임 파일의 reset 블록을 먼저 실행한 뒤 아래를 푼다.
-- -----------------------------------------------------------------------------
-- drop table if exists public.players, public.rooms cascade;
-- drop function if exists
--   public.gen_room_code(), public.next_questioner(uuid, uuid),
--   public.handle_player_leave(), public.touch_room_activity() cascade;
-- drop type if exists public.room_status;
-- =============================================================================

-- gen_random_uuid() 용 (Supabase 에는 보통 이미 활성화되어 있음)
create extension if not exists "pgcrypto";

do $$ begin
  create type public.room_status as enum
    ('waiting', 'question', 'scoring', 'reveal', 'finished');
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 방 코드 생성 (rooms.code 의 default 로 쓰이므로 테이블보다 먼저)
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
  game_type         text         not null default 'guess_me',
  target_score      smallint     not null default 10
                                 check (target_score between 1 and 20),
  answer_time_limit smallint     null                       -- null = 무제한
                                 check (answer_time_limit between 5 and 100),
  status            public.room_status not null default 'waiting',
  created_at        timestamptz  not null default now(),
  -- 마지막 활동 시각. 게임별 트리거(touch_room_activity)가 갱신하고,
  -- 방치된 방 정리(0002_cleanup_cron.sql)의 기준값으로 쓰인다.
  last_active_at    timestamptz  not null default now()
);

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

-- -----------------------------------------------------------------------------
-- 예전 스키마로 이미 만들어진 DB 를 현재 정의로 맞추는 보정
-- (create table if not exists 는 기존 테이블을 건드리지 않으므로 필요하다)
-- -----------------------------------------------------------------------------
alter table public.rooms add column if not exists game_type text not null default 'guess_me';
alter table public.rooms add column if not exists last_active_at timestamptz not null default now();
alter table public.rooms alter column code set default public.gen_room_code();

-- 컬럼 설명은 반드시 위의 add column 보정 "뒤에" 둔다. 예전 DB 에서는 game_type 이
-- 위 보정이 끝나야 생기므로, 앞에 두면 "column does not exist" 로 스크립트가 실패한다.
comment on column public.rooms.code is '참가용 짧은 코드';
comment on column public.rooms.game_type is '게임 종류 (guess_me / song / ...). 앱의 게임 레지스트리 id 와 같다.';
comment on column public.rooms.target_score is '목표 점수(1~20). 게임별로 의미가 다를 수 있다.';
comment on column public.rooms.answer_time_limit is '제한 시간(초, 5~100). null 이면 무제한. 게임별로 의미가 다를 수 있다.';
comment on column public.rooms.last_active_at is '마지막 활동 시각. 2시간 이상 조용하면 cron 이 방을 삭제한다.';

-- answer_time_limit: 첫 배포본 상한은 60 이었다 → 100 으로.
alter table public.rooms drop constraint if exists rooms_answer_time_limit_check;
alter table public.rooms add constraint rooms_answer_time_limit_check
  check (answer_time_limit between 5 and 100);

-- =============================================================================
-- 공통 함수
-- =============================================================================

-- (출제자·질문자 같은 "차례 돌리기"를 하는 모든 게임이 같이 쓴다.)
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

-- 방 활동 시각 갱신. room_id 컬럼이 있는 테이블(players, 각 게임의 라운드 테이블)에
-- 붙이는 트리거 함수. room_id 가 없으면 아무것도 하지 않는다.
create or replace function public.touch_room_activity()
returns trigger
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  v_room_id := (to_jsonb(new) ->> 'room_id')::uuid;
  if v_room_id is not null then
    update public.rooms set last_active_at = now() where id = v_room_id;
  end if;
  return null;
end;
$$;

-- 플레이어 탈주 처리 (공통 부분)
--   1) 마지막 참가자가 나가면 방을 통째로 삭제 (하위 행은 FK on delete cascade)
--   2) 나간 사람이 방장이면 최고 점수(동점 랜덤)에게 방장 승계
--   3) 게임별 후속 처리는 "<game_type>_on_leave(players, rooms, uuid)" 가 있으면 호출
--
-- security definer: 게임 훅이 anon 에게 쓰기 권한이 없는 테이블(정답 등)을 만질 수
-- 있어야 하고, 훅 함수를 anon 이 직접 호출하지 못하게 막아 두기 위해서다.
create or replace function public.handle_player_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_new_host uuid;
  v_remaining int;
  v_hook text;
begin
  select * into v_room from public.rooms where id = old.room_id for update;
  if not found then
    return old;
  end if;

  select count(*) into v_remaining from public.players where room_id = old.room_id;
  if v_remaining = 0 then
    -- 마지막 참가자가 나갔다 → 방을 통째로 삭제. 빈 방을 남겨 두면 영구히 쌓이기만 한다.
    delete from public.rooms where id = old.room_id;
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

  -- 게임별 후속 처리 (규약: <game_type>_on_leave)
  v_hook := v_room.game_type || '_on_leave';
  if to_regprocedure(
       format('public.%I(public.players, public.rooms, uuid)', v_hook)
     ) is not null then
    execute format('select public.%I($1, $2, $3)', v_hook)
      using old, v_room, v_new_host;
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

-- 참가도 "활동"이다
drop trigger if exists players_touch_activity on public.players;
create trigger players_touch_activity
  after insert on public.players
  for each row execute function public.touch_room_activity();

grant execute on function public.gen_room_code()             to anon;
grant execute on function public.next_questioner(uuid, uuid) to anon;

-- =============================================================================
-- RLS
-- 인증이 없으므로 anon 키로 모든 접근이 이뤄진다. 파티 게임 특성상 anon 에게
-- 전체 CRUD 를 허용한다. 프로덕션에서 악용 방지가 필요하면 쓰기를
-- Edge Function / RPC 뒤로 옮기는 것을 권장. (정답처럼 숨겨야 하는 데이터를 가진
-- 게임은 자기 파일에서 anon 정책을 더 좁게 건다.)
-- =============================================================================
alter table public.rooms   enable row level security;
alter table public.players enable row level security;

drop policy if exists "anon full access - rooms"   on public.rooms;
drop policy if exists "anon full access - players" on public.players;

create policy "anon full access - rooms"
  on public.rooms for all to anon using (true) with check (true);
create policy "anon full access - players"
  on public.players for all to anon using (true) with check (true);

-- =============================================================================
-- Realtime
-- 변경 사항을 구독자에게 브로드캐스트. REPLICA IDENTITY FULL 로 UPDATE/DELETE
-- 이벤트에서도 전체 row 를 받는다.
-- =============================================================================
alter table public.rooms   replica identity full;
alter table public.players replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'players'] loop
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
