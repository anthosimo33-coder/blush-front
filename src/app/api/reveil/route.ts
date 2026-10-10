import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { json } from "@/server/http";
import { BACKEND } from "@/services/mode";

/*
 * Le réveil : une requête minuscule qui démarre une instance et réveille la base (Neon s’endort après quelques minutes
 * sans requête, et la première qui suit attend environ une seconde). Le navigateur l’appelle sans attendre la réponse
 * (src/components/shell/Reveil.tsx), un service de ping peut l’appeler toutes les 4 minutes. Un GET sans effet : rien
 * n’est lu ni écrit, et elle ne dit rien d’autre que « ok ».
 */
export async function GET() {
  if (!BACKEND) return json({ ok: true });
  try {
    await db().execute(sql`select 1`);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
