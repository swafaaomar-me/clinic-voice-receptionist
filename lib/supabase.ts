import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only database client. It uses the secret key, which bypasses Row Level
// Security, so it must never be imported into a "use client" component.
let client: SupabaseClient | null = null;

/** Returns the database client, creating it the first time it's needed. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
    }
    client = createClient(url, secretKey, { auth: { persistSession: false } });
  }
  return client;
}
