-- =============================================================================
-- 0006
--  1) answers.is_editing : 참여자가 "수정 중" 임을 표시 (수집 단계 자동 마감 억제용)
--  2) advance_to_scoring : 시간 초과로 자동 생성되는 빈 답변에 -1 페널티 부여,
--     그리고 남아 있는 is_editing 플래그를 정리
-- (여러 번 실행해도 안전)
-- =============================================================================

alter table public.answers
  add column if not exists is_editing boolean not null default false;

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

  -- 미제출자(방장 제외)는 빈 답변으로 채우고 즉시 -1점(페널티) 처리
  insert into public.answers (round_id, player_id, answer_text, score)
  select p_round_id, pl.id, '', -1
  from public.players pl
  where pl.room_id = v_room_id
    and pl.is_host = false
    and not exists (
      select 1 from public.answers a
      where a.round_id = p_round_id and a.player_id = pl.id
    );

  -- 채점 단계로 넘어가면 "수정 중" 상태는 의미가 없으므로 정리
  update public.answers set is_editing = false
  where round_id = p_round_id and is_editing;

  update public.rounds set status = 'scoring' where id = p_round_id;
  update public.rooms  set status = 'scoring' where id = v_room_id;
end;
$$;

grant execute on function public.advance_to_scoring(uuid) to anon;
