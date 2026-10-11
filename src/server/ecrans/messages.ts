import { HEURE_INCONNUE, lireLigne } from "@prompts/lib/ligne";
import type { Message } from "@/types";

/*
 * Des sorties du modèle aux écrans de l’appli (src/server/ecrans) : le rapport, le verdict, les scores, sa fiche, les
 * bulles du chat, et les trouvailles de la lecture. Ces fonctions rendent les types du front (src/types), et rien
 * d’autre : ni base, ni modèle. Elles vivaient dans le sous-module des prompts (prompts/lib/front.ts), avec leur
 * propre copie des types du front ; le sous-module ne garde que ce que lit et écrit le modèle. Le rapport de l’écran
 * s’assemble ensuite, d’après ce qui est lu en base, dans src/server/presentation (README, « Où sont les choses »).
 *
 * Ici, les preuves : une ligne de la conv (lib/ligne.ts) devient un message daté.
 */

/** Les messages affichables, par identifiant. Un média seul (« [photo] ») n’a rien à montrer : il est écarté. */
export function messagesAffiches(lignes: Map<string, string>, prenomUtilisateur: string): Map<string, Message> {
  const out = new Map<string, Message>();
  for (const [id, ligne] of lignes) {
    const l = lireLigne(ligne);
    /* Son profil (« profil de Sophie ») n’est pas un message : il ne s’affiche pas en bulle */
    if (!l || /^\[[^\]]+\]$/.test(l.texte.trim()) || l.profil) continue;
    const toi = l.nom === prenomUtilisateur;
    const h = l.heure === HEURE_INCONNUE ? "" : ` ${l.heure.replace("~", "")}`;
    out.set(id, { from: toi ? "toi" : "elle", text: l.texte.replace(/ ⏎ /g, " "), caption: `${toi ? "Toi" : l.nom} · ${l.jour.slice(8, 10)}/${l.jour.slice(5, 7)}${h}` });
  }
  return out;
}

/** Les messages cités, dans l’ordre des preuves. Une preuve qui n’a rien à montrer (un média seul, son profil) est sautée. */
export const resoudre = (ids: string[], messages: Map<string, Message>): Message[] =>
  ids.flatMap((id) => {
    const m = messages.get(id);
    return m ? [m] : [];
  });
