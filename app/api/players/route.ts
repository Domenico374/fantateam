import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RUOLI_VALIDI = new Set(["P", "D", "C", "A"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ruolo = searchParams.get("ruolo")?.trim();
  const squadra = searchParams.get("squadra")?.trim();
  const search = searchParams.get("search")?.trim();

  if (ruolo && !RUOLI_VALIDI.has(ruolo)) {
    return NextResponse.json(
      { error: "Ruolo non valido. Valori ammessi: P, D, C, A." },
      { status: 400 }
    );
  }

  const players = await prisma.player.findMany({
    where: {
      ...(ruolo ? { ruolo } : {}),
      ...(squadra ? { squadraSerieA: squadra } : {}),
      ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { costo: "desc" },
    take: 50,
  });

  return NextResponse.json(players);
}
