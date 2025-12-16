import {
  Interaction,
  InteractionResponseType,
  InteractionType,
} from "https://deno.land/x/discord_api_types/v10.ts";
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { hexToUint8Array } from "./src/utils.ts";
import { handleHostCommand } from "./src/commands/host.ts";
import { handleRaffleCommand, handleModalSubmit, handleMessageComponent } from "./src/commands/raffle.ts";
import { handleClaimCommand } from "./src/commands/claim.ts";

Deno.serve(async (req) => {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text();

  if (!signature || !timestamp) return new Response("Unauthorized", { status: 401 });

  const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY");
  if (!PUBLIC_KEY) return new Response("Internal Server Error", { status: 500 });

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbService) return new Response("Internal Server Error", { status: 500 });

  const supabase = createClient(sbUrl, sbService);

  try {
    const isValid = nacl.sign.detached.verify(new TextEncoder().encode(timestamp + body), hexToUint8Array(signature!), hexToUint8Array(PUBLIC_KEY));
    if (!isValid) return new Response("Unauthorized", { status: 401 });

    const interaction: Interaction = JSON.parse(body);

    if (interaction.type === InteractionType.Ping) {
      return new Response(JSON.stringify({ type: InteractionResponseType.Pong }), { headers: { "Content-Type": "application/json" } });
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
        const { name } = interaction.data;
        if (name === "host") return await handleHostCommand(interaction, supabase);
        if (name === "raffle") return await handleRaffleCommand(interaction, supabase);
        if (name === "claim") return await handleClaimCommand(interaction, supabase);
    }

    if (interaction.type === 5) { // InteractionType.ModalSubmit = 5
        return await handleModalSubmit(interaction, supabase);
    }

    if (interaction.type === 3) { // InteractionType.MessageComponent = 3
        return await handleMessageComponent(interaction, supabase);
    }

    return new Response("OK");
  } catch (err) {
    console.error("Unexpected Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
