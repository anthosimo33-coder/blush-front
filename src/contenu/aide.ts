/*
 * L’aide à un toucher, partout où l’appli la donne, écrite une fois : les numéros d’urgence (les conditions, et le chat
 * quand il n’y a plus de bulles), et les lignes d’écoute du rapport doux (le mode sobre). Un numéro changé ici change
 * partout.
 * Aucune détection de la détresse ne tourne sur le serveur avant le modèle : c’est le modèle qui lève une alerte (le
 * mode sobre pour la détresse et l’âge ; une réponse du chat en alerte se paie comme les autres depuis le 21 octobre
 * 2026, mais verrouillée, elle montre les numéros d’urgence). Un message envoyé sans bulles quand une réponse verrouillée attend déjà
 * n’arrive pas jusqu’à lui (402 « bulles ») : cette réponse, et ce que l’écran en dit, portent donc toujours les
 * numéros d’urgence (AIDE_SANS_BULLES), quoi qu’il ait écrit.
 */

/** Les numéros d’urgence, et celui de la prévention du suicide, en une phrase. */
export const URGENCES = "Si tu te sens en danger, appelle le 17 ou le 112. Si tu vas mal, le 3114 répond jour et nuit, gratuitement.";

/** Les lignes d’écoute du rapport doux (le mode sobre), absentes des maquettes (validées). */
export const LIGNES_D_ECOUTE = [
  { name: "Fil Santé Jeunes", detail: "Anonyme et gratuit, tous les jours de 9 h à 23 h", tel: "0800235236", label: "0 800 235 236" },
  { name: "SOS Amitié", detail: "À l’écoute 24 h sur 24", tel: "0972394050", label: "09 72 39 40 50" },
] as const;

/**
 * Ce que porte toute réponse 402 « bulles » (src/server/http.ts) : les numéros d’urgence, puis les lignes d’écoute, une
 * ligne chacun. Le navigateur dit la première sous « plus de bulles » (src/lib/messages-erreur.ts).
 */
export const AIDE_SANS_BULLES: readonly string[] = [URGENCES, ...LIGNES_D_ECOUTE.map((l) => `${l.name}\u00a0: ${l.label} (${l.detail})`)];
