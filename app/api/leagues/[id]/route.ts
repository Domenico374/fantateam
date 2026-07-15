import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalUser } from "@/lib/authz";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        orderBy: { points: "desc" },
      },
    },
  });

  if (!league) {
    return NextResponse.json(
      { error: "Lega non trovata." },
      { status: 404 }
    );
  }

  const user = await getOptionalUser(request);
  const isCreator = user?.id === league.creatorId;

  // inviteCode non va mai esposto a chi non è il creatore della lega.
  const { inviteCode, ...rest } = league;
  return NextResponse.json({
    ...rest,
    ...(isCreator ? { inviteCode } : {}),
  });
}
