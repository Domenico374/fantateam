import { createAuthClient } from "better-auth/react";

// Nessun baseURL esplicito: il client usa l'origine corrente della pagina
// (same-origin). Frontend e API vivono sullo stesso dominio Vercel (nessun
// backend separato), quindi non serve una variabile da tenere sincronizzata
// tra locale e produzione — e si evita il rischio di un fallback hardcoded
// che punti a un URL sbagliato in un ambiente diverso da quello previsto.
export const authClient = createAuthClient({});
