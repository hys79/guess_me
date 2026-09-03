-- =============================================================================
-- 0008
--  1) promote_host : 목표 점수 도달로 방장을 넘길 때 모든 플레이어 누적 점수를 0 으로 초기화
--  2) 방장이 방을 나가면(players 행 삭제) 남은 사람 중 최고 점수(동점이면 랜덤)를
--     새 방장으로 지정하고 대기실로 되돌리는 트리거
-- (여러 번 실행해도 안전)
-- =============================================================================

-- 1) 방장 교체 + 점수 초기화 -------------------------------------------------
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

  -- 새 라운드 시즌 시작: 누적 점수 전원 초기화
  update public.players set score = 0
  where room_id = p_room_id;

  update public.rooms
  set status = 'waiting', host_nickname = v_nickname
  where id = p_room_id;
end;
$$;

grant execute on function public.promote_host(uuid, uuid) to anon;

-- 2) 방장 탈주 시 자동 승계 -------------------------------------------------
create or replace function public.reassign_host_on_leave()
returns trigger
language plpgsql
as $$
declare
  v_new_host uuid;
begin
  -- 나간 사람이 방장이 아니면 아무 것도 하지 않는다
  if not old.is_host then
    return old;
  end if;

  -- 남은 사람 중 최고 점수, 동점이면 랜덤
  select id into v_new_host
  from public.players
  where room_id = old.room_id
  order by score desc, random()
  limit 1;

  if v_new_host is null then
    return old; -- 방에 아무도 안 남음
  end if;

  update public.players set is_host = true where id = v_new_host;

  -- 방장이 빠지면 진행 중이던 라운드는 (target_player_id FK on delete cascade 로)
  -- 이미 삭제되었으므로 대기실로 되돌린다.
  update public.rooms
  set status = 'waiting',
      host_nickname = (select nickname from public.players where id = v_new_host)
  where id = old.room_id;

  return old;
end;
$$;

drop trigger if exists players_reassign_host on public.players;
create trigger players_reassign_host
  after delete on public.players
  for each row execute function public.reassign_host_on_leave();
