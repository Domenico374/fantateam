"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type League = {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
};

type CreatedLeague = League & { inviteCode: string | null };

export default function LeaguesPanel({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [joinableLeagues, setJoinableLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  // Crea lega
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreatedLeague | null>(null);

  // Entra con un codice
  const [joinCode, setJoinCode] = useState("");
  const [joinTeamName, setJoinTeamName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // Entra da lista pubblica: nome squadra per riga (indicizzato per id lega)
  const [teamNameByLeague, setTeamNameByLeague] = useState<Record<string, string>>({});
  const [joinListError, setJoinListError] = useState<string | null>(null);

  const loadJoinable = useCallback(async () => {
    const res = await fetch("/api/leagues?joinable=true");
    const data = await res.json();
    setJoinableLeagues(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJoinable();
  }, [loadJoinable]);

  async function handleCreate() {
    setCreateError(null);
    setJustCreated(null);
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isPrivate, teamName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setCreateError(data.error ?? "Errore nella creazione della lega.");
      return;
    }

    setJustCreated(data);
    setName("");
    setTeamName("");
    setIsPrivate(false);
    await loadJoinable();
  }

  async function handleJoinPublic(leagueId: string) {
    setJoinListError(null);
    const teamNameForLeague = teamNameByLeague[leagueId]?.trim();
    if (!teamNameForLeague) {
      setJoinListError("Inserisci un nome squadra per entrare.");
      return;
    }

    const res = await fetch(`/api/leagues/${leagueId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamNameForLeague }),
    });
    const data = await res.json();

    if (!res.ok) {
      setJoinListError(data.error ?? "Errore nell'entrare nella lega.");
      return;
    }

    setTeamNameByLeague((prev) => ({ ...prev, [leagueId]: "" }));
    await loadJoinable();
  }

  async function handleJoinByCode() {
    setJoinError(null);
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode, teamName: joinTeamName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setJoinError(data.error ?? "Errore nell'entrare nella lega.");
      return;
    }

    setJoinCode("");
    setJoinTeamName("");
    await loadJoinable();
  }

  return (
    <>
      <h2>Crea una lega</h2>
      {isLoggedIn ? (
        <>
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome nuova lega"
            />
            <label>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />{" "}
              Privata (si entra solo con codice)
            </label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Nome della tua squadra"
            />
            <button onClick={handleCreate}>Crea lega</button>
          </div>

          {createError && <p className="error">{createError}</p>}
          {justCreated && (
            <p>
              Lega &quot;{justCreated.name}&quot; creata.{" "}
              {justCreated.inviteCode && (
                <>
                  Codice d&apos;invito: <strong>{justCreated.inviteCode}</strong> — condividilo
                  con chi vuoi far entrare.
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p>
          <Link href="/login">Fai login</Link> per creare una lega.
        </p>
      )}

      <h2>Leghe pubbliche disponibili</h2>
      {loading ? (
        <p>Caricamento...</p>
      ) : joinableLeagues.length === 0 ? (
        <p>Nessuna lega pubblica disponibile al momento.</p>
      ) : (
        <ul>
          {joinableLeagues.map((league) => (
            <li key={league.id}>
              <Link href={`/leagues/${league.id}`}>{league.name}</Link>{" "}
              {isLoggedIn && (
                <>
                  <input
                    value={teamNameByLeague[league.id] ?? ""}
                    onChange={(e) =>
                      setTeamNameByLeague((prev) => ({ ...prev, [league.id]: e.target.value }))
                    }
                    placeholder="Nome squadra"
                  />
                  <button onClick={() => handleJoinPublic(league.id)}>Entra</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {joinListError && <p className="error">{joinListError}</p>}

      {isLoggedIn && (
        <>
          <h2>Entra con un codice</h2>
          <div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Codice d'invito"
            />
            <input
              value={joinTeamName}
              onChange={(e) => setJoinTeamName(e.target.value)}
              placeholder="Nome della tua squadra"
            />
            <button onClick={handleJoinByCode}>Entra</button>
          </div>
          {joinError && <p className="error">{joinError}</p>}
        </>
      )}
    </>
  );
}
