# Architettura Agenti-Prodotto — Fantateam

> ⚠️ **Cancello.** Questi agenti si implementano **solo dopo** che:
> 1. la base gira (Slice 1–2: lega, squadre, classifica, giocatori reali importati), e
> 2. è stata scelta la strada sui dati (CSV manuale vs API eventi partita).
>
> Un agente vale quanto i dati che ha sotto. Costruirli prima significa costruire una
> chat carina che non sa niente. Prima i dati, poi il cervello.

## Cosa NON sono

Questi **non** sono i subagent di Claude Code in `.claude/agents/`. Quelli aiutano a
*sviluppare*. Questi sono **codice TypeScript che gira su Vercel** e risponde agli utenti.
Claude Code li scrive; non li *diventa*.

## Pattern (lo stesso di StudioPro)

```
Utente → API route (/api/coach) → Orchestrator → { Coach, Scout, Lineup, News, Market, Opponent } → Anthropic API
                                                          ↑
                                             ognuno legge i dati dal DB Fantateam
```

Ogni agente è un **modulo server-side** con tre cose:
- un **system prompt** focalizzato sul suo ruolo;
- **accesso ai dati** che gli servono (query al DB, non tutto lo schema);
- una **chiamata all'Anthropic API**, eventualmente con tool/function calling.

L'**Orchestrator** riceve la domanda dell'utente, decide quali agenti interpellare,
raccoglie i loro output e compone la risposta finale. È l'unico che parla direttamente
con l'utente.

## Struttura file suggerita

```
lib/agents/
  orchestrator.ts     # instrada e compone
  coach.ts            # la chat principale
  scout.ts            # analisi giocatori / acquisti
  lineup.ts           # miglior formazione
  news.ts             # news, infortuni, convocazioni
  market.ts           # scambi, occasioni
  opponent.ts         # studio avversari di lega
  shared/
    prompt.ts         # prompt riusabili, formato output
    data.ts           # funzioni di lettura dati condivise
app/api/coach/route.ts  # entry point utente
```

## Ordine di costruzione

1. **Orchestrator + Coach** insieme. Il Coach è la chat "chi schiero? / faccio questo scambio?".
   All'inizio l'Orchestrator ha un solo agente da chiamare: il Coach stesso, che legge
   direttamente i dati. Questo dà il primo "wow" con il minimo di infrastruttura.
2. **Lineup** e **Scout**: i due che il Coach userà più spesso. Man mano che esistono,
   l'Orchestrator smette di far leggere tutto al Coach e delega a loro.
3. **News** e **Opponent**: dipendono da fonti esterne (news / storico formazioni lega).
4. **Market**: il più "di ragionamento", arriva quando gli altri gli fanno da base.

## Dipendenze dai dati (perché il cancello conta)

| Agente    | Cosa gli serve davvero                                  |
|-----------|--------------------------------------------------------|
| Coach     | rosa utente, calendario, voti/fantavoti recenti        |
| Lineup    | probabili formazioni, indisponibili, forma             |
| Scout     | statistiche storiche giocatori, rendimento             |
| News      | feed news/infortuni/convocazioni (fonte esterna)       |
| Opponent  | storico formazioni degli altri utenti della lega       |
| Market    | listino/valori, output di Scout                        |

Coach, Lineup e Scout partono con quello che hai già dopo l'import CSV. News e Opponent
hanno bisogno di dati che oggi **non hai** — vanno per ultimi, o restano stub onesti
("dati non ancora disponibili") finché la fonte non c'è.

## Nota tecnica

Ogni agente è una funzione async che prende un contesto tipizzato e ritorna un risultato
strutturato (non testo libero) così l'Orchestrator può comporre. Il testo in italiano lo
genera l'Orchestrator nella risposta finale; gli agenti interni possono ragionare in modo
più strutturato. Chiavi API mai nel client: tutto server-side nelle route `/api`.
