import {
  Interaction,
  InteractionResponseType,
  InteractionType,
} from "https://deno.land/x/discord_api_types/v10.ts";
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Types ---
interface SlashCommandOption {
  name: string;
  value?: string | number | boolean;
  type: number;
  options?: SlashCommandOption[];
}

// --- Helper Functions ---
function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)));
}

function getOptionValue(options: SlashCommandOption[] | undefined, name: string): any {
  return options?.find((opt) => opt.name === name)?.value;
}

function getSubcommand(options: SlashCommandOption[] | undefined): SlashCommandOption | undefined {
  return options?.find((opt) => opt.type === 1 || opt.type === 2);
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string) {
  return jsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: `❌ Error: ${message}`, flags: 64 },
  });
}

function messageResponse(content: string, ephemeral = false) {
  return jsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: ephemeral ? 64 : 0 },
  });
}

function getAttachmentUrl(interaction: any, attachmentId: string): string | undefined {
    return interaction.data.resolved?.attachments?.[attachmentId]?.url;
}

function parseCommission(rateStr: string, marketPrice: number): number {
    if (!rateStr) return 0;
    const percentMatch = rateStr.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        return (marketPrice * percent) / 100;
    }
    const flatMatch = rateStr.match(/^\$?(\d+(?:\.\d+)?)$/);
    if (flatMatch) {
        return parseFloat(flatMatch[1]);
    }
    return 0;
}

function bankersRound(num: number): number {
    const n = +num.toFixed(8);
    const i = Math.floor(n);
    const f = n - i;
    const e = 1e-8;
    if (f > 0.5 - e && f < 0.5 + e) {
        return (i % 2 === 0) ? i : i + 1;
    }
    return Math.round(n);
}

