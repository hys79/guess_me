-- =============================================================================
-- 0003 : 게임 "Guess Me!" (game_type = 'guess_me')
--
-- 나를 가장 잘 아는 사람은? — 질문자에 대한 질문에 다른 사람들이 답을 쓰고,
-- 질문자가 익명으로 👍/👎 채점하는 게임. 이 게임에 속한 것만 이 파일에 둔다:
--   테이블  : questions_bank(레거시) · rounds · answers · answer_reactions
--   rooms   : game_mode · current_questioner_id · winner_player_id 컬럼 추가
--   RPC     : advance_to_scoring · finalize_round · promote_host · restart_everyone_game
--   훅      : guess_me_on_leave (질문자가 나갔을 때 승계, 0001 의 탈주 처리에서 호출됨)
--
-- 공통 인프라(rooms / players / 방 코드 / 탈주 공통 처리)는 0001_common.sql.
-- 여러 번 실행해도 안전하다(idempotent).
--
-- 이 게임만 처음부터 다시 만들려면:
-- drop table if exists public.answer_reactions, public.answers, public.rounds,
--                      public.questions_bank cascade;
-- drop function if exists
--   public.pick_random_question(), public.advance_to_scoring(uuid),
--   public.finalize_round(uuid), public.promote_host(uuid, uuid),
--   public.restart_everyone_game(uuid),
--   public.guess_me_on_leave(public.players, public.rooms, uuid),
--   public.guess_me_touch_answer_activity() cascade;
-- drop type if exists public.room_mode, public.round_status;
-- (rooms 의 game_mode / current_questioner_id / winner_player_id 컬럼은 남는다)
-- =============================================================================

do $$ begin
  create type public.round_status as enum ('collecting', 'scoring', 'revealed');
exception when duplicate_object then null;
end $$;

-- king = 왕 모드(질문자 = 방장 고정) / everyone = 다같이 모드(질문자 순환)
do $$ begin
  create type public.room_mode as enum ('king', 'everyone');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- rooms 에 이 게임 전용 컬럼 추가
-- 아래 두 소프트 참조는 FK 를 걸지 않는다. players 행 삭제 시 FK 내부 트리거와
-- 탈주 트리거의 실행 순서에 의존하지 않기 위해서다(정합성은 guess_me_on_leave 가 관리).
-- -----------------------------------------------------------------------------
alter table public.rooms add column if not exists game_mode public.room_mode not null default 'king';
alter table public.rooms add column if not exists current_questioner_id uuid;
alter table public.rooms add column if not exists winner_player_id uuid;

comment on column public.rooms.game_mode is '[guess_me · song 공용] king=왕 모드 / everyone=다같이 모드';
comment on column public.rooms.current_questioner_id is '[guess_me 전용] 현재 라운드의 질문자(=답변 대상) player id. 소프트 참조.';
comment on column public.rooms.winner_player_id is '[guess_me · song 공용] 목표 점수 도달로 게임이 끝났을 때의 우승자. 소프트 참조.';

-- =============================================================================
-- 테이블
-- =============================================================================
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

-- -----------------------------------------------------------------------------
-- 예전 스키마로 이미 만들어진 DB 를 현재 정의로 맞추는 보정
-- -----------------------------------------------------------------------------

-- answers.is_editing 가 없던 시절 대비
alter table public.answers add column if not exists is_editing boolean not null default false;

-- answers.score: 3단계 채점(-1/0/1) 시절의 -1 행을 0(👎)으로 옮긴 뒤 범위를 좁힌다.
-- 반드시 "제약 해제 → 데이터 정리 → 새 제약" 순서. 기존 제약을 켜 둔 채로 옮기면
-- 옮기는 값이 옛 제약을 위반해(예: emoji 는 옛 제약이 ❤️ 를 아예 허용 안 함)
-- 스크립트 전체가 롤백된다.
alter table public.answers drop constraint if exists answers_score_check;
update public.answers set score = 0 where score = -1;
alter table public.answers add constraint answers_score_check check (score in (0, 1));

