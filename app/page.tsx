import Link from "next/link";
import { getSession } from "@/lib/get-session";
import LeaguesPanel from "@/app/components/leagues-panel";
import LogoutButton from "@/app/components/logout-button";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main>
      <h1>Fantateam — Leghe</h1>

      <p>
        {session ? (
          <>
            Loggato come {session.user.name} <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login">Login</Link> / <Link href="/register">Registrati</Link>
          </>
        )}
      </p>

      <LeaguesPanel />
    </main>
  );
}
