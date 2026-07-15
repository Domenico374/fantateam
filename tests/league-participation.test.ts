import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  GET as getLeagues,
  POST as postLeague,
} from "@/app/api/leagues/route";
import { GET as getLeague } from "@/app/api/leagues/[id]/route";
import { POST as postTeam } from "@/app/api/leagues/[id]/teams/route";
import { POST as postJoin } from "@/app/api/leagues/join/route";
import { GET as getMine } from "@/app/api/leagues/mine/route";

// Test della Slice 5: partecipazione alle leghe (pubbliche/private, codice
// d'invito, "le mie leghe"). Prefisso univoco per riconoscere ed eliminare
// solo i dati (User/League/Team) creati da questa suite.
const TEST_PREFIX = "__test__slice5__";
const uniqueEmail = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
const uniqueName = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}__${Math.random().toString(36).slice(2)}`;

const PASSWORD = "PasswordSicura123";
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

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

function makeGetRequest(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, { method: "GET", headers });
}

// Ordine di cancellazione obbligatorio: PRIMA le League di test (cascade su
// Team/RosterEntry), POI gli User di test — Team.ownerId e League.creatorId
// hanno entrambi onDelete: Restrict verso User, quindi finché esiste una
// League/Team che punta a uno User quello User non è cancellabile.
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

describe("POST /api/leagues — creazione con contratto Slice 5", () => {
  it("senza sessione ritorna 401 e non crea nessuna lega", async () => {
    const name = uniqueName("league-anon");
    const request = makePostRequest("http://localhost/api/leagues", {
      name,
      isPrivate: false,
      teamName: uniqueName("team"),
      // nessun cookie: richiesta anonima
    });

    const response = await postLeague(request);
    expect(response.status).toBe(401);

    const inDb = await prisma.league.findFirst({ where: { name } });
    expect(inDb).toBeNull();
  });

  it("crea una lega pubblica da loggato: isPrivate false, inviteCode null, squadra del creatore creata", async () => {
    const { userId, cookie } = await creaUtenteLoggato("create-public");
    createdUserIds.push(userId);

    const name = uniqueName("league-public");
    const teamName = uniqueName("team-public");
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name, isPrivate: false, teamName },
      cookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    createdLeagueIds.push(body.id);

    expect(body.name).toBe(name);
    expect(body.isPrivate).toBe(false);
    expect(body.inviteCode).toBeNull();

    // Verifica via Prisma diretta: la Team del creatore esiste nella stessa lega.
    const team = await prisma.team.findUnique({
      where: { leagueId_ownerId: { leagueId: body.id, ownerId: userId } },
    });
    expect(team).not.toBeNull();
    expect(team?.name).toBe(teamName);
    expect(team?.leagueId).toBe(body.id);
  });

  it("crea una lega privata: inviteCode presente, 8 caratteri, alfabeto atteso", async () => {
    const { userId, cookie } = await creaUtenteLoggato("create-private");
    createdUserIds.push(userId);

    const name = uniqueName("league-private");
    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name, isPrivate: true, teamName: uniqueName("team-private") },
      cookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    createdLeagueIds.push(body.id);

    expect(body.isPrivate).toBe(true);
    expect(typeof body.inviteCode).toBe("string");
    expect(body.inviteCode).toHaveLength(8);
    for (const char of body.inviteCode as string) {
      expect(INVITE_CODE_ALPHABET.includes(char)).toBe(true);
    }
    // Niente caratteri ambigui (0/O/1/I/L) — verificato implicitamente
    // dall'alfabeto sopra, ma lo rendiamo esplicito.
    expect(/[0O1IL]/.test(body.inviteCode)).toBe(false);
  });

  it("rifiuta teamName vuoto con 400", async () => {
    const { userId, cookie } = await creaUtenteLoggato("create-no-teamname");
    createdUserIds.push(userId);

    const request = makePostRequest(
      "http://localhost/api/leagues",
      { name: uniqueName("league-no-team"), isPrivate: false, teamName: "" },
      cookie
    );

    const response = await postLeague(request);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/leagues — visibilità pubblica/privata", () => {
  it("default (senza filtri): la lega pubblica compare, la privata NO", async () => {
    const { userId, cookie } = await creaUtenteLoggato("list-default-creator");
    createdUserIds.push(userId);

    const publicName = uniqueName("league-list-public");
    const privateName = uniqueName("league-list-private");

    const publicResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: publicName, isPrivate: false, teamName: uniqueName("team") },
        cookie
      )
    );
    const publicBody = await publicResp.json();
    createdLeagueIds.push(publicBody.id);

    const privateResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: privateName, isPrivate: true, teamName: uniqueName("team") },
        cookie
      )
    );
    const privateBody = await privateResp.json();
    createdLeagueIds.push(privateBody.id);

    const response = await getLeagues(makeGetRequest("http://localhost/api/leagues"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.some((l: { id: string }) => l.id === publicBody.id)).toBe(true);
    expect(body.some((l: { id: string }) => l.id === privateBody.id)).toBe(false);
    expect(body.some((l: { name: string }) => l.name === privateName)).toBe(false);
  });

  it("?joinable=true: esclude leghe dove l'utente ha già una squadra, e sempre le private", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "joinable-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: callerId, cookie: callerCookie } = await creaUtenteLoggato(
      "joinable-caller"
    );
    createdUserIds.push(callerId);

    // Lega pubblica dove il chiamante NON ha ancora una squadra: deve comparire.
    const availableResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-joinable-available"), isPrivate: false, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const availableBody = await availableResp.json();
    createdLeagueIds.push(availableBody.id);

    // Lega pubblica dove il chiamante ha già una squadra: NON deve comparire.
    const joinedResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-joinable-joined"), isPrivate: false, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const joinedBody = await joinedResp.json();
    createdLeagueIds.push(joinedBody.id);
    await prisma.team.create({
      data: { name: uniqueName("team-caller"), leagueId: joinedBody.id, ownerId: callerId },
    });

    // Lega privata: non deve comparire mai in joinable, a prescindere da membership.
    const privateResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-joinable-private"), isPrivate: true, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const privateBody = await privateResp.json();
    createdLeagueIds.push(privateBody.id);

    const response = await getLeagues(
      makeGetRequest("http://localhost/api/leagues?joinable=true", callerCookie)
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.some((l: { id: string }) => l.id === availableBody.id)).toBe(true);
    expect(body.some((l: { id: string }) => l.id === joinedBody.id)).toBe(false);
    expect(body.some((l: { id: string }) => l.id === privateBody.id)).toBe(false);
  });
});

describe("GET /api/leagues/:id — inviteCode solo per il creatore", () => {
  it("il creatore riceve inviteCode; un altro utente e un anonimo no", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "detail-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: otherId, cookie: otherCookie } = await creaUtenteLoggato("detail-other");
    createdUserIds.push(otherId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-detail-private"), isPrivate: true, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    // Il creatore la vede.
    const asCreator = await getLeague(
      makeGetRequest(`http://localhost/api/leagues/${league.id}`, creatorCookie),
      { params: Promise.resolve({ id: league.id }) }
    );
    const creatorBody = await asCreator.json();
    expect(creatorBody.inviteCode).toBe(league.inviteCode);

    // Un altro utente loggato non la vede: campo assente, non null.
    const asOther = await getLeague(
      makeGetRequest(`http://localhost/api/leagues/${league.id}`, otherCookie),
      { params: Promise.resolve({ id: league.id }) }
    );
    const otherBody = await asOther.json();
    expect("inviteCode" in otherBody).toBe(false);
    expect(otherBody.inviteCode).toBeUndefined();

    // Un anonimo non la vede.
    const asAnon = await getLeague(
      makeGetRequest(`http://localhost/api/leagues/${league.id}`),
      { params: Promise.resolve({ id: league.id }) }
    );
    const anonBody = await asAnon.json();
    expect("inviteCode" in anonBody).toBe(false);
    expect(anonBody.inviteCode).toBeUndefined();
  });
});

