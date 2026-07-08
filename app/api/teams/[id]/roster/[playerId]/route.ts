import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamOwner } from "@/lib/authz";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;

  const ownerResult = await requireTeamOwner(request, id);
  if (!ownerResult.ok) {
    return NextResponse.json(
      { error: ownerResult.error },
      { status: ownerResult.status }
    );
  }

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
