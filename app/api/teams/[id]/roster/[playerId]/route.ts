import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;

  const entry = await prisma.rosterEntry.findUnique({
    where: { teamId_playerId: { teamId: id, playerId } },
  });

  if (!entry) {
    return NextResponse.json(
      { error: "Il giocatore non è in rosa." },
      { status: 404 }
    );
  }

  await prisma.rosterEntry.delete({ where: { id: entry.id } });

  return new NextResponse(null, { status: 204 });
}
