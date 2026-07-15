# Slice 5 — Partecipazione alle leghe

Obiettivo: una lega può essere pubblica o privata. Un utente può entrare in una lega pubblica
liberamente, o in una privata con un codice d'invito. Entrando, gli nasce una squadra in quella
lega. Il creatore di una lega è automaticamente il primo partecipante.

In questa slice NON si tocca: import giocatori, rosa (Slice 2), autenticazione (Slice 3),
proprietà/autorizzazione sulla rosa (Slice 4, resta valida così com'è). Non si introduce alcuna
formula di punteggio/fantavoto.

## Prerequisito / pulizia dati

`League` oggi non ha un creatore. Se in produzione esistono già leghe (verificare: al momento
di scrivere questa spec il conteggio è 0), vanno cancellate prima della migrazione — stesso
approccio della Slice 4 per `Team.ownerId`: la colonna `creatorId` nasce NOT NULL, niente
backfill di comodo su dati di prova. `Team` è vuota per lo stesso motivo (nessun problema ad
aggiungere il vincolo di unicità).

## Cosa cambia rispetto a oggi (importante)

- `POST /api/leagues` oggi **non richiede login** — chiunque, anche anonimo, crea una lega. Da
  questa slice richiede sessione: è una correzione di un buco di autorizzazione preesistente,
  non solo una funzionalità nuova.
- Oggi creare una squadra (`POST /api/leagues/:id/teams`) equivale de facto a "entrare" in una
  lega, senza alcun limite: un utente può creare più squadre nella stessa lega, in qualunque
  lega. Questa slice formalizza quell'azione come "join" e la vincola.

## Modello dati (Prisma)

Nessun modello nuovo (vedi sotto perché). Modifiche a modelli esistenti:

- `League`:
  - `creatorId String` — FK verso `User`, `onDelete: Restrict` (coerente con `Team.ownerId`).
  - `isPrivate Boolean @default(false)`.
  - `inviteCode String? @unique` — valorizzato solo se `isPrivate = true`.
  - relazione inversa `creator User @relation(...)`; su `User` aggiungere `leaguesCreated League[]`.
- `Team`:
  - aggiungere `@@unique([leagueId, ownerId])` — un utente ha al massimo una squadra per lega.
    Questo vincolo **è** la "membership": non introduciamo una tabella `LeagueMembership`
    separata perché nel dominio (anche secondo la tua stessa specifica, punto 4) partecipare a
    una lega coincide con avervi una squadra — sono la stessa relazione, non due concetti
    distinti. Se in futuro servisse un concetto di partecipante-senza-squadra (richiesta di
    adesione in sospeso, co-manager multipli su una squadra) si introdurrà lì, quando serve
    davvero.

Genera la migrazione e applicala a Neon. Nessun impatto su `Player`/`RosterEntry`.

## Generazione codice d'invito

- 8 caratteri, alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (esclude `0/O/1/I/L` per leggibilità).
- Generato con `crypto.randomInt` (RNG sicuro), mai scelto o proposto dal client.
- Genera e verifica unicità con un retry in caso di collisione (probabilità trascurabile, ma va
  gestita).
- Solo le leghe con `isPrivate = true` ne hanno uno; le pubbliche restano `inviteCode = null`.

## API (route handlers Next.js)

- `POST /api/leagues` — **cambia il contratto esistente**. Richiede login (`requireUser`, 401
  se anonimo). Body: `{ name, isPrivate, teamName }`. `teamName` è obbligatorio (il creatore
  nasce con la sua squadra). Crea `League` (con `creatorId = user.id`, `inviteCode` generato se
  `isPrivate`) e la `Team` del creatore **nella stessa transazione** (`prisma.$transaction`):
  mai una lega senza almeno la squadra di chi l'ha creata. Risposta: la lega creata, incluso
  `inviteCode` in chiaro (solo qui, è la risposta alla richiesta di chi l'ha appena creata).
- `GET /api/leagues` — resta pubblica. Aggiunge il campo `isPrivate` a ogni lega nella risposta.
  Aggiunge filtro opzionale `?joinable=true`: esclude le leghe private e (se il chiamante è
  loggato) quelle dove ha già una squadra — usata per "leghe pubbliche disponibili".
  **Non include mai `inviteCode`.**
- `GET /api/leagues/:id` — resta pubblica (nessun cambiamento per chi guarda). Aggiunge
  `isPrivate`. Include `inviteCode` **solo** se il chiamante è loggato ed è `creatorId` di
  quella lega (nuovo helper `getOptionalUser`, che legge la sessione se c'è senza bloccare la
  richiesta se manca).
- `POST /api/leagues/:id/teams` — **diventa il join per una lega pubblica** (stesso URL, nuove
  regole): `requireUser` (401); lega inesistente → 404; `isPrivate` → 403 ("lega privata, serve
  un codice d'invito"); utente già proprietario di una squadra in quella lega → 409 (pre-check
  + fallback su `P2002` come per l'aggiunta di un giocatore già in rosa); altrimenti crea la
  `Team` (`ownerId = user.id`) come oggi.
- `POST /api/leagues/join` (nuovo) — join di una lega privata by-code. Body `{ inviteCode,
  teamName }`. `requireUser` (401); nessuna lega con quel codice → 404 (stesso status di
  "codice sbagliato": un codice errato non deve essere distinguibile da uno inesistente);
  utente già in quella lega → 409; altrimenti crea la `Team`.
- `GET /api/leagues/mine` (nuovo) — "Le mie leghe": richiede login (401 se anonimo). Ritorna le
  leghe dove il chiamante ha una `Team`, con la sua squadra inclusa (nome, punti).

## UI (App Router)

- Form "Crea lega" (home o pagina dedicata): nome lega, toggle pubblica/privata, nome squadra
  del creatore (sempre richiesto). Se la lega creata è privata, mostra subito il codice
  d'invito con invito a copiarlo/condividerlo (è l'unico momento in cui il codice è ovvio da
  recuperare per l'utente, oltre a rivederlo — da loggato come creatore — nella pagina lega).
- Vista "Leghe pubbliche disponibili": lista da `GET /api/leagues?joinable=true`, bottone
  "Entra" per riga con richiesta del nome squadra, chiama `POST /api/leagues/:id/teams`.
- Form "Entra con un codice": campo codice + nome squadra, chiama `POST /api/leagues/join`.
- Pagina "Le mie leghe" (nuova rotta, es. `/leagues/mine`): da `GET /api/leagues/mine`, link a
  ciascuna lega.
- Pagina lega esistente (`/leagues/[id]`): se il viewer è il creatore e la lega è privata,
  mostra il codice d'invito. Se la lega è privata e ha un badge visivo (🔒) nella classifica/
  liste dov'è mostrata la lega.
- Componenti client con fetch espliciti, niente submit nativo, coerente con le slice precedenti.

## ATTENZIONE — due domande di design che non decido da solo

1. **Visibilità di `GET /api/leagues/:id` per una lega privata.** Oggi è pubblica e mostra la
   classifica a chiunque abbia il link. Questa spec la lascia così (nessun cambiamento) per non
   introdurre un requisito non richiesto esplicitamente. Se invece vuoi che la classifica di una
   lega privata sia visibile SOLO ai membri, è un cambiamento in più da aggiungere qui prima di
   implementare (richiederebbe autenticare anche quella GET, oggi mai successo in questo
   progetto).
2. **`GET /api/leagues` di default (senza `?joinable=true`) continua a mostrare TUTTE le leghe**,
   comprese quelle private (solo il nome, mai il codice) — comportamento invariato rispetto a
   oggi. Se preferisci che le leghe private non compaiano affatto nella lista generale (nemmeno
   il nome, a chi non ne fa parte), va deciso ora.

## Sicurezza

- Ogni mutazione (`POST /api/leagues`, `POST .../teams`, `POST /api/leagues/join`) passa da
  `requireUser` come prima cosa, query reali, mai il middleware come confine (coerente con la
  nota CVE-2025-29927 già seguita dalla Slice 4).
- Codice d'invito: RNG crittografico, mai client-side, mai esposto a chi non è il creatore.
- **Limite non affrontato in questa slice**: nessun rate-limiting sui tentativi di
  `POST /api/leagues/join` — in teoria un codice a 8 caratteri è enumerabile a forza bruta senza
  un limitatore. Non esiste ancora infrastruttura di rate-limiting nel progetto; lo segnalo come
  limite noto, non lo finto risolto.
- Doppio join prevenuto a livello DB (`@@unique([leagueId, ownerId])`), non solo applicativo.

## Test (Vitest)

- `POST /api/leagues` senza sessione → 401 (comportamento NUOVO: verificare che rompa e poi
  correggere i test di Slice 1 esistenti che oggi creano leghe in anonimo, stesso tipo di
  aggiornamento fatto in Slice 4 per `tests/leagues.test.ts`).
- Creare una lega pubblica da loggato → creatore ha una squadra lì, `isPrivate = false`,
  `inviteCode = null`.
- Creare una lega privata → `inviteCode` generato, 8 caratteri, unico; non presente nella
  risposta di `GET /api/leagues` per un altro utente; presente per il creatore su
  `GET /api/leagues/:id`.
- `POST /api/leagues/:id/teams` su lega pubblica, utente non ancora membro → crea la squadra.
- Stesso utente, stessa lega, seconda chiamata → 409.
- `POST /api/leagues/:id/teams` su lega privata → 403.
- `POST /api/leagues/join` con codice corretto → crea la squadra.
- `POST /api/leagues/join` con codice sbagliato/inesistente → 404.
- `POST /api/leagues/join` da chi è già membro di quella lega → 409.
- `GET /api/leagues/mine` anonimo → 401; da loggato → solo le leghe con una sua squadra.
- `GET /api/leagues?joinable=true` esclude le private e le leghe dove l'utente loggato è già
  dentro.
- Nessuna regressione: test di Slice 1, 2, 3, 4 continuano a passare (con gli aggiornamenti
  attesi sui test di creazione lega, vedi sopra).

## Criteri di completamento

- [ ] Creo una lega pubblica da loggato: risulto automaticamente partecipante con la mia squadra.
- [ ] Creo una lega privata: ricevo un codice d'invito; un altro utente non lo vede da nessuna
      parte tranne inserendolo esplicitamente.
- [ ] Da un secondo utente, entro in una lega pubblica dalla lista "leghe disponibili" dandole
      un nome squadra.
- [ ] Da un terzo utente, entro in una lega privata inserendo il codice corretto.
- [ ] Un codice sbagliato non fa entrare da nessuna parte (404, nessuna squadra creata).
- [ ] Provo a entrare due volte nella stessa lega con lo stesso utente → bloccato (409), non
      compaiono due mie squadre.
- [ ] "Le mie leghe" mostra solo le leghe di cui sono davvero membro.
- [ ] `npm test` passa tutti i test, inclusi quelli di Slice 1-4 (nessuna regressione).

Quando tutti i box sono spuntati: fermati, riepiloga, proponi il commit. Non iniziare la Slice 6.
