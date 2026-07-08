import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as getPlayers } from "@/app/api/players/route";
import {
  GET as getRoster,
  POST as postRoster,
} from "@/app/api/teams/[id]/roster/route";
import { DELETE as deleteRosterEntry } from "@/app/api/teams/[id]/roster/[playerId]/route";

// Prefisso univoco per riconoscere ed eliminare solo le League/Team di prova
// create da questa suite. I Player sono catalogo reale importato dal seed:
// NON vanno mai creati, modificati o cancellati dai test.
const TEST_PREFIX = "__test__slice2__";
const uniqueName = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}__${Math.random().toString(36).slice(2)}`;

function makePostRequest(url: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// Dalla Slice 4, Team.ownerId è obbligatorio e POST/DELETE roster richiedono
// che chi chiama sia il proprietario. Qui non testiamo l'ownership in sé
// (per quello c'è tests/authz.test.ts): usiamo un solo utente di test come
// proprietario di tutte le Team create da questa suite, e il suo cookie di
// sessione per le chiamate a postRoster/deleteRosterEntry che altrimenti
// ricevono 401 prima di arrivare alla logica applicativa che vogliamo testare.
let ownerUserId: string;
let ownerCookie: string;

async function createTestTeam() {
  const league = await prisma.league.create({
    data: { name: uniqueName("league") },
  });
  const team = await prisma.team.create({
    data: { name: uniqueName("team"), leagueId: league.id, ownerId: ownerUserId },
  });
  return { league, team };
}

// Traccia le league create nei singoli test per pulirle a fine test.
// onDelete: Cascade su Team e su RosterEntry fa sì che eliminando la League
// vengano eliminate anche le Team e le RosterEntry collegate. I Player
// (catalogo reale) restano intatti.
let createdLeagueIds: string[] = [];

afterEach(async () => {
  if (createdLeagueIds.length > 0) {
    await prisma.league.deleteMany({
      where: { id: { in: createdLeagueIds } },
    });
    createdLeagueIds = [];
  }
});

// Due giocatori reali distinti del catalogo, usati come fixture nei test di
// rosa. Non vengono mai creati/modificati/cancellati: solo letti.
let playerA: { id: string; ruolo: string; squadraSerieA: string };
let playerB: { id: string };

beforeAll(async () => {
  const found = await prisma.player.findMany({ take: 2 });
  if (found.length < 2) {
    throw new Error(
      "Servono almeno 2 Player nel DB per questi test: esegui `npm run seed` prima di `npm test`."
    );
  }
  playerA = found[0];
  playerB = found[1];

  const email = `${TEST_PREFIX}owner__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const signUp = await auth.api.signUpEmail({
    body: { name: "Test Owner Slice2", email, password: "PasswordSicura123" },
  });
  ownerUserId = signUp.user.id;

  const { headers: signInHeaders } = await auth.api.signInEmail({
    body: { email, password: "PasswordSicura123" },
    returnHeaders: true,
  });
  ownerCookie = signInHeaders.get("set-cookie") ?? "";
});

afterAll(async () => {
  // Le League/Team di test sono già state cancellate negli afterEach, quindi
  // qui non c'è più nessuna Team con ownerId = ownerUserId a bloccare la
  // cancellazione dello User (Team.ownerId ha onDelete: Restrict).
  if (ownerUserId) {
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
  }
});

