import { defineConfig } from "vitest/config";
import path from "node:path";

// Config minimale: testiamo solo route handler/logica server (niente componenti
// React), quindi environment "node" e niente jsdom. L'alias "@/*" replica
// tsconfig.json per poter importare i route handler con lo stesso path usato
// nell'app.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
