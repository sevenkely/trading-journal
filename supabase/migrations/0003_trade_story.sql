-- =====================================================================
-- Trading Journal : le dossier de trade (migration 0003)
-- À exécuter après 0002_screenshots_limits.sql. Idempotente.
--
-- Un trade ne se résume plus à un montant : il raconte une décision.
--   1. `setups` : bibliothèque réutilisable (le même setup, écrit une fois).
--   2. `media` : les captures deviennent typées (contexte HTF, déclencheur
--      LTF, résultat) au lieu d'une galerie sans ordre.
--   3. `thesis` / `invalidation` / `verdict` / `confluences` : la raison
--      d'entrer, ce qui l'aurait contredite, et ce qu'il en est advenu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bibliothèque de setups
-- ---------------------------------------------------------------------
create table if not exists public.setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  -- Condition de contexte attendue (ex. « H4 sous le VWAP, biais vendeur »)
  htf text,
  -- Ce qui invalide le setup avant même l'entrée
  invalidation text,
  checklist text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists setups_user_idx on public.setups (user_id, name);

-- ---------------------------------------------------------------------
-- 2. Le dossier de trade
-- ---------------------------------------------------------------------
alter table public.trades
  add column if not exists setup_id uuid references public.setups (id) on delete set null,
  add column if not exists thesis text,
  add column if not exists invalidation text,
  add column if not exists verdict text,
  add column if not exists confluences text[] not null default '{}',
  add column if not exists media jsonb not null default '[]';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trades_verdict_check' and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_verdict_check
      check (
        verdict is null
        or verdict in ('played_out', 'invalidated', 'early_exit', 'late_exit', 'no_plan')
      );
  end if;
end
$$;

create index if not exists trades_setup_idx on public.trades (setup_id);

-- ---------------------------------------------------------------------
-- 3. Reprise des captures existantes
-- Les quatre emplacements de la galerie plate deviennent, dans l'ordre,
-- le contexte, le déclencheur, puis le résultat.
-- ---------------------------------------------------------------------
update public.trades t
set media = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'path', shot.path,
        'role', case shot.position when 1 then 'htf' when 2 then 'ltf' else 'result' end,
        'caption', null
      )
      order by shot.position
    )
    from unnest(t.screenshots) with ordinality as shot (path, position)
  ),
  '[]'::jsonb
)
where cardinality(t.screenshots) > 0
  and t.media = '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 4. La galerie plate disparaît (remplacée par `media`)
-- ---------------------------------------------------------------------
alter table public.trades drop constraint if exists trades_screenshots_max;
alter table public.trades drop column if exists screenshots;

-- La limite de 4 images reste dans l'application (MAX_SCREENSHOTS), qui
-- connaît désormais le rôle de chaque fichier.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trades_media_max' and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_media_max check (jsonb_array_length(media) <= 4);
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Row Level Security : chacun ne voit que ses setups
-- ---------------------------------------------------------------------
alter table public.setups enable row level security;

drop policy if exists "setups_select_own" on public.setups;
create policy "setups_select_own" on public.setups
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "setups_insert_own" on public.setups;
create policy "setups_insert_own" on public.setups
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "setups_update_own" on public.setups;
create policy "setups_update_own" on public.setups
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "setups_delete_own" on public.setups;
create policy "setups_delete_own" on public.setups
  for delete to authenticated using (user_id = auth.uid());

drop trigger if exists setups_touch on public.setups;
create trigger setups_touch
  before update on public.setups
  for each row execute function public.touch_updated_at();
