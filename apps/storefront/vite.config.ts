import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import mkcert from "vite-plugin-mkcert";

const isProduction = process.env.NODE_ENV === "production" || process.env.CF_PAGES === "1";
const isCI = process.env.CI === "true";

export default defineConfig({
  // Avoid writing Vite caches under node_modules (can cause EXDEV issues in Docker/overlayfs)
  cacheDir: ".vite",
  // Ensure the SSR build lands where React Router expects it: <buildDirectory>/server
  environments: {
    ssr: {
      build: {
        outDir: "dist/server",
      },
    },
  },
  plugins: [
    // Only use mkcert for local development (not in CI/production builds)
    // !isProduction && !isCI && mkcert(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ].filter(Boolean),
  esbuild: {
    jsx: "automatic",
  },
});

