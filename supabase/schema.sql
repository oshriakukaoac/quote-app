-- ===== סכמת מסד הנתונים ל-Supabase (Postgres) =====
-- מריצים את כל הקובץ הזה פעם אחת ב-Supabase: לוח הבקרה של הפרויקט ← SQL Editor ← New query ← להדביק ולהריץ (Run).
-- כל טבלה קשורה למשתמש (user_id) עם Row Level Security, כך שכל משתמש רואה רק את הנתונים שלו.

-- ---- לקוחות ----
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tax_id text,
  address text,
  phone text,
  email text,
  contact text,
  created_at timestamptz not null default now()
);
alter table customers enable row level security;
create policy "customers_owner" on customers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- מוצרים ושירותים (קטלוג המכירה) ----
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  supplier text,
  supplier_price numeric default 0,
  cost_price numeric default 0,
  margin_percent numeric default 30,
  sale_price numeric default 0,
  favorite boolean default false,
  mkt jsonb default '{}'::jsonb, -- {title, intro, specs[], audience, closing}
  created_at timestamptz not null default now()
);
alter table products enable row level security;
create policy "products_owner" on products for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- הצעות מחיר ----
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  number integer,
  status text not null default 'draft', -- 'draft' | 'final'
  customer_id uuid references customers(id) on delete set null,
  date date not null default current_date,
  items jsonb not null default '[]'::jsonb, -- [{id,productId,name,qty,unitPrice}]
  discount_type text not null default 'fixed', -- 'fixed' | 'percent'
  discount_value numeric default 0,
  vat_percent numeric default 18,
  notes text,
  finbot_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table quotes enable row level security;
create policy "quotes_owner" on quotes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- מאגר מחירי ספקים (ייבוא ממחירונים חיצוניים) ----
create table if not exists supplier_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier text not null,
  supplier_sku text,
  mfr_sku text,
  description text,
  cost numeric default 0,
  category text,
  manufacturer text,
  availability text,
  image_url text,
  imported_at timestamptz not null default now()
);
alter table supplier_prices enable row level security;
create policy "supplier_prices_owner" on supplier_prices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists supplier_prices_search_idx on supplier_prices
  using gin (to_tsvector('simple', coalesce(supplier_sku,'') || ' ' || coalesce(mfr_sku,'') || ' ' || coalesce(description,'')));

-- ---- הגדרות (שורה אחת למשתמש) ----
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text default 'אקוקה מחשוב וגרפיקה',
  tax_id text default '052863172',
  address text default 'רחוב גפן 11, חריש',
  phone text default '0587500070',
  email text default 'oshri08@gmail.com',
  website text default 'www.oac.co.il',
  tagline text default 'OAC – שירותי מחשוב וענן',
  logo_text text default 'OAC',
  default_vat numeric default 18,
  default_margin numeric default 30,
  next_quote_number integer default 80157,
  finbot_api_key text default ''
);
alter table settings enable row level security;
create policy "settings_owner" on settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- יוצר אוטומטית שורת הגדרות ברירת מחדל לכל משתמש חדש שנרשם
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
