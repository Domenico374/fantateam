import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeamOwner } from "@/lib/authz";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: "Squadra non trovata." }, { status: 404 });
  }

  const entries = await prisma.rosterEntry.findMany({
    where: { teamId: id },
    include: { player: true },
    orderBy: { player: { ruolo: "asc" } },
  });

  return NextResponse.json({ team, entries });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ownerResult = await requireTeamOwner(request, id);
  if (!ownerResult.ok) {
    return NextResponse.json(
      { error: ownerResult.error },
      { status: ownerResult.status }
    );
  }

  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : "";

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId è obbligatorio." },
      { status: 400 }
    );
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    return NextResponse.json({ error: "Giocatore non trovato." }, { status: 404 });
  }

  const existing = await prisma.rosterEntry.findUnique({
    where: { teamId_playerId: { teamId: id, playerId } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Il giocatore è già in rosa." },
      { status: 409 }
    );
  }

  try {
    const entry = await prisma.rosterEntry.create({
      data: { teamId: id, playerId },
      include: { player: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    // Race condition: due richieste concorrenti possono superare entrambe il
    // check "existing" sopra e collidere sul vincolo @@unique([teamId, playerId]).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Il giocatore è già in rosa." },
        { status: 409 }
      );
    }
    throw err;
  }
}
