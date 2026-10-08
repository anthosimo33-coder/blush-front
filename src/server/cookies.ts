import "server-only";
import { cookies } from "next/headers";
import { STORY_COOKIE } from "@/services/session";

/* Les deux cookies du back-end : la session, et le brouillon (une conv importée avant l’email). httpOnly : le navigateur ne les lit pas. */
const SESSION = "blush-session";
const BROUILLON = "blush-brouillon";
const options = (expires: Date) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires });

export const lireSession = async () => (await cookies()).get(SESSION)?.value;
/** Une session dans la requête, sans la vérifier (ce qui ne fait qu’adapter l’affichage). */
export const aUneSession = async () => (await cookies()).has(SESSION);
export const lireBrouillon = async () => (await cookies()).get(BROUILLON)?.value;
export const poserSession = async (secret: string, expires: Date) => (await cookies()).set(SESSION, secret, options(expires));
export const poserBrouillon = async (secret: string) => (await cookies()).set(BROUILLON, secret, options(new Date(Date.now() + 86400e3)));
export const effacerSession = async () => (await cookies()).delete(SESSION);
export const effacerBrouillon = async () => (await cookies()).delete(BROUILLON);

/*
 * La conv choisie dans « Tes convs » : son identifiant, rien d’autre. Pas httpOnly : un toucher dans la liste l’écrit
 * (src/services/api.ts, openConv), et le serveur vérifie qu’elle est bien au compte (histoireOuverte).
 */
export const lireChoisie = async () => (await cookies()).get(STORY_COOKIE)?.value;
export const poserChoisie = async (id: string) =>
  (await cookies()).set(STORY_COOKIE, id, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
export const effacerChoisie = async () => (await cookies()).delete(STORY_COOKIE);
