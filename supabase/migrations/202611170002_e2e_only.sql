-- Облако принимает только зашифрованные на устройстве снимки (формат opora-e2e).
-- NOT VALID: ограничение действует для новых и изменяемых строк и не ломает уже существующие.
alter table public.opora_snapshots
  drop constraint if exists opora_snapshots_e2e_only;
alter table public.opora_snapshots
  add constraint opora_snapshots_e2e_only
  check (payload->>'format' = 'opora-e2e' and payload->>'v' = '1' and payload ? 'ct' and payload ? 'wraps')
  not valid;
