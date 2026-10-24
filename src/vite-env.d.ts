/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path for the build, used for the GitHub Pages project subpath (Req 10.2). */
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
