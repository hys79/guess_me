-- =============================================================================
-- questions_bank 에서 무작위 질문 1개를 뽑는 RPC
-- 클라이언트(anon)에서 supabase.rpc('pick_random_question') 로 호출한다.
-- 반환값은 방장 닉네임 뒤에 붙일 "뒷부분" 문장이다.
-- =============================================================================
create or replace function public.pick_random_question()
returns text
language sql
stable
as $$
  select question_text
  from public.questions_bank
  order by random()
  limit 1;
$$;

grant execute on function public.pick_random_question() to anon;
