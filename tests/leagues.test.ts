import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as getLeagues, POST as postLeague } from "@/app/api/leagues/route";
import { GET as getLeague } from "@/app/api/leagues/[id]/route";
import { POST as postTeam } from "@/app/api/leagues/[id]/teams/route";

// Prefisso univoco per riconoscere ed eliminare solo i dati creati da questa
// suite sul DB Neon reale (non è un DB di test separato in questa slice).
const TEST_PREFIX = "__test__slice1__";
const uniqueName = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}__${Math.random().toString(36).slice(2)}`;

function makePostRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

describe("POST /api/leagues", () => {
  it("crea una lega e la lega esiste nel DB", async () => {
    const name = uniqueName("league");
    const request = makePostRequest("http://localhost/api/leagues", { name });

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
    const request = makePostRequest("http://localhost/api/leagues", { name: "" });

    const response = await postLeague(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("rifiuta un nome fatto solo di spazi con 400", async () => {
    const request = makePostRequest("http://localhost/api/leagues", { name: "   " });

    const response = await postLeague(request);
    expect(response.status).toBe(400);
  });

  it("rifiuta un body senza il campo name con 400", async () => {
    const request = makePostRequest("http://localhost/api/leagues", {});

    const response = await postLeague(request);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/leagues", () => {
  it("include la lega appena creata nella lista", async () => {
    const name = uniqueName("league-list");
    const created = await prisma.league.create({ data: { name } });
    createdLeagueIds.push(created.id);

    const response = await getLeagues();
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
      data: { name: uniqueName("league-detail") },
    });
    createdLeagueIds.push(league.id);

    // Creiamo le squadre in un ordine diverso da quello atteso in output,
    // cosi' il test verifica davvero l'ordinamento e non l'ordine di inserimento.
    await prisma.team.create({
      data: { name: uniqueName("team-low"), leagueId: league.id, points: 5 },
    });
    await prisma.team.create({
      data: { name: uniqueName("team-high"), leagueId: league.id, points: 20 },
    });
    await prisma.team.create({
      data: { name: uniqueName("team-mid"), leagueId: league.id, points: 10 },
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
      data: { name: uniqueName("league-teams") },
    });
    createdLeagueIds.push(league.id);

    const teamName = uniqueName("team");
    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: teamName }
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
      data: { name: uniqueName("league-teams-400") },
    });
    createdLeagueIds.push(league.id);

    const request = makePostRequest(
      `http://localhost/api/leagues/${league.id}/teams`,
      { name: "" }
    );

    const response = await postTeam(request, { params: Promise.resolve({ id: league.id }) });
    expect(response.status).toBe(400);
  });

  it("ritorna 404 se la lega non esiste", async () => {
    const request = makePostRequest(
      "http://localhost/api/leagues/does-not-exist/teams",
      { name: uniqueName("team-orphan") }
    );

    const response = await postTeam(request, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });

    expect(response.status).toBe(404);
  });
});
