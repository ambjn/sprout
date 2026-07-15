/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_SPROUT_SLUG?: string;
  readonly VITE_SPROUT_DASHBOARD_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected into index.html at serve time by `sprout dashboard` (see src/cli/dashboard.ts) --
// a prebuilt static bundle can't have per-consumer Convex URL/keys baked in at
// `vite build` time, so runtime config is threaded in via this global instead of
// import.meta.env when running under `dashboard`. See DASHBOARD.md.
interface SproutRuntimeConfig {
  convexUrl?: string;
  slug?: string;
  dashboardKey?: string;
}

interface Window {
  __SPROUT_CONFIG__?: SproutRuntimeConfig;
}
