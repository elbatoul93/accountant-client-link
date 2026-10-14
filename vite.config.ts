import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // The "-b2" suffix renames every built file once. The managementik.com edge had cached
        // index.html under some old /assets names (see public/_headers); a new name is never
        // in that cache. Change the suffix again only if a similar cleanup is ever needed.
        entryFileNames: "assets/[name]-[hash]-b2.js",
        chunkFileNames: "assets/[name]-[hash]-b2.js",
        assetFileNames: "assets/[name]-[hash]-b2[extname]",
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
