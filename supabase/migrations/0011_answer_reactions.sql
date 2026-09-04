-- =============================================================================
-- 0011 : 답변 리액션 (결과 공개 화면에서 이모지로 반응)
--
-- 공개(reveal) 단계에서 모든 참가자가 각 답변에 이모지 하나씩 반응을 남길 수
-- 있다. 사람당 답변 하나에 반응은 최대 1개(다른 이모지를 누르면 바꿔치기,
-- 같은 걸 다시 누르면 취소) — upsert/delete 로 클라이언트가 직접 관리한다.
--
-- 이모지는 😆 웃겨요 / 😮 놀랐어요 / 👏 인정해요 세 가지만 허용한다.
-- =============================================================================

create table if not exists public.answer_reactions (
  id         uuid        primary key default gen_random_uuid(),
  round_id   uuid        not null references public.rounds  (id) on delete cascade,
  answer_id  uuid        not null references public.answers (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  emoji      text        not null check (emoji in ('😆', '😮', '👏')),
  created_at timestamptz not null default now(),
  unique (answer_id, player_id)
);

comment on table public.answer_reactions is
  '결과 공개 화면에서 참가자가 답변에 남기는 이모지 반응. 사람당 답변 하나에 1개.';

create index if not exists answer_reactions_round_id_idx  on public.answer_reactions (round_id);
create index if not exists answer_reactions_answer_id_idx on public.answer_reactions (answer_id);

alter table public.answer_reactions enable row level security;

drop policy if exists "anon full access - answer_reactions" on public.answer_reactions;
create policy "anon full access - answer_reactions"
  on public.answer_reactions for all to anon using (true) with check (true);

alter table public.answer_reactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'answer_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.answer_reactions';
  end if;
end $$;

-- 이 테이블을 예전에(5종 이모지로) 이미 만들어 둔 DB 를 위한 보정.
-- 새로 만든 테이블에는 해당하는 행이 없으므로 아무 일도 하지 않는다.
-- *** 이 UPDATE 들을 지우면 안 된다 *** — 아래 CHECK 제약이 기존 5종 이모지
-- 행과 충돌해서, 점수를 -1 -> 0 으로 옮길 때와 똑같은 이유로 실행이 실패한다.
update public.answer_reactions set emoji = '😆' where emoji = '😂';
update public.answer_reactions set emoji = '😮' where emoji = '😲';
update public.answer_reactions set emoji = '👏' where emoji in ('😍', '😭');

alter table public.answer_reactions drop constraint if exists answer_reactions_emoji_check;
alter table public.answer_reactions
  add constraint answer_reactions_emoji_check check (emoji in ('😆', '😮', '👏'));
