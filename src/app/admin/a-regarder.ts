import { CIBLE_DE_MARGE, NOMS_DES_SOURCES, margeApresIA } from "@/contenu/pilotage";
import type { StatsAdmin } from "@/server/stats";
import type { SourceVisite } from "@/types";
import { dollars, euros, fuiteDuTunnel, pluriel, pourcent, rapport, texteDeLaFuite } from "./calculs";

/*
 * « À regarder », en haut du pilotage : trois cartes au plus, calculées des chiffres de la période. D’abord ce qui coince
 * (la santé, la plus grosse fuite du tunnel, la marge sous la cible, les remboursements), puis les bonnes nouvelles (la
 * source qui achète le mieux, la marge au-dessus de la cible). Tant qu’aucune visite n’est comptée, une carte neutre le
 * dit, à la place de ce qui dépend des visiteurs. Pure : tests/unit/admin-a-regarder.test.ts.
 */

/** Au-delà de cette part du payé, les remboursements se regardent. */
const SEUIL_DES_REMBOURSEMENTS = 0.05;
/** Une source n’est « la meilleure » qu’à partir de ce nombre de visiteurs : en dessous, son taux ne veut rien dire. */
export const VISITEURS_D_UNE_SOURCE = 30;
/** La plus grosse fuite ne se signale qu’à partir de ce nombre de personnes à l’étape d’avant : 1 visiteur sur 1 parti n’en est pas une. */
const PERSONNES_D_UNE_FUITE = 30;
/** Combien de cartes au plus. */
const CARTES = 3;

/** Où mène le lien d’une carte : une carte du pilotage, par son ancre. */
type AncreDuPilotage = "tunnel" | "couts" | "sources" | "sante" | "chiffre-d-affaires" | "chiffres-cles";

/** Une carte d’« À regarder » : ce qui coince (mal), une bonne nouvelle (bon), ou une remarque (neutre). */
export type CarteARegarder = { ton: "mal" | "bon" | "neutre"; titre: string; texte: string; lien: { texte: string; ancre: AncreDuPilotage } | null };

/** La source au meilleur taux d’achat, parmi celles d’au moins VISITEURS_D_UNE_SOURCE visiteurs, et qui ont un acheteur. */
export function meilleureSource(sources: StatsAdmin["pilotage"]["sources"]): { source: SourceVisite; taux: number; visiteurs: number; acheteurs: number } | null {
  let meilleure: { source: SourceVisite; taux: number; visiteurs: number; acheteurs: number } | null = null;
  for (const s of sources) {
    if (s.source === null || s.visiteurs < VISITEURS_D_UNE_SOURCE || s.acheteurs === 0) continue;
    const taux = s.acheteurs / s.visiteurs;
    if (!meilleure || taux > meilleure.taux) meilleure = { source: s.source, taux, visiteurs: s.visiteurs, acheteurs: s.acheteurs };
  }
  return meilleure;
}

