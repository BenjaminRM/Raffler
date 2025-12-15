# AI Assistant Context & Preferences

This file serves as a context guide for the AI assistant working on this project. It includes user preferences, operational guidelines, and environment specifics.

## User Preferences
*   **Proactive Command Execution:** The user prefers the agent to **run commands** directly rather than just suggesting them, especially for deployment and testing steps.
*   **Detailed Step-by-Step:** When troubleshooting, the user values detailed, atomic steps.
*   **Documentation:** The user values clean, organized code and persistent documentation of sessions (`DEVLOG.md`).
*   **Environment Variables:** The user maintains a local `.env` file (git-ignored) with all necessary secrets. The agent should reference this but never output the actual secrets in chat.

## Project Environment
*   **Shell:** PowerShell (Windows).
*   **Package Manager:** `scoop` is used for tool management (`deno`, `supabase`).
*   **Execution Paths:** Tools like `supabase` and `deno` may need their full path (e.g., `C:\Users\benny\scoop\shims\supabase.exe`) if the PATH variable is flaky.
*   **Supabase Project ID:** `awxnhyomcfnxrvwxmklw`.

## Key Files
*   **`DEVLOG.md`**: The primary history of project progress. **Read this at the start of every session.**
*   **`scripts/`**: Helper scripts (e.g., `register_commands.ts`).
*   **`supabase/functions/raffler-bot/index.ts`**: The main bot logic.

## Operational Rules
1.  **Always** read `DEVLOG.md` upon initialization to understand the current state.
2.  **Always** update `DEVLOG.md` at the end of a session with significant progress.
3.  **Do not** revert successful code changes unless explicitly asked.
