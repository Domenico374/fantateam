"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    setError(null);
    setSubmitting(true);

    const { error: signUpError } = await authClient.signUp.email({
      name: nome,
      email,
      password,
    });

    setSubmitting(false);

    if (signUpError) {
      if (signUpError.status === 422 || signUpError.status === 409) {
        setError("Email già in uso.");
      } else {
        setError(signUpError.message ?? "Errore nella registrazione.");
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleRegister();
    }
  }

  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Registrati</h1>

      <div>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome"
        />
      </div>
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Email"
        />
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Password"
        />
      </div>
      <button onClick={handleRegister} disabled={submitting}>
        {submitting ? "Registrazione..." : "Registrati"}
      </button>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
