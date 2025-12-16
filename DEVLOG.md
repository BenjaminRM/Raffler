# Developer Log

## 2025-12-14: Discord Bot Verification & Initial Deployment

### Achievements
*   **Resolved Discord Endpoint Verification:**
    *   Diagnosed that Supabase's default JWT verification was blocking Discord's unauthenticated requests.
    *   Fixed by setting `verify_jwt = false` in `supabase/config.toml` for the `raffler-bot` function.
    *   Verified success via the Discord Developer Portal.
*   **Database Schema Deployment:**
    *   Converted `setup.sql` into a formal Supabase migration (`20251215023435_initial_schema.sql`).
    *   Successfully pushed the schema to the remote Supabase project using `supabase db push`.
*   **Slash Command Registration:**
    *   Created `scripts/register_commands.ts` to register the `/raffle` command with Discord's API.
    *   Successfully ran the script using local environment variables.
*   **Bug Fix: Supabase Client Authentication:**
    *   Encountered `PGRST301: Expected 3 parts in JWT` error when the bot tried to insert data.
    *   Identified that the Service Role Key was not being correctly passed in the `Authorization` header.
    *   **Fix:** Refactored `index.ts` to instantiate the Supabase client directly with `createClient(url, service_role_key)`, which correctly handles admin authentication.
*   **Verification:**
    *   Successfully created a raffle named "Test Raffle" via the Discord `/raffle create` command.

## 2025-12-15: Full Feature Implementation & Refinement

### Achievements
*   **Complete Database Schema:**
    *   Implemented the full schema defined in `DESIGN.md` via `20251215090000_full_schema.sql`.
    *   Added tables: `users`, `raffle_hosts`, `host_payment_methods`, `raffles`, `slots`.
    *   Migrated successfully using `supabase db push`.
*   **Full Slash Command Registration:**
    *   Updated `scripts/register_commands.ts` to include `/host setup`, `/host payment`, `/raffle status/close`, and `/claim`.
    *   Registered commands with Discord API.
*   **Bot Logic Implementation:**
    *   Rewrote `supabase/functions/raffler-bot/index.ts` to handle all new commands.
    *   Implemented `handleHostCommand` for host profile and payment setup.
    *   Implemented `handleRaffleCommand` for creating, closing, and viewing raffles.
    *   Implemented `handleClaimCommand` for user slot claims and host proxy claims.
    *   Added logic to enforce single active raffle rule.
    *   Added logic to prevent duplicate slot claims (including race condition handling).
*   **Deployment & Debugging:**
    *   Overcame multiple syntax errors related to template literals and regex during Deno deployment.
    *   Successfully deployed the updated `raffler-bot` function to Supabase.

### Enhancements & Bug Fixes
*   **Host Info Command:**
    *   Added `/host info` subcommand to allow users to view host profiles and payment methods.
    *   Implemented logic to fetch and display host details dynamically.
*   **Multi-Image Support:**
    *   Updated `raffles` table schema to replace `item_image_url` with `images` (array of text).
    *   Updated `/raffle create` command to accept up to 4 additional images (`image2` - `image4`).
    *   Updated bot logic to store all provided image URLs in the database.
    *   Updated raffle creation response to display multiple images using a gallery (multi-embed) approach.
*   **Multi-Tenancy Support:**
    *   Added `guild_id` column to `raffles` table.
    *   Updated all queries to filter by `guild_id`, ensuring raffles are scoped to their specific Discord server.
*   **Transparent Pricing & Math:**
    *   Implemented commission parsing logic (supports % and flat fee).
    *   Updated `/raffle create` to calculate `Total Value = Market Price + Commission`.
    *   Derived `Cost Per Slot` from the Total Value.
    *   Updated `/raffle create` and `/raffle status` messages to explicitly show the breakdown: Market Price, Commission, Total Value, and Price Per Slot math.
*   **Raffle Configuration Updates:**
    *   Added `max_slots_per_user` and `duration_hours` (optional) to `/raffle create`.
    *   Implemented logic to auto-calculate `close_timer` based on duration.
    *   Fixed `/raffle update` command (was previously unimplemented in the handler) to allow updating max slots during an active raffle.
    *   Updated `/host info` text for clarity ("Can claim slots for others (Proxy)").
    *   Added validation to `/claim` to enforce `max_slots_per_user` limits and check if the raffle has expired.
*   **Modal-Based "Wizard" Creation & Confirmation:**
    *   Refactored `/raffle create` to only require images and title.
    *   Implemented a Discord Modal interaction to collect details (Description, Price, Slots, Max Claims, Duration).
    *   Implemented **Banker's Rounding** for precise slot pricing.
    *   Added a **Confirmation Step**: After modal submission, user sees a summary with "Confirm" (Green) and "Cancel" (Red) buttons.
    *   Implemented button handlers to Activate or Delete the draft raffle.
*   **Claim System Overhaul:**
    *   **Quantity Claims:** Changed `/claim` to accept a `quantity` instead of specific slot numbers. The bot now automatically assigns the first available slots.
    *   **Payment DMs:** If a raffle requires `IMMEDIATE` payment, the bot now sends a Direct Message (DM) to the user with the payment total and the host's payment methods upon claiming.
    *   **Participants List:** Added `/raffle participants` to view a summary of who has claimed slots and how many.
*   **Bug Fix: "No Active Raffle":**
    *   Identified that `select("*", { count: 'exact', head: true })` was being used in `close` and `claim` commands, causing the query to return no data body, leading to false negatives.
    *   **Fix:** Removed `{ head: true }` from these queries to correctly retrieve raffle data.
*   **Refinement: Infinite Duration:**
    *   Removed `duration_hours` input from the creation modal.
    *   Removed `close_timer` calculation and enforcement.
    *   Raffles now run indefinitely until manually closed by the host.

### Current State
*   **Version:** 0.5.1
*   **Functionality:** Full Feature Set + Host Info + Multi-Image + Multi-Tenancy + Transparent Math + Modal UI + Auto-Assign Claims + Payment DMs + Indefinite Duration.
*   **Database:** Full Schema Deployed (with latest migrations).
*   **Environment:** Production Ready (Supabase Edge Function).