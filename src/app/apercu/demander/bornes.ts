/*
 * Ce que le vrai chat de l’aperçu et l’accueil de l’aperçu partagent, écrit une fois : ses bornes, que la route impose
 * (./route.ts, qui ne peut exporter que ses handlers) et que l’accueil tient avant d’envoyer (../accueil/ApercuAccueil.tsx),
 * et sa réponse quand le chat n’a pas répondu. Pur : importé des deux côtés.
 */
import type { BlushAnswer } from "@/types";

/** Une question, et chaque message du fil, au plus : la limite d’un message du vrai chat (LONGUEUR_MAX, src/app/api/chat/route.ts). */
export const TEXTE_MAX = 4000;

/** Le fil déjà échangé qui part avec la question, au plus : ses derniers messages. */
export const FIL_MAX = 6;

/** Ce que BLUSH dit quand le chat local n’a pas répondu (le lanceur a échoué, la demande a été refusée, le réseau a coupé). */
export const PAS_DE_REPONSE: BlushAnswer = { kind: "bubbles", bubbles: [{ text: "j’ai pas réussi à te répondre, réessaie" }] };
