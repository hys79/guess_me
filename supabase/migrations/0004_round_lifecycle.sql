-- =============================================================================
-- 라운드 진행 상태 전환 RPC
--   collecting --advance_to_scoring--> scoring --finalize_round--> revealed
--   revealed  --promote_host--> (대기실, 새 방장)
--
-- 모든 함수는 라운드 row 를 FOR UPDATE 로 잠그고 현재 status 를 확인한 뒤에만
-- 동작하므로, 여러 클라이언트가 동시에 호출해도 실제 전환은 한 번만 일어난다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- collecting -> scoring
-- 미제출자(방장 제외)는 빈 답변('')으로 채운 뒤 채점 단계로 넘어간다.
-- -----------------------------------------------------------------------------
create or replace function public.advance_to_scoring(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
  v_status  round_status;
begin
  select room_id, status into v_room_id, v_status
  from public.rounds
  where id = p_round_id
  for update;

  if not found or v_status <> 'collecting' then
    return;
  end if;

  insert into public.answers (round_id, player_id, answer_text)
  select p_round_id, pl.id, ''
  from public.players pl
  where pl.room_id = v_room_id
    and pl.is_host = false
    and not exists (
      select 1 from public.answers a
      where a.round_id = p_round_id and a.player_id = pl.id
    );

  update public.rounds set status = 'scoring' where id = p_round_id;
  update public.rooms  set status = 'scoring' where id = v_room_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- scoring -> revealed
-- 모든 답변에 점수가 매겨졌을 때만: 플레이어 누적 점수에 이번 라운드 점수를
-- 더하고, 라운드/방 상태를 공개 단계로 전환한다.
-- -----------------------------------------------------------------------------
create or replace function public.finalize_round(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_room_id  uuid;
  v_status   round_status;
  v_unscored int;
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
  update public.rooms  set status = 'reveal'   where id = v_room_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 새 방장 지정 + 대기실 복귀
-- (target_score 도달자를 새 방장으로 넘길 때 호출)
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

  update public.rooms
  set status = 'waiting', host_nickname = v_nickname
  where id = p_room_id;
end;
$$;

grant execute on function public.advance_to_scoring(uuid) to anon;
grant execute on function public.finalize_round(uuid)     to anon;
grant execute on function public.promote_host(uuid, uuid) to anon;
