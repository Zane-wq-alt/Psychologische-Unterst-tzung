/* Public Supabase project settings. Leave empty to keep the app local-only.
   The anon/publishable key is public by design; never put a service-role key here. */
window.OPORA_SUPABASE_CONFIG = window.OPORA_SUPABASE_CONFIG || {
  url: "",
  anonKey: "",
  redirectTo: window.location.origin + window.location.pathname
};
