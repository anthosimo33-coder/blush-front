import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { estAdmin } from "@/server/env";
import { decrireLaDemande } from "@/server/mcp/acces";
import { contexte } from "@/server/requete";
import { Consentement, type DemandeAffichee } from "../Consentement";

export const metadata: Metadata = { title: "Connecter Claude · Admin" };

/**
 * La page de consentement de l’OAuth du serveur MCP (src/server/mcp/acces.ts) : Claude y envoie la personne pour qu’elle
 * l’autorise à lire /admin. Réservée aux emails de BLUSH_ADMINS, comme le tableau de bord : pour un autre compte, la
 * page n’existe pas. Sans session, elle demande de se connecter dans ce navigateur, puis de la recharger (ses
 * paramètres restent dans l’adresse). Une demande fausse dont le retour est sûr y repart avec son erreur.
 */
export default async function Page({ searchParams }: PageProps<"/admin/connecter">) {
  const q = await searchParams;
  /* Les paramètres de l’OAuth que la page relaie (ParametresDAutorisation, src/types/api.ts) : les autres ne comptent pas */
  const lire = (cle: string) => (typeof q[cle] === "string" ? q[cle] : undefined);
  const parametres = {
    response_type: lire("response_type"),
    client_id: lire("client_id"),
    redirect_uri: lire("redirect_uri"),
    code_challenge: lire("code_challenge"),
    code_challenge_method: lire("code_challenge_method"),
    state: lire("state"),
    scope: lire("scope"),
    resource: lire("resource"),
  };
  const { utilisateur } = await contexte();
  if (!utilisateur) return <Consentement demande={{ genre: "connexion" }} parametres={parametres} />;
  if (!estAdmin(utilisateur.email)) notFound();
  const d = await decrireLaDemande(parametres);
  /* Le retour d’un client enregistré, hors de BLUSH : une adresse que les routes typées ne connaissent pas */
  if (d.genre === "invalide") redirect(d.retour as Route);
  const demande: DemandeAffichee = d.genre === "ok" ? { ...d, compte: utilisateur.email } : { genre: "perdue" };
  return <Consentement demande={demande} parametres={parametres} />;
}
