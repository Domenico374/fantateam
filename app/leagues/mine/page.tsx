import Link from "next/link";
import { getSession } from "@/lib/get-session";
import MyLeaguesPanel from "@/app/components/my-leagues-panel";

export default async function MyLeaguesPage() {
  const session = await getSession();

  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Le mie leghe</h1>

      {session ? (
        <MyLeaguesPanel />
      ) : (
        <p>
          <Link href="/login">Fai login</Link> per vedere le tue leghe.
        </p>
      )}
    </main>
  );
}
