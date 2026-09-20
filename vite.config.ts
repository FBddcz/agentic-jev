import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [
    react({ jsxImportSource: "@agentic/i18n" }),
    {
      name: "keep-app-localization-live",
      configResolved(config) {
        // React adds its JSX runtimes to prebundling. Ours is application code:
        // bundling it would snapshot a separate locale store and dictionary.
        config.optimizeDeps.include = config.optimizeDeps.include?.filter(
          (id) => !id.startsWith("@agentic/i18n"),
        );
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@agentic/i18n/jsx-runtime", "@agentic/i18n/jsx-dev-runtime"],
    include: ["react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  resolve: {
    alias: {
      "@agentic/i18n": fileURLToPath(new URL("./src/i18n", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1" },
});
