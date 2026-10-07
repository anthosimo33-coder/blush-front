import "server-only";
import { cookies } from "next/headers";

/* Les deux cookies du back-end : la session, et le brouillon (une conv importée avant l’email). httpOnly : le navigateur ne les lit pas. */
const SESSION = "blush-session";
const BROUILLON = "blush-brouillon";
const options = (expires: Date) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires });

export const lireSession = async () => (await cookies()).get(SESSION)?.value;
export const lireBrouillon = async () => (await cookies()).get(BROUILLON)?.value;
export const poserSession = async (secret: string, expires: Date) => (await cookies()).set(SESSION, secret, options(expires));
export const poserBrouillon = async (secret: string) => (await cookies()).set(BROUILLON, secret, options(new Date(Date.now() + 86400e3)));
export const effacerSession = async () => (await cookies()).delete(SESSION);
export const effacerBrouillon = async () => (await cookies()).delete(BROUILLON);
