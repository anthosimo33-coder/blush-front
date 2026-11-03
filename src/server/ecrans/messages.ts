import { REPERE_MEDIA } from "@prompts/lib/conv";
import { HEURE_INCONNUE, JOUR_INCONNU, lireLigne } from "@prompts/lib/ligne";
import { nomAffiche } from "@prompts/lib/noms";
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

/**
 * Les messages affichables, par identifiant. Un média seul (« [photo] »), ou ce que WhatsApp a écrit à sa place (un
 * appel, une position : « [Appel vocal 7 s] »), n’a rien à montrer : il est écarté. `toi` : le nom (ou les noms,
 * nomsDeToi) sous lequel tes messages s’écrivent dans les lignes. Sous la bulle : le jour, avec l’année quand ce n’est
 * pas celle du dernier message de la conv (deux messages à un an d’écart ne portent pas la même date), et l’heure,
 * « vers 21:00 » quand elle vient d’un repère de captures ; rien d’un jour inconnu (des captures sans date, JOUR_INCONNU).
 */
export function messagesAffiches(lignes: Map<string, string>, toi: string | readonly string[], { fin = "" }: { fin?: string } = {}): Map<string, Message> {
  const noms = new Set(typeof toi === "string" ? [toi] : toi);
  const lues = [...lignes].map(([id, ligne]) => [id, lireLigne(ligne)] as const);
  /*
   * Le jour du dernier message de la conv (`fin`, resume.fin : les lignes données ne sont parfois que celles citées), ou
   * d’une ligne plus récente (un message ajouté depuis le chat). Une ligne de son profil est datée du jour de l’ajout :
   * elle n’en est pas un. Une ligne au jour inconnu non plus : son jour n’est pas une date (« ???? » passerait devant tout)
   */
  const derniere = lues.reduce((a, [, l]) => (l && !l.profil && l.jour !== JOUR_INCONNU && l.jour > a ? l.jour : a), fin).slice(0, 4);
  const out = new Map<string, Message>();
  for (const [id, l] of lues) {
    /* Son profil (« profil de Sophie ») n’est pas un message : il ne s’affiche pas en bulle */
    if (!l || /^\[[^\]]+\]$/.test(l.texte.trim()) || l.profil) continue;
    const deToi = noms.has(l.nom);
    const h = l.heure === HEURE_INCONNUE ? "" : l.heure.startsWith("~") ? ` vers ${l.heure.slice(1)}` : ` ${l.heure}`;
    const annee = l.jour.slice(0, 4) === derniere ? "" : `/${l.jour.slice(0, 4)}`;
    /* Un jour inconnu (des captures sans date) : le nom seul, et l’heure si elle est lue */
    const quand = l.jour === JOUR_INCONNU ? h.trim() : `${l.jour.slice(8, 10)}/${l.jour.slice(5, 7)}${annee}${h}`;
    const qui = deToi ? "Toi" : nomAffiche(l.nom);
    out.set(id, {
      from: deToi ? "toi" : "elle",
      /* La légende d’un média : son texte, puis ce qu’il accompagne (« on y va ? · photo ») */
      text: l.texte.replace(/ ⏎ /g, " ").replace(REPERE_MEDIA, " · $1"),
      caption: quand ? `${qui} · ${quand}` : qui,
    });
  }
  return out;
}

/** Les messages cités, dans l’ordre des preuves. Une preuve qui n’a rien à montrer (un média seul, son profil) est sautée. */
export const resoudre = (ids: string[], messages: Map<string, Message>): Message[] =>
  ids.flatMap((id) => {
    const m = messages.get(id);
    return m ? [m] : [];
  });