async function sendDM(userId: string, content: string) {
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


// --- DB Helpers ---
async function ensureUser(supabase: SupabaseClient, user: { id: string; username: string; discriminator?: string; global_name?: string }) {
  const { error } = await supabase.from('users').upsert({
    user_id: user.id,
    username: user.username,
    display_name: user.global_name || user.username,
  });
  if (error) console.error("Error upserting user:", error);
}

// --- Command Handlers ---

async function handleHostCommand(interaction: any, supabase: SupabaseClient) {
  const { data } = interaction;
  const subcommand = getSubcommand(data.options);
  const user = interaction.member?.user || interaction.user;

  if (!user) return errorResponse("User not found.");
  await ensureUser(supabase, user);

  if (subcommand?.name === "setup") {
    const commission = getOptionValue(subcommand.options, "commission");
    const local_meetup = getOptionValue(subcommand.options, "local_meetup");
    const shipping = getOptionValue(subcommand.options, "shipping");
    const allow_proxy = getOptionValue(subcommand.options, "allow_proxy_claims");

    const { error } = await supabase.from("raffle_hosts").upsert({
      host_id: user.id,
      commission_rate: commission,
      allows_local_meetup: local_meetup,
      allows_shipping: shipping,
      proxy_claim_enabled: allow_proxy,
      default_payment_trigger: "IMMEDIATE" 
    });

    if (error) return errorResponse(`Failed to setup host profile: ${error.message}`);
    return messageResponse("✅ Host profile updated successfully!", true);
  }

  if (subcommand?.name === "payment") {
    const action = getSubcommand(subcommand.options); 
    const platform = getOptionValue(action?.options, "platform");
    
    if (action?.name === "add") {
        const handle = getOptionValue(action?.options, "handle");
        const { error } = await supabase.from("host_payment_methods").insert({
            host_id: user.id,
            platform,
            handle
        });
        if (error) return errorResponse(`Failed to add payment method: ${error.message}`);
        return messageResponse(`✅ Added ${platform} payment method: ${handle}`, true);
    }

    if (action?.name === "remove") {
        const { error } = await supabase.from("host_payment_methods").delete().match({
            host_id: user.id,
            platform
        });
        if (error) return errorResponse(`Failed to remove payment method: ${error.message}`);
        return messageResponse(`✅ Removed ${platform} payment method.`, true);
    }
  }

  if (subcommand?.name === "info") {
      const targetUserId = getOptionValue(subcommand.options, "user") || user.id;
      const { data: host, error: hostError } = await supabase.from("raffle_hosts").select("*" ).eq("host_id", targetUserId).single();
      
      if (hostError || !host) {
          return errorResponse(targetUserId === user.id ? "You are not registered as a host. Run `/host setup` first." : "That user is not a registered host.");
      }

      const { data: payments } = await supabase.from("host_payment_methods").select("*" ).eq("host_id", targetUserId);

      let infoText = "📋 **Host Profile**\n" + 
                     "👤 **Host:** <@" + targetUserId + ">\n" +
                     "💸 **Commission:** " + (host.commission_rate || "N/A") + "\n" +
                     "🤝 **Local Meetup:** " + (host.allows_local_meetup ? "Yes" : "No") + "\n" +
                     "📦 **Shipping:** " + (host.allows_shipping ? "Yes" : "No") + "\n" +
                     "🤖 **Proxy Claims:** " + (host.proxy_claim_enabled ? "Can claim slots for others (Proxy)" : "No") + "\n\n" + 
                     "💳 **Payment Methods:**\n";
      
      if (payments && payments.length > 0) {
          payments.forEach((p: any) => { infoText += "- **" + p.platform + "**: " + p.handle + "\n"; });
      } else {
          infoText += "- No payment methods added.\n";
      }
      return messageResponse(infoText);
  }
  return errorResponse("Unknown host subcommand.");
}

async function handleRaffleCommand(interaction: any, supabase: SupabaseClient) {
  const { data } = interaction;
  const subcommand = getSubcommand(data.options);
  const user = interaction.member?.user || interaction.user;
  const guild_id = interaction.guild_id;

  if (!user) return errorResponse("User not found.");
  if (!guild_id) return errorResponse("Raffles can only be managed within a server.");

  await ensureUser(supabase, user);

  if (subcommand?.name === "create") {
    const { count, error: countError } = await supabase.from("raffles").select("*", { count: 'exact', head: true }).eq("status", "ACTIVE").eq("guild_id", guild_id);
    if (countError) return errorResponse("Database error checking active raffles.");
    if (count && count > 0) return errorResponse("A raffle is already active in this server. Please wait for it to close.");

    const { data: hostData } = await supabase.from("raffle_hosts").select("*" ).eq("host_id", user.id).single();
    if (!hostData) return errorResponse("You must be a registered host to create a raffle. Run `/host setup` first.");

    const title = getOptionValue(subcommand.options, "title");
    const img1 = getOptionValue(subcommand.options, "image");
    const images: string[] = [];
    if (img1) { const url = getAttachmentUrl(interaction, img1); if(url) images.push(url); }

    const { data: raffle, error } = await supabase.from("raffles").insert({
        host_id: user.id,
        guild_id: guild_id,
        status: "PENDING", 
        item_title: title,
        images: images,
        payment_trigger: "IMMEDIATE" 
    }).select().single();

    if (error) return errorResponse(`Failed to initialize raffle: ${error.message}`);

    return jsonResponse({
        type: 9, 
        data: {
            custom_id: `raffle_modal:${raffle.raffle_id}`,
            title: "Raffle Details",
            components: [
                { type: 1, components: [{ type: 4, custom_id: "item_description", label: "Description (Optional)", style: 2, required: false, max_length: 500 }] },
                { type: 1, components: [{ type: 4, custom_id: "market_price", label: "Total Market Price ($)", style: 1, required: true, placeholder: "e.g. 50.00" }] },
                { type: 1, components: [{ type: 4, custom_id: "total_slots", label: "Total Slots", style: 1, required: true, placeholder: "e.g. 10" }] },
                { type: 1, components: [{ type: 4, custom_id: "max_slots_per_user", label: "Max Slots Per User", style: 1, required: true, placeholder: "1", value: "1" }] },
                { type: 1, components: [{ type: 4, custom_id: "duration_hours", label: "Duration (Hours)", style: 1, required: true, placeholder: "48", value: "48" }] }
            ]
        }
    });
  }

  if (subcommand?.name === "close") {
    const { data: raffle } = await supabase.from("raffles").select("*" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
    if (!raffle) return errorResponse("No active raffle to close.");
    if (raffle.host_id !== user.id) return errorResponse("Only the host can close this raffle.");

    const { error } = await supabase.from("raffles").update({ status: "CLOSED" }).eq("raffle_id", raffle.raffle_id);
    if (error) return errorResponse(`Failed to close raffle: ${error.message}`);
    return messageResponse(`🔒 Raffle **${raffle.item_title}** has been CLOSED.`);
  }

  if (subcommand?.name === "update") {
      const { data: raffle } = await supabase.from("raffles").select("*" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
      if (!raffle) return errorResponse("No active raffle to update.");
      if (raffle.host_id !== user.id) return errorResponse("Only the host can update this raffle.");

      const newMaxSlots = getOptionValue(subcommand.options, "max_slots_per_user");
      if (newMaxSlots !== undefined) {
          const { error } = await supabase.from("raffles").update({ max_slots_per_user: newMaxSlots }).eq("raffle_id", raffle.raffle_id);
          if (error) return errorResponse(`Update failed: ${error.message}`);
          return messageResponse(`✅ Raffle updated! Max slots per user is now: **${newMaxSlots}**`);
      }
      return errorResponse("No update parameters provided.");
  }

  if (subcommand?.name === "participants") {
      const { data: raffle } = await supabase.from("raffles").select("*" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
      if (!raffle) return messageResponse("No active raffle at the moment.");

      const { data: slots } = await supabase.from("slots").select("claimant_id, slot_number").eq("raffle_id", raffle.raffle_id);
      
      if (!slots || slots.length === 0) {
          return messageResponse("No participants yet.");
      }

      // Group by user
      const userMap = new Map<string, number[]>();
      for (const slot of slots) {
          if (!userMap.has(slot.claimant_id)) userMap.set(slot.claimant_id, []);
          userMap.get(slot.claimant_id)?.push(slot.slot_number);
      }

      let msg = `👥 **Participants for ${raffle.item_title}**\n\n`;
      userMap.forEach((nums, uid) => {
          msg += `<@${uid}>: **${nums.length}** slots (${nums.sort((a,b)=>a-b).join(", ")})\n`;
      });

      return messageResponse(msg);
  }

  if (subcommand?.name === "status") {
      const { data: raffle } = await supabase.from("raffles").select("*" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
      if (!raffle) return messageResponse("No active raffle at the moment.");

      const { count: claimedCount } = await supabase.from("slots").select("*", { count: 'exact', head: true }).eq("raffle_id", raffle.raffle_id);
      const openSlots = raffle.total_slots - (claimedCount || 0);
      const totalRaffleValue = raffle.cost_per_slot * raffle.total_slots;
      const commissionAmount = totalRaffleValue - raffle.market_price;
      const startTimeDisplay = "<t:" + Math.floor(new Date(raffle.created_at).getTime() / 1000) + ":f>";
      let endTimeDisplay = "";
      if (raffle.close_timer) { endTimeDisplay = "\n⏳ **Ends:** <t:" + Math.floor(new Date(raffle.close_timer).getTime() / 1000) + ":R>"; }

      const statusMsg = "📊 **Raffle Status**\n" + 
                        "**" + raffle.item_title + "**\n\n" +
                        "🏷️ **Market Price:** $" + raffle.market_price.toFixed(2) + "\n" +
                        "💸 **Fees/Commission:** $" + commissionAmount.toFixed(2) + "\n" +
                        "💰 **Total Value:** $" + totalRaffleValue.toFixed(2) + "\n" +
                        "--------------------------------\n" +
                        "🔢 **Total Slots:** " + raffle.total_slots + "\n" +
                        "💵 **Price Per Slot:** $" + raffle.cost_per_slot.toFixed(2) + "\n" +
                        "🟢 **Open Slots:** " + openSlots + "\n\n" +
                        "🕒 **Started:** " + startTimeDisplay + endTimeDisplay + "\n" +
                        "🛑 **Max Claims:** " + (raffle.max_slots_per_user ? raffle.max_slots_per_user : "Unlimited") + "\n" +
                        "💳 **Pay:** " + (raffle.payment_trigger === "IMMEDIATE" ? "Immediately on Claim" : "When Full");
      
      const mainImage = raffle.images && raffle.images.length > 0 ? raffle.images[0] : null;
      return jsonResponse({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: statusMsg, embeds: mainImage ? [{ image: { url: mainImage } }] : [] }
    });
  }
  return errorResponse("Unknown raffle subcommand.");
}

async function handleModalSubmit(interaction: any, supabase: SupabaseClient) {
    const customId = interaction.data.custom_id;
    if (!customId.startsWith("raffle_modal:")) return errorResponse("Unknown modal interaction.");

    const raffleId = customId.split(":")[1];
    const components = interaction.data.components;
    const getValue = (id: string) => {
        for (const row of components) {
            const comp = row.components[0];
            if (comp.custom_id === id) return comp.value;
        }
        return null;
    };

    const slotsStr = getValue("total_slots");
    const priceStr = getValue("market_price");
    const desc = getValue("item_description");
    const maxSlotsStr = getValue("max_slots_per_user");
    const durationStr = getValue("duration_hours");

    const total_slots = parseInt(slotsStr);
    const market_price = parseFloat(priceStr);
    const max_slots = parseInt(maxSlotsStr);
    const duration = parseInt(durationStr);

    if (isNaN(total_slots) || total_slots < 1) return errorResponse("Total slots must be a valid number greater than 0.");
    if (isNaN(market_price) || market_price < 0) return errorResponse("Market price must be a valid positive number.");
    if (isNaN(max_slots) || max_slots < 1) return errorResponse("Max slots per user must be a valid number.");
    if (isNaN(duration) || duration < 1) return errorResponse("Duration must be a valid number.");

    const { data: raffle } = await supabase.from("raffles").select("*" ).eq("raffle_id", raffleId).single();
    if (!raffle || raffle.status !== 'PENDING') return errorResponse("Raffle not found or expired.");

    const { data: hostData } = await supabase.from("raffle_hosts").select("commission_rate" ).eq("host_id", raffle.host_id).single();
    const commissionRateStr = hostData?.commission_rate || "0%";
    const commissionAmount = parseCommission(commissionRateStr, market_price);
    const totalRaffleValue = market_price + commissionAmount;
    
    const cost_per_slot = bankersRound(totalRaffleValue / total_slots);

    const ms = duration * 60 * 60 * 1000;
    const close_timer = new Date(Date.now() + ms).toISOString();

    await supabase.from("raffles").update({
        item_description: desc,
        total_slots: total_slots,
        market_price: market_price,
        cost_per_slot: cost_per_slot,
        max_slots_per_user: max_slots,
        close_timer: close_timer,
    }).eq("raffle_id", raffleId);

    const msgContent = "⚠️ **Please Confirm Raffle Details**\n\n" + 
                       "**Title:** " + raffle.item_title + "\n" +
                       "**Slots:** " + total_slots + "\n" +
                       "**Market Price:** $" + market_price.toFixed(2) + "\n" +
                       "**Commission:** $" + commissionAmount.toFixed(2) + "\n" +
                       "**Total Value:** $" + totalRaffleValue.toFixed(2) + "\n" +
                       "--------------------------------\n" +
                       "💵 **Calculated Slot Price:** $" + cost_per_slot.toFixed(2) + " (Rounded)\n" +
                       "--------------------------------\n" +
                       "**Max Claims:** " + max_slots + "\n" +
                       "**Duration:** " + duration + " Hours\n\n" +
                       "Select an option below to finalize or cancel.";

    return jsonResponse({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
            content: msgContent,
            flags: 64, 
            components: [
                {
                    type: 1, 
                    components: [
                        { type: 2, style: 3, label: "Confirm & Create", custom_id: `raffle_confirm:${raffleId}` },
                        { type: 2, style: 4, label: "Cancel", custom_id: `raffle_cancel:${raffleId}` } 
                    ]
                }
            ]
        }
    });
}

async function handleMessageComponent(interaction: any, supabase: SupabaseClient) {
    const customId = interaction.data.custom_id;
    const [action, raffleId] = customId.split(":");

    if (action === "raffle_cancel") {
        await supabase.from("raffles").delete().eq("raffle_id", raffleId);
        return jsonResponse({ type: 7, data: { content: "❌ Raffle creation cancelled.", components: [] } });
    }

    if (action === "raffle_confirm") {
        const { data: raffle } = await supabase.from("raffles").select("*" ).eq("raffle_id", raffleId).single();
        if (!raffle || raffle.status !== 'PENDING') return errorResponse("Raffle invalid or already processed.");

        await supabase.from("raffles").update({
            status: "ACTIVE",
            created_at: new Date().toISOString()
        }).eq("raffle_id", raffleId);

        const totalRaffleValue = raffle.cost_per_slot * raffle.total_slots;
        const commissionAmount = totalRaffleValue - raffle.market_price;
        const startTimeDisplay = "<t:" + Math.floor(Date.now() / 1000) + ":f>";
        let endTimeDisplay = "";
        if (raffle.close_timer) { endTimeDisplay = "\n⏳ **Ends:** <t:" + Math.floor(new Date(raffle.close_timer).getTime() / 1000) + ":R>"; }

        const msgContent = "🎉 **New Raffle Started!**\n" + 
                       "**" + raffle.item_title + "**\n\n" + 
                       "🏷️ **Market Price:** $" + raffle.market_price.toFixed(2) + "\n" +
                       "💸 **Fees/Commission:** $" + commissionAmount.toFixed(2) + "\n" +
                       "💰 **Total Value:** $" + totalRaffleValue.toFixed(2) + "\n" +
                       "--------------------------------\n" +
                       "🔢 **Slots:** " + raffle.total_slots + "\n" +
                       "💵 **Price Per Slot:** $" + raffle.cost_per_slot.toFixed(2) + "\n\n" +
                       "🕒 **Started:** " + startTimeDisplay + 
                       endTimeDisplay + "\n" +
                       "🛑 **Max Claims:** " + raffle.max_slots_per_user + "\n" +
                       "💳 **Pay:** " + (raffle.payment_trigger === "IMMEDIATE" ? "Immediately on Claim" : "When Full") + "\n\n" +
                       "Host: <@" + raffle.host_id + ">\n" +
                       "Type `/claim` to enter!";
        
        const embeds = raffle.images ? raffle.images.map((url: string) => ({ image: { url } })) : [];

        return jsonResponse({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: msgContent, embeds: embeds }
        });
    }
    return new Response("OK");
}

async function handleClaimCommand(interaction: any, supabase: SupabaseClient) {
  const { data } = interaction;
  const user = interaction.member?.user || interaction.user;
  const guild_id = interaction.guild_id;
  const quantity = getOptionValue(data.options, "quantity");
  const onBehalfOf = getOptionValue(data.options, "on_behalf_of");

  if (!user) return errorResponse("User not found.");
  if (!guild_id) return errorResponse("Claims can only be made within a server.");
  if (!quantity || quantity < 1) return errorResponse("Quantity must be at least 1.");

  await ensureUser(supabase, user);

  let claimantId = user.id;
  if (onBehalfOf) {
      const { data: raffle } = await supabase.from("raffles").select("host_id" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
      if (!raffle || raffle.host_id !== user.id) return errorResponse("Only the host can proxy claim for others.");
      claimantId = onBehalfOf;
      const proxyUser = interaction.data.resolved?.users?.[onBehalfOf];
      if (proxyUser) await ensureUser(supabase, proxyUser);
  }

  const { data: raffle } = await supabase.from("raffles").select("*" ).eq("status", "ACTIVE").eq("guild_id", guild_id).single();
  if (!raffle) return errorResponse("No active raffle to enter.");

  if (raffle.close_timer && new Date() > new Date(raffle.close_timer)) return errorResponse("This raffle has ended.");

  if (raffle.max_slots_per_user && !onBehalfOf) {
      const { count: userClaimCount } = await supabase.from("slots").select("*", { count: 'exact', head: true }).eq("raffle_id", raffle.raffle_id).eq("claimant_id", claimantId);
      const currentClaims = userClaimCount || 0;
      if (currentClaims + quantity > raffle.max_slots_per_user) {
          return errorResponse(`You can only claim ${raffle.max_slots_per_user} slots total. You have ${currentClaims} and are trying to claim ${quantity} more.`);
      }
  }

  // Determine Available Slots
  const { data: takenSlots } = await supabase.from("slots").select("slot_number").eq("raffle_id", raffle.raffle_id);
  const takenSet = new Set(takenSlots?.map(s => s.slot_number));
  const availableSlots: number[] = [];
  
  for (let i = 1; i <= raffle.total_slots; i++) {
      if (!takenSet.has(i)) availableSlots.push(i);
      if (availableSlots.length === quantity) break;
  }

  if (availableSlots.length < quantity) {
      return errorResponse(`Not enough slots available. Only ${availableSlots.length} left.`);
  }

  const rows = availableSlots.map(num => ({
      raffle_id: raffle.raffle_id,
      slot_number: num,
      claimant_id: claimantId,
      claimed_at: new Date().toISOString()
  }));

  const { error } = await supabase.from("slots").insert(rows);
  if (error) {
       if (error.code === '23505') return errorResponse("Slots were claimed just before you. Please try again.");
       return errorResponse(`Database error: ${error.message}`);
  }

  // --- Payment Notification Logic ---
  if (raffle.payment_trigger === "IMMEDIATE" && !onBehalfOf) {
      const totalDue = (raffle.cost_per_slot * quantity).toFixed(2);
      
      const { data: payments } = await supabase.from("host_payment_methods").select("*" ).eq("host_id", raffle.host_id);
      
      let payMsg = `🎉 **Raffle Entry Confirmed!**\n` + 
                   `You claimed **${quantity}** slots in **${raffle.item_title}**.\n` + 
                   `Your Slot Numbers: **${availableSlots.join(", ")}**\n\n` + 
                   `💰 **Total Due: $${totalDue}**\n\n` + 
                   `Please send payment immediately to <@${raffle.host_id}> using one of the following methods:\n`;
      
      if (payments && payments.length > 0) {
          payments.forEach((p: any) => { payMsg += `- **${p.platform}**: ${p.handle}\n`; });
      } else {
          payMsg += `- (No payment methods listed. Please ask the host.)\n`;
      }
      
      payMsg += `
Reference your Discord Name or Slot Numbers in the payment note!`;

      // Send DM
      await sendDM(claimantId, payMsg);
  }

  const msg = onBehalfOf 
    ? `✅ Host claimed ${quantity} slots for <@${claimantId}>: ${availableSlots.join(", ")}`
    : `✅ <@${claimantId}> claimed ${quantity} slots: ${availableSlots.join(", ")}`;

  return messageResponse(msg);
}


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