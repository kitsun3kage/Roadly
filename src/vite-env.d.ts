/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEOCODING_PROVIDER?: string;
  readonly VITE_ROUTING_PROVIDER?: string;
  readonly VITE_OSRM_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}