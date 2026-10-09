-- =====================================================================
-- Trading Journal : limites des captures d'écran (migration 0002)
-- À exécuter après 0001_init.sql. Idempotente : peut être relancée sans effet.
--
-- 1. Le bucket n'accepte que des images (PNG, JPEG, WebP) de 10 Mo au plus.
--    L'application réduit et compresse déjà les images avant l'envoi ;
--    cette limite sert de filet de sécurité côté serveur.
-- 2. Un trade ne peut pas dépasser 4 captures.
-- =====================================================================

update storage.buckets
set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'trade-screenshots';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trades_screenshots_max' and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_screenshots_max check (cardinality(screenshots) <= 4);
  end if;
end
$$;
