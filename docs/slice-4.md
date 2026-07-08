# Slice 4 — Ownership delle squadre

Obiettivo: ogni squadra appartiene a un utente, e solo il proprietario può modificarla (aggiungere/rimuovere squadre e giocatori in rosa).

## Prerequisito / pulizia dati
Le leghe e squadre esistenti sono dati di prova creati prima dell'auth (es. lega "fantaorto", squadra "domenico") e non hanno proprietario. Vanno cancellate prima o durante la migrazione, così ogni squadra nasce con un ownerId valido e non restano record orfani. I 807 Player NON si toccano.

## Obiettivo
1. Ogni Team ha un proprietario (ownerId → User).
2. Creare una squadra richiede login; la squadra viene assegnata all'utente corrente.
3. Modificare la rosa è consentito solo al proprietario: 401 se non loggato, 403 se loggato ma non proprietario.
4. In UI i controlli di modifica appaiono solo al proprietario; gli altri vedono in sola lettura.

## Modello dati (Prisma)
- Team: aggiungere ownerId (String) + relazione owner User, onDelete: Restrict.
- User: relazione inversa teams Team[].
- Generare la migrazione. Le Team esistenti vanno cancellate, quindi ownerId può essere NOT NULL senza bisogno di gestire righe vecchie.

## Autorizzazione lato server (cuore della slice)
Enforcement lato server, il middleware NON è il confine di sicurezza (CVE-2025-29927).
- Data Access Layer con due helper in lib/ (es. lib/authz.ts):
  - requireUser() → sessione o 401.
  - requireTeamOwner(teamId) → verifica sessione E session.user.id === team.ownerId; 401 se non loggato, 403 se non proprietario, 404 se la squadra non esiste.
- Ogni route handler che crea/modifica dati chiama questi helper come PRIMA cosa, con query reali.
- Route: POST /api/leagues/:id/teams (requireUser, ownerId = user.id); POST /api/teams/:id/roster (requireTeamOwner); DELETE /api/teams/:id/roster/:playerId (requireTeamOwner).
- Le GET (classifica, roster, players) restano pubbliche.

## UI (App Router)
- Nelle pagine lega e rosa, leggere la sessione lato server e passare un flag isOwner.
- Se isOwner falso: niente form/bottoni di modifica, sola lettura.
- Se isOwner vero: controlli di modifica come oggi.
- Nascondere i bottoni è solo comodità: la protezione vera resta lato server (chiamata diretta all'API senza essere proprietario → 401/403).
- Gestire lato client 401/403 con messaggio comprensibile.

## Test (Vitest)
- Creare una squadra senza sessione → 401.
- Creare una squadra da loggato → ownerId = utente corrente.
- Il proprietario aggiunge/rimuove un giocatore → funziona.
- Un utente NON proprietario prova a modificare la rosa altrui → 403.
- Un anonimo prova a modificare una rosa → 401.
- Le GET pubbliche funzionano da anonimo.
- Nessuna regressione: i test di Slice 1, 2, 3 continuano a passare.

## Criteri di completamento
- [ ] I dati di prova pre-auth rimossi; ogni Team ha un ownerId valido.
- [ ] Da loggato creo lega e squadra; la squadra risulta mia.
- [ ] Da proprietario compongo la rosa come nella Slice 2.
- [ ] Da un secondo utente o da incognito NON riesco a modificare la mia squadra: 403/401, e i bottoni non compaiono.
- [ ] Le pagine restano visibili in sola lettura a chi non è proprietario.
- [ ] Chiamando le API di modifica direttamente senza essere proprietario → 401/403 (verificato, non basta nascondere i bottoni).
- [ ] npm test passa tutti i test, inclusi Slice 1, 2, 3.

Quando tutti i box sono spuntati: fermati, riepiloga, proponi il commit. Con questa slice l'autenticazione è completa.
