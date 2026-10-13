import "server-only";
import type { Direct } from "@/types/api";

/*
 * /admin en direct : qui est sur le site en ce moment (les onglets qui ont fait signe dans la dernière minute et
 * quart), où ils en sont, d’où ils arrivent, de quelle ville, et le fil des derniers gestes. Que des nombres, des villes
 * et des écrans : ni compte, ni email, ni conv, ni adresse IP (src/server/visites.ts).
 */

export async function direct(): Promise<Direct> {
  throw new Error("à écrire");
}
