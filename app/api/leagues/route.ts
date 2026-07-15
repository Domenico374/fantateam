import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getOptionalUser } from "@/lib/authz";
import { generateUniqueInviteCode } from "@/lib/invite-code";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const joinableOnly = searchParams.get("joinable") === "true";

  // Le leghe private non compaiono MAI nella lista pubblica, nemmeno il
  // nome: chi ne fa parte le trova in "Le mie leghe" (GET /api/leagues/mine),
  // chi non ne fa parte non deve nemmeno sapere che esistono.
  if (!joinableOnly) {
    const leagues = await prisma.league.findMany({
      where: { isPrivate: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, isPrivate: true, createdAt: true },
    });
    return NextResponse.json(leagues);
  }

  // Leghe pubbliche disponibili: come sopra, ma (se loggato) esclude anche
  // quelle dove il chiamante ha già una squadra.
  const user = await getOptionalUser(request);

  const leagues = await prisma.league.findMany({
    where: {
      isPrivate: false,
      ...(user ? { teams: { none: { ownerId: user.id } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isPrivate: true, createdAt: true },
  });

  return NextResponse.json(leagues);
}

export async function POST(request: NextRequest) {
  const userResult = await requireUser(request);
  if (!userResult.ok) {
    return NextResponse.json(
      { error: userResult.error },
      { status: userResult.status }
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const isPrivate = body?.isPrivate === true;
  const teamName = typeof body?.teamName === "string" ? body.teamName.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Il nome della lega non può essere vuoto." },
      { status: 400 }
    );
  }

  if (!teamName) {
    return NextResponse.json(
      { error: "Il nome della tua squadra non può essere vuoto." },
      { status: 400 }
    );
  }

  const inviteCode = isPrivate ? await generateUniqueInviteCode() : null;

  const league = await prisma.$transaction(async (tx) => {
    const createdLeague = await tx.league.create({
      data: {
        name,
        isPrivate,
        inviteCode,
        creatorId: userResult.user.id,
      },
    });

    await tx.team.create({
      data: {
        name: teamName,
        leagueId: createdLeague.id,
        ownerId: userResult.user.id,
      },
    });

    return createdLeague;
  });

  return NextResponse.json(league, { status: 201 });
}
