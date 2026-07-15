"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MyLeague = {
  id: string;
  name: string;
  isPrivate: boolean;
  myTeam: { id: string; name: string; points: number };
};

export default function MyLeaguesPanel() {
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leagues/mine")
      .then((res) => res.json())
      .then((data) => {
        setLeagues(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Caricamento...</p>;
  }

  if (leagues.length === 0) {
    return <p>Non fai ancora parte di nessuna lega.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Lega</th>
          <th>La tua squadra</th>
          <th>Punti</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {leagues.map((league) => (
          <tr key={league.id}>
            <td>
              <Link href={`/leagues/${league.id}`}>
                {league.name} {league.isPrivate && "🔒"}
              </Link>
            </td>
            <td>{league.myTeam.name}</td>
            <td>{league.myTeam.points}</td>
            <td>
              <Link href={`/teams/${league.myTeam.id}/roster`}>Rosa</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
