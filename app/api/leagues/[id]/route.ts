import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
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

  return NextResponse.json(league);
}
