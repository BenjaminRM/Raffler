import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOptionValue, errorResponse, messageResponse, sendDM } from "../discord.ts";
import { ensureUser } from "../db.ts";

export async function handleClaimCommand(interaction: any, supabase: SupabaseClient) {
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
