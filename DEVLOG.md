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

## 2025-12-16: Refactoring & Role-Based Access Control

### Refactoring
*   **Modular Codebase:** Split the single `index.ts` file into a modular structure:
    *   `src/types.ts`, `src/utils.ts`, `src/discord.ts`, `src/db.ts` for shared logic.
    *   `src/commands/` for specific command handlers (`host.ts`, `raffle.ts`, `claim.ts`).
    *   `index.ts` now serves as a clean entry point router.

### Role-Based Access Control (RBAC)
*   **Guild Configuration:** Created `guild_configs` table to store guild-specific settings (currently: `raffle_host_role_id`).
*   **Admin Command:** Implemented `/admin set_host_role [role]` to allow server administrators to define which Discord role is required to create raffles.
*   **Permission Enforcement:** Updated `/raffle create` to:
    1.  Check if a `raffle_host_role_id` is configured for the guild.
    2.  If configured, verify the user has that specific role in their `interaction.member.roles`.
    3.  Deny access with a descriptive message if the role is missing.
*   **Security:** Registered `/admin` command with `default_member_permissions` set to Administrator (8) to prevent unauthorized configuration.
*   **Deployment:** Successfully pushed migration `20251216000000_guild_configs.sql` and redeployed the bot.

### Winner Selection System
*   **Database:** Added `winner_id` column to `raffles` table.
*   **Command:** Implemented `/raffle pick_winner`.
*   **Logic:**
    *   Host selects the command.
    *   Bot checks for an ACTIVE raffle.
    *   Bot retrieves all claimed slots.
    *   Bot performs server-side RNG to select a winner.
    *   Bot updates the raffle status to `CLOSED` and saves the `winner_id`.
    *   Bot posts a public announcement with the winner and their winning slot number.

### Unique Raffle Identifier
*   **Feature:** Implemented a unique, publicly displayable `raffle_code` (e.g., `A7X9K2`) to identify specific raffles.
*   **Schema:** Added `raffle_code` column (text, unique, indexed) via migration `20251216020000_add_raffle_code.sql`.
*   **Logic:**
    *   Updated `utils.ts` with a `generateRaffleCode` function (8-char alphanumeric).
    *   Updated `/raffle create` to generate and save this code.
    *   Updated `/raffle status` and `/raffle pick_winner` announcements to display this ID.

### Current State
*   **Version:** 0.8.0
*   **Functionality:** Full Feature Set + Modular Code + RBAC for Hosts + Admin Configuration + Pick Winner + Unique Raffle IDs.
*   **Database:** Full Schema + Guild Configs + Winner Tracking + Unique Raffle Codes.