-- answer_reactions.emoji: 3종(😆/😮/👏) 또는 그 이전 이모지 행을 모두 ❤️ 로 통일.
alter table public.answer_reactions drop constraint if exists answer_reactions_emoji_check;
alter table public.answer_reactions alter column emoji set default '❤️';
update public.answer_reactions set emoji = '❤️' where emoji <> '❤️';
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

-- -----------------------------------------------------------------------------
-- 탈주 훅 — 0001 의 handle_player_leave 가 "<game_type>_on_leave" 규약으로 호출한다.
-- 질문자 승계 (왕/다같이 모드 공통). 방장 승계는 공통 처리가 이미 끝낸 상태다.
-- -----------------------------------------------------------------------------
create or replace function public.guess_me_on_leave(
  p_old public.players,
  p_room public.rooms,
  p_new_host uuid
)
returns void
language plpgsql
as $$
declare
  v_new_questioner uuid;
begin
  -- 질문자 승계: 나간 사람이 현재 질문자였으면 (또는 아직 지정 전인데 관리자였으면)
  if p_room.current_questioner_id = p_old.id
     or (p_room.current_questioner_id is null and p_old.is_host) then
    if p_room.game_mode = 'king' then
      v_new_questioner := p_new_host;
    else
      select p.id into v_new_questioner
      from public.players p
      where p.room_id = p_old.room_id
        and (p.created_at, p.id) > (p_old.created_at, p_old.id)
      order by p.created_at asc, p.id asc
      limit 1;

      if v_new_questioner is null then
        select id into v_new_questioner
        from public.players where room_id = p_old.room_id
        order by created_at asc, id asc limit 1;
      end if;
    end if;

    update public.rooms
    set current_questioner_id = v_new_questioner,
        status = case
          when status not in ('waiting', 'finished') then 'waiting'
          else status
        end
    where id = p_old.room_id;
  end if;
end;
$$;

-- 답변 제출도 "활동"이다 (answers 에는 room_id 가 없어 전용 트리거 함수를 쓴다)
create or replace function public.guess_me_touch_answer_activity()
returns trigger
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id from public.rounds where id = new.round_id;
  if v_room_id is not null then
    update public.rooms set last_active_at = now() where id = v_room_id;
  end if;
  return null;
end;
$$;

drop trigger if exists rounds_touch_activity  on public.rounds;
drop trigger if exists answers_touch_activity on public.answers;

create trigger rounds_touch_activity
  after insert or update on public.rounds
  for each row execute function public.touch_room_activity();

create trigger answers_touch_activity
  after insert on public.answers
  for each row execute function public.guess_me_touch_answer_activity();

grant execute on function public.pick_random_question()           to anon;
grant execute on function public.advance_to_scoring(uuid)         to anon;
grant execute on function public.finalize_round(uuid)             to anon;
grant execute on function public.promote_host(uuid, uuid)         to anon;
grant execute on function public.restart_everyone_game(uuid)      to anon;

-- 탈주 훅은 handle_player_leave(security definer)만 부르면 된다 — 직접 호출 차단
revoke execute on function public.guess_me_on_leave(public.players, public.rooms, uuid)
  from public, anon, authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.questions_bank   enable row level security;
alter table public.rounds           enable row level security;
alter table public.answers          enable row level security;
alter table public.answer_reactions enable row level security;

drop policy if exists "anon read - questions_bank"          on public.questions_bank;
drop policy if exists "anon full access - rounds"           on public.rounds;
drop policy if exists "anon full access - answers"          on public.answers;
drop policy if exists "anon full access - answer_reactions" on public.answer_reactions;

create policy "anon read - questions_bank"
  on public.questions_bank for select to anon using (true);
create policy "anon full access - rounds"
  on public.rounds for all to anon using (true) with check (true);
create policy "anon full access - answers"
  on public.answers for all to anon using (true) with check (true);
create policy "anon full access - answer_reactions"
  on public.answer_reactions for all to anon using (true) with check (true);

-- =============================================================================
-- Realtime (questions_bank 는 실시간 대상 아님)
-- =============================================================================
alter table public.rounds           replica identity full;
alter table public.answers          replica identity full;
alter table public.answer_reactions replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['rounds', 'answers', 'answer_reactions'] loop
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
