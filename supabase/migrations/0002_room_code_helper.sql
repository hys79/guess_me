-- =============================================================================
-- 참가용 방 코드 자동 생성 헬퍼
-- 헷갈리는 글자(0/O, 1/I) 를 제외한 4자리 코드. 충돌 시 재시도.
-- =============================================================================
create or replace function public.gen_room_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- code 를 넘기지 않으면 자동 생성
alter table public.rooms
  alter column code set default public.gen_room_code();
