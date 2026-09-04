-- =============================================================================
-- 0011 : 다같이 모드 "다시 시작" 시 대기실을 거치지 않고 바로 게임 화면으로.
--
-- 지금까지는 restart_everyone_game 이 rooms.status 를 'waiting' 으로 돌려놔서
-- 방장이 "게임 시작" 버튼을 한 번 더 눌러야 새 게임이 실제로 시작됐다.
-- 이제 곧바로 'question' 으로 전환해, 새 질문자(직전 우승자)가 바로 질문을
-- 보낼 수 있는 화면으로 넘어가게 한다. (왕 모드의 promote_host 는 기존 설계
-- 그대로 대기실로 돌아간다 — 변경하지 않음)
-- (여러 번 실행해도 안전)
-- =============================================================================

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
  set status = 'question',
      current_questioner_id = coalesce(v_winner, v_first)
  where id = p_room_id;
end;
$$;
