import { existsSync } from "node:fs";

// Vitest non passa da prisma.config.ts, quindi carichiamo .env qui allo
// stesso modo (Prisma 7 / Node non lo fanno più automaticamente). Il file
// non esiste in ambienti dove le env var arrivano già iniettate (CI/Vercel):
// process.loadEnvFile lancerebbe ENOENT se chiamato a vuoto.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
