alter table public.mt_entries
add column if not exists start_postcode text,
add column if not exists stop1_postcode text,
add column if not exists stop2_postcode text,
add column if not exists stop3_postcode text,
add column if not exists stop4_postcode text,
add column if not exists finish_postcode text,
add column if not exists status text not null default 'draft';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mt_entries_status_check'
  ) then
    alter table public.mt_entries
    add constraint mt_entries_status_check
    check (status in ('draft', 'submitted', 'paid')) not valid;
  end if;
end $$;

alter table public.mt_entries
validate constraint mt_entries_status_check;
