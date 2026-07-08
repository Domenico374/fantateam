import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAPIError } from "better-auth/api";

// Prefisso univoco per riconoscere ed eliminare solo gli User di prova creati
// da questa suite. onDelete: Cascade su Session/Account (definito nello schema
// Prisma di Better Auth) fa sì che eliminando lo User vengano eliminate anche
// le Session/Account collegate: lo verifichiamo esplicitamente in un test.
const TEST_PREFIX = "__test__slice3__";
const uniqueEmail = (label: string) =>
  `${TEST_PREFIX}${label}__${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

let createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  }
});

async function signUp(email: string, password: string, name = "Test User") {
  const result = await auth.api.signUpEmail({ body: { name, email, password } });
  // signUpEmail ritorna { user, token } — tracciamo l'id per la pulizia.
  createdUserIds.push(result.user.id);
  return result;
}

describe("registrazione (signUpEmail)", () => {
  it("crea un User nel DB con un Account collegato la cui password è hashata", async () => {
    const email = uniqueEmail("signup");
    const password = "password-corretta-123";

    await signUp(email, password);

    const userInDb = await prisma.user.findUnique({ where: { email } });
    expect(userInDb).not.toBeNull();
    expect(userInDb?.email).toBe(email);

    const account = await prisma.account.findFirst({
      where: { userId: userInDb!.id, providerId: "credential" },
    });
    expect(account).not.toBeNull();
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe(password);
    // Un hash vero è ben più lungo della password in chiaro e non la contiene.
    expect(account?.password?.length ?? 0).toBeGreaterThan(20);
    expect(account?.password?.includes(password)).toBe(false);
  });

  it("una seconda registrazione con la stessa email lancia un APIError 4xx (non un errore generico)", async () => {
    const email = uniqueEmail("dup");
    const password = "password-corretta-123";

    await signUp(email, password);

    let caught: unknown;
    try {
      await auth.api.signUpEmail({
        body: { name: "Altro Nome", email, password: "altra-password-456" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isAPIError(caught)).toBe(true);
    if (isAPIError(caught)) {
      expect(caught.status).not.toBe("INTERNAL_SERVER_ERROR");
      // statusCode HTTP numerico esposto da better-auth sugli APIError.
      const statusCode = (caught as unknown as { statusCode?: number }).statusCode;
      if (typeof statusCode === "number") {
        expect(statusCode).toBeGreaterThanOrEqual(400);
        expect(statusCode).toBeLessThan(500);
      }
    }

    // Non deve esistere un secondo User con la stessa email.
    const usersWithEmail = await prisma.user.findMany({ where: { email } });
    expect(usersWithEmail).toHaveLength(1);
  });
});

describe("login (signInEmail)", () => {
  it("con credenziali corrette crea una Session collegata all'utente", async () => {
    const email = uniqueEmail("signin-ok");
    const password = "password-corretta-123";
    await signUp(email, password);

    const { headers: signInHeaders, response } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });

    expect(response.user.email).toBe(email);

    const setCookie = signInHeaders.get("set-cookie");
    expect(setCookie).toBeTruthy();

    const userInDb = await prisma.user.findUnique({ where: { email } });
    const sessionInDb = await prisma.session.findFirst({
      where: { userId: userInDb!.id },
    });
    expect(sessionInDb).not.toBeNull();

    // Roundtrip cookie -> getSession, come farebbe il browser.
    const sessionHeaders = new Headers({ cookie: setCookie ?? "" });
    const session = await auth.api.getSession({ headers: sessionHeaders });
    expect(session).not.toBeNull();
    expect(session?.user.email).toBe(email);
    expect(session?.user.name).toBe("Test User");
  });

  it("con password errata lancia un APIError 401", async () => {
    const email = uniqueEmail("signin-bad-pw");
    const password = "password-corretta-123";
    await signUp(email, password);

    let caught: unknown;
    try {
      await auth.api.signInEmail({
        body: { email, password: "password-sbagliata" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isAPIError(caught)).toBe(true);
    if (isAPIError(caught)) {
      const statusCode = (caught as unknown as { statusCode?: number }).statusCode;
      if (typeof statusCode === "number") {
        expect(statusCode).toBe(401);
      } else {
        expect(caught.status).toBe("UNAUTHORIZED");
      }
    }
  });

  it("con un'email inesistente lancia un APIError 4xx (non un successo)", async () => {
    let caught: unknown;
    try {
      await auth.api.signInEmail({
        body: { email: uniqueEmail("non-esiste"), password: "qualsiasi-password" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isAPIError(caught)).toBe(true);
  });
});

describe("getSession", () => {
  it("con Headers vuoti (nessun cookie) ritorna null", async () => {
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it("con il cookie di un signIn riuscito ritorna l'utente corretto", async () => {
    const email = uniqueEmail("getsession-ok");
    const password = "password-corretta-123";
    await signUp(email, password, "Mario Rossi");

    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const setCookie = signInHeaders.get("set-cookie");

    const sessionHeaders = new Headers({ cookie: setCookie ?? "" });
    const session = await auth.api.getSession({ headers: sessionHeaders });

    expect(session).not.toBeNull();
    expect(session?.user.email).toBe(email);
    expect(session?.user.name).toBe("Mario Rossi");
  });
});

describe("cancellazione User (cleanup)", () => {
  it("eliminare uno User elimina in cascata Session e Account collegati", async () => {
    const email = uniqueEmail("cascade");
    const password = "password-corretta-123";
    await signUp(email, password);

    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    void signInHeaders;

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();

    const accountBefore = await prisma.account.findFirst({ where: { userId: user!.id } });
    const sessionBefore = await prisma.session.findFirst({ where: { userId: user!.id } });
    expect(accountBefore).not.toBeNull();
    expect(sessionBefore).not.toBeNull();

    await prisma.user.delete({ where: { id: user!.id } });
    createdUserIds = createdUserIds.filter((id) => id !== user!.id);

    const accountAfter = await prisma.account.findFirst({ where: { userId: user!.id } });
    const sessionAfter = await prisma.session.findFirst({ where: { userId: user!.id } });
    expect(accountAfter).toBeNull();
    expect(sessionAfter).toBeNull();
  });
});
