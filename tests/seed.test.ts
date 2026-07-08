import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/prisma";

// Il seed (prisma/seed.ts) è uno script standalone, non pensato per essere
// importato come modulo: lo eseguiamo come processo figlio, esattamente come
// farebbe `npm run seed`, e verifichiamo che rilanciarlo non crei duplicati.
//
// Il DB Neon reale ha già gli 807 giocatori del CSV importati in precedenza:
// questo test verifica la sola idempotenza (nessun nuovo Player creato),
// non l'import iniziale. Non tocca né cancella Player.
describe("prisma/seed.ts", () => {
  it("rilanciare il seed non crea nuovi giocatori (idempotente)", async () => {
    const before = await prisma.player.count();

    const output = execFileSync("node", ["prisma/seed.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 60_000,
    });

    const after = await prisma.player.count();

    expect(after).toBe(before);
    expect(output).toMatch(/Nuovi giocatori importati in questa esecuzione: 0/);
    expect(output).toMatch(/Righe malformate scartate: 0/);
    expect(output).toMatch(new RegExp(`Totale giocatori nel DB: ${after}`));
  }, 60_000);
});
