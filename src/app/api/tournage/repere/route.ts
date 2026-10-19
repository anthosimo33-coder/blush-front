import { repondre, route } from "@/server/http";
import { repereDuTournage } from "@/server/tournage";

/**
 * Le repère du mode tournage sur les écrans de l’import (src/components/shell/RepereTournage.tsx) : le nom du lien de
 * tournage de ce navigateur, pour un compte de BLUSH_ADMINS seulement (repereDuTournage). Tous les autres reçoivent la
 * même réponse, `{ nom: null }` : rien ne dit à une créatrice que son navigateur est en mode tournage.
 */
export const GET = route("GET /api/tournage/repere", async () => repondre("GET /api/tournage/repere", { nom: await repereDuTournage() }));
