import { z } from "zod";
import { inviterLaListe } from "@/server/attente";
import { Email } from "@/server/auth";
import { estAdmin } from "@/server/env";
import { debloquerDesConvs, donnerDesBulles, noterAction } from "@/server/equipe";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { arreterTournage, creerTournage } from "@/server/tournage";
import { ROUTES } from "@/types/api";

/* Le corps du contrat, l’email vérifié comme à la connexion (Email : sa forme, en minuscules) */
const AvecEmail = z.object({ email: Email });

/**
 * Les gestes de l’équipe depuis /admin (src/server/equipe.ts, attente.ts et tournage.ts) : donner des bulles à un compte,
 * débloquer le rapport de sa dernière conv (ou de toutes), inviter la liste d’attente par lots, créer une conv de
 * tournage depuis une conv de son propre compte, ou l’arrêter. Réservés aux emails de BLUSH_ADMINS :
 * pour tous les autres, la route n’existe pas (404 « introuvable », comme la page). Chaque geste va au journal de
 * l’équipe ; la réponse ne dit que des nombres (un solde, des convs, des invitations).
 */
export const POST = route("POST /api/admin", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const { utilisateur } = g;
  if (!estAdmin(utilisateur.email)) return erreur("introuvable");
  const geste = await lireCorps(req, ROUTES["POST /api/admin"].corps);
  if (!geste) return erreur("invalide");
  if (geste.action === "inviter") {
    const lot = await inviterLaListe(geste.n);
    if (lot.invites) await noterAction("inviter", { par: utilisateur.id, compte: null, nombre: lot.invites });
    return repondre("POST /api/admin", { action: "inviter", ...lot });
  }
  if (geste.action === "tournage") {
    const r = await creerTournage({ conv: geste.conv, nom: geste.nom, par: utilisateur });
    if ("id" in r) await noterAction("tournage", { par: utilisateur.id, compte: null, nombre: 1 });
    return repondre("POST /api/admin", { action: "tournage", refus: "refus" in r ? r.refus : null });
  }
  if (geste.action === "tournage_arret") {
    const arretee = await arreterTournage(geste.id);
    if (arretee) await noterAction("tournage_arret", { par: utilisateur.id, compte: null, nombre: 1 });
    return repondre("POST /api/admin", { action: "tournage_arret", arretee });
  }
  const lu = AvecEmail.safeParse(geste);
  if (!lu.success) return erreur("email");
  const { email } = lu.data;
  if (geste.action === "bulles") {
    const r = await donnerDesBulles(email, geste.n, utilisateur.id);
    return repondre("POST /api/admin", { action: "bulles", solde: r?.solde ?? null });
  }
  const r = await debloquerDesConvs(email, geste.cible, utilisateur.id);
  return repondre("POST /api/admin", { action: "debloquer", convs: r ? r.convs.length : null });
});
