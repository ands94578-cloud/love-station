-- 寶貝的戀愛補給站：Supabase 資料庫結構
-- 用法：Supabase 專案 → SQL Editor → 貼上整份 → Run。可重複執行。
-- 執行完後，照 README「Supabase 設定」建立兩個使用者，再執行最下面的「綁定情侶」區塊。

create extension if not exists pgcrypto;

-- ── 資料表 ───────────────────────────────────────────────
create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  nickname text not null default '寶貝' check (char_length(nickname) between 1 and 20),
  anniversary date,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  couple_id uuid not null references couples on delete cascade,
  role text not null check (role in ('boyfriend','girlfriend')),
  unique (couple_id, role)
);

create table if not exists issued_coupons (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  coupon smallint not null check (coupon between 0 and 15),
  status text not null default 'available' check (status in ('available','pending','done')),
  source text not null,
  note text check (char_length(note) <= 300),
  requested_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists weekly_draws (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  coupon smallint not null,
  issued_coupon_id uuid not null references issued_coupons on delete cascade,
  created_at timestamptz not null default now(),
  unique (couple_id, user_id, week_start)
);

create table if not exists letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  author uuid not null references auth.users on delete cascade,
  author_role text not null check (author_role in ('boyfriend','girlfriend')),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  author uuid not null references auth.users on delete cascade,
  category text not null check (char_length(category) <= 20),
  body text not null check (char_length(body) between 1 and 500),
  status text not null default '已收到' check (status in ('已收到','安排中','已實現')),
  reply text check (char_length(reply) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists moods (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  author uuid not null references auth.users on delete cascade,
  mood text not null check (mood in ('開心','平靜','低落','疲累','煩躁')),
  need text not null check (char_length(need) <= 20),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  author uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  day date not null,
  body text not null check (char_length(body) between 1 and 1000),
  photo_path text,
  created_at timestamptz not null default now()
);

-- ── 目前登入者的情侶與角色 ─────────────────────────────────
create or replace function my_couple() returns uuid language sql stable security definer set search_path = public
as $$ select couple_id from profiles where id = auth.uid() $$;
create or replace function my_role() returns text language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

-- ── 權限（RLS）：只看得到自己這對情侶的資料 ─────────────────
alter table couples enable row level security;
alter table profiles enable row level security;
alter table issued_coupons enable row level security;
alter table weekly_draws enable row level security;
alter table letters enable row level security;
alter table wishes enable row level security;
alter table moods enable row level security;
alter table memories enable row level security;

drop policy if exists couple_read on couples;
create policy couple_read on couples for select to authenticated using (id = my_couple());
drop policy if exists couple_read on profiles;
create policy couple_read on profiles for select to authenticated using (couple_id = my_couple());

do $$ declare t text; begin
  foreach t in array array['issued_coupons','weekly_draws','letters','wishes','moods','memories'] loop
    execute format('drop policy if exists couple_read on %I', t);
    execute format('create policy couple_read on %I for select to authenticated using (couple_id = my_couple())', t);
  end loop;
end $$;

-- 情書、回憶：兩人都能寫；許願、心情：只有女友寫。只能新增，不能改別人的。
drop policy if exists own_insert on letters;
create policy own_insert on letters for insert to authenticated
  with check (couple_id = my_couple() and author = auth.uid() and author_role = my_role());
drop policy if exists own_insert on memories;
create policy own_insert on memories for insert to authenticated
  with check (couple_id = my_couple() and author = auth.uid());
drop policy if exists own_insert on wishes;
create policy own_insert on wishes for insert to authenticated
  with check (couple_id = my_couple() and author = auth.uid() and my_role() = 'girlfriend' and status = '已收到' and reply is null);
drop policy if exists own_insert on moods;
create policy own_insert on moods for insert to authenticated
  with check (couple_id = my_couple() and author = auth.uid() and my_role() = 'girlfriend');

-- 券、抽獎、回覆、設定只能透過下面的函式改，前端不能直接寫。

-- ── 伺服器端動作 ─────────────────────────────────────────
create or replace function require_role(want text) returns uuid language plpgsql stable security definer set search_path = public
as $$ declare c uuid; begin
  select couple_id into c from profiles where id = auth.uid() and role = want;
  if c is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return c;
end $$;

-- 每週抽獎：台北時間週一 00:00 起算，每人每週一次，由伺服器決定獎品。
create or replace function draw_weekly() returns json language plpgsql security definer set search_path = public
as $$ declare c uuid; wk date; pick smallint; cid uuid; begin
  c := require_role('girlfriend');
  wk := date_trunc('week', now() at time zone 'Asia/Taipei')::date;
  perform pg_advisory_xact_lock(hashtext(c::text || auth.uid()::text || wk::text));
  if exists (select 1 from weekly_draws where couple_id = c and user_id = auth.uid() and week_start = wk) then
    raise exception 'already_drawn' using errcode = 'P0001';
  end if;
  pick := floor(random() * 16)::smallint;
  insert into issued_coupons (couple_id, coupon, source) values (c, pick, '每週抽獎') returning id into cid;
  insert into weekly_draws (couple_id, user_id, week_start, coupon, issued_coupon_id) values (c, auth.uid(), wk, pick, cid);
  return json_build_object('couponId', pick, 'issuedCouponId', cid, 'weekStart', wk);
end $$;

create or replace function request_redeem(p_id uuid, p_note text) returns void language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := require_role('girlfriend');
  update issued_coupons set status = 'pending', note = nullif(left(p_note, 300), ''), requested_at = now()
    where id = p_id and couple_id = c and status = 'available';
  if not found then raise exception 'invalid_state' using errcode = 'P0001'; end if;
end $$;

create or replace function complete_redeem(p_id uuid) returns void language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := require_role('boyfriend');
  update issued_coupons set status = 'done', done_at = now() where id = p_id and couple_id = c and status = 'pending';
  if not found then raise exception 'invalid_state' using errcode = 'P0001'; end if;
end $$;

create or replace function gift_coupon(p_coupon smallint) returns void language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := require_role('boyfriend');
  insert into issued_coupons (couple_id, coupon, source) values (c, p_coupon, '男友的小驚喜');
end $$;

create or replace function reply_wish(p_id uuid, p_reply text, p_status text) returns void language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := require_role('boyfriend');
  update wishes set reply = left(p_reply, 300), status = p_status where id = p_id and couple_id = c;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function update_settings(p_nickname text, p_anniversary date) returns void language plpgsql security definer set search_path = public
as $$ declare c uuid; begin
  c := require_role('boyfriend');
  if p_anniversary > (now() at time zone 'Asia/Taipei')::date then raise exception 'future_date' using errcode = 'P0001'; end if;
  update couples set nickname = p_nickname, anniversary = p_anniversary where id = c;
end $$;

revoke all on function require_role(text), draw_weekly(), request_redeem(uuid, text), complete_redeem(uuid),
  gift_coupon(smallint), reply_wish(uuid, text, text), update_settings(text, date) from public, anon;
grant execute on function draw_weekly(), request_redeem(uuid, text), complete_redeem(uuid),
  gift_coupon(smallint), reply_wish(uuid, text, text), update_settings(text, date) to authenticated;

-- ── 即時同步：另一半有動作時畫面自動更新 ─────────────────────
do $$ declare t text; begin
  foreach t in array array['couples','issued_coupons','weekly_draws','letters','wishes','moods','memories'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ── 回憶照片：私人儲存空間，只有這對情侶能看 ─────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists memories_read on storage.objects;
create policy memories_read on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = my_couple()::text);
drop policy if exists memories_upload on storage.objects;
create policy memories_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = my_couple()::text);

-- ── 綁定情侶（建立兩個使用者之後執行；可重複執行）─────────────
-- 把兩個 email 換成你在 Authentication → Users 建立的帳號，取消下面的註解後按 Run。
--
-- do $$ declare bf uuid; gf uuid; c uuid; begin
--   select id into bf from auth.users where lower(email) = lower('男友的email');
--   select id into gf from auth.users where lower(email) = lower('女友的email');
--   if bf is null or gf is null then
--     raise exception '找不到登入帳號：請先在 Authentication → Users 建立男友和女友兩個帳號，再重新執行這份 SQL';
--   end if;
--   select couple_id into c from profiles where id in (bf, gf) limit 1;
--   if c is null then insert into couples (nickname) values ('寶貝') returning id into c; end if;
--   insert into profiles (id, couple_id, role) values (bf, c, 'boyfriend'), (gf, c, 'girlfriend')
--   on conflict (id) do update set couple_id = excluded.couple_id, role = excluded.role;
-- end $$;
