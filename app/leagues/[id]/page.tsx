"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Team = {
  id: string;
  name: string;
  points: number;
  createdAt: string;
};

type LeagueDetail = {
  id: string;
  name: string;
  createdAt: string;
  teams: Team[];
};

export default function LeagueDetailPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLeague = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setLeague(data);
    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    loadLeague();
  }, [loadLeague]);

  async function handleAddTeam() {
    setError(null);
    const res = await fetch(`/api/leagues/${leagueId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Errore nell'aggiunta della squadra.");
      return;
    }

    setTeamName("");
    await loadLeague();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleAddTeam();
    }
  }

  if (loading) {
    return (
      <main>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (notFound || !league) {
    return (
      <main>
        <p>
          <Link href="/">← Tutte le leghe</Link>
        </p>
        <p>Lega non trovata.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/">← Tutte le leghe</Link>
      </p>
      <h1>{league.name}</h1>

      <div>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome nuova squadra"
        />
        <button onClick={handleAddTeam}>Aggiungi squadra</button>
      </div>

      {error && <p className="error">{error}</p>}

      <h2>Classifica</h2>
      {league.teams.length === 0 ? (
        <p>Nessuna squadra ancora.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Squadra</th>
              <th>Punti</th>
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team, index) => (
              <tr key={team.id}>
                <td>{index + 1}</td>
                <td>{team.name}</td>
                <td>{team.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
