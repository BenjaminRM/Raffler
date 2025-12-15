# Raffler Discord Bot

**Raffler** is a serverless Discord bot designed to streamline community raffles. It handles the math, the state, and the organization, letting hosts focus on their community. Built on Supabase Edge Functions, it's cost-effective and scalable.

## ✨ Features

*   **Wizard Creation Flow:** A smooth, modal-based interface for creating raffles without complex commands.
*   **Transparent Math:** Automatically calculates commissions, total values, and slot prices (using Banker's Rounding).
*   **Multi-Image Gallery:** Supports displaying multiple images for raffle items.
*   **Auto-Assign Claims:** Users simply request a quantity of slots, and the bot handles the rest.
*   **Payment DMs:** Automatically sends payment details to users via DM when they claim slots.
*   **Multi-Tenancy:** Supports multiple Discord servers (Guilds) with isolated raffle states.
*   **Role-Based:** Secure `/host` commands ensure only authorized users can manage raffles.

## 🚀 Commands

### Host Configuration
*   `/host setup` - Configure your commission rate, meetup/shipping preferences, and proxy settings.
*   `/host payment add` - Add payment methods (Venmo, PayPal, etc.) for users to pay you.
*   `/host info` - View your host profile and settings.

### Managing Raffles
*   `/raffle create` - Start the Raffle Wizard (requires Title & Image).
*   `/raffle status` - Check the status of the active raffle.
*   `/raffle participants` - See a list of all entrants and their slots.
*   `/raffle close` - Close the current raffle.
*   `/raffle update` - Update settings like max slots per user.

### Participating
*   `/claim [quantity]` - Claim one or more slots in the active raffle.

## 🛠️ Architecture

Raffler creates an HTTP endpoint that Discord hits via **Interactions (Webhooks)**. It does not maintain a WebSocket connection.

*   **Runtime:** Deno (Supabase Edge Functions)
*   **Database:** PostgreSQL (Supabase)
*   **Validation:** Ed25519 Signature Verification

## 💻 Local Development

1.  **Prerequisites:** `supabase` CLI, `deno`.
2.  **Setup:**
    *   `supabase start` to run local stack.
    *   Set `.env` variables (`DISCORD_PUBLIC_KEY`, etc.).
3.  **Deploy:**
    *   `supabase functions deploy raffler-bot --no-verify-jwt`
4.  **Register Commands:**
    *   `deno run --allow-net --allow-read --allow-env scripts/register_commands.ts`

Check `DEVLOG.md` for a detailed history of changes.
