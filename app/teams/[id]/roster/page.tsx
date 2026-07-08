"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Player = {
  id: string;
  nome: string;
  ruolo: string;
  squadraSerieA: string;
  costo: number;
};

type RosterEntry = {
  id: string;
  playerId: string;
  teamId: string;
  createdAt: string;
  player: Player;
};

type Team = {
  id: string;
  name: string;
};

const RUOLI = [
  { value: "", label: "Tutti i ruoli" },
  { value: "P", label: "Portiere" },
  { value: "D", label: "Difensore" },
  { value: "C", label: "Centrocampista" },
  { value: "A", label: "Attaccante" },
];

const SQUADRE_SERIE_A = [
  "Atalanta", "Bologna", "Cagliari", "Como", "Cremonese", "Fiorentina",
  "Genoa", "Hellas Verona", "Inter", "Juventus", "Lazio", "Lecce", "Milan",
  "Napoli", "Parma", "Pisa", "Roma", "Sassuolo", "Torino", "Udinese",
];

export default function RosterPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;

  const [team, setTeam] = useState<Team | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [filtroRuolo, setFiltroRuolo] = useState("");
  const [filtroSquadra, setFiltroSquadra] = useState("");
  const [ricercaNome, setRicercaNome] = useState("");
  const [risultati, setRisultati] = useState<Player[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/roster`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTeam(data.team);
    setEntries(data.entries);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const cercaGiocatori = useCallback(async () => {
    setSearchError(null);
    const qs = new URLSearchParams();
    if (filtroRuolo) qs.set("ruolo", filtroRuolo);
    if (filtroSquadra) qs.set("squadra", filtroSquadra);
    if (ricercaNome.trim()) qs.set("search", ricercaNome.trim());

    const res = await fetch(`/api/players?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setSearchError(data.error ?? "Errore nella ricerca.");
      return;
    }
    setRisultati(data);
  }, [filtroRuolo, filtroSquadra, ricercaNome]);

  useEffect(() => {
    cercaGiocatori();
  }, [cercaGiocatori]);

  async function handleAggiungi(playerId: string) {
    setRosterError(null);
    const res = await fetch(`/api/teams/${teamId}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRosterError(data.error ?? "Errore nell'aggiunta del giocatore.");
      return;
    }
    await loadRoster();
  }

  async function handleRimuovi(playerId: string) {
    setRosterError(null);
    const res = await fetch(`/api/teams/${teamId}/roster/${playerId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => null);
      setRosterError(data?.error ?? "Errore nella rimozione del giocatore.");
      return;
    }
    await loadRoster();
  }

  if (loading) {
    return (
      <main>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (notFound || !team) {
    return (
      <main>
        <p>
          <Link href="/">← Tutte le leghe</Link>
        </p>
        <p>Squadra non trovata.</p>
      </main>
    );
  }

  const costoTotale = entries.reduce((tot, e) => tot + e.player.costo, 0);
  const idInRosa = new Set(entries.map((e) => e.playerId));

  return (
    <main>
      <p>
        <Link href="/">← Tutte le leghe</Link>
      </p>
      <h1>Rosa — {team.name}</h1>

      {rosterError && <p className="error">{rosterError}</p>}

      <h2>Giocatori in rosa (costo totale: {costoTotale})</h2>
      {entries.length === 0 ? (
        <p>Nessun giocatore in rosa ancora.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ruolo</th>
              <th>Nome</th>
              <th>Squadra</th>
              <th>Costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.player.ruolo}</td>
                <td>{e.player.nome}</td>
                <td>{e.player.squadraSerieA}</td>
                <td>{e.player.costo}</td>
                <td>
                  <button onClick={() => handleRimuovi(e.playerId)}>
                    Rimuovi
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Cerca giocatori</h2>
      <div>
        <select
          value={filtroRuolo}
          onChange={(e) => setFiltroRuolo(e.target.value)}
        >
          {RUOLI.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={filtroSquadra}
          onChange={(e) => setFiltroSquadra(e.target.value)}
        >
          <option value="">Tutte le squadre</option>
          {SQUADRE_SERIE_A.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={ricercaNome}
          onChange={(e) => setRicercaNome(e.target.value)}
          placeholder="Cerca per nome"
        />
      </div>

      {searchError && <p className="error">{searchError}</p>}

      {risultati.length === 0 ? (
        <p>Nessun risultato.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ruolo</th>
              <th>Nome</th>
              <th>Squadra</th>
              <th>Costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {risultati.map((p) => (
              <tr key={p.id}>
                <td>{p.ruolo}</td>
                <td>{p.nome}</td>
                <td>{p.squadraSerieA}</td>
                <td>{p.costo}</td>
                <td>
                  <button
                    onClick={() => handleAggiungi(p.id)}
                    disabled={idInRosa.has(p.id)}
                  >
                    {idInRosa.has(p.id) ? "Già in rosa" : "Aggiungi alla rosa"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
