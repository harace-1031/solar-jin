create table if not exists public.parcel_search_events (
  id bigint generated always as identity primary key,
  address text not null check (char_length(address) between 1 and 300),
  searched_at timestamptz not null default now()
);
alter table public.parcel_search_events enable row level security;
revoke all on public.parcel_search_events from anon, authenticated;
grant select, insert on public.parcel_search_events to service_role;
grant usage, select on sequence public.parcel_search_events_id_seq to service_role;
