import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
//
// The `base` path is read from a build configuration value so the static build
// works when served from a GitHub Pages project subpath (Req 10.2).
//
// Configure it by setting `VITE_BASE_PATH` (for example `/my-repo/`) in the
// environment or in a `.env` file. When unset it defaults to `/`, which is the
// correct value for local dev and for a user/organization GitHub Pages site
// served from the domain root.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH ?? '/';

  return {
    base,
    plugins: [react()],
  };
});
