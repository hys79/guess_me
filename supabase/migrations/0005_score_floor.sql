-- =============================================================================
-- 플레이어 누적 점수가 0 밑으로 내려가지 않도록 finalize_round 를 갱신한다.
-- (create or replace 이므로 여러 번 실행해도 안전)
-- =============================================================================
create or replace function public.finalize_round(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_room_id  uuid;
  v_status   public.round_status;
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

  -- greatest(0, ...) 로 하한을 0 으로 고정
  update public.players p
  set score = greatest(0, p.score + agg.delta)
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

grant execute on function public.finalize_round(uuid) to anon;