describe("POST /api/leagues/:id/teams — join di una lega pubblica", () => {
  it("utente non ancora membro: crea la squadra (201)", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "join-public-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: joinerId, cookie: joinerCookie } = await creaUtenteLoggato(
      "join-public-joiner"
    );
    createdUserIds.push(joinerId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-join-public"), isPrivate: false, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const teamName = uniqueName("team-joiner");
    const response = await postTeam(
      makePostRequest(
        `http://localhost/api/leagues/${league.id}/teams`,
        { name: teamName },
        joinerCookie
      ),
      { params: Promise.resolve({ id: league.id }) }
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerId).toBe(joinerId);
    expect(body.name).toBe(teamName);
  });

  it("stesso utente riprova sulla stessa lega: 409", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "join-public-dup-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: joinerId, cookie: joinerCookie } = await creaUtenteLoggato(
      "join-public-dup-joiner"
    );
    createdUserIds.push(joinerId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-join-dup"), isPrivate: false, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const first = await postTeam(
      makePostRequest(
        `http://localhost/api/leagues/${league.id}/teams`,
        { name: uniqueName("team-joiner-1") },
        joinerCookie
      ),
      { params: Promise.resolve({ id: league.id }) }
    );
    expect(first.status).toBe(201);

    const second = await postTeam(
      makePostRequest(
        `http://localhost/api/leagues/${league.id}/teams`,
        { name: uniqueName("team-joiner-2") },
        joinerCookie
      ),
      { params: Promise.resolve({ id: league.id }) }
    );
    expect(second.status).toBe(409);

    const teams = await prisma.team.findMany({
      where: { leagueId: league.id, ownerId: joinerId },
    });
    expect(teams).toHaveLength(1);
  });

  it("su lega privata: 403", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "join-private-forbidden-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: joinerId, cookie: joinerCookie } = await creaUtenteLoggato(
      "join-private-forbidden-joiner"
    );
    createdUserIds.push(joinerId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-join-private"), isPrivate: true, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const response = await postTeam(
      makePostRequest(
        `http://localhost/api/leagues/${league.id}/teams`,
        { name: uniqueName("team-joiner") },
        joinerCookie
      ),
      { params: Promise.resolve({ id: league.id }) }
    );
    expect(response.status).toBe(403);

    const teams = await prisma.team.findMany({
      where: { leagueId: league.id, ownerId: joinerId },
    });
    expect(teams).toHaveLength(0);
  });

  it("senza sessione: 401", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "join-anon-creator"
    );
    createdUserIds.push(creatorId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-join-anon"), isPrivate: false, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const response = await postTeam(
      makePostRequest(`http://localhost/api/leagues/${league.id}/teams`, {
        name: uniqueName("team-anon"),
      }),
      { params: Promise.resolve({ id: league.id }) }
    );
    expect(response.status).toBe(401);
  });

  it("lega inesistente: 404", async () => {
    const { userId, cookie } = await creaUtenteLoggato("join-404");
    createdUserIds.push(userId);

    const response = await postTeam(
      makePostRequest(
        "http://localhost/api/leagues/does-not-exist/teams",
        { name: uniqueName("team") },
        cookie
      ),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/leagues/join — join by-code", () => {
  it("codice corretto: crea la squadra (201)", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "code-join-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: joinerId, cookie: joinerCookie } = await creaUtenteLoggato(
      "code-join-joiner"
    );
    createdUserIds.push(joinerId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-code-join"), isPrivate: true, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const teamName = uniqueName("team-joiner");
    // Il codice viene normalizzato (.trim().toUpperCase()) prima della
    // lookup: verifichiamo che minuscolo funzioni comunque.
    const response = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { inviteCode: (league.inviteCode as string).toLowerCase(), teamName },
        joinerCookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerId).toBe(joinerId);
    expect(body.leagueId).toBe(league.id);
    expect(body.name).toBe(teamName);
  });

  it("codice sbagliato/inesistente: 404", async () => {
    const { userId, cookie } = await creaUtenteLoggato("code-join-wrong");
    createdUserIds.push(userId);

    const response = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { inviteCode: "ZZZZZZZZ", teamName: uniqueName("team") },
        cookie
      )
    );
    expect(response.status).toBe(404);
  });

  it("utente già membro tenta di nuovo con lo stesso codice: 409", async () => {
    const { userId: creatorId, cookie: creatorCookie } = await creaUtenteLoggato(
      "code-join-dup-creator"
    );
    createdUserIds.push(creatorId);
    const { userId: joinerId, cookie: joinerCookie } = await creaUtenteLoggato(
      "code-join-dup-joiner"
    );
    createdUserIds.push(joinerId);

    const createResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-code-dup"), isPrivate: true, teamName: uniqueName("team") },
        creatorCookie
      )
    );
    const league = await createResp.json();
    createdLeagueIds.push(league.id);

    const first = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { inviteCode: league.inviteCode, teamName: uniqueName("team-1") },
        joinerCookie
      )
    );
    expect(first.status).toBe(201);

    const second = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { inviteCode: league.inviteCode, teamName: uniqueName("team-2") },
        joinerCookie
      )
    );
    expect(second.status).toBe(409);

    const teams = await prisma.team.findMany({
      where: { leagueId: league.id, ownerId: joinerId },
    });
    expect(teams).toHaveLength(1);
  });

  it("senza sessione: 401", async () => {
    const response = await postJoin(
      makePostRequest("http://localhost/api/leagues/join", {
        inviteCode: "ABCDEFGH",
        teamName: uniqueName("team"),
      })
    );
    expect(response.status).toBe(401);
  });

  it("body senza inviteCode: 400", async () => {
    const { userId, cookie } = await creaUtenteLoggato("code-join-no-code");
    createdUserIds.push(userId);

    const response = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { teamName: uniqueName("team") },
        cookie
      )
    );
    expect(response.status).toBe(400);
  });

  it("body senza teamName: 400", async () => {
    const { userId, cookie } = await creaUtenteLoggato("code-join-no-teamname");
    createdUserIds.push(userId);

    const response = await postJoin(
      makePostRequest(
        "http://localhost/api/leagues/join",
        { inviteCode: "ABCDEFGH" },
        cookie
      )
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/leagues/mine", () => {
  it("anonimo: 401", async () => {
    const response = await getMine(makeGetRequest("http://localhost/api/leagues/mine"));
    expect(response.status).toBe(401);
  });

  it("utente con 2 leghe (una pubblica, una privata): entrambe presenti con myTeam corretto", async () => {
    const { userId, cookie } = await creaUtenteLoggato("mine-two-leagues");
    createdUserIds.push(userId);

    const publicTeamName = uniqueName("team-public");
    const publicResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-mine-public"), isPrivate: false, teamName: publicTeamName },
        cookie
      )
    );
    const publicLeague = await publicResp.json();
    createdLeagueIds.push(publicLeague.id);

    const privateTeamName = uniqueName("team-private");
    const privateResp = await postLeague(
      makePostRequest(
        "http://localhost/api/leagues",
        { name: uniqueName("league-mine-private"), isPrivate: true, teamName: privateTeamName },
        cookie
      )
    );
    const privateLeague = await privateResp.json();
    createdLeagueIds.push(privateLeague.id);

    const response = await getMine(makeGetRequest("http://localhost/api/leagues/mine", cookie));
    expect(response.status).toBe(200);
    const body = await response.json();

    const publicEntry = body.find((l: { id: string }) => l.id === publicLeague.id);
    const privateEntry = body.find((l: { id: string }) => l.id === privateLeague.id);

    expect(publicEntry).toBeTruthy();
    expect(publicEntry.isPrivate).toBe(false);
    expect(publicEntry.myTeam.name).toBe(publicTeamName);

    expect(privateEntry).toBeTruthy();
    expect(privateEntry.isPrivate).toBe(true);
    expect(privateEntry.myTeam.name).toBe(privateTeamName);
  });

  it("utente senza alcuna lega: array vuoto", async () => {
    const { userId, cookie } = await creaUtenteLoggato("mine-empty");
    createdUserIds.push(userId);

    const response = await getMine(makeGetRequest("http://localhost/api/leagues/mine", cookie));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });
});
