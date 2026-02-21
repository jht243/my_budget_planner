import { createClient } from "@supabase/supabase-js";

declare global {
    interface Window {
        SUPABASE_ENV?: {
            url: string;
            anonKey: string;
        };
    }
}

// Fallback to import.meta.env if running locally with Vite, otherwise rely on MCP server injection
// @ts-ignore
const supabaseUrl = window.SUPABASE_ENV?.url || import.meta.env?.VITE_SUPABASE_URL || "";
// @ts-ignore
const supabaseAnonKey = window.SUPABASE_ENV?.anonKey || import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
