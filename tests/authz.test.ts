import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as getLeagues } from "@/app/api/leagues/route";
import { GET as getLeague } from "@/app/api/leagues/[id]/route";
import { POST as postTeam } from "@/app/api/leagues/[id]/teams/route";
import { GET as getPlayers } from "@/app/api/players/route";
import {
  GET as getRoster,
  POST as postRoster,
} from "@/app/api/teams/[id]/roster/route";
import { DELETE as deleteRosterEntry } from "@/app/api/teams/[id]/roster/[playerId]/route";

// Test di autorizzazione della Slice 4: ownership delle Team e protezione
// server-side delle route di modifica. Prefisso univoco per riconoscere ed
// eliminare solo i dati (User/League/Team) creati da questa suite.
const TEST_PREFIX = "__test__slice4__";
const uniqueEmail = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
const uniqueName = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}__${Math.random().toString(36).slice(2)}`;

const PASSWORD = "PasswordSicura123";

async function creaUtenteLoggato(label: string) {
  const email = uniqueEmail(label);
  const signUp = await auth.api.signUpEmail({
    body: { name: `Test ${label}`, email, password: PASSWORD },
  });
  const { headers: signInHeaders } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = signInHeaders.get("set-cookie") ?? "";
  return { userId: signUp.user.id, cookie };
}

function makePostRequest(url: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

// Traccia League e User creati nei singoli test per pulirli a fine test.
// Ordine di cancellazione obbligatorio: PRIMA le League di test (cascade su
// Team/RosterEntry), POI gli User di test — perché Team.ownerId ha
// onDelete: Restrict verso User, quindi finché esiste una Team che punta a
// uno User quello User non è cancellabile.
let createdLeagueIds: string[] = [];
let createdUserIds: string[] = [];

afterEach(async () => {
  if (createdLeagueIds.length > 0) {
    await prisma.league.deleteMany({ where: { id: { in: createdLeagueIds } } });
    createdLeagueIds = [];
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  }
});

// Due Player reali del catalogo, usati come fixture nei test di rosa. Non
// vengono mai creati/modificati/cancellati: solo letti (807 Player intatti).
let playerA: { id: string };
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
});

// Nessun cleanup afterAll necessario oltre agli afterEach: qui non ci sono
// risorse condivise a livello di modulo (a differenza di leagues.test.ts /
// players-roster.test.ts), ogni test crea e pulisce i propri User/League.

describe("POST /api/leagues/:id/teams — ownership", () => {
  it("senza sessione ritorna 401 e non crea nessuna Team", async () => {
    const league = await prisma.league.create({ data: { name: uniqueName("league") } });
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: uniqueName("team") }
      // nessun cookie: richiesta anonima
    );

    const response = await postTeam(request, { params: Promise.resolve({ id: league.id }) });
    expect(response.status).toBe(401);

    const teams = await prisma.team.findMany({ where: { leagueId: league.id } });
    expect(teams).toHaveLength(0);
  });

  it("da loggato crea una Team con ownerId uguale all'utente corrente", async () => {
    const { userId, cookie } = await creaUtenteLoggato("owner-create");
    createdUserIds.push(userId);

    const league = await prisma.league.create({ data: { name: uniqueName("league") } });
    createdLeagueIds.push(league.id);

    const teamName = uniqueName("team");
    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: teamName },
      cookie
    );

    const response = await postTeam(request, { params: Promise.resolve({ id: league.id }) });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe(teamName);
    expect(body.ownerId).toBe(userId);

    // Verifica anche via query Prisma diretta, non solo sulla risposta HTTP.
    const inDb = await prisma.team.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.ownerId).toBe(userId);
  });
});

describe("gestione rosa — proprietario, non proprietario, anonimo", () => {
  async function creaLegaSquadraDi(ownerId: string) {
    const league = await prisma.league.create({ data: { name: uniqueName("league") } });
    const team = await prisma.team.create({
      data: { name: uniqueName("team"), leagueId: league.id, ownerId },
    });
    return { league, team };
  }

  it("il proprietario aggiunge un giocatore alla rosa (201, compare in GET roster)", async () => {
    const { userId, cookie } = await creaUtenteLoggato("owner-add");
    createdUserIds.push(userId);
    const { league, team } = await creaLegaSquadraDi(userId);
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id },
      cookie
    );
    const response = await postRoster(request, { params: Promise.resolve({ id: team.id }) });
    expect(response.status).toBe(201);

    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.entries).toHaveLength(1);
    expect(rosterBody.entries[0].playerId).toBe(playerA.id);
  });

  it("il proprietario rimuove un giocatore dalla rosa (204, sparisce)", async () => {
    const { userId, cookie } = await creaUtenteLoggato("owner-remove");
    createdUserIds.push(userId);
    const { league, team } = await creaLegaSquadraDi(userId);
    createdLeagueIds.push(league.id);

    await prisma.rosterEntry.create({ data: { teamId: team.id, playerId: playerA.id } });

    const response = await deleteRosterEntry(
      new Request(`http://localhost/api/teams/${team.id}/roster/${playerA.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
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

  it("un secondo utente (loggato, non proprietario) riceve 403 su POST roster", async () => {
    const { userId: ownerId } = await creaUtenteLoggato("owner-post403");
    createdUserIds.push(ownerId);
    const { userId: intruderId, cookie: intruderCookie } = await creaUtenteLoggato("intruder-post403");
    createdUserIds.push(intruderId);

    const { league, team } = await creaLegaSquadraDi(ownerId);
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id },
      intruderCookie
    );
    const response = await postRoster(request, { params: Promise.resolve({ id: team.id }) });
    expect(response.status).toBe(403);

    // Il giocatore non deve essere stato aggiunto.
    const entries = await prisma.rosterEntry.findMany({ where: { teamId: team.id } });
    expect(entries).toHaveLength(0);
  });

  it("un secondo utente (loggato, non proprietario) riceve 403 su DELETE roster", async () => {
    const { userId: ownerId } = await creaUtenteLoggato("owner-del403");
    createdUserIds.push(ownerId);
    const { userId: intruderId, cookie: intruderCookie } = await creaUtenteLoggato("intruder-del403");
    createdUserIds.push(intruderId);

    const { league, team } = await creaLegaSquadraDi(ownerId);
    createdLeagueIds.push(league.id);
    await prisma.rosterEntry.create({ data: { teamId: team.id, playerId: playerA.id } });

    const response = await deleteRosterEntry(
      new Request(`http://localhost/api/teams/${team.id}/roster/${playerA.id}`, {
        method: "DELETE",
        headers: { cookie: intruderCookie },
      }),
      { params: Promise.resolve({ id: team.id, playerId: playerA.id }) }
    );
    expect(response.status).toBe(403);

    // La entry non deve essere stata rimossa.
    const entry = await prisma.rosterEntry.findUnique({
      where: { teamId_playerId: { teamId: team.id, playerId: playerA.id } },
    });
    expect(entry).not.toBeNull();
  });

  it("una richiesta anonima riceve 401 su POST roster", async () => {
    const { userId, cookie } = await creaUtenteLoggato("owner-anon-post");
    createdUserIds.push(userId);
    void cookie;
    const { league, team } = await creaLegaSquadraDi(userId);
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/teams/${team.id}/roster`,
      { playerId: playerA.id }
      // nessun cookie
    );
    const response = await postRoster(request, { params: Promise.resolve({ id: team.id }) });
    expect(response.status).toBe(401);

    const entries = await prisma.rosterEntry.findMany({ where: { teamId: team.id } });
    expect(entries).toHaveLength(0);
  });

  it("una richiesta anonima riceve 401 su DELETE roster", async () => {
    const { userId } = await creaUtenteLoggato("owner-anon-delete");
    createdUserIds.push(userId);
    const { league, team } = await creaLegaSquadraDi(userId);
    createdLeagueIds.push(league.id);
    await prisma.rosterEntry.create({ data: { teamId: team.id, playerId: playerB.id } });

    const response = await deleteRosterEntry(
      new Request(`http://localhost/api/teams/${team.id}/roster/${playerB.id}`, {
        method: "DELETE",
        // nessun cookie: Headers vuoto equivalente a richiesta anonima
      }),
      { params: Promise.resolve({ id: team.id, playerId: playerB.id }) }
    );
    expect(response.status).toBe(401);

    const entry = await prisma.rosterEntry.findUnique({
      where: { teamId_playerId: { teamId: team.id, playerId: playerB.id } },
    });
    expect(entry).not.toBeNull();
  });
});

