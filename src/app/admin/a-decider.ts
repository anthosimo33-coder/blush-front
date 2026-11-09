import { NOMS_DES_SOURCES } from "@/contenu/pilotage";
import type { StatsAdmin } from "@/server/stats";
import { aRegarder, meilleureSource, type CarteARegarder } from "./a-regarder";
import { nombre, pluriel, pourcent, rapport } from "./calculs";

/*
 * « À décider », en haut du résumé (/admin) : une liste classée, cinq lignes au plus, chacune
 * avec son constat chiffré, ce qu’il veut dire, et la rubrique où le creuser. Ce qu’« À regarder » ne disait pas : un
 * canal qui amène du monde sans vendre, et un trafic qui monte sans que les acheteurs suivent. La santé n’y prend plus de
 * place : elle a son bandeau (soucisDeSante) et sa rubrique. Pure.
 */

/** Les rubriques du pilotage rangé. */
export type Vue = "resume" | "acquisition" | "tunnel" | "ventes" | "couts" | "sante" | "outils";

/** Une ligne d’« À décider » : son ton, son constat, ce qu’il veut dire, et où le creuser (une rubrique, et une ancre dedans). */
export type Decision = { ton: CarteARegarder["ton"]; titre: string; texte: string; lien: { texte: string; vue: Vue; ancre?: string } | null };

/** Un canal ne se juge « sans vente » qu’à partir de ce nombre de visiteurs. */
const VISITEURS_D_UN_CANAL_SANS_VENTE = 100;
/** Le trafic « monte sans que les acheteurs suivent » à partir de cette hausse des visiteurs. */
const HAUSSE_DU_TRAFIC = 0.5;
/** Combien de lignes au plus. */
const LIGNES = 5;

/** Où mène chaque ancre d’« À regarder », dans le pilotage rangé. */
const VUE_DE_L_ANCRE: Record<NonNullable<CarteARegarder["lien"]>["ancre"], { vue: Vue; ancre?: string }> = {
  tunnel: { vue: "tunnel", ancre: "tunnel" },
  couts: { vue: "couts", ancre: "couts" },
  sources: { vue: "acquisition", ancre: "sources" },
  sante: { vue: "sante" },
  "chiffre-d-affaires": { vue: "resume", ancre: "chiffre-d-affaires" },
  "chiffres-cles": { vue: "resume" },
};

/** Ce qui coince dans la santé, en quelques mots (« 10 paiements refusés », « 4 pannes du serveur »), ou rien. */
export function soucisDeSante(s: StatsAdmin): string[] {
  const x = s.pilotage.sante;
  return [
    x.echecs > 0 && pluriel(x.echecs, "tâche en échec", "tâches en échec"),
    x.bloquees > 0 && pluriel(x.bloquees, "tâche bloquée", "tâches bloquées"),
    x.paiementsEchoues > 0 && pluriel(x.paiementsEchoues, "paiement refusé", "paiements refusés"),
    x.pannes > 0 && pluriel(x.pannes, "panne du serveur", "pannes du serveur"),
  ].filter((t): t is string => Boolean(t));
}

/** « ×8,5 », « ×1,7 » : par combien un chiffre a été multiplié. */
const fois = (valeur: number, avant: number) => {
  const r = rapport(valeur, avant);
  return r === null ? null : `×${r.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`;
};

/** Les lignes d’« À décider », dans l’ordre où les lire : ce qui coince, ce qui est à savoir, puis ce qui marche. */
export function aDecider(s: StatsAdmin): Decision[] {
  const p = s.pilotage;
  const suivi = p.suiviDepuis !== null;
  const lignes: Decision[] = [];

  /* Le canal qui amène le plus de monde sans un seul acheteur */
  const meilleure = suivi ? meilleureSource(p.sources) : null;
  const [sansVente] = suivi
    ? p.sources.filter((x) => x.source !== null && x.acheteurs === 0 && x.visiteurs >= VISITEURS_D_UN_CANAL_SANS_VENTE).sort((a, b) => b.visiteurs - a.visiteurs)
    : [];
  if (sansVente?.source) {
    const partDuTrafic = rapport(sansVente.visiteurs, p.visiteurs.valeur);
    const importent = rapport(sansVente.importent, sansVente.visiteurs);
    const ailleurs = meilleure ? p.sources.find((x) => x.source === meilleure.source) : undefined;
    const importentAilleurs = ailleurs ? rapport(ailleurs.importent, ailleurs.visiteurs) : null;
    lignes.push({
      ton: "mal",
      titre: `${NOMS_DES_SOURCES[sansVente.source]}\u00a0: ${pluriel(sansVente.visiteurs, "visiteur")}, aucun acheteur`,
      texte: `${partDuTrafic === null ? "" : `${pourcent(partDuTrafic * 100, 0)} du trafic de la période. `}${nombre(sansVente.importent)} importent${
        importent === null ? "" : ` (${pourcent(importent * 100, 0)})`
      }${
        meilleure && importentAilleurs !== null ? `, contre ${pourcent(importentAilleurs * 100, 0)} pour ${NOMS_DES_SOURCES[meilleure.source]}` : ""
      }. Avant d’y remettre du temps ou du budget, change l’accroche ou la page où ce canal arrive.`,
      lien: { texte: "Voir l’acquisition", vue: "acquisition", ancre: "sources" },
    });
  }

  /* Le trafic monte, les acheteurs ne suivent pas : le taux d’achat baisse sans que le produit ait changé */
  const hausse = rapport(p.visiteurs.valeur - p.visiteurs.avant, p.visiteurs.avant);
  const taux = rapport(p.acheteurs.valeur, p.visiteurs.valeur);
  const tauxAvant = rapport(p.acheteurs.avant, p.visiteurs.avant);
  if (suivi && hausse !== null && hausse >= HAUSSE_DU_TRAFIC && taux !== null && tauxAvant !== null && taux < tauxAvant) {
    const acheteurs = fois(p.acheteurs.valeur, p.acheteurs.avant);
    lignes.push({
      ton: "neutre",
      titre: `Le trafic a fait ${fois(p.visiteurs.valeur, p.visiteurs.avant) ?? ""}${acheteurs ? `, les acheteurs ${acheteurs}` : ""}`,
      texte: `${pluriel(p.visiteurs.valeur, "visiteur")} (${nombre(p.visiteurs.avant)} avant), ${pluriel(p.acheteurs.valeur, "acheteur")} (${nombre(
        p.acheteurs.avant,
      )} avant)\u00a0: le taux d’achat passe de ${pourcent(tauxAvant * 100)} à ${pourcent(taux * 100)}. Ce n’est pas le paywall qui vend moins, c’est le monde en plus qui n’importe pas\u00a0: juge le taux canal par canal.`,
      lien: { texte: "Voir l’acquisition", vue: "acquisition", ancre: "sources" },
    });
  }

  /* Puis « À regarder », sans la santé (son bandeau la dit) */
  for (const c of aRegarder(s)) {
    if (c.lien?.ancre === "sante") continue;
    lignes.push({ ton: c.ton, titre: c.titre, texte: c.texte, lien: c.lien ? { texte: c.lien.texte, ...VUE_DE_L_ANCRE[c.lien.ancre] } : null });
  }

  const rang = { mal: 0, neutre: 1, bon: 2 } as const;
  return lignes.sort((a, b) => rang[a.ton] - rang[b.ton]).slice(0, LIGNES);
}
