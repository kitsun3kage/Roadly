import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Klient Supabase jest opcjonalny. Synchronizacja w chmurze jest aktywna
 * wyłącznie gdy obie zmienne środowiskowe są ustawione.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true } }) : null;

export const isSupabaseEnabled = Boolean(supabase);