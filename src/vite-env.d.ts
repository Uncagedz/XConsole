/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_PRIMARY_LOCATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
