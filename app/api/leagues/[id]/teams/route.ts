import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userResult = await requireUser(request);
  if (!userResult.ok) {
    return NextResponse.json(
      { error: userResult.error },
      { status: userResult.status }
    );
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Il nome della squadra non può essere vuoto." },
      { status: 400 }
    );
  }

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) {
    return NextResponse.json(
      { error: "Lega non trovata." },
      { status: 404 }
    );
  }

  const team = await prisma.team.create({
    data: { name, leagueId: id, ownerId: userResult.user.id },
  });

  return NextResponse.json(team, { status: 201 });
}
