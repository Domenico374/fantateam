// Vitest non passa da prisma.config.ts, quindi carichiamo .env qui allo
// stesso modo (Prisma 7 / Node non lo fanno più automaticamente).
if (!process.env.DATABASE_URL) {
  process.loadEnvFile(".env");
}
