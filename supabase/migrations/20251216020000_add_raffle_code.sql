alter table public.raffles 
add column if not exists raffle_code text;

create unique index if not exists idx_raffles_code on public.raffles(raffle_code);
