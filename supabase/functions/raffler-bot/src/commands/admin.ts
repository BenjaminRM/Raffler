import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSubcommand, getOptionValue, errorResponse, messageResponse } from "../discord.ts";

export async function handleAdminCommand(interaction: any, supabase: SupabaseClient) {
  const { data } = interaction;
  const subcommand = getSubcommand(data.options);
  const guild_id = interaction.guild_id;

  if (!guild_id) return errorResponse("This command can only be used in a server.");

  if (subcommand?.name === "set_host_role") {
    const roleId = getOptionValue(subcommand.options, "role");

    const { error } = await supabase.from("guild_configs").upsert({
      guild_id: guild_id,
      raffle_host_role_id: roleId
    });

    if (error) return errorResponse(`Failed to update configuration: ${error.message}`);
    
    return messageResponse(`✅ **Raffle Host Role Updated!**\nUsers with the <@&${roleId}> role can now create raffles.`);
  }

  return errorResponse("Unknown admin subcommand.");
}