describe("GET pubbliche restano accessibili senza sessione", () => {
  it("GET /api/leagues funziona da anonimo", async () => {
    const response = await getLeagues();
    expect(response.status).toBe(200);
  });

  it("GET /api/leagues/:id funziona da anonimo", async () => {
    const league = await prisma.league.create({ data: { name: uniqueName("league-get") } });
    createdLeagueIds.push(league.id);

    const response = await getLeague(new Request(`http://localhost/api/leagues/${league.id}`), {
      params: Promise.resolve({ id: league.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(league.id);
  });

  it("GET /api/teams/:id/roster funziona da anonimo", async () => {
    const { userId } = await creaUtenteLoggato("get-roster-anon");
    createdUserIds.push(userId);
    const league = await prisma.league.create({ data: { name: uniqueName("league-get-roster") } });
    createdLeagueIds.push(league.id);
    const team = await prisma.team.create({
      data: { name: uniqueName("team-get-roster"), leagueId: league.id, ownerId: userId },
    });

    const response = await getRoster(
      new Request(`http://localhost/api/teams/${team.id}/roster`),
      { params: Promise.resolve({ id: team.id }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.team.id).toBe(team.id);
  });

  it("GET /api/players funziona da anonimo", async () => {
    const request = new NextRequest("http://localhost/api/players");
    const response = await getPlayers(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
