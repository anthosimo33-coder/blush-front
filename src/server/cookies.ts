import "server-only";
import { cookies } from "next/headers";
import { serveurDeTest } from "./env";
import { jeton } from "./chiffrement";
import { CODE_MINUTES } from "@/lib/limites";
import { nomDuCookie, type CookieDuServeur } from "@/lib/noms-cookies";
import { STORY_COOKIE } from "@/services/session";

/*
 * Les cookies du back-end : la session, le brouillon (une conv importée avant l’email) et le navigateur qui a demandé un
 * code de connexion. httpOnly : le navigateur ne les lit pas. Leurs noms : src/lib/noms-cookies.ts (__Host- en https).
 * Secure en production (Vercel compris), sauf sur le serveur des tests de bout en bout, qui sert http://localhost : le
 * WebKit de Linux (celui de la CI) y refuse un cookie Secure, et la session ne tiendrait pas.
 */
export const cookieSecurise = () => process.env.NODE_ENV === "production" && !serveurDeTest();
const nom = (cookie: CookieDuServeur) => nomDuCookie(cookie, cookieSecurise());
const attributs = () => ({ httpOnly: true, secure: cookieSecurise(), sameSite: "lax" as const, path: "/" });
/*
 * En https, le cookie sous son ancien nom, sans préfixe, posé avant le préfixe __Host- (la session, pour 90 jours) :
 * plus lu, mais src/proxy.ts et next.config.ts le prennent encore pour une session. Effacé à la pose comme à
 * l’effacement du nouveau, s’il est là : une fois suffit, le navigateur ne le renvoie plus.
 */
const oublierLAncien = async (cookie: CookieDuServeur) => {
  const pot = await cookies();
  const ancien = nomDuCookie(cookie, false);
  if (cookieSecurise() && pot.has(ancien)) pot.delete({ name: ancien, ...attributs() });
};
const poser = async (cookie: CookieDuServeur, valeur: string, expires: Date) => {
  await oublierLAncien(cookie);
  (await cookies()).set(nom(cookie), valeur, { ...attributs(), expires });
};
/* Avec les attributs de la pose : un navigateur ne prend l’effacement d’un cookie __Host- que Secure, sur path / */
const effacer = async (cookie: CookieDuServeur) => {
  await oublierLAncien(cookie);
  (await cookies()).delete({ name: nom(cookie), ...attributs() });
};

export const lireSession = async () => (await cookies()).get(nom("session"))?.value;
export const lireBrouillon = async () => (await cookies()).get(nom("brouillon"))?.value;
export const poserSession = (secret: string, expires: Date) => poser("session", secret, expires);
export const poserBrouillon = (secret: string) => poser("brouillon", secret, new Date(Date.now() + 86400e3));
export const effacerSession = () => effacer("session");
export const effacerBrouillon = () => effacer("brouillon");

/*
 * Le navigateur qui demande un code de connexion : un jeton à lui, gardé le temps d’un code. Un code ne vaut que dans le
 * navigateur qui l’a demandé (src/server/auth.ts) : celui qui en redemande pour l’email d’un autre ne remplace pas le
 * sien, et ne peut rien faire du code qu’il reçoit.
 */
/** Le jeton du navigateur, posé par sa dernière demande de code (un jeton de chiffrement.ts, rien d’autre). */
export async function lireNavigateur(): Promise<string | undefined> {
  const valeur = (await cookies()).get(nom("code"))?.value;
  return valeur && /^[\w-]{43}$/.test(valeur) ? valeur : undefined;
}
/*
 * Deux premières demandes en même temps d’un navigateur sans ce cookie (deux onglets, un double toucher) font deux
 * jetons, et seul le dernier cookie reste : l’un des deux codes reçus ne marche pas. Rare, et accepté : le suivant marche.
 */
/** Le jeton de ce navigateur, repris ou neuf, reposé pour la durée d’un code : à chaque demande, tout le monde reçoit le même cookie. */
export async function poserNavigateur(): Promise<string> {
  const navigateur = (await lireNavigateur()) ?? jeton();
  await poser("code", navigateur, new Date(Date.now() + CODE_MINUTES * 60e3));
  return navigateur;
}
export const effacerNavigateur = () => effacer("code");

/** Le laissez-passer du CAPTCHA (src/server/captcha.ts) : signé, il ne dit rien de personne. */
export const lireHumain = async () => (await cookies()).get(nom("humain"))?.value;
export const poserHumain = (valeur: string, expires: Date) => poser("humain", valeur, expires);

/*
 * La conv choisie dans « Tes convs » : son identifiant, rien d’autre. Pas httpOnly : un toucher dans la liste l’écrit
 * (src/services/api.ts, openConv), et le serveur vérifie qu’elle est bien au compte (histoireOuverte).
 */
export const lireChoisie = async () => (await cookies()).get(STORY_COOKIE)?.value;
export const poserChoisie = async (id: string) =>
  (await cookies()).set(STORY_COOKIE, id, { httpOnly: false, secure: cookieSecurise(), sameSite: "lax", path: "/", maxAge: 365 * 86400 });
export const effacerChoisie = async () => (await cookies()).delete(STORY_COOKIE);

/**
 * Ce que cet appareil oublie quand on s’en va (se déconnecter, « Tout effacer ») : la session, le brouillon d’un import
 * laissé en plan, la conv choisie et le navigateur d’un code demandé. Ce que le navigateur garde lui-même, la réponse le
 * lui fait oublier (OUBLIER_LE_NAVIGATEUR, src/server/http.ts).
 */
export async function oublierCetAppareil(): Promise<void> {
  await effacerSession();
  await effacerBrouillon();
  await effacerChoisie();
  await effacerNavigateur();
}
