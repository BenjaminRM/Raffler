create table if not exists public.guild_configs (
    guild_id text primary key,
    raffle_host_role_id text
);

alter table public.guild_configs enable row level security;

create policy "Enable read access for all users" on public.guild_configs
    for select using (true);

create policy "Enable insert/update for service role only" on public.guild_configs
    for all using (true) with check (true);