/** Les trois cartes au plus d’« À regarder », dans l’ordre où les lire. Jamais vide : sans rien à dire, une carte calme. */
export function aRegarder(s: StatsAdmin): CarteARegarder[] {
  const p = s.pilotage;
  const suivi = p.suiviDepuis !== null;
  const mal: CarteARegarder[] = [];
  const bon: CarteARegarder[] = [];
  const neutre: CarteARegarder[] = [];

  /* La santé : des tâches en échec ou bloquées, des paiements refusés, des pannes du serveur */
  const souci = [
    p.sante.echecs > 0 && `${pluriel(p.sante.echecs, "tâche")} en échec`,
    p.sante.bloquees > 0 && `${pluriel(p.sante.bloquees, "tâche bloquée", "tâches bloquées")}`,
    p.sante.paiementsEchoues > 0 && `${pluriel(p.sante.paiementsEchoues, "paiement refusé", "paiements refusés")}`,
    p.sante.pannes > 0 && `${pluriel(p.sante.pannes, "panne du serveur", "pannes du serveur")}`,
  ].filter((t): t is string => Boolean(t));
  if (souci.length)
    mal.push({
      ton: "mal",
      titre: souci.length > 1 ? `${souci.slice(0, -1).join(", ")} et ${souci.at(-1)}` : (souci[0] ?? ""),
      texte: "Le détail est dans la carte Santé\u00a0: les codes d’échec, ce qui est bloqué, ce que Whop a refusé, les routes et les pages en panne.",
      lien: { texte: "Voir la santé", ancre: "sante" },
    });

  /* La plus grosse fuite : sans visites comptées, celle de l’arrivée ne se calcule pas (fuiteDuTunnel saute un passage vide) */
  const fuite = fuiteDuTunnel(suivi ? p.tunnel : { ...p.tunnel, visiteurs: 0 });
  if (fuite && fuite.depuis >= PERSONNES_D_UNE_FUITE) mal.push({ ton: "mal", ...texteDeLaFuite(fuite), lien: { texte: "Voir le tunnel", ancre: "tunnel" } });

  /* La marge après l’IA, contre la cible */
  const marge = margeApresIA(p.net.valeur, p.dollars.valeur);
  if (marge !== null && marge < CIBLE_DE_MARGE) {
    const [poste] = s.couts.postes;
    const part = poste ? rapport(poste.dollars, s.couts.total) : null;
    mal.push({
      ton: "mal",
      titre: `Marge après IA\u00a0: ${pourcent(marge, 0)}, sous ta cible de ${pourcent(CIBLE_DE_MARGE, 0)}`,
      texte:
        poste && part !== null
          ? `Le poste «\u00a0${poste.nom}\u00a0» fait ${pourcent(part * 100, 0)} de ce que coûte l’IA (${dollars(poste.dollars)} sur ${dollars(s.couts.total)}).`
          : `L’IA a coûté ${dollars(p.dollars.valeur)} pour ${euros(p.net.valeur)} de chiffre d’affaires net.`,
      lien: { texte: "Voir les coûts", ancre: "couts" },
    });
  }

  /* Les remboursements, au-delà de 5 % du payé */
  const rembourse = rapport(p.rembourses.centimes, p.payes.centimes);
  if (rembourse !== null && rembourse > SEUIL_DES_REMBOURSEMENTS)
    mal.push({
      ton: "mal",
      titre: `${pourcent(rembourse * 100, 0)} du payé remboursé`,
      texte: `${pluriel(p.rembourses.n, "remboursement")} pour ${euros(p.rembourses.centimes)}, sur ${euros(p.payes.centimes)} payés. Au-delà de 5\u00a0%, cherche ce qui déçoit après l’achat.`,
      lien: { texte: "Voir le chiffre d’affaires", ancre: "chiffre-d-affaires" },
    });

  /* Sans visites comptées, ce qui en dépend se tait, et une carte le dit */
  if (!suivi)
    neutre.push({
      ton: "neutre",
      titre: "Les visiteurs se comptent depuis la mise en ligne de ce tableau de bord",
      texte: "Le taux d’achat, l’arrivée dans le tunnel et les sources se rempliront avec les premières visites.",
      lien: null,
    });

  /* La source qui achète le mieux */
  const meilleure = suivi ? meilleureSource(p.sources) : null;
  if (meilleure) {
    const moyenne = rapport(p.acheteurs.valeur, p.visiteurs.valeur);
    bon.push({
      ton: "bon",
      titre: `${NOMS_DES_SOURCES[meilleure.source]} achète le mieux\u00a0: ${pourcent(meilleure.taux * 100)}`,
      texte: `${pluriel(meilleure.acheteurs, "acheteur")} pour ${pluriel(meilleure.visiteurs, "visiteur")} venus de là${moyenne === null ? "" : `, quand la moyenne est à ${pourcent(moyenne * 100)}`}.`,
      lien: { texte: "Voir les sources", ancre: "sources" },
    });
  }

  /* La marge au-dessus de la cible */
  if (marge !== null && marge >= CIBLE_DE_MARGE)
    bon.push({
      ton: "bon",
      titre: `Marge après IA\u00a0: ${pourcent(marge, 0)}`,
      texte: `Au-dessus de ta cible de ${pourcent(CIBLE_DE_MARGE, 0)}, une fois l’IA payée (hors frais Whop).`,
      lien: { texte: "Voir les coûts", ancre: "couts" },
    });

  const cartes = [...mal, ...neutre, ...bon].slice(0, CARTES);
  if (cartes.length) return cartes;
  return [
    {
      ton: "neutre",
      titre: "Rien à signaler",
      texte: `Aucun souci, et pas encore de quoi comparer sur la période (${pluriel(p.visiteurs.valeur, "visiteur")}, ${euros(p.net.valeur)} de chiffre d’affaires net).`,
      lien: null,
    },
  ];
}
