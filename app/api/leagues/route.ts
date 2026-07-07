import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const leagues = await prisma.league.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(leagues);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Il nome della lega non può essere vuoto." },
      { status: 400 }
    );
  }

  const league = await prisma.league.create({ data: { name } });
  return NextResponse.json(league, { status: 201 });
}
