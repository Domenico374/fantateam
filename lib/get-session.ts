import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// Helper server-side per leggere la sessione in Server Component (dove non c'è
// un oggetto Request da passare direttamente). Nei route handler si può usare
// auth.api.getSession({ headers: request.headers }) senza passare da qui.
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
