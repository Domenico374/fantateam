# Slice 3 — Autenticazione di base

Obiettivo: un utente può registrarsi, fare login e logout, e la sessione è leggibile lato server. Niente di più.

In questa slice NON si tocca il comportamento di squadre/rose. League, Team, Player e RosterEntry restano accessibili come oggi. L'autorizzazione ("solo il proprietario modifica la sua squadra") è la Slice 4, separata.

## Libreria
Better Auth con adapter Prisma. Self-hosted, utenti nel nostro Postgres su Neon, supporto Next.js 15 App Router. Solo email + password in questa slice, niente OAuth.

## Modello dati (Prisma)
Aggiungere i modelli richiesti da Better Auth SENZA modificare i modelli di dominio esistenti:
- User, Session, Account, Verification, con la forma esatta attesa dall'adapter Better Auth della versione installata (seguire la documentazione ufficiale, non inventare le tabelle).
- NESSUN campo ownerId su Team in questa slice (è la Slice 4).
Generare la migrazione e applicarla a Neon.

## Configurazione e sessione
- Istanza Better Auth server-side (lib/auth.ts) con adapter Prisma e provider email+password.
- Route handler Better Auth (es. app/api/auth/[...all]/route.ts).
- Helper server-side getSession() usabile in Server Component e route handler.
- Client Better Auth lato browser per signup/login/logout.
- Segreti in .env (BETTER_AUTH_SECRET, BETTER_AUTH_URL), mai committati, aggiunti anche a .env.example senza valori.

## Pagine (non stilizzate, l'estetica è una fase dopo)
- /register: form nome + email + password.
- /login: form email + password.
- Logout: bottone che chiude la sessione.
- Home: se loggato mostra "Loggato come X" + Logout; se no, link a Login / Registrati.
Componenti client con handler espliciti, errori di base mostrati (credenziali errate, email già in uso).

## Sicurezza (il code-reviewer deve vigilare qui)
- Il middleware serve SOLO per l'esperienza utente (redirect a /login), MAI come unico confine di sicurezza. Riferimento CVE-2025-29927 (bypass middleware Next.js): un controllo solo nel middleware è aggirabile.
- Ogni punto che espone o modifica dati sensibili ri-verifica la sessione lato server con una query reale.
- Le password non si loggano mai, non si ritornano nelle API, sono hashate dalla libreria.

## Test (Vitest)
- Registrazione nuovo utente: l'utente esiste, la password NON è in chiaro nel DB.
- Registrazione con email esistente: errore gestito (non 500).
- Login corretto: sessione valida creata.
- Login con password errata: rifiutato.
- getSession riconosce l'utente autenticato e ritorna null per l'anonimo.
- Nessuna regressione: i test di Slice 1 e 2 continuano a passare.

## Criteri di completamento
- [ ] Da /register creo un account e risulto autenticato.
- [ ] Logout e poi login da /login con le stesse credenziali.
- [ ] La home mostra lo stato (loggato come X / non loggato).
- [ ] La password è hashata nel DB.
- [ ] Squadre e rose funzionano come prima (nessuna regressione).
- [ ] npm test passa tutti i test, inclusi Slice 1 e 2.
- [ ] Nuove chiavi in .env.example; .env resta non committato.

Quando tutti i box sono spuntati: fermati, riepiloga, proponi il commit. Non iniziare la Slice 4.
