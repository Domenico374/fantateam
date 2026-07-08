# Slice 2 — Giocatori e Rose

Seconda fetta verticale. Obiettivo: importare i giocatori reali di Serie A nel database e poterli assegnare alle rose delle squadre da una pagina web. Brutta ma viva.

Nessun voto, nessun fantavoto, nessun punteggio, nessuna asta con budget in questa slice. Solo: i giocatori esistono, e posso comporre una rosa scegliendoli.

## Prerequisito

Il file data/players.csv è già nel repo. Intestazione esatta: ruolo,nome,squadra,costo
807 righe. ruolo ∈ {P, D, C, A}. costo è un intero (Fantamilioni, 1–87). Le 20 squadre di Serie A compaiono come stringhe (es. Inter, Hellas Verona). NON modificare il CSV.

## Obiettivo

1. Uno script di seed importa i 807 giocatori da data/players.csv nel database (idempotente: rilanciarlo non crea duplicati).
2. Da una pagina web, dentro una squadra, posso aggiungere giocatori alla sua rosa (cercandoli/filtrandoli per ruolo e per squadra di Serie A) e vederli elencati nella rosa.
3. Posso rimuovere un giocatore dalla rosa.

## Modello dati (Prisma)

Aggiungere allo schema esistente (League, Team):
- Player — id, nome (String), ruolo (String: P/D/C/A), squadraSerieA (String), costo (Int), createdAt. Indici su ruolo e squadraSerieA.
- RosterEntry — la rosa: collega un Player a una Team. id, teamId (FK Team), playerId (FK Player), createdAt. Vincolo di unicità su (teamId, playerId).
- Relazioni: una Team ha molte RosterEntry; un Player può stare in molte RosterEntry.

Genera la migrazione con nome descrittivo e applicala a Neon.

ATTENZIONE: Team = fanta-squadra di un utente (già esistente dalla Slice 1). squadraSerieA = la squadra reale del giocatore (Inter, Napoli…), è solo un campo stringa del Player, NON una tabella. Non confonderle.

## Import (seed script)

- Script prisma/seed.ts (o scripts/import-players.ts) che legge data/players.csv, fa il parse e fa upsert dei Player.
- Idempotente: chiave logica nome + squadraSerieA per evitare duplicati.
- Validazione: ruolo ∈ P/D/C/A; costo intero ≥ 1; scarta e logga righe malformate.
- A fine import stampa: quanti giocatori importati, conteggio per ruolo, numero squadre distinte. Deve dire 807 e 20.
- Comando documentato (es. npm run seed).

## API (route handlers Next.js)

- GET /api/players → lista con filtri opzionali: ?ruolo=P e/o ?squadra=Inter e/o ?search=<nome>. Ordinati per costo desc. Limita a 50 risultati.
- GET /api/teams/:id/roster → la rosa di una squadra.
- POST /api/teams/:id/roster → aggiunge un giocatore { playerId }. 409 se già presente.
- DELETE /api/teams/:id/roster/:playerId → rimuove il giocatore dalla rosa.
- Validazione input e status code sensati (400/404/409).

## UI (App Router)

Pagina rosa per una Team, es. /teams/[id]/roster:
- Mostra la rosa attuale: giocatori ordinati per ruolo, con nome, ruolo, squadra Serie A, costo. Ogni giocatore ha un bottone Rimuovi.
- Pannello di ricerca giocatori: filtro per ruolo, filtro per squadra Serie A, campo ricerca per nome. Risultati con bottone Aggiungi alla rosa.
- Mostra il totale costo della rosa (somma dei costi). Informativo, nessun budget da rispettare ancora.
- Componenti client con fetch, niente submit nativo.

## Test (Vitest)

- Il seed importa 807 giocatori; rilanciarlo NON crea duplicati.
- GET /api/players?ruolo=P ritorna solo portieri.
- GET /api/players?squadra=Inter ritorna solo giocatori dell'Inter.
- Aggiunta giocatore alla rosa → compare in GET roster.
- Aggiungere due volte lo stesso giocatore → 409.
- Rimozione giocatore → sparisce dalla rosa.

## Criteri di completamento

- [ ] npm run seed importa 807 giocatori (807 righe, 20 squadre, conteggio P/D/C/A corretto).
- [ ] Rilanciare npm run seed non crea duplicati.
- [ ] Da /teams/[id]/roster filtro per ruolo e squadra, cerco per nome.
- [ ] Aggiungo giocatori alla rosa e li vedo con il costo totale.
- [ ] Rimuovo un giocatore e sparisce.
- [ ] npm test passa tutti i test, inclusi quelli della Slice 1 (nessuna regressione).
- [ ] data/players.csv è incluso nel commit.

Quando tutti i box sono spuntati: fermati, riepiloga, e proponi il commit. Non iniziare la Slice 3.
