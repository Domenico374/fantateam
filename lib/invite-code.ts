import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Alfabeto senza caratteri ambigui alla lettura (niente 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 10;

function generateCandidate(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Genera un codice d'invito con RNG crittografico (mai Math.random(), è un
// segreto che protegge l'accesso a una lega privata) e verifica l'unicità
// contro il DB, ritentando in caso di collisione (probabilità trascurabile
// con 8 caratteri su un alfabeto di 32 simboli, ma va comunque gestita).
export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateCandidate();
    const existing = await prisma.league.findUnique({
      where: { inviteCode: candidate },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error(
    "Impossibile generare un codice d'invito univoco dopo diversi tentativi."
  );
}
