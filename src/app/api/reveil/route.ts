import { prolongerSession } from "@/server/auth";
import { lireSession, poserSession } from "@/server/cookies";
import { reveillerLaBase } from "@/server/depot";
import { repondre, route } from "@/server/http";
import { journalErreur } from "@/server/journal";

/*
 * La durée du chat et du rapport (leurs routes et leurs pages vivent 800 s, DUREE_FONCTION_S) : Vercel regroupe dans une même fonction les
 * routes de même réglage, et c’est celle-là qu’il faut réveiller. Une page qui appelle le réveil vient d’être servie,
 * sa propre fonction est déjà chaude ; avec la durée par défaut, il ne réveillait que celle-là, pas le chat ni le rapport.
 */
export const maxDuration = 800;

/*
 * Le réveil : une requête minuscule qui démarre une instance et réveille la base (Neon s’endort après quelques minutes
 * sans requête, et la première qui suit attend environ une seconde). Le navigateur l’appelle sans attendre la réponse
 * (src/components/shell/Reveil.tsx), à chaque visite ; un service de ping peut l’appeler toutes les 4 minutes. Elle ne
 * dit rien d’autre que « ok ». Seul effet : une visite prolonge la session (un mois, une fois par jour au plus), et son
 * cookie avec elle.
 */
export const GET = route("GET /api/reveil", async () => {
  try {
    await reveillerLaBase();
    const secret = await lireSession();
    const fin = secret ? await prolongerSession(secret) : null;
    if (secret && fin) await poserSession(secret, fin);
    return repondre("GET /api/reveil", { ok: true });
  } catch (e) {
    /* La base qui ne répond pas : le navigateur n’en saura rien de plus (503), le journal en garde le nom et le code */
    journalErreur("réveil sans base", e);
    return repondre("GET /api/reveil", { ok: false }, 503);
  }
});
