-- Drop existing tables to start fresh
DROP TABLE IF EXISTS raffle_entries;
DROP TABLE IF EXISTS raffles;

-- Users Table
CREATE TABLE users (
    user_id text PRIMARY KEY, -- Discord Snowflake
    username text NOT NULL,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- RaffleHosts Table
CREATE TABLE raffle_hosts (
    host_id text PRIMARY KEY REFERENCES users(user_id),
    commission_rate text,
    allows_local_meetup boolean DEFAULT false,
    allows_shipping boolean DEFAULT false,
    proxy_claim_enabled boolean DEFAULT false,
    default_payment_trigger text CHECK (default_payment_trigger IN ('IMMEDIATE', 'ON_FILL'))
);

-- HostPaymentMethods Table
CREATE TABLE host_payment_methods (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    host_id text NOT NULL REFERENCES raffle_hosts(host_id) ON DELETE CASCADE,
    platform text NOT NULL, -- Venmo, CashApp, PayPal, Zelle
    handle text NOT NULL,
    qr_code_url text
);

-- Raffles Table
CREATE TABLE raffles (
    raffle_id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    host_id text NOT NULL REFERENCES raffle_hosts(host_id),
    status text NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'CANCELLED')),
    item_title text NOT NULL,
    item_description text,
    item_image_url text,
    market_price numeric NOT NULL,
    total_slots integer NOT NULL,
    cost_per_slot numeric NOT NULL,
    max_slots_per_user integer,
    payment_trigger text NOT NULL CHECK (payment_trigger IN ('IMMEDIATE', 'ON_FILL')),
    created_at timestamptz NOT NULL DEFAULT now(),
    close_timer timestamptz
);

-- Slots Table
CREATE TABLE slots (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    raffle_id bigint NOT NULL REFERENCES raffles(raffle_id) ON DELETE CASCADE,
    slot_number integer NOT NULL,
    claimant_id text REFERENCES users(user_id),
    claimed_at timestamptz,
    payment_status text CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED')) DEFAULT 'PENDING',
    UNIQUE (raffle_id, slot_number)
);

-- Index for finding the active raffle quickly
CREATE INDEX idx_raffles_status ON raffles(status) WHERE status = 'ACTIVE';
