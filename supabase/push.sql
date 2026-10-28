-- 寶貝的戀愛補給站：手機推播＋情書按讚
-- 用法：Supabase → SQL Editor → 貼上整份 → Run。可重複執行。需要先執行過 schema.sql。

-- 每支手機（或瀏覽器）的推播地址
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  couple_id uuid not null references couples on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
-- 不開放直接讀寫；只能透過下面三個函式。

-- 這支手機開啟通知時呼叫
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := my_couple();
  if c is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'invalid_endpoint' using errcode = 'P0001'; end if;
  insert into push_subscriptions (endpoint, user_id, couple_id, p256dh, auth)
  values (p_endpoint, auth.uid(), c, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, couple_id = excluded.couple_id,
    p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- 登出或推播地址失效時呼叫
create or replace function remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public
as $$ delete from push_subscriptions where endpoint = p_endpoint and couple_id = my_couple() $$;

-- 推播函式用：只回傳「另一半」的推播地址
create or replace function partner_push_subscriptions() returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public
as $$ select endpoint, p256dh, auth from push_subscriptions
      where couple_id = my_couple() and user_id <> auth.uid() $$;

revoke all on function save_push_subscription(text, text, text), remove_push_subscription(text), partner_push_subscriptions() from public, anon;
grant execute on function save_push_subscription(text, text, text), remove_push_subscription(text), partner_push_subscriptions() to authenticated;

-- ───────── 悄悄情書：按讚 ─────────
-- 收信的人才能按（或收回）喜歡；寫信的人看得到對方有沒有按。
alter table letters add column if not exists liked_at timestamptz;

create or replace function toggle_letter_like(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = public
as $$ declare t timestamptz; begin
  update letters set liked_at = case when liked_at is null then now() else null end
   where id = p_id and couple_id = my_couple() and author <> auth.uid()
  returning liked_at into t;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return t;
end $$;

revoke all on function toggle_letter_like(uuid) from public, anon;
grant execute on function toggle_letter_like(uuid) to authenticated;
