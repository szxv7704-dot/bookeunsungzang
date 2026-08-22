-- 개인 서재의 기록과 사랑방 공유를 분리하는 추가 마이그레이션입니다.
-- 공유 시점의 주제·근거·의견을 별도 사본으로 보관하므로 이후의 비공개 수정은 자동 공개되지 않습니다.
-- 기존 books, topics, messages, quotes 행은 수정하거나 삭제하지 않습니다.

create table if not exists public.reading_circle_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.shared_topic_posts (
  id uuid primary key default gen_random_uuid(),
  source_topic_id uuid not null references public.topics(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text,
  keyword text,
  unresolved text,
  apply_note text,
  evidence jsonb not null default '[]'::jsonb,
  initial_opinions jsonb not null default '[]'::jsonb,
  message text check (message is null or char_length(message) <= 2000),
  shared_at timestamptz not null default now(),
  unique (source_topic_id, owner_id)
);

create index if not exists shared_topic_posts_owner_book_idx
  on public.shared_topic_posts (owner_id, book_id, shared_at desc);

create table if not exists public.shared_topic_recipients (
  post_id uuid not null references public.shared_topic_posts(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (post_id, recipient_id)
);

create index if not exists shared_topic_recipients_recipient_idx
  on public.shared_topic_recipients (recipient_id, shared_at desc);

create table if not exists public.shared_topic_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.shared_topic_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index if not exists shared_topic_replies_post_created_idx
  on public.shared_topic_replies (post_id, created_at);

create table if not exists public.reading_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null,
  book_id uuid not null references public.books(id) on delete cascade,
  book_title text not null,
  topic_id uuid not null references public.shared_topic_posts(id) on delete cascade,
  topic_title text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reading_notifications_recipient_created_idx
  on public.reading_notifications (recipient_id, created_at desc);

alter table public.reading_circle_members enable row level security;
alter table public.shared_topic_posts enable row level security;
alter table public.shared_topic_recipients enable row level security;
alter table public.shared_topic_replies enable row level security;
alter table public.reading_notifications enable row level security;

-- 공유 본문·수신자·답변은 보안 함수를 통해서만 읽고 씁니다.
-- 직접 테이블 권한을 열지 않아 선택하지 않은 사람의 우회 조회를 막습니다.

drop policy if exists "reading_notifications_select_own" on public.reading_notifications;
create policy "reading_notifications_select_own"
  on public.reading_notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "reading_notifications_update_own" on public.reading_notifications;
create policy "reading_notifications_update_own"
  on public.reading_notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function public.register_reading_circle_member()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not coalesce(public.is_member(), false) then
    raise exception '초대받은 계정만 사랑방에 들어올 수 있습니다.';
  end if;
  insert into public.reading_circle_members (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;
  return true;
end;
$$;

create or replace function public.share_candidates()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.reading_circle_members member
  join public.profiles p on p.id = member.user_id
  where p.id <> auth.uid()
    and nullif(trim(p.display_name), '') is not null
  order by p.display_name;
$$;

create or replace function public.share_topics(
  p_topic_ids uuid[],
  p_recipient_ids uuid[],
  p_message text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_owner_name text;
  v_topic record;
  v_post_id uuid;
  v_evidence jsonb;
  v_opinions jsonb;
begin
  if v_owner_id is null then raise exception '로그인이 필요합니다.'; end if;
  if coalesce(cardinality(p_topic_ids), 0) = 0 then raise exception '공유할 주제를 골라주세요.'; end if;
  if coalesce(cardinality(p_recipient_ids), 0) = 0 then raise exception '공유할 사람을 골라주세요.'; end if;
  if char_length(coalesce(p_message, '')) > 2000 then raise exception '함께 전할 말은 2000자 이내로 적어주세요.'; end if;

  if exists (
    select 1
    from unnest(p_topic_ids) as requested(topic_id)
    left join public.topics t on t.id = requested.topic_id
    left join public.books b on b.id = t.book_id
    where t.id is null or b.user_id <> v_owner_id
  ) then raise exception '내 서재의 주제만 공유할 수 있습니다.'; end if;

  if exists (
    select 1
    from unnest(p_recipient_ids) as requested(recipient_id)
    left join public.reading_circle_members member on member.user_id = requested.recipient_id
    where member.user_id is null or requested.recipient_id = v_owner_id
  ) then raise exception '사랑방 구성원만 선택할 수 있습니다.'; end if;

  select coalesce(nullif(trim(p.display_name), ''), '독자') into v_owner_name
  from public.profiles p where p.id = v_owner_id;

  for v_topic in
    select t.* from public.topics t
    join public.books b on b.id = t.book_id
    where t.id = any(p_topic_ids) and b.user_id = v_owner_id
    order by t.order_no
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object('id', q.id, 'page', q.page, 'content', q.content)
      order by q.created_at
    ), '[]'::jsonb) into v_evidence
    from public.topic_quotes tq
    join public.quotes q on q.id = tq.quote_id
    where tq.topic_id = v_topic.id;

    select coalesce(jsonb_agg(
      jsonb_build_object('id', o.id, 'user_id', o.user_id, 'author_name', o.author_name, 'content', o.content, 'created_at', o.created_at)
      order by o.created_at
    ), '[]'::jsonb) into v_opinions
    from public.topic_opinions o
    where o.topic_id = v_topic.id;

    insert into public.shared_topic_posts (
      source_topic_id, book_id, owner_id, title, summary, keyword, unresolved,
      apply_note, evidence, initial_opinions, message, shared_at
    ) values (
      v_topic.id, v_topic.book_id, v_owner_id, v_topic.title, v_topic.summary,
      v_topic.keyword, v_topic.unresolved, v_topic.apply_note, v_evidence,
      v_opinions, nullif(trim(p_message), ''), now()
    )
    on conflict (source_topic_id, owner_id) do update set
      title = excluded.title,
      summary = excluded.summary,
      keyword = excluded.keyword,
      unresolved = excluded.unresolved,
      apply_note = excluded.apply_note,
      evidence = excluded.evidence,
      initial_opinions = excluded.initial_opinions,
      message = excluded.message,
      shared_at = excluded.shared_at
    returning id into v_post_id;

    delete from public.reading_notifications n
    where n.actor_id = v_owner_id
      and n.topic_id = v_post_id
      and not (n.recipient_id = any(p_recipient_ids));

    delete from public.shared_topic_recipients r
    where r.post_id = v_post_id
      and not (r.recipient_id = any(p_recipient_ids));

    insert into public.shared_topic_recipients (post_id, recipient_id, shared_at)
    select v_post_id, recipients.recipient_id, now()
    from unnest(p_recipient_ids) as recipients(recipient_id)
    on conflict (post_id, recipient_id) do update set shared_at = excluded.shared_at;

    delete from public.reading_notifications n
    where n.recipient_id = any(p_recipient_ids)
      and n.actor_id = v_owner_id
      and n.topic_id = v_post_id
      and n.read_at is null;

    insert into public.reading_notifications (
      recipient_id, actor_id, actor_name, book_id, book_title, topic_id, topic_title
    )
    select recipients.recipient_id, v_owner_id, coalesce(v_owner_name, '독자'),
           v_topic.book_id, b.title, v_post_id, v_topic.title
    from unnest(p_recipient_ids) as recipients(recipient_id)
    join public.books b on b.id = v_topic.book_id;
  end loop;

  return cardinality(p_recipient_ids);
end;
$$;

create or replace function public.my_sarangbang()
returns table (
  id uuid,
  title text,
  author text,
  cover_url text,
  owner_name text,
  is_mine boolean,
  topic_count bigint,
  newest_shared_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.title, b.author, b.cover_url,
         coalesce(nullif(trim(profile.display_name), ''), '독자') as owner_name,
         (post.owner_id = auth.uid()) as is_mine,
         count(distinct post.id) as topic_count,
         max(post.shared_at) as newest_shared_at
  from public.shared_topic_posts post
  join public.books b on b.id = post.book_id
  join public.profiles profile on profile.id = post.owner_id
  where post.owner_id = auth.uid()
     or exists (
       select 1 from public.shared_topic_recipients recipient
       where recipient.post_id = post.id and recipient.recipient_id = auth.uid()
     )
  group by b.id, b.title, b.author, b.cover_url, profile.display_name, post.owner_id
  order by max(post.shared_at) desc;
$$;

create or replace function public.open_selective_shared_book(p_book_id uuid)
returns table (
  id uuid,
  title text,
  author text,
  cover_url text,
  owner_name text,
  is_mine boolean,
  share_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.title, b.author, b.cover_url,
         coalesce(nullif(trim(profile.display_name), ''), '독자') as owner_name,
         (post.owner_id = auth.uid()) as is_mine,
         (array_agg(post.message order by post.shared_at desc) filter (where post.message is not null))[1] as share_note
  from public.shared_topic_posts post
  join public.books b on b.id = post.book_id
  join public.profiles profile on profile.id = post.owner_id
  where post.book_id = p_book_id
    and (
      post.owner_id = auth.uid()
      or exists (
        select 1 from public.shared_topic_recipients recipient
        where recipient.post_id = post.id and recipient.recipient_id = auth.uid()
      )
    )
  group by b.id, b.title, b.author, b.cover_url, profile.display_name, post.owner_id;
$$;

create or replace function public.shared_topics(p_book_id uuid)
returns table (
  id uuid,
  title text,
  summary text,
  keyword text,
  unresolved text,
  apply_note text,
  evidence jsonb,
  opinions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select post.id, post.title, post.summary, post.keyword, post.unresolved, post.apply_note,
         post.evidence,
         post.initial_opinions || coalesce((
           select jsonb_agg(jsonb_build_object(
             'id', reply.id,
             'user_id', reply.user_id,
             'author_name', reply.author_name,
             'content', reply.content,
             'created_at', reply.created_at
           ) order by reply.created_at)
           from public.shared_topic_replies reply
           where reply.post_id = post.id
         ), '[]'::jsonb) as opinions
  from public.shared_topic_posts post
  where post.book_id = p_book_id
    and (
      post.owner_id = auth.uid()
      or exists (
        select 1 from public.shared_topic_recipients recipient
        where recipient.post_id = post.id and recipient.recipient_id = auth.uid()
      )
    )
  order by post.shared_at;
$$;

create or replace function public.add_shared_opinion(p_topic_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if nullif(trim(p_content), '') is null then raise exception '생각을 적어주세요.'; end if;
  if char_length(trim(p_content)) > 20000 then raise exception '생각은 20000자 이내로 적어주세요.'; end if;
  if not exists (
    select 1 from public.shared_topic_posts post
    where post.id = p_topic_id
      and (
        post.owner_id = auth.uid()
        or exists (
          select 1 from public.shared_topic_recipients recipient
          where recipient.post_id = post.id and recipient.recipient_id = auth.uid()
        )
      )
  ) then raise exception '공유받은 주제에만 답할 수 있습니다.'; end if;

  select coalesce(nullif(trim(p.display_name), ''), '독자') into v_name
  from public.profiles p where p.id = auth.uid();

  insert into public.shared_topic_replies (post_id, author_name, content)
  values (p_topic_id, coalesce(v_name, '독자'), trim(p_content))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.register_reading_circle_member() from public;
revoke all on function public.share_candidates() from public;
revoke all on function public.share_topics(uuid[], uuid[], text) from public;
revoke all on function public.my_sarangbang() from public;
revoke all on function public.open_selective_shared_book(uuid) from public;
revoke all on function public.shared_topics(uuid) from public;
revoke all on function public.add_shared_opinion(uuid, text) from public;

grant execute on function public.register_reading_circle_member() to authenticated;
grant execute on function public.share_candidates() to authenticated;
grant execute on function public.share_topics(uuid[], uuid[], text) to authenticated;
grant execute on function public.my_sarangbang() to authenticated;
grant execute on function public.open_selective_shared_book(uuid) to authenticated;
grant execute on function public.shared_topics(uuid) to authenticated;
grant execute on function public.add_shared_opinion(uuid, text) to authenticated;
grant select, update on public.reading_notifications to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.reading_notifications;
exception
  when duplicate_object then null;
end $$;
