/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PUBLIC_META_PIXEL_ID?: string
  readonly PUBLIC_PLAUSIBLE_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
