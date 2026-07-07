# Slice 1 — Lega, Squadre, Classifica

Prima fetta verticale. Obiettivo: avere qualcosa che **gira end-to-end** — si crea una lega,
si aggiungono squadre, si vede una classifica in una pagina web. Brutta ma viva.

Nessuna autenticazione, nessuna AI, nessun import voti in questa slice. Solo la spina dorsale.

## Obiettivo

Da una pagina web posso: creare una lega, aggiungere squadre a quella lega, e vedere la
classifica della lega (con punti a 0 per tutti, per ora) che si aggiorna quando aggiungo squadre.

## Modello dati (Prisma)

Minimo indispensabile:

- `League` — `id`, `name`, `createdAt`.
- `Team` — `id`, `name`, `leagueId` (FK → League), `points` (Int, default 0), `createdAt`.
- Relazione: una League ha molte Team.

Crea lo schema, genera la migrazione, applicala a Neon.

## API (route handlers Next.js)

- `POST /api/leagues` → crea una lega `{ name }`, ritorna la lega creata.
- `GET  /api/leagues` → lista tutte le leghe.
- `GET  /api/leagues/:id` → dettaglio lega + sue squadre ordinate per `points` desc.
- `POST /api/leagues/:id/teams` → aggiunge una squadra `{ name }` alla lega.

Validazione input di base (nome non vuoto). Errori con status code sensati (400/404).

## UI (App Router)

- `/` → lista delle leghe + form per crearne una nuova.
- `/leagues/[id]` → nome lega, form per aggiungere una squadra, e la **classifica**
  (tabella: posizione, nome squadra, punti) ordinata per punti.

Niente styling elaborato: leggibile e basta. **Non** usare `<form>` con submit nativo che
ricarica la pagina se lavori in componenti client — usa handler onClick/onChange e fetch.

## Test (Vitest)

Almeno:

- Creazione lega → la lega esiste nel DB.
- Aggiunta squadra a una lega → la squadra è collegata alla lega giusta.
- `GET /api/leagues/:id` ritorna le squadre ordinate per punti decrescenti.
- `POST` con nome vuoto → 400.

## Criteri di completamento (Definition of Done)

- [ ] `npm run dev` avvia l'app senza errori.
- [ ] Da `/` creo una lega e la vedo comparire nella lista.
- [ ] Da `/leagues/[id]` aggiungo 3 squadre e le vedo in classifica.
- [ ] `npm test` passa tutti i test.
- [ ] `.env` è in `.gitignore`; nel repo c'è un `.env.example` con `DATABASE_URL=`.

Quando tutti i box sono spuntati: **fermati, riepiloga cosa hai fatto, e proponi il commit.**
Non iniziare la Slice 2.
