import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSubcommand, getOptionValue, errorResponse, messageResponse } from "../discord.ts";
import { ensureUser } from "../db.ts";

export async function handleHostCommand(interaction: any, supabase: SupabaseClient) {
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
      const { data: host, error: hostError } = await supabase.from("raffle_hosts").select("*").eq("host_id", targetUserId).single();
      
      if (hostError || !host) {
          return errorResponse(targetUserId === user.id ? "You are not registered as a host. Run `/host setup` first." : "That user is not a registered host.");
      }

      const { data: payments } = await supabase.from("host_payment_methods").select("*").eq("host_id", targetUserId);

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
