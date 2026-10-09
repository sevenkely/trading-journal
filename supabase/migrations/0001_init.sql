-- =====================================================================
-- Trading Journal : schéma initial (Supabase / PostgreSQL)
-- À exécuter une seule fois dans l'éditeur SQL du projet Supabase
-- (ou via `supabase db push` si tu utilises la CLI).
-- Toutes les tables sont protégées par RLS : chacun ne voit que ses données.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profils (une ligne par utilisateur, créée automatiquement)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  default_timezone text not null default 'Indian/Antananarivo',
  default_currency text not null default 'USD' check (char_length(default_currency) = 3),
  checklist text[] not null default array[
    'Biais directionnel défini (HTF)',
    'Setup conforme à mon plan',
    'Stop-loss défini avant l’entrée',
    'Risque dans ma limite par trade',
    'Pas de news à fort impact proche',
    'État émotionnel calme'
  ]::text[],
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Comptes : personnel, challenge (évaluation) ou compte financé
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('personal', 'evaluation', 'funded')),
  status text not null default 'active' check (status in ('active', 'passed', 'failed', 'archived')),
  firm text,
  platform text,
  currency text not null default 'USD' check (char_length(currency) = 3),
  initial_balance numeric(14, 2) not null check (initial_balance > 0),
  day_timezone text not null default 'Indian/Antananarivo',
  -- Règles prop firm : le montant est prioritaire sur le pourcentage
  daily_loss_amount numeric(14, 2) check (daily_loss_amount > 0),
  daily_loss_pct numeric(6, 3) check (daily_loss_pct > 0 and daily_loss_pct <= 100),
  max_loss_amount numeric(14, 2) check (max_loss_amount > 0),
  max_loss_pct numeric(6, 3) check (max_loss_pct > 0 and max_loss_pct <= 100),
  drawdown_type text not null default 'static' check (drawdown_type in ('static', 'trailing')),
  profit_target_amount numeric(14, 2) check (profit_target_amount > 0),
  profit_target_pct numeric(6, 3) check (profit_target_pct > 0 and profit_target_pct <= 100),
  min_trading_days integer not null default 0 check (min_trading_days >= 0),
  consistency_pct numeric(5, 2) check (consistency_pct > 0 and consistency_pct <= 100),
  created_at timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------
-- 3. Imports (créés avant les trades : un trade peut pointer vers son import)
-- ---------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  source text not null check (source in ('mt5', 'ninjatrader', 'tradingview', 'csv')),
  filename text,
  rows_total integer not null default 0 check (rows_total >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  created_at timestamptz not null default now()
);

create index if not exists import_batches_user_idx on public.import_batches (user_id);

-- ---------------------------------------------------------------------
-- 4. Trades (P&L net calculé : brut − frais)
-- ---------------------------------------------------------------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  import_batch_id uuid references public.import_batches (id) on delete cascade,
  instrument text not null check (char_length(instrument) between 1 and 40),
  direction text not null check (direction in ('long', 'short')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  entry_price numeric(18, 6),
  exit_price numeric(18, 6),
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),
  size numeric(18, 6),
  risk_amount numeric(14, 2) check (risk_amount >= 0),
  gross_pnl numeric(14, 2) not null,
  -- Peut être négatif (un swap positif réduit les frais)
  fees numeric(14, 2) not null default 0,
  net_pnl numeric(14, 2) generated always as (gross_pnl - fees) stored,
  session text,
  setup text,
  timeframe text,
  emotions_before text[] not null default '{}',
  emotions_after text[] not null default '{}',
  plan_respected boolean,
  mistakes text[] not null default '{}',
  checklist_done text[] not null default '{}',
  notes text,
  tags text[] not null default '{}',
  screenshots text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'import')),
  -- Identifiant d'origine (ticket MT5, empreinte CSV) : évite les doublons à l'import
  external_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists trades_account_external_uidx
  on public.trades (account_id, external_id)
  where external_id is not null;
create index if not exists trades_user_opened_idx on public.trades (user_id, opened_at);
create index if not exists trades_batch_idx on public.trades (import_batch_id);

-- ---------------------------------------------------------------------
-- 5. Notes quotidiennes (journal : humeur, discipline, bilan)
-- ---------------------------------------------------------------------
create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  rating smallint check (rating between 1 and 5),
  plan text,
  review text,
  lessons text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------
-- 6. Fonctions et triggers
-- ---------------------------------------------------------------------

-- Crée le profil à l'inscription (ou à la première invitation acceptée)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profils des utilisateurs déjà existants (si la migration est lancée après l'inscription)
insert into public.profiles (id, display_name)
select u.id, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists daily_notes_touch on public.daily_notes;
create trigger daily_notes_touch
  before update on public.daily_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. Row Level Security : chacun ne voit que ses lignes
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.import_batches enable row level security;
alter table public.trades enable row level security;
alter table public.daily_notes enable row level security;

-- Profils
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Comptes
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated using (user_id = auth.uid());

-- Imports
drop policy if exists "import_batches_select_own" on public.import_batches;
create policy "import_batches_select_own" on public.import_batches
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "import_batches_insert_own" on public.import_batches;
create policy "import_batches_insert_own" on public.import_batches
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

drop policy if exists "import_batches_delete_own" on public.import_batches;
create policy "import_batches_delete_own" on public.import_batches
  for delete to authenticated using (user_id = auth.uid());

-- Trades : le compte rattaché doit appartenir à l'utilisateur
drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own" on public.trades
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own" on public.trades
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
    and (
      import_batch_id is null
      or exists (select 1 from public.import_batches b where b.id = import_batch_id and b.user_id = auth.uid())
    )
  );

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own" on public.trades
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own" on public.trades
  for delete to authenticated using (user_id = auth.uid());

-- Notes quotidiennes
drop policy if exists "daily_notes_select_own" on public.daily_notes;
create policy "daily_notes_select_own" on public.daily_notes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "daily_notes_insert_own" on public.daily_notes;
create policy "daily_notes_insert_own" on public.daily_notes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "daily_notes_update_own" on public.daily_notes;
create policy "daily_notes_update_own" on public.daily_notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "daily_notes_delete_own" on public.daily_notes;
create policy "daily_notes_delete_own" on public.daily_notes
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8. Stockage des captures d'écran (bucket privé)
--    Chemin des fichiers : <user_id>/<trade_id>/<fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trade-screenshots', 'trade-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "screenshots_select_own" on storage.objects;
create policy "screenshots_select_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_insert_own" on storage.objects;
create policy "screenshots_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_delete_own" on storage.objects;
create policy "screenshots_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );
