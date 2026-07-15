import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";

// Join di una lega privata tramite codice d'invito. Un codice sbagliato non è
// distinguibile da uno inesistente (404 in entrambi i casi): altrimenti si
// regalerebbe un oracolo per capire quali codici "quasi" esistono.
export async function POST(request: NextRequest) {
  const userResult = await requireUser(request);
  if (!userResult.ok) {
    return NextResponse.json(
      { error: userResult.error },
      { status: userResult.status }
    );
  }

  const body = await request.json().catch(() => null);
  const inviteCode =
    typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
  const teamName = typeof body?.teamName === "string" ? body.teamName.trim() : "";

  if (!inviteCode) {
    return NextResponse.json(
      { error: "Il codice d'invito è obbligatorio." },
      { status: 400 }
    );
  }

  if (!teamName) {
    return NextResponse.json(
      { error: "Il nome della tua squadra non può essere vuoto." },
      { status: 400 }
    );
  }

  const league = await prisma.league.findUnique({ where: { inviteCode } });
  if (!league) {
    return NextResponse.json(
      { error: "Codice d'invito non valido." },
      { status: 404 }
    );
  }

  const existing = await prisma.team.findUnique({
    where: { leagueId_ownerId: { leagueId: league.id, ownerId: userResult.user.id } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Hai già una squadra in questa lega." },
      { status: 409 }
    );
  }

  try {
    const team = await prisma.team.create({
      data: { name: teamName, leagueId: league.id, ownerId: userResult.user.id },
    });
    return NextResponse.json(team, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Hai già una squadra in questa lega." },
        { status: 409 }
      );
    }
    throw err;
  }
}
