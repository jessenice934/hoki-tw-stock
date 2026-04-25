/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY_2?: string;
  readonly VITE_GEMINI_API_KEY_3?: string;
  readonly VITE_GEMINI_API_KEY_4?: string;
  readonly VITE_GEMINI_API_KEY_5?: string;
  readonly VITE_GEMINI_API_KEY_6?: string;
  readonly VITE_GEMINI_API_KEY_7?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
