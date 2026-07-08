"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("Credenziali non valide.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Login</h1>

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
      <button onClick={handleLogin} disabled={submitting}>
        {submitting ? "Accesso..." : "Login"}
      </button>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
