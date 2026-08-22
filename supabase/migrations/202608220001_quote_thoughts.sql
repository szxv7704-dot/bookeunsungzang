-- 기존 books/quotes 데이터에는 손대지 않는 추가 마이그레이션입니다.
create table if not exists public.quote_thoughts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 20000),
  source text not null default 'revisit' check (source in ('revisit', 'ai', 'sarangbang', 'reader', 'life')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_thoughts_quote_id_created_at_idx
  on public.quote_thoughts (quote_id, created_at);
create index if not exists quote_thoughts_user_id_idx
  on public.quote_thoughts (user_id);

alter table public.quote_thoughts enable row level security;

drop policy if exists "quote_thoughts_select_own" on public.quote_thoughts;
create policy "quote_thoughts_select_own"
  on public.quote_thoughts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "quote_thoughts_insert_own" on public.quote_thoughts;
create policy "quote_thoughts_insert_own"
  on public.quote_thoughts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "quote_thoughts_update_own" on public.quote_thoughts;
create policy "quote_thoughts_update_own"
  on public.quote_thoughts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "quote_thoughts_delete_own" on public.quote_thoughts;
create policy "quote_thoughts_delete_own"
  on public.quote_thoughts for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.preserve_quote_thought_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.quote_id := old.quote_id;
  new.book_id := old.book_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists preserve_quote_thought_identity_trigger on public.quote_thoughts;
create trigger preserve_quote_thought_identity_trigger
before update on public.quote_thoughts
for each row execute function public.preserve_quote_thought_identity();

grant select, insert, update, delete on public.quote_thoughts to authenticated;

-- 사랑방 화면을 열어둔 동안 새 생각이 갱신될 수 있도록 Realtime에 추가합니다.
do $$
begin
  alter publication supabase_realtime add table public.quote_thoughts;
exception
  when duplicate_object then null;
end $$;
