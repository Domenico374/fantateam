import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Il file .env non esiste in ambienti dove le env var arrivano già iniettate
// (es. CI/Vercel): process.loadEnvFile lancerebbe ENOENT se chiamato a vuoto.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RUOLI_VALIDI = new Set(["P", "D", "C", "A"]);
const CSV_PATH = join(process.cwd(), "data", "players.csv");

type CsvRow = {
  ruolo: string;
  nome: string;
  squadra: string;
  costo: string;
};

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  const [, ...dataLines] = lines; // scarta l'header
  return dataLines.map((line) => {
    const [ruolo, nome, squadra, costo] = line.split(",");
    return { ruolo, nome, squadra, costo };
  });
}

async function main() {
  const content = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(content);

  const existing = await prisma.player.findMany({
    select: { nome: true, squadraSerieA: true, ruolo: true },
  });
  const existingKeys = new Set(
    existing.map((p) => `${p.nome}|${p.squadraSerieA}|${p.ruolo}`)
  );

  let importati = 0;
  let saltatiEsistenti = 0;
  const malformate: { riga: CsvRow; motivo: string }[] = [];

  for (const row of rows) {
    const ruolo = row.ruolo?.trim();
    const nome = row.nome?.trim();
    const squadra = row.squadra?.trim();
    const costoNum = Number(row.costo);

    if (!ruolo || !RUOLI_VALIDI.has(ruolo)) {
      malformate.push({ riga: row, motivo: `ruolo non valido: "${row.ruolo}"` });
      continue;
    }
    if (!nome) {
      malformate.push({ riga: row, motivo: "nome mancante" });
      continue;
    }
    if (!squadra) {
      malformate.push({ riga: row, motivo: "squadra mancante" });
      continue;
    }
    if (!Number.isInteger(costoNum) || costoNum < 1) {
      malformate.push({ riga: row, motivo: `costo non valido: "${row.costo}"` });
      continue;
    }

    // Chiave logica (nome, squadraSerieA, ruolo): il CSV contiene 7 coppie
    // nome+squadra che corrispondono a DUE giocatori reali distinti con lo
    // stesso cognome nello stesso club (es. "Martinez" Inter: il portiere
    // Josep Martinez e l'attaccante Lautaro Martinez). Usare solo nome+squadra
    // ne farebbe scartare uno come "duplicato" per errore. In tutti e 7 i casi
    // il ruolo differisce, quindi aggiungerlo alla chiave disambigua senza
    // introdurre falsi duplicati (verificato: 807 chiavi uniche su 807 righe).
    const key = `${nome}|${squadra}|${ruolo}`;
    if (existingKeys.has(key)) {
      saltatiEsistenti++;
      continue;
    }

    await prisma.player.create({
      data: { nome, ruolo, squadraSerieA: squadra, costo: costoNum },
    });
    existingKeys.add(key);
    importati++;
  }

  const totale = await prisma.player.count();
  const perRuolo = await prisma.player.groupBy({
    by: ["ruolo"],
    _count: { _all: true },
  });
  const squadreDistinte = await prisma.player.findMany({
    distinct: ["squadraSerieA"],
    select: { squadraSerieA: true },
  });

  console.log(`Righe nel CSV: ${rows.length}`);
  console.log(`Nuovi giocatori importati in questa esecuzione: ${importati}`);
  console.log(`Già presenti (saltati, idempotenza): ${saltatiEsistenti}`);
  console.log(`Righe malformate scartate: ${malformate.length}`);
  for (const m of malformate) {
    console.log(`  - ${JSON.stringify(m.riga)} -> ${m.motivo}`);
  }
  console.log(`\nTotale giocatori nel DB: ${totale}`);
  console.log("Conteggio per ruolo:");
  for (const r of perRuolo.sort((a, b) => a.ruolo.localeCompare(b.ruolo))) {
    console.log(`  ${r.ruolo}: ${r._count._all}`);
  }
  console.log(`Squadre distinte: ${squadreDistinte.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
