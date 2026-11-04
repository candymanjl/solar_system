import { copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Keep in sync with the GitHub Pages project path. Trailing slash required. */
const BASE = "/solar_system/";

/** GitHub Pages has no SPA fallback. Mirror index.html to 404.html and skip Jekyll. */
function githubPagesPlugin(): Plugin {
  return {
    name: "github-pages",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir;
      if (!dir) return;
      copyFileSync(resolve(dir, "index.html"), resolve(dir, "404.html"));
      writeFileSync(resolve(dir, ".nojekyll"), "");
    },
  };
}

export default defineConfig({
  // Project site: https://<user>.github.io/solar_system/
  base: BASE,
  plugins: [react(), tailwindcss(), githubPagesPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
