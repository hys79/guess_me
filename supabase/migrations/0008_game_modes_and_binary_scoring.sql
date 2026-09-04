-- =============================================================================
-- 0009 : 게임 모드(왕 모드 / 다같이 모드) + 채점 이분화(👍/👎)
--
--  - answers.score 범위를 (-1,0,1) 에서 (0,1) 로 좁힌다. (👍=1, 👎=0)
--    더 이상 음수가 없으므로 finalize_round 의 0-하한 클램프도 제거한다.
--  - rooms 에 game_mode('king'|'everyone'), current_questioner_id,
--    winner_player_id 를 추가한다. 뒤의 두 컬럼은 FK 를 걸지 않은 "소프트 참조"다
--    (players 행 삭제 시 FK 의 내부 트리거와 우리 트리거의 실행 순서에 의존하지
--    않기 위해 — 정합성은 handle_player_leave 트리거가 직접 관리한다).
--  - "왕 모드" 는 기존과 동일: 질문자 = 방장, target_score 도달 시 수동 승격.
--  - "다같이 모드" 는 질문자가 매 라운드 참가 순서(created_at)대로 돌아가며,
--    target_score 도달자가 나오면 즉시 게임을 종료(status='finished')한다.
--
-- 참고: 이 파일은 이전의 0008_host_handoff_and_leave.sql 이 하던 일(방장 교체 시
-- 점수 초기화, 방장 탈주 시 자동 승계)을 완전히 대체한다 — promote_host 를 다시
-- create or replace 하고, handle_player_leave 트리거가 옛 트리거/함수를 직접
-- drop 한 뒤 새로 만든다. 그래서 0008 파일은 삭제했고, 0007 다음이 바로 0009다
-- (번호 결번은 의도된 것 — 0008 이 0009 에 통합됐다).
-- (여러 번 실행해도 안전)
-- =============================================================================

do $$ begin
  create type public.room_mode as enum ('king', 'everyone');
exception when duplicate_object then null;
end $$;

alter table public.rooms
  add column if not exists game_mode public.room_mode not null default 'king';

-- 소프트 참조 (FK 없음 — 이유는 위 설명 참고)
alter table public.rooms add column if not exists current_questioner_id uuid;
alter table public.rooms add column if not exists winner_player_id uuid;

-- 답변 점수 범위: 👍(1) / 👎(0) 두 가지만 허용
-- 이전(3단계 채점) 시절에 만들어진 -1(별로) 행이 남아 있으면 새 제약을 걸 수
-- 없으므로, 그런 기존 행은 동일한 의미의 새 최저값인 0(👎)으로 먼저 옮겨준다.
update public.answers set score = 0 where score = -1;

alter table public.answers drop constraint if exists answers_score_check;
alter table public.answers add constraint answers_score_check check (score in (0, 1));

-- -----------------------------------------------------------------------------
-- collecting -> scoring : 미제출자는 이제 0점(👎)으로 채운다 (더 이상 음수 없음)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 참가 순서(created_at)상 p_current_id 다음 플레이어. 없으면(마지막이면) 맨 처음으로.
-- -----------------------------------------------------------------------------
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

grant execute on function public.next_questioner(uuid, uuid) to anon;

-- -----------------------------------------------------------------------------
-- scoring -> revealed : 점수 반영(하한 클램프 없음) + 모드별 다음 단계 결정
--   왕 모드     : status='reveal' 로만 전환. 승격은 여전히 클라이언트가
--                 promote_host 를 명시 호출(기존과 동일한 확인 버튼 흐름).
--   다같이 모드 : target_score 도달자가 있으면 즉시 status='finished' +
--                 winner_player_id 기록. 없으면 질문자를 다음 사람으로 자동
--                 회전시키고 status='reveal' 유지.
-- -----------------------------------------------------------------------------
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
    update public.rooms set status = 'reveal' where id = v_room_id;
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

-- -----------------------------------------------------------------------------
-- 왕 모드 승격: 새 방장 지정 + 점수 초기화 + current_questioner_id 동기화
-- -----------------------------------------------------------------------------
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

  update public.rooms
  set status = 'waiting',
      host_nickname = v_nickname,
      current_questioner_id = p_new_host
  where id = p_room_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 다같이 모드 재시작: 점수 초기화 + 직전 우승자부터 질문 시작 + 대기실로
-- -----------------------------------------------------------------------------
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

  select id into v_first
  from public.players where room_id = p_room_id
  order by created_at asc limit 1;

  update public.rooms
  set status = 'waiting',
      current_questioner_id = coalesce(v_winner, v_first)
  where id = p_room_id;
end;
$$;

grant execute on function public.restart_everyone_game(uuid) to anon;

-- -----------------------------------------------------------------------------
-- 플레이어 탈주 처리 (관리자 승계 + 질문자 승계, 왕/다같이 모드 공통)
-- -----------------------------------------------------------------------------
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

drop trigger if exists players_reassign_host on public.players;
drop trigger if exists players_handle_leave on public.players;
create trigger players_handle_leave
  after delete on public.players
  for each row execute function public.handle_player_leave();

-- 0008 의 옛 함수는 더 이상 쓰지 않는다 (위 트리거로 대체)
drop function if exists public.reassign_host_on_leave();
