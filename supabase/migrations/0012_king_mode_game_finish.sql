-- =============================================================================
-- 0012 : 왕 모드도 목표 점수 도달 시 "게임 종료" 화면을 거치도록 통일.
--
-- 지금까지 왕 모드는 목표 점수 도달자가 나와도 계속 reveal 화면에 머물다가,
-- 방장이 화면의 "👑 넘기기" 버튼을 눌러야만 승격이 이뤄졌다(클라이언트가
-- 도달자를 계산). 이제 다같이 모드와 동일하게 finalize_round 안에서 서버가
-- 도달자를 직접 판정해 rooms.status='finished' + winner_player_id 를 기록한다.
--
-- 결과 공개 화면(GameFinished)이 뜨고, 이후 "왕위 넘기기" 버튼을 누르면 기존
-- promote_host 가 그대로 새 방장 지정 + 점수 초기화 + 대기실 복귀를 수행한다
-- (promote_host 자체는 변경 없음 — 호출 시점만 화면 흐름상 달라진다).
-- (여러 번 실행해도 안전)
-- =============================================================================

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
