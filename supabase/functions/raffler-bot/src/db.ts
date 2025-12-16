import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function ensureUser(supabase: SupabaseClient, user: { id: string; username: string; discriminator?: string; global_name?: string }) {
  const { error } = await supabase.from('users').upsert({
    user_id: user.id,
    username: user.username,
    display_name: user.global_name || user.username,
  });
  if (error) console.error("Error upserting user:", error);
}
