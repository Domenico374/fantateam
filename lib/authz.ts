import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Data Access Layer per l'autorizzazione. Va chiamato come PRIMA cosa in ogni
// route handler che crea/modifica dati — mai fidarsi di un eventuale
// middleware come unico confine di sicurezza (CVE-2025-29927: un header
// craftato ad arte può far saltare l'esecuzione del middleware Next.js).
// Qui invece si ri-verifica la sessione con una query reale, ogni volta.

type AuthzUser = {
  id: string;
  name: string;
  email: string;
};

type AuthzFailure = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

type RequireUserResult = { ok: true; user: AuthzUser } | AuthzFailure;

type RequireTeamOwnerResult =
  | {
      ok: true;
      user: AuthzUser;
      team: { id: string; name: string; leagueId: string; ownerId: string; points: number };
    }
  | AuthzFailure;

export async function requireUser(request: Request): Promise<RequireUserResult> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return { ok: false, status: 401, error: "Devi effettuare il login." };
  }

  return { ok: true, user: session.user };
}

export async function requireTeamOwner(
  request: Request,
  teamId: string
): Promise<RequireTeamOwnerResult> {
  const userResult = await requireUser(request);
  if (!userResult.ok) {
    return userResult;
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return { ok: false, status: 404, error: "Squadra non trovata." };
  }

  if (team.ownerId !== userResult.user.id) {
    return {
      ok: false,
      status: 403,
      error: "Non sei il proprietario di questa squadra.",
    };
  }

  return { ok: true, user: userResult.user, team };
}
