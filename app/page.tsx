"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type League = {
  id: string;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadLeagues() {
    const res = await fetch("/api/leagues");
    const data = await res.json();
    setLeagues(data);
    setLoading(false);
  }

  useEffect(() => {
    loadLeagues();
  }, []);

  async function handleCreate() {
    setError(null);
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Errore nella creazione della lega.");
      return;
    }

    setName("");
    await loadLeagues();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleCreate();
    }
  }

  return (
    <main>
      <h1>Fantateam — Leghe</h1>

      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome nuova lega"
        />
        <button onClick={handleCreate}>Crea lega</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Caricamento...</p>
      ) : leagues.length === 0 ? (
        <p>Nessuna lega ancora. Creane una.</p>
      ) : (
        <ul>
          {leagues.map((league) => (
            <li key={league.id}>
              <Link href={`/leagues/${league.id}`}>{league.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
