-- =============================================================================
-- 0010 : "새 게임 시작" 시 이전 게임의 라운드를 정리한다.
--
-- 버그: 다같이 모드에서 우승자가 나와 게임이 끝난 뒤 방장이 "다시 시작"을
-- 누르면 점수/차례는 초기화되지만, 방금 끝난 게임의 마지막 라운드(rounds 행)가
-- 그대로 남아 있었다. 클라이언트는 "가장 최근 라운드"를 화면에 표시하므로,
-- 재시작 후에도 이전 게임의 공개(reveal) 결과 화면이 계속 보이고 새 질문을
-- 보내는 패널이 그 아래 파묻혀 나타나 "멈춘 것처럼" 보였다. (왕 모드의 방장
-- 교체 때도 같은 문제가 잠재해 있었다 — 같이 고친다.)
--
-- 해결: 새 게임을 시작하는 두 지점(promote_host, restart_everyone_game)에서
-- 그 방의 rounds 를 모두 삭제한다. answers 는 rounds 에 FK(on delete cascade)
-- 로 걸려 있어 함께 정리된다. 이 게임에는 라운드 히스토리를 보여주는 화면이
-- 없으므로 삭제해도 안전하다.
-- (여러 번 실행해도 안전)
-- =============================================================================

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

  -- 이전 게임의 라운드/답변 정리 (answers 는 cascade)
  delete from public.rounds where room_id = p_room_id;

  update public.rooms
  set status = 'waiting',
      host_nickname = v_nickname,
      current_questioner_id = p_new_host
  where id = p_room_id;
end;
$$;

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

  -- 이전 게임의 라운드/답변 정리 (answers 는 cascade)
  delete from public.rounds where room_id = p_room_id;

  select id into v_first
  from public.players where room_id = p_room_id
  order by created_at asc limit 1;

  update public.rooms
  set status = 'waiting',
      current_questioner_id = coalesce(v_winner, v_first)
  where id = p_room_id;
end;
$$;
