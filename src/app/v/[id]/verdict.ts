import "server-only";
import { BACKEND } from "@/services/mode";
import { verdictPartage, type VerdictPartage } from "@/server/partages";

/** Le verdict d’un lien partagé. Sans back-end (démo, galerie), le lien « demo » montre le verdict de démo. */
export async function verdictDuLien(id: string): Promise<VerdictPartage | null> {
  if (!BACKEND) return id === "demo" ? { emoji: "🔥", title: "Vous êtes un couple, sans le nom.", subtitle: "Elle veut que tu dormes chez elle tous les jours. Il manque juste le mot." } : null;
  return verdictPartage(id);
}
