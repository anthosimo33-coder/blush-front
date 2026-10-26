import { randomUUID } from "node:crypto";
import type { Demande, FournisseurDeLots, IssueDuLot, MessageRecu } from "@/server/ia/claude";
import { fournisseurFactice, REFUS_FACTICE, type RequeteFactice } from "@/server/ia/factice";

/*
 * Un faux prestataire des lots (definirFournisseurDeLots, src/server/ia/claude.ts), pour les tests de la base : aucun
 * appel réel. Il garde chaque lot et ce qu’il a reçu ; un lot tourne jusqu’à ce que le test le dise fini (`finir`), avec
 * l’issue que le test choisit pour chaque requête, sinon la réponse du modèle factice (`sorties`) ; annulé, ses requêtes
 * sont annulées, sauf celles que le test dit finies quand même. Ses réponses coûtent (USAGE_DU_LOT) : le suivi des coûts
 * les note, comme celles du vrai. Ses pannes se posent par `pannes` (les prochains appels qui échouent), et un lot d’un
 * autre outil (une requête qui n’est pas à nous) par `etranger`.
 */

/** L’usage d’une réponse du faux : une mise à jour à froid, son système écrit dans le cache (environ 23 400 jetons). */
const USAGE_DU_LOT = { input_tokens: 2_000, output_tokens: 1_000, cache_creation_input_tokens: 23_400, cache_read_input_tokens: 0 };

/** Une réponse du modèle, telle qu’un lot la rend : la sortie en JSON, ou un refus (REFUS_FACTICE). */
export function reponseDuLot(sortie: unknown): MessageRecu {
  const base = { usage: USAGE_DU_LOT, model: "claude-opus-5-5" };
  if (typeof sortie === "string" && sortie.startsWith(REFUS_FACTICE))
    return { ...base, content: [], stop_reason: "refusal", stop_details: { category: sortie.slice(REFUS_FACTICE.length + 1) || null } };
  return { ...base, content: [{ type: "text", text: typeof sortie === "string" ? sortie : JSON.stringify(sortie) }], stop_reason: "end_turn" };
}

/**
 * Un lot gardé par le faux : ses requêtes (sans demande : celle d’un autre outil), s’il est fini, annulé, effacé, sa
 * création, les issues choisies par le test, s’il n’est pas à nous (`etranger`), et s’il finit sans aucune réponse (`vide`).
 */
type LotDuFaux = {
  requetes: { id: string; demande: Demande | null }[];
  fini: boolean;
  annule: boolean;
  efface: boolean;
  creeLe: Date;
  issues: Map<string, IssueDuLot>;
  etranger: boolean;
  vide: boolean;
};

/** Le faux, ses lots (dans l’ordre d’envoi), et ce qu’on lui a demandé (« envoyer », « etat », « annuler », « effacer »…). */
export function fauxLots(sorties: (req: RequeteFactice) => unknown = fournisseurFactice) {
  const lots = new Map<string, LotDuFaux>();
  const appels: string[] = [];
  /** Combien des prochains appels échouent : `etat`, `annuler`, `effacer`, et `envoyerApres` (le lot part, sa réponse se perd). */
  const pannes = { etat: 0, annuler: 0, effacer: 0, envoyerApres: 0 };
  const panne = (quoi: keyof typeof pannes) => {
    if (pannes[quoi] <= 0) return;
    pannes[quoi]--;
    throw new Error(`faux lots : panne (${quoi})`);
  };
  const lot = (id: string) => {
    const l = lots.get(id);
    if (!l) throw new Error(`faux lots : pas de lot ${id}`);
    return l;
  };
  const reponse = ({ requete, partie }: Demande): IssueDuLot => ({ type: "succeeded", message: reponseDuLot(sorties({ ...requete, ...(partie ? { partie } : {}) })) });
  const nouveau = (requetes: LotDuFaux["requetes"], autres: Partial<LotDuFaux> = {}) => {
    /* Unique d’un test à l’autre : le ménage se souvient des lots d’un autre outil qu’il a vus */
    const id = `lot_test_${randomUUID()}`;
    lots.set(id, { requetes, fini: false, annule: false, efface: false, creeLe: new Date(), issues: new Map(), etranger: false, vide: false, ...autres });
    return id;
  };
  const f: FournisseurDeLots = {
    async envoyer(requetes) {
      appels.push("envoyer");
      const id = nouveau(requetes);
      panne("envoyerApres");
      return id;
    },
    async etat(id) {
      appels.push("etat");
      panne("etat");
      const l = lots.get(id);
      return !l || l.efface ? "introuvable" : l.fini ? "fini" : "en_cours";
    },
    async resultats(id) {
      appels.push("resultats");
      const l = lot(id);
      if (l.vide) return [];
      return l.requetes.map(({ id: r, demande }) => {
        const issue: IssueDuLot = l.issues.get(r) ?? (l.annule || !demande ? { type: "canceled" } : reponse(demande));
        return { id: l.etranger ? null : r, issue };
      });
    },
    async annuler(id) {
      appels.push("annuler");
      panne("annuler");
      lot(id).annule = true;
    },
    async effacer(id) {
      appels.push("effacer");
      panne("effacer");
      lot(id).efface = true;
    },
    async recents(depuis) {
      appels.push("recents");
      return [...lots]
        .filter(([, l]) => !l.efface && l.creeLe >= depuis)
        .reverse()
        .map(([id, l]) => ({ id, fini: l.fini, requetes: l.requetes.length, creeLe: l.creeLe }));
    },
  };
  return {
    f,
    lots,
    appels,
    pannes,
    /** Le dernier lot envoyé : son identifiant, et sa seule requête. */
    dernier() {
      const [id, l] = [...lots].at(-1) ?? [];
      if (!id || !l) throw new Error("faux lots : rien d’envoyé");
      return { id, ...l, requete: l.requetes[0]! };
    },
    /** Le lot fini, chaque requête avec son issue (`issues`, par identifiant de tâche), sinon la réponse factice. */
    finir(id: string, issues: Record<string, IssueDuLot> = {}) {
      const l = lot(id);
      l.fini = true;
      for (const [r, issue] of Object.entries(issues)) l.issues.set(r, issue);
    },
    /** Un lot fini d’un autre outil (les évals des prompts, sur la même clé) : une requête, une réponse, rien de nous. */
    etranger(creeLe: Date) {
      return nouveau([{ id: "eval-1", demande: null }], {
        fini: true,
        creeLe,
        etranger: true,
        issues: new Map([["eval-1", { type: "succeeded", message: reponseDuLot({ ok: true }) }]]),
      });
    },
  };
}
