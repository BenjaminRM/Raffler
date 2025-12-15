CREATE TABLE raffles (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    guild_id text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    max_slots integer NOT NULL,
    created_by_user_id text NOT NULL,
    message_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raffle_entries (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    raffle_id bigint NOT NULL REFERENCES raffles(id),
    user_id text NOT NULL,
    user_username text NOT NULL,
    slot_number integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (raffle_id, user_id),
    UNIQUE (raffle_id, slot_number)
);