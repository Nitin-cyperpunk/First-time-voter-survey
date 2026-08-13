"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export function createClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
