-- =============================================================================
-- 0002 : 방치된 방 자동 정리 (pg_cron TTL 스윕)
--
-- 마지막 활동(rooms.last_active_at, 없으면 created_at)이 2시간을 넘긴 방을
-- 15분마다 삭제한다. players / rounds / answers / answer_reactions 는 FK
-- on delete cascade 로 함께 지워진다.
--
-- 2시간은 넉넉하다 — 이 게임을 그보다 오래 이어서 하는 경우는 거의 없고,
-- 게임 중에는 라운드/답변 트리거가 last_active_at 를 계속 갱신하므로
-- "진행 중인 방"이 잘려 나갈 일은 없다.
--
-- 이 파일은 0001_schema.sql 과 달리 pg_cron 확장이 필요하다. Supabase 에서
-- create extension 이 권한 문제로 막히면 대시보드 Database → Extensions 에서
-- "pg_cron" 을 켠 뒤 이 파일을 다시 실행한다. (여러 번 실행해도 안전)
-- =============================================================================

create extension if not exists pg_cron;

-- 재실행 대비: 같은 이름의 잡이 이미 있으면 먼저 해제
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-stale-rooms') then
    perform cron.unschedule('cleanup-stale-rooms');
  end if;
end $$;

select cron.schedule(
  'cleanup-stale-rooms',
  '*/15 * * * *',
  $$
    delete from public.rooms
    where coalesce(last_active_at, created_at) < now() - interval '2 hours'
  $$
);