describe("GET /api/players", () => {
  it("con ?ruolo=P ritorna solo portieri", async () => {
    const request = new NextRequest("http://localhost/api/players?ruolo=P");

    const response = await getPlayers(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((p: { ruolo: string }) => p.ruolo === "P")).toBe(true);
  });

  it("con ?squadra=Inter ritorna solo giocatori dell'Inter", async () => {
    const request = new NextRequest("http://localhost/api/players?squadra=Inter");

    const response = await getPlayers(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(
      body.every((p: { squadraSerieA: string }) => p.squadraSerieA === "Inter")
    ).toBe(true);
  });

  it("ordina i risultati per costo decrescente e limita a 50", async () => {
    const request = new NextRequest("http://localhost/api/players");

    const response = await getPlayers(request);
    const body = await response.json();

    expect(body.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].costo).toBeGreaterThanOrEqual(body[i].costo);
    }
  });

  it("rifiuta un ruolo non valido con 400", async () => {
    const request = new NextRequest("http://localhost/api/players?ruolo=X");

    const response = await getPlayers(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe("GET /api/teams/:id/roster", () => {
  it("ritorna 404 per una squadra inesistente", async () => {
    const response = await getRoster(
      new Request("http://localhost/api/teams/does-not-exist/roster"),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("ritorna una rosa vuota per una squadra appena creata", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const response = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.team.id).toBe(team.id);
    expect(body.entries).toEqual([]);
  });
});

describe("POST /api/teams/:id/roster", () => {
  it("aggiunge un giocatore e compare in GET roster", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id },
      ownerCookie
    );
    const response = await postRoster(request, {
      params: Promise.resolve({ id: team.id }),
    });

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.teamId).toBe(team.id);
    expect(created.playerId).toBe(playerA.id);
    expect(created.player.id).toBe(playerA.id);

    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.entries).toHaveLength(1);
    expect(rosterBody.entries[0].playerId).toBe(playerA.id);
    expect(rosterBody.entries[0].player.id).toBe(playerA.id);
  });

  it("rifiuta un body senza playerId con 400", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      {},
      ownerCookie
    );
    const response = await postRoster(request, {
      params: Promise.resolve({ id: team.id }),
    });

    expect(response.status).toBe(400);
  });

  it("ritorna 404 se la squadra non esiste", async () => {
    const request = makePostRequest(
      "http://localhost/api/teams/does-not-exist/roster",
      { playerId: playerA.id },
      ownerCookie
    );
    const response = await postRoster(request, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });

    expect(response.status).toBe(404);
  });

  it("ritorna 404 se il giocatore non esiste", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: "does-not-exist" },
      ownerCookie
    );
    const response = await postRoster(request, {
      params: Promise.resolve({ id: team.id }),
    });

    expect(response.status).toBe(404);
  });

  it("aggiungere due volte lo stesso giocatore ritorna 409", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const request1 = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id },
      ownerCookie
    );
    const first = await postRoster(request1, {
      params: Promise.resolve({ id: team.id }),
    });
    expect(first.status).toBe(201);

    const request2 = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id },
      ownerCookie
    );
    const second = await postRoster(request2, {
      params: Promise.resolve({ id: team.id }),
    });
    expect(second.status).toBe(409);

    // La rosa deve contenere ancora una sola entry, non due.
    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.entries).toHaveLength(1);
  });
});

describe("DELETE /api/teams/:id/roster/:playerId", () => {
  it("rimuove un giocatore e sparisce dalla rosa", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    await prisma.rosterEntry.create({
      data: { teamId: team.id, playerId: playerA.id },
    });

    const response = await deleteRosterEntry(
      new Request(
        `http://localhost/api/teams/${team.id}/roster/${playerA.id}`,
        { method: "DELETE", headers: { cookie: ownerCookie } }
      ),
      { params: Promise.resolve({ id: team.id, playerId: playerA.id }) }
    );

    expect(response.status).toBe(204);

    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.entries).toEqual([]);
  });

  it("ritorna 404 se la entry non esiste (giocatore non in rosa)", async () => {
    const { league, team } = await createTestTeam();
    createdLeagueIds.push(league.id);

    const response = await deleteRosterEntry(
      new Request(
        `http://localhost/api/teams/${team.id}/roster/${playerB.id}`,
        { method: "DELETE", headers: { cookie: ownerCookie } }
      ),
      { params: Promise.resolve({ id: team.id, playerId: playerB.id }) }
    );

    expect(response.status).toBe(404);
  });

  it("ritorna 404 se la squadra non esiste", async () => {
    const response = await deleteRosterEntry(
      new Request(
        `http://localhost/api/teams/does-not-exist/roster/${playerA.id}`,
        { method: "DELETE", headers: { cookie: ownerCookie } }
      ),
      { params: Promise.resolve({ id: "does-not-exist", playerId: playerA.id }) }
    );

    expect(response.status).toBe(404);
  });
});
