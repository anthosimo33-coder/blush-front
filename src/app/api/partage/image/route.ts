import { carteMoment, carteReponse } from "@/server/carte-partage";
import { chapitresEcrits, donneesVerdict, echangeDuChat } from "@/server/depot";
import { erreur, lireCorps } from "@/server/http";
import { masqueDe } from "@/server/partages";
import { garde } from "@/server/requete";
import { estOffert } from "@/contenu/chapitres";
import { peut } from "@/lib/acces";
import { ROUTES } from "@/types/api";

/**
 * « Partager en image » : un moment de BLUSH (une réponse du chat, la chute d’un chapitre) dessiné en story.
 * Le contenu est relu ici, dans le compte (jamais pris de la requête : pas de fausse image « askblush.com »),
 * et le prénom de l’autre est masqué (le tien reste). Comme le lien du verdict (src/server/partages.ts), rien d’une
 * situation difficile (le mode sobre) ne se partage ; et un chapitre payant ne se dessine qu’avec l’accès au rapport
 * (S-25) : l’image ne montre jamais ce que l’écran ne montre pas.
 */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true, limite: { compte: "image" } });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  /* Une réponse du chat (son échange) ou la chute d’un chapitre (sa place) : CibleImage, src/types/api.ts */
  const c = await lireCorps(req, ROUTES["POST /api/partage/image"].corps);
  if (!c) return erreur("cible");
  const verdict = await donneesVerdict(story.id);
  if (verdict?.sortie.mode_sobre) return erreur("sobre");
  const masquer = masqueDe(story);

  if (c.type === "reponse") {
    const echange = await echangeDuChat(story.id, c.echange);
    const r = echange?.blush.reponse;
    if (!echange || r?.kind !== "bubbles") return erreur("introuvable");
    return carteReponse({
      question: masquer((echange.toi.affiche ?? echange.toi.texte).replace(/^\(vocal\)\s*/, "")),
      bulles: [...r.bubbles.map((b) => b.text), ...(r.ask ? [r.ask] : [])].map(masquer),
    });
  }

  if (!estOffert(c.chapitre) && !peut(utilisateur.plan, "rapport")) return erreur("acces");
  const chapitre = (await chapitresEcrits(story.id)).find((ch) => ch.number === c.chapitre);
  const bloc = chapitre?.blocks[c.bloc];
  if (!chapitre || bloc?.kind !== "punchline") return erreur("introuvable");
  return carteMoment({ surtitre: masquer(`Chapitre ${chapitre.number} · ${chapitre.tocTitle}`), texte: masquer(bloc.text) });
}
