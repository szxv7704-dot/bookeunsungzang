-- 책은성장 관리자 전용 초대 발송·승인·취소 기능입니다.
-- 관리자 계정: szxv7704@gmail.com

alter table public.reading_circle_members
  add column if not exists email text;

create unique index if not exists reading_circle_members_email_unique_idx
  on public.reading_circle_members (lower(email))
  where email is not null;

create table if not exists public.reading_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists reading_invitations_email_created_idx
  on public.reading_invitations (lower(email), created_at desc);
create index if not exists reading_invitations_status_idx
  on public.reading_invitations (status, expires_at);

create table if not exists public.reading_circle_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  blocked_by uuid not null references auth.users(id) on delete cascade,
  blocked_at timestamptz not null default now()
);

alter table public.reading_invitations enable row level security;
alter table public.reading_circle_blocks enable row level security;

create or replace function public.is_reading_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'szxv7704@gmail.com';
$$;

create or replace function public.reading_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then return false; end if;
  if v_email = 'szxv7704@gmail.com' then return true; end if;
  if exists (
    select 1 from public.reading_circle_blocks blocked
    where blocked.user_id = auth.uid() or lower(coalesce(blocked.email, '')) = v_email
  ) then return false; end if;
  if exists (select 1 from public.reading_circle_members m where m.user_id = auth.uid()) then return true; end if;
  if coalesce(public.is_member(), false) then return true; end if;
  return exists (
    select 1 from public.reading_invitations i
    where lower(i.email) = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  );
end;
$$;

create or replace function public.share_candidates()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.display_name
  from public.reading_circle_members member
  join public.profiles profile on profile.id = member.user_id
  where public.reading_access()
    and profile.id <> auth.uid()
    and nullif(trim(profile.display_name), '') is not null
  order by profile.display_name;
$$;

create or replace function public.enforce_reading_circle_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.reading_access() then
    raise exception '현재 사랑방에 입장할 수 없는 계정입니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_shared_post_access on public.shared_topic_posts;
create trigger enforce_shared_post_access
before insert or update on public.shared_topic_posts
for each row execute function public.enforce_reading_circle_access();

drop trigger if exists enforce_shared_reply_access on public.shared_topic_replies;
create trigger enforce_shared_reply_access
before insert or update on public.shared_topic_replies
for each row execute function public.enforce_reading_circle_access();

create or replace function public.register_reading_circle_member()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null or not public.reading_access() then
    raise exception '초대받은 계정만 사랑방에 들어올 수 있습니다.';
  end if;

  insert into public.reading_circle_members (user_id, email)
  values (auth.uid(), nullif(v_email, ''))
  on conflict (user_id) do update set email = excluded.email;

  delete from public.reading_circle_blocks
  where user_id = auth.uid() or lower(coalesce(email, '')) = v_email;

  update public.reading_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where lower(email) = v_email
    and status = 'pending'
    and expires_at > now();

  return true;
end;
$$;

create or replace function public.accept_reading_invitation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_invitation public.reading_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Google 로그인이 필요합니다.'; end if;

  select * into v_invitation
  from public.reading_invitations
  where token = p_token
  limit 1;

  if v_invitation.id is null then raise exception '유효하지 않은 초대입니다.'; end if;
  if v_invitation.status = 'revoked' then raise exception '취소된 초대입니다.'; end if;
  if v_invitation.status = 'accepted' then
    if v_invitation.accepted_by = auth.uid() then return true; end if;
    raise exception '이미 다른 계정으로 사용된 초대입니다.';
  end if;
  if v_invitation.expires_at <= now() then
    update public.reading_invitations set status = 'expired' where id = v_invitation.id;
    raise exception '초대 유효기간이 지났습니다. 관리자에게 새 초대를 요청해 주세요.';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception '초대받은 이메일과 같은 Google 계정으로 로그인해 주세요.';
  end if;

  update public.reading_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now())
  where id = v_invitation.id;

  insert into public.reading_circle_members (user_id, email)
  values (auth.uid(), v_email)
  on conflict (user_id) do update set email = excluded.email;

  delete from public.reading_circle_blocks
  where user_id = auth.uid() or lower(coalesce(email, '')) = v_email;

  return true;
end;
$$;

