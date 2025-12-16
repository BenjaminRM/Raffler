import { InteractionResponseType } from "https://deno.land/x/discord_api_types/v10.ts";
import { SlashCommandOption } from "./types.ts";

export function getOptionValue(options: SlashCommandOption[] | undefined, name: string): any {
  return options?.find((opt) => opt.name === name)?.value;
}

export function getSubcommand(options: SlashCommandOption[] | undefined): SlashCommandOption | undefined {
  return options?.find((opt) => opt.type === 1 || opt.type === 2);
}

export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string) {
  return jsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: `❌ Error: ${message}`, flags: 64 },
  });
}

export function messageResponse(content: string, ephemeral = false) {
  return jsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: ephemeral ? 64 : 0 },
  });
}

export function getAttachmentUrl(interaction: any, attachmentId: string): string | undefined {
    return interaction.data.resolved?.attachments?.[attachmentId]?.url;
}

export async function sendDM(userId: string, content: string) {
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || Deno.env.get("DISCORD_TOKEN");
    if (!BOT_TOKEN) return;

    // 1. Create DM Channel
    const createRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
            "Authorization": `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ recipient_id: userId })
    });

    if (!createRes.ok) {
        console.error("Failed to create DM channel:", await createRes.text());
        return;
    }

    const channelData = await createRes.json();
    const channelId = channelData.id;

    // 2. Send Message
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
            "Authorization": `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
    });
}

export async function sendMessage(channelId: string, content: string) {
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || Deno.env.get("DISCORD_TOKEN");
    if (!BOT_TOKEN) return;

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
            "Authorization": `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
            content,
            allowed_mentions: { parse: [] } // Disable pings
        })
    });
}
