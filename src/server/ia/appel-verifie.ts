import "server-only";
import type { z } from "zod";
import type { Requete } from "@prompts/lib/contextes";
import { introuvables } from "@prompts/lib/preuves";
import { tempsRestant } from "../echeance";
import { ErreurTache } from "../erreurs";
import { appeler, type Appel, type Avance, type OptionsAppel } from "./claude";

/*
 * Ce que les étapes attendent d’un appel au modèle (src/server/ia/claude.ts) : une sortie, ou une erreur qui dit
 * pourquoi il n’y en a pas. Un refus du modèle (malgré le repli sur un autre) n’est jamais pris pour une sortie vide :
 * son code d’erreur porte sa catégorie (« refus:cyber »), et le navigateur apprend le refus (codePublic).
 */

/** L’erreur d’un refus du modèle : sa catégorie va dans le code (et dans l’alerte), quand il la donne. */
const erreurDeRefus = (a: Appel<unknown>) => new ErreurTache(a.categorie ? `refus:${a.categorie}` : "refus");

/**
 * La sortie d’un appel fait une fois (la lecture de captures) : un refus du modèle lève son ErreurTache, une sortie
 * illisible lève l’erreur que fait `sinon` (celle que la route sait dire : « fichier », « capture »).
 */
export function exigerSortie<T>(a: Appel<T>, sinon: () => Error): T {
  if (a.refus) throw erreurDeRefus(a);
  if (a.sortie === null) throw sinon();
  return a.sortie;
}

/** Le temps qu’il faut encore pour rejouer un appel dont la sortie ne convient pas (des preuves introuvables, ou incomplète). */
export const TEMPS_RELANCE = 90_000;

/**
 * Le suivi de ce qui s’écrit : le même pour tous les essais (`surAvance`, OptionsAppel), ou un neuf à chaque essai
 * (`parEssai`), jamais les deux.
 */
type Suivi =
  | { surAvance?: OptionsAppel["surAvance"]; parEssai?: never }
  | {
      surAvance?: never;
      /**
       * Le suivi de chaque essai, neuf à chaque fois (le chat : ses bulles montrées pendant qu’il écrit). `rejouable()`,
       * demandé après l’essai : faux, il n’y en aura pas d’autre (une bulle déjà montrée, qu’un nouvel essai réécrirait
       * autrement) ; sa sortie est rendue telle quelle, et sans sortie, l’appel échoue.
       */
      parEssai: () => { surAvance: (a: Avance) => void; rejouable: () => boolean };
    };

/** Les options d’appelVerifie : celles d’appeler (OptionsAppel), le suivi (Suivi), et de quoi vérifier la sortie. */
export type OptionsVerifie<T> = Pick<OptionsAppel, "partie" | "signal" | "differer"> &
  Suivi & {
    /** Les identifiants que la sortie cite en preuve : chacun doit exister dans `lignes`. */
    preuves: (s: T) => string[];
    /** Les messages qu’elle peut citer, par identifiant. */
    lignes: Map<string, string>;
    /** La conv de l’appel : le suivi des coûts, et le budget du jour de son compte. */
    storyId: string;
    /** Le nom de l’appel dans le suivi des coûts (ai_usage.task). */
    etiquette: string;
    /** Ce que l’étape attend de la sortie (des chapitres, la partie sobre) : sans, on la rejoue une fois. */
    complet?: (s: T) => boolean;
  };

/**
 * Un appel dont chaque preuve doit exister. Une sortie illisible, une preuve introuvable, ou une sortie incomplète
 * (`complet`) : on rejoue une fois, si le temps le permet (TEMPS_RELANCE ; une sortie illisible, toujours). Au second
 * essai (ou quand l’essai ne se rejoue pas : `parEssai`), les preuves introuvables sont simplement ignorées à
 * l’affichage, et une sortie incomplète est rendue telle quelle. Un refus lève son erreur tout de suite (erreurDeRefus).
 */
export async function appelVerifie<S extends z.ZodType>(req: Requete, format: S, o: OptionsVerifie<z.infer<S>>): Promise<z.infer<S>> {
  for (let essai = 0; essai < 2; essai++) {
    const suivi = o.parEssai?.();
    const a = await appeler(req, format, {
      storyId: o.storyId,
      etiquette: o.etiquette,
      ...(o.partie ? { partie: o.partie } : {}),
      ...(suivi ? { surAvance: suivi.surAvance } : o.surAvance ? { surAvance: o.surAvance } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
      ...(o.differer ? { differer: o.differer } : {}),
    });
    if (a.refus) throw erreurDeRefus(a);
    const dernier = essai === 1 || (suivi ? !suivi.rejouable() : false);
    if (!a.sortie) {
      if (dernier) break;
      continue;
    }
    /* Rejouer cet appel seul (pas toute l’étape) : seulement s’il en reste un, et le temps de le faire */
    const rejouer = !dernier && tempsRestant() >= TEMPS_RELANCE;
    /* Il manque ce que l’étape attend : on rejoue */
    if (o.complet && !o.complet(a.sortie) && rejouer) continue;
    /* Des preuves introuvables : on rejoue (sinon, elles sont ignorées à l’affichage) */
    if (!introuvables(o.preuves(a.sortie), o.lignes).length || !rejouer) return a.sortie;
  }
  throw new ErreurTache("sortie_illisible");
}
