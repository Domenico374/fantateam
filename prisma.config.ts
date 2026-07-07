import { defineConfig, env } from "prisma/config";

// Prisma 7 non carica più automaticamente .env: lo carichiamo esplicitamente
// usando il loader nativo di Node (disponibile da Node 20.6+).
process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