create or replace function public.create_reading_invitation(p_email text)
returns table (
  id uuid,
  email text,
  token uuid,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_reading_admin() then raise exception '관리자만 초대할 수 있습니다.'; end if;
  if char_length(v_email) < 5 or position('@' in v_email) < 2 or char_length(v_email) > 320 then
    raise exception '올바른 이메일 주소를 입력해 주세요.';
  end if;
  if v_email = 'szxv7704@gmail.com' then raise exception '관리자 계정은 이미 입장할 수 있습니다.'; end if;
  if exists (select 1 from public.reading_circle_members m where lower(m.email) = v_email) then
    raise exception '이미 사랑방에 들어온 사람입니다.';
  end if;

  update public.reading_invitations i
  set status = 'revoked', revoked_at = now()
  where lower(i.email) = v_email and i.status = 'pending';

  delete from public.reading_circle_blocks
  where lower(coalesce(email, '')) = v_email;

  return query
  insert into public.reading_invitations (email, invited_by)
  values (v_email, auth.uid())
  returning reading_invitations.id, reading_invitations.email, reading_invitations.token,
            reading_invitations.status, reading_invitations.created_at, reading_invitations.expires_at;
end;
$$;

create or replace function public.list_reading_invitations()
returns table (
  id uuid,
  email text,
  token uuid,
  display_name text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_reading_admin() then raise exception '관리자만 초대 현황을 볼 수 있습니다.'; end if;

  return query
  select i.id, i.email, i.token, p.display_name,
         case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
         i.created_at, i.expires_at, i.accepted_at
  from public.reading_invitations i
  left join public.profiles p on p.id = i.accepted_by
  order by i.created_at desc;
end;
$$;

create or replace function public.list_reading_circle_members()
returns table (
  user_id uuid,
  email text,
  display_name text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_reading_admin() then raise exception '관리자만 구성원을 볼 수 있습니다.'; end if;

  return query
  select m.user_id, m.email, p.display_name, m.joined_at
  from public.reading_circle_members m
  left join public.profiles p on p.id = m.user_id
  where m.user_id <> auth.uid()
  order by m.joined_at desc;
end;
$$;

create or replace function public.revoke_reading_invitation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepted_by uuid;
  v_email text;
  v_changed boolean := false;
begin
  if not public.is_reading_admin() then raise exception '관리자만 초대를 취소할 수 있습니다.'; end if;

  select accepted_by, email into v_accepted_by, v_email
  from public.reading_invitations
  where id = p_id;

  update public.reading_invitations
  set status = 'revoked', revoked_at = now()
  where id = p_id and status <> 'revoked';
  v_changed := found;

  if v_accepted_by is not null then
    insert into public.reading_circle_blocks (user_id, email, blocked_by)
    values (v_accepted_by, v_email, auth.uid())
    on conflict (user_id) do update set email = excluded.email, blocked_by = excluded.blocked_by, blocked_at = now();
    delete from public.reading_circle_members where user_id = v_accepted_by;
    delete from public.reading_notifications where recipient_id = v_accepted_by or actor_id = v_accepted_by;
    delete from public.shared_topic_recipients where recipient_id = v_accepted_by;
    delete from public.shared_topic_posts where owner_id = v_accepted_by;
  end if;

  return v_changed;
end;
$$;

create or replace function public.remove_reading_circle_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_reading_admin() then raise exception '관리자만 구성원을 내보낼 수 있습니다.'; end if;
  if p_user_id = auth.uid() then raise exception '관리자 자신은 내보낼 수 없습니다.'; end if;

  select email into v_email from public.reading_circle_members where user_id = p_user_id;
  if not found then return false; end if;

  insert into public.reading_circle_blocks (user_id, email, blocked_by)
  values (p_user_id, v_email, auth.uid())
  on conflict (user_id) do update set email = excluded.email, blocked_by = excluded.blocked_by, blocked_at = now();

  delete from public.reading_circle_members where user_id = p_user_id;
  delete from public.reading_notifications where recipient_id = p_user_id or actor_id = p_user_id;
  delete from public.shared_topic_recipients where recipient_id = p_user_id;
  delete from public.shared_topic_posts where owner_id = p_user_id;
  update public.reading_invitations
  set status = 'revoked', revoked_at = now()
  where accepted_by = p_user_id and status <> 'revoked';
  return true;
end;
$$;

revoke all on function public.is_reading_admin() from public;
revoke all on function public.reading_access() from public;
revoke all on function public.enforce_reading_circle_access() from public;
revoke all on function public.accept_reading_invitation(uuid) from public;
revoke all on function public.create_reading_invitation(text) from public;
revoke all on function public.list_reading_invitations() from public;
revoke all on function public.list_reading_circle_members() from public;
revoke all on function public.revoke_reading_invitation(uuid) from public;
revoke all on function public.remove_reading_circle_member(uuid) from public;

grant execute on function public.is_reading_admin() to authenticated;
grant execute on function public.reading_access() to authenticated;
grant execute on function public.accept_reading_invitation(uuid) to authenticated;
grant execute on function public.create_reading_invitation(text) to authenticated;
grant execute on function public.list_reading_invitations() to authenticated;
grant execute on function public.list_reading_circle_members() to authenticated;
grant execute on function public.revoke_reading_invitation(uuid) to authenticated;
grant execute on function public.remove_reading_circle_member(uuid) to authenticated;
