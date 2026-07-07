# CLAUDE.md — Fantateam

Istruzioni per Claude Code quando lavora su questo repo. Leggi **tutto** prima di scrivere codice.

## Cos'è Fantateam

Piattaforma AI-first per il Fantacalcio (Serie A italiana). L'obiettivo finale è un
ecosistema di agenti AI (Coach, Scout, Market, News, Opponent, Lineup) coordinati da un
Orchestrator, che aiutano il fantallenatore a decidere. La gestione lega/rose è la base,
non il fine. Interfaccia e contenuti sono in **italiano**.

## Principi di lavoro (i più importanti)

1. **Slice verticali, non layer orizzontali.** Ogni task deve produrre un pezzo funzionante
   end-to-end (modello → API → UI che lo mostra), non "tutto il livello database". Preferisco
   qualcosa di brutto che gira a qualcosa di elegante che non parte.
2. **Un task = un obiettivo chiuso e verificabile.** Quando l'obiettivo della slice è
   raggiunto e i test passano, **fermati e proponi il commit**. Non anticipare slice future.
3. **Niente finte.** Mai dati mock che *sembrano* reali (es. voti inventati passati come veri),
   mai stub che fingono di funzionare. Se manca una dipendenza esterna, dillo e fermati.
4. **Verifica prima di dichiarare fatto.** Esegui i test e, se possibile, avvia l'app. Non
   dire "fatto" senza aver visto il codice girare.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict).
- **PostgreSQL** su Neon (serverless). Connessione via `DATABASE_URL` in `.env` (mai committare `.env`).
- **Prisma** come ORM. Schema in `prisma/schema.prisma`, migrazioni versionate.
- API dentro Next.js (route handlers `app/api/.../route.ts`). **Nessun backend separato** per ora.
- UI: React server/client components, CSS semplice o Tailwind (concordare prima di introdurlo).
- Test: **Vitest** per unit/integration. Ogni slice porta i suoi test.
- Deploy target: **Vercel** (come StudioPro).

## Cosa NON fare senza chiedere

- Non introdurre un backend separato, microservizi, o monorepo con più package.
- Non aggiungere librerie pesanti (state manager globali, UI kit interi) senza motivarlo.
- Non toccare la strategia dati: per ora i voti/statistiche entrano via **import CSV manuale**
  a giornata. Niente scraping, niente API a pagamento finché non lo decidiamo esplicitamente.
- Non costruire agenti AI finché la base lega/rose/classifica non gira davvero.
- Non riscrivere il README o il logo esistenti.

## Convenzioni

- Codice e nomi variabili in inglese; testo UI, commenti di dominio e messaggi utente in italiano.
- Commit piccoli e descrittivi, in italiano, uno per slice completata.
- Un file `docs/slice-N.md` descrive lo scopo di ogni slice; leggilo prima di iniziarla.

## Terminologia di dominio (usa questi termini)

- **Lega**: competizione privata tra utenti. **Squadra (fanta-squadra)**: la rosa di un utente.
- **Rosa**: giocatori posseduti. **Giornata**: turno di campionato.
- **Voto**: voto base del giocatore. **Fantavoto**: voto + bonus/malus. **Bonus/Malus**:
  gol (+3), assist (+1), ammonizione (−0.5), espulsione (−1), ecc. (formula configurabile).
