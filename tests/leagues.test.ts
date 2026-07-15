import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as getLeagues, POST as postLeague } from "@/app/api/leagues/route";
import { GET as getLeague } from "@/app/api/leagues/[id]/route";
import { POST as postTeam } from "@/app/api/leagues/[id]/teams/route";

// Prefisso univoco per riconoscere ed eliminare solo i dati creati da questa
// suite sul DB Neon reale (non è un DB di test separato in questa slice).
const TEST_PREFIX = "__test__slice1__";
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

// Traccia gli id delle leghe create nei singoli test per pulirle a fine test.
// onDelete: Cascade sul modello Team fa sì che eliminando la League vengano
// eliminate anche le Team collegate.
let createdLeagueIds: string[] = [];

afterEach(async () => {
  if (createdLeagueIds.length > 0) {
    await prisma.league.deleteMany({
      where: { id: { in: createdLeagueIds } },
    });
    createdLeagueIds = [];
  }
});

// Dalla Slice 4, POST /api/leagues/:id/teams richiede una sessione (la Team
// creata viene assegnata all'utente loggato). Creiamo un utente di test una
// tantum per questa suite, da riusare come "chiunque sia loggato" nei test
// che qui non riguardano l'ownership in sé (quella è testata in
// tests/authz.test.ts), ma solo il comportamento esistente delle Slice 1.
let ownerUserId: string;
let ownerCookie: string;

// Dalla Slice 5, @@unique([leagueId, ownerId]) su Team impedisce a un utente
// di avere più di una squadra nella stessa lega. Il test che verifica
// l'ordinamento per punti crea 3 Team nella stessa League: servono 3
// proprietari distinti, non più lo stesso ownerUserId ripetuto.
let secondUserId: string;
let thirdUserId: string;

async function creaUtente(label: string) {
  const email = `${TEST_PREFIX}${label}__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const signUp = await auth.api.signUpEmail({
    body: { name: `Test ${label}`, email, password: "PasswordSicura123" },
  });
  return signUp.user.id;
}

beforeAll(async () => {
  const email = `${TEST_PREFIX}owner__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const signUp = await auth.api.signUpEmail({
    body: { name: "Test Owner Slice1", email, password: "PasswordSicura123" },
  });
  ownerUserId = signUp.user.id;

  const { headers: signInHeaders } = await auth.api.signInEmail({
    body: { email, password: "PasswordSicura123" },
    returnHeaders: true,
  });
  ownerCookie = signInHeaders.get("set-cookie") ?? "";

  secondUserId = await creaUtente("second");
  thirdUserId = await creaUtente("third");
});

afterAll(async () => {
  // Le League/Team di test sono già state cancellate negli afterEach, quindi
  // qui non c'è più nessuna Team con ownerId puntato a questi User a
  // bloccare la cancellazione (Team.ownerId ha onDelete: Restrict).
  const ids = [ownerUserId, secondUserId, thirdUserId].filter(Boolean);
  if (ids.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});

// Dalla Slice 5, POST /api/leagues richiede login (stesso motivo di
// POST /api/leagues/:id/teams dalla Slice 4) e il body richiede anche
// teamName (il creatore nasce con la sua squadra). I test 400 sotto passano
// comunque il cookie: vogliamo che falliscano per il motivo giusto (nome
// vuoto), non solo perché anonimi (quel caso è coperto in
// tests/league-participation.test.ts).
describe("POST /api/leagues", () => {
  it("crea una lega e la lega esiste nel DB", async () => {
    const name = uniqueName("league");
    const teamName = uniqueName("team");
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name, teamName },
      ownerCookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe(name);
    expect(typeof body.id).toBe("string");
    createdLeagueIds.push(body.id);

    const inDb = await prisma.league.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.name).toBe(name);
  });

  it("rifiuta un nome vuoto con 400", async () => {
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name: "", teamName: uniqueName("team") },
      ownerCookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("rifiuta un nome fatto solo di spazi con 400", async () => {
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name: "   ", teamName: uniqueName("team") },
      ownerCookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(400);
  });

  it("rifiuta un body senza il campo name con 400", async () => {
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { teamName: uniqueName("team") },
      ownerCookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/leagues", () => {
  it("include la lega appena creata nella lista", async () => {
    const name = uniqueName("league-list");
    const created = await prisma.league.create({
      data: { name, creatorId: ownerUserId },
    });
    createdLeagueIds.push(created.id);

    const response = await getLeagues(new NextRequest("http://localhost/api/leagues"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((l: { id: string }) => l.id === created.id)).toBe(true);
  });
});

describe("GET /api/leagues/:id", () => {
  it("ritorna 404 per una lega inesistente", async () => {
    const response = await getLeague(new Request("http://localhost/api/leagues/does-not-exist"), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("ritorna la lega con le squadre ordinate per punti decrescenti", async () => {
    const league = await prisma.league.create({
      data: { name: uniqueName("league-detail"), creatorId: ownerUserId },
    });
    createdLeagueIds.push(league.id);

    // Creiamo le squadre in un ordine diverso da quello atteso in output,
    // cosi' il test verifica davvero l'ordinamento e non l'ordine di inserimento.
    // Tre proprietari distinti: @@unique([leagueId, ownerId]) impedirebbe a
    // un solo utente di avere 3 squadre nella stessa lega.
    await prisma.team.create({
      data: { name: uniqueName("team-low"), leagueId: league.id, points: 5, ownerId: ownerUserId },
    });
    await prisma.team.create({
      data: { name: uniqueName("team-high"), leagueId: league.id, points: 20, ownerId: secondUserId },
    });
    await prisma.team.create({
      data: { name: uniqueName("team-mid"), leagueId: league.id, points: 10, ownerId: thirdUserId },
    });

    const response = await getLeague(
      new Request(`http://localhost/api/leagues/${league.id}`),
      { params: Promise.resolve({ id: league.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.id).toBe(league.id);
    expect(body.teams).toHaveLength(3);
    expect(body.teams.map((t: { points: number }) => t.points)).toEqual([20, 10, 5]);
  });
});

describe("POST /api/leagues/:id/teams", () => {
  it("aggiunge una squadra collegata alla lega giusta", async () => {
    const league = await prisma.league.create({
      data: { name: uniqueName("league-teams"), creatorId: ownerUserId },
    });
    createdLeagueIds.push(league.id);

    const teamName = uniqueName("team");
    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: teamName },
      ownerCookie
    );

    const response = await postTeam(request, { params: Promise.resolve({ id: league.id }) });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe(teamName);
    expect(body.leagueId).toBe(league.id);
    expect(body.points).toBe(0);

    const inDb = await prisma.team.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.leagueId).toBe(league.id);
  });

  it("rifiuta un nome vuoto con 400", async () => {
    const league = await prisma.league.create({
      data: { name: uniqueName("league-teams-400"), creatorId: ownerUserId },
    });
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: "" },
      ownerCookie
    );

    const response = await postTeam(request, { params: Promise.resolve({ id: league.id }) });
    expect(response.status).toBe(400);
  });

  it("ritorna 404 se la lega non esiste", async () => {
    const request = makePostRequest(
      "http://localhost/api/leagues/does-not-exist/teams",
      { name: uniqueName("team-orphan") },
      ownerCookie
    );

    const response = await postTeam(request, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });

    expect(response.status).toBe(404);
  });
});
