import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const userResult = await requireUser(request);
  if (!userResult.ok) {
    return NextResponse.json(
      { error: userResult.error },
      { status: userResult.status }
    );
  }

  const teams = await prisma.team.findMany({
    where: { ownerId: userResult.user.id },
    include: { league: true },
    orderBy: { createdAt: "desc" },
  });

  const leagues = teams.map((team) => ({
    id: team.league.id,
    name: team.league.name,
    isPrivate: team.league.isPrivate,
    myTeam: { id: team.id, name: team.name, points: team.points },
  }));

  return NextResponse.json(leagues);
}
