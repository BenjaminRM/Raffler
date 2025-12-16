import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { InteractionResponseType } from "https://deno.land/x/discord_api_types/v10.ts";
import { getSubcommand, getOptionValue, errorResponse, messageResponse, jsonResponse, getAttachmentUrl, sendDM } from "../discord.ts";
import { ensureUser } from "../db.ts";
import { parseCommission, bankersRound, generateRaffleCode } from "../utils.ts";

export async function handleRaffleCommand(interaction: any, supabase: SupabaseClient) {
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
    
        // Check for required Host Role
        const { data: config } = await supabase.from("guild_configs").select("raffle_host_role_id").eq("guild_id", guild_id).single();
        if (config?.raffle_host_role_id) {
            const memberRoles = interaction.member?.roles || [];
            if (!memberRoles.includes(config.raffle_host_role_id)) {
                return errorResponse(`🚫 Permission Denied.\nYou need the <@&${config.raffle_host_role_id}> role to create raffles in this server.`);
            }
        }
    
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
        payment_trigger: "IMMEDIATE",
        raffle_code: generateRaffleCode()
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
                { type: 1, components: [{ type: 4, custom_id: "max_slots_per_user", label: "Max Slots Per User", style: 1, required: true, placeholder: "1", value: "1" }] }
            ]
        }
    });
  }

  if (subcommand?.name === "close") {
    const { data: raffle } = await supabase.from("raffles").select("*").eq("status", "ACTIVE").eq("guild_id", guild_id).single();
    if (!raffle) return errorResponse("No active raffle to close.");
    if (raffle.host_id !== user.id) return errorResponse("Only the host can close this raffle.");

    const { error } = await supabase.from("raffles").update({ status: "CLOSED" }).eq("raffle_id", raffle.raffle_id);
    if (error) return errorResponse(`Failed to close raffle: ${error.message}`);
    return messageResponse(`🔒 Raffle **${raffle.item_title}** has been CLOSED.`);
  }

  if (subcommand?.name === "update") {
      const { data: raffle } = await supabase.from("raffles").select("*").eq("status", "ACTIVE").eq("guild_id", guild_id).single();
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
      const { data: raffle } = await supabase.from("raffles").select("*").eq("status", "ACTIVE").eq("guild_id", guild_id).single();
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

      // Send via DM
      await sendDM(user.id, msg);

      return messageResponse("📬 The participants list has been sent to your DMs!", true);
  }

  if (subcommand?.name === "pick_winner") {
      // Find the relevant raffle. We check for ACTIVE or CLOSED (but not yet won) raffles for this host/guild.
      // Prioritize ACTIVE.
      let { data: raffle } = await supabase.from("raffles").select("*").eq("guild_id", guild_id).eq("status", "ACTIVE").single();
      
      // If no active raffle, check if there's a closed one without a winner? 
      // Actually, typically you pick a winner to close it. Let's stick to: Must be ACTIVE or recently CLOSED.
      // For simplicity and safety, let's look for the one the user is hosting that is ACTIVE.
      if (!raffle) {
           // Fallback: Check for a CLOSED raffle by this host that has no winner yet? 
           // This might be tricky if there are multiple. Let's restrict to ACTIVE for now as per "shuts the raffle down".
           return errorResponse("No active raffle found to pick a winner for.");
      }

      if (raffle.host_id !== user.id) return errorResponse("Only the host can pick a winner.");

      const { data: slots } = await supabase.from("slots").select("claimant_id, slot_number").eq("raffle_id", raffle.raffle_id);
      
      if (!slots || slots.length === 0) return errorResponse("No slots claimed! Cannot pick a winner.");

      // RNG
      const randomIndex = Math.floor(Math.random() * slots.length);
      const winningSlot = slots[randomIndex];

      // Update Raffle
      const { error } = await supabase.from("raffles").update({ 
          status: "CLOSED", 
          winner_id: winningSlot.claimant_id 
      }).eq("raffle_id", raffle.raffle_id);

      if (error) return errorResponse(`Failed to record winner: ${error.message}`);

      return messageResponse(`🎉 **Raffle Complete!**\n\nThe winner of **${raffle.item_title}** (ID: \`${raffle.raffle_code || "N/A"}\`) is...\n\n🏆 <@${winningSlot.claimant_id}> (Slot #${winningSlot.slot_number}) 🏆\n\nCongratulations! The raffle is now closed.`);
  }

  if (subcommand?.name === "list") {
      const page = getOptionValue(subcommand.options, "page") || 1;
      const pageSize = 5;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      // Fetch raffles
      const { data: raffles, count } = await supabase
        .from("raffles")
        .select("*", { count: 'exact' })
        .eq("guild_id", guild_id)
        .order('created_at', { ascending: false })
        .range(start, end);

      if (!raffles || raffles.length === 0) {
          return messageResponse("No raffles found in history.");
      }

      let msg = `📜 **Raffle History** (Page ${page})\n\n`;
      
      for (const r of raffles) {
          const statusIcon = r.status === 'ACTIVE' ? "🟢" : (r.status === 'CLOSED' ? "🔴" : "🚫");
          const dateStr = new Date(r.created_at).toLocaleDateString();
          const winnerText = r.winner_id ? `🏆 <@${r.winner_id}>` : (r.status === 'ACTIVE' ? "*(In Progress)*" : "*(No Winner)*");
          
          msg += `**${r.item_title}** \`ID: ${r.raffle_code || "N/A"}\`\n`;
          msg += `${statusIcon} **Price:** ${r.cost_per_slot}/slot | **Slots:** ${r.total_slots} | 📅 ${dateStr}\n`;
          msg += `> Winner: ${winnerText}\n\n`;
      }

      // Pagination Buttons
      const components = [];
      const row = { type: 1, components: [] as any[] };
      
      if (page > 1) {
          row.components.push({ type: 2, style: 2, label: "Previous", custom_id: `list_prev:${page}` });
      }
      
      // If there are more items beyond this page
      if (count && count > (end + 1)) {
          row.components.push({ type: 2, style: 2, label: "Next", custom_id: `list_next:${page}` });
      }

      if (row.components.length > 0) components.push(row);

      return jsonResponse({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: msg, components: components }
      });
  }

    if (subcommand?.name === "status") {

        const code = getOptionValue(subcommand.options, "raffle_code");

        

        let query = supabase.from("raffles").select("*").eq("guild_id", guild_id);

        

        if (code) {

            query = query.eq("raffle_code", code); // Lookup specific historic raffle

        } else {

            query = query.eq("status", "ACTIVE"); // Default to current active

        }

  

        const { data: raffle, error } = await query.maybeSingle();

  

        if (!raffle) {

             return messageResponse(code ? `No raffle found with ID code: \`${code}\`` : "No active raffle at the moment.");

        }

  

        const { count: claimedCount } = await supabase.from("slots").select("*", { count: 'exact', head: true }).eq("raffle_id", raffle.raffle_id);

        const openSlots = raffle.total_slots - (claimedCount || 0);

        const startTimeDisplay = "<t:" + Math.floor(new Date(raffle.created_at).getTime() / 1000) + ":f>";

        let endTimeDisplay = "";

        if (raffle.close_timer) { endTimeDisplay = "\n⏳ **Ends:** <t:" + Math.floor(new Date(raffle.close_timer).getTime() / 1000) + ":R>"; }

  

        // Status Badge

        const statusBadge = raffle.status === 'ACTIVE' ? "🟢 **ACTIVE**" : (raffle.status === 'CLOSED' ? "🔴 **CLOSED**" : "🚫 **CANCELLED**");

        const winnerDisplay = raffle.winner_id ? `\n🏆 **Winner:** <@${raffle.winner_id}>` : "";

  

        const statusMsg = `📊 **Raffle Status** ${statusBadge}\n` + 

                          "**" + raffle.item_title + "** (ID: `" + (raffle.raffle_code || "N/A") + "`)\n\n" +

                          "🏷️ **Market Price:** $" + raffle.market_price.toFixed(2) + "\n" +

                          "--------------------------------\n" +

                          "🔢 **Total Slots:** " + raffle.total_slots + "\n" +

                          "💵 **Price Per Slot:** $" + raffle.cost_per_slot.toFixed(2) + "\n" +

                          "🟢 **Open Slots:** " + openSlots + "\n\n" +

                          "🕒 **Started:** " + startTimeDisplay + endTimeDisplay + "\n" +

                          winnerDisplay + "\n" + 

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

export async function handleModalSubmit(interaction: any, supabase: SupabaseClient) {
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

    const total_slots = parseInt(slotsStr);
    const market_price = parseFloat(priceStr);
    const max_slots = parseInt(maxSlotsStr);

    if (isNaN(total_slots) || total_slots < 1) return errorResponse("Total slots must be a valid number greater than 0.");
    if (isNaN(market_price) || market_price < 0) return errorResponse("Market price must be a valid positive number.");
    if (isNaN(max_slots) || max_slots < 1) return errorResponse("Max slots per user must be a valid number.");

    const { data: raffle } = await supabase.from("raffles").select("*").eq("raffle_id", raffleId).single();
    if (!raffle || raffle.status !== 'PENDING') return errorResponse("Raffle not found or expired.");

    const { data: hostData } = await supabase.from("raffle_hosts").select("commission_rate").eq("host_id", raffle.host_id).single();
    const commissionRateStr = hostData?.commission_rate || "0%";
    const commissionAmount = parseCommission(commissionRateStr, market_price);
    
    // Commission is absorbed, so Total Value = Market Price
    const totalRaffleValue = market_price; 
    const netToHost = market_price - commissionAmount;
    
    const cost_per_slot = bankersRound(totalRaffleValue / total_slots);

    await supabase.from("raffles").update({
        item_description: desc,
        total_slots: total_slots,
        market_price: market_price,
        cost_per_slot: cost_per_slot,
        max_slots_per_user: max_slots,
    }).eq("raffle_id", raffleId);

    const msgContent = "⚠️ **Please Confirm Raffle Details**\n\n" + 
                       "**Title:** " + raffle.item_title + "\n" +
                       "**ID:** `" + (raffle.raffle_code || "PENDING") + "`\n" +
                       "**Slots:** " + total_slots + "\n" +
                       "**Market Price:** $" + market_price.toFixed(2) + "\n" +
                       "--------------------------------\n" +
                       "💵 **Calculated Slot Price:** $" + cost_per_slot.toFixed(2) + " (Rounded)\n" +
                       "--------------------------------\n" +
                       "**Host Fees:** -$" + commissionAmount.toFixed(2) + " (Deducted from total)\n" +
                       "**Net to Host:** $" + netToHost.toFixed(2) + "\n" +
                       "**Max Claims:** " + max_slots + "\n" +
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

export async function handleMessageComponent(interaction: any, supabase: SupabaseClient) {
    const customId = interaction.data.custom_id;
    const [action, value] = customId.split(":");

    if (action === "list_prev" || action === "list_next") {
        const currentPage = parseInt(value);
        const newPage = action === "list_next" ? currentPage + 1 : currentPage - 1;
        const guild_id = interaction.guild_id;

        const pageSize = 5;
        const start = (newPage - 1) * pageSize;
        const end = start + pageSize - 1;

        const { data: raffles, count } = await supabase
            .from("raffles")
            .select("*", { count: 'exact' })
            .eq("guild_id", guild_id)
            .order('created_at', { ascending: false })
            .range(start, end);

        if (!raffles || raffles.length === 0) {
            return jsonResponse({ type: 7, data: { content: "No more raffles.", components: [] } });
        }

        let msg = `📜 **Raffle History** (Page ${newPage})\n\n`;
        for (const r of raffles) {
            const statusIcon = r.status === 'ACTIVE' ? "🟢" : (r.status === 'CLOSED' ? "🔴" : "🚫");
            const dateStr = new Date(r.created_at).toLocaleDateString();
            const winnerText = r.winner_id ? `🏆 <@${r.winner_id}>` : (r.status === 'ACTIVE' ? "*(In Progress)*" : "*(No Winner)*");
            
            msg += `**${r.item_title}** \`ID: ${r.raffle_code || "N/A"}\`\n`;
            msg += `${statusIcon} **Price:** $${r.cost_per_slot}/slot | **Slots:** ${r.total_slots} | 📅 ${dateStr}\n`;
            msg += `> Winner: ${winnerText}\n\n`;
        }

        const components = [];
        const row = { type: 1, components: [] as any[] };
        
        if (newPage > 1) {
            row.components.push({ type: 2, style: 2, label: "Previous", custom_id: `list_prev:${newPage}` });
        }
        if (count && count > (end + 1)) {
            row.components.push({ type: 2, style: 2, label: "Next", custom_id: `list_next:${newPage}` });
        }
        if (row.components.length > 0) components.push(row);

        // Update the message (Type 7)
        return jsonResponse({
            type: 7,
            data: { content: msg, components: components }
        });
    }

    const raffleId = value; // For raffle_cancel/confirm, value is ID

    if (action === "raffle_cancel") {
        await supabase.from("raffles").delete().eq("raffle_id", raffleId);
        return jsonResponse({ type: 7, data: { content: "❌ Raffle creation cancelled.", components: [] } });
    }

    if (action === "raffle_confirm") {
        const { data: raffle } = await supabase.from("raffles").select("*").eq("raffle_id", raffleId).single();
        if (!raffle || raffle.status !== 'PENDING') return errorResponse("Raffle invalid or already processed.");

        await supabase.from("raffles").update({
            status: "ACTIVE",
            created_at: new Date().toISOString()
        }).eq("raffle_id", raffleId);

        const startTimeDisplay = "<t:" + Math.floor(Date.now() / 1000) + ":f>";
        let endTimeDisplay = "";
        if (raffle.close_timer) { endTimeDisplay = "\n⏳ **Ends:** <t:" + Math.floor(new Date(raffle.close_timer).getTime() / 1000) + ":R>"; }

        const msgContent = "🎉 **New Raffle Started!**\n" + 
                       "**" + raffle.item_title + "** (ID: `" + (raffle.raffle_code || "N/A") + "`)\n\n" + 
                       "🏷️ **Market Price:** $" + raffle.market_price.toFixed(2) + "\n" +
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
