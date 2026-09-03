-- =============================================================================
-- 0007 : rooms.answer_time_limit CHECK 범위 보정 (5~60  ->  5~100)
--
-- 초기 스키마 첫 배포본은 상한이 60 이었다. 이후 100 으로 올렸지만,
-- 이미 rooms 테이블이 만들어진 DB 에서는 `create table if not exists` 가
-- 아무 것도 바꾸지 않아 옛 제약(5~60)이 남아 있다. 그래서 제한시간을
-- 61초 이상으로 만들면 "rooms_answer_time_limit_check" 위반이 난다.
--
-- 아래는 제약을 드롭 후 재생성한다. (여러 번 실행해도 안전)
-- =============================================================================
alter table public.rooms
  drop constraint if exists rooms_answer_time_limit_check;

alter table public.rooms
  add constraint rooms_answer_time_limit_check
  check (answer_time_limit between 5 and 100);
