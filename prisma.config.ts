import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 non carica più automaticamente .env: lo carichiamo esplicitamente
// usando il loader nativo di Node (disponibile da Node 20.6+). Il file non
// esiste in ambienti come Vercel (le env var arrivano già in process.env),
// e process.loadEnvFile lancia ENOENT se il file manca: va quindi chiamato
// solo se il file è presente, altrimenti "prisma generate" va in crash
// durante l'npm install del deploy.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
