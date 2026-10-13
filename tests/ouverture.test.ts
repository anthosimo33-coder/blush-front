import { NextRequest, type NextResponse } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editeur } from "@/contenu/mentions-legales";

/*
 * Le verrou de l’ouverture vu des deux côtés, qui doivent toujours dire la même chose : le serveur (env(), dont
 * BLUSH_BETA_FERMEE décide qui entre : peutEntrer, la connexion, les captures sans compte) et le proxy (betaFermee,
 * src/server/drapeaux.ts, qui sert au parcours où mène la page d’accueil, /commencer, sa variante « fermee »). Une
 * configuration par cas, l’éditeur fictif ; les modules rechargés à chaque cas (env() garde ses variables). Sans base :
 * l’alerte à l’équipe est simulée.
 */

/** Ce que la production a toujours (Vercel, ses clés), avec la bêta écrite à `beta`. */
const production = (beta: "0" | "1") => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BLUSH_IA_FACTICE", "0");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
  vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
  vi.stubEnv("CRON_SECRET", "un-secret-fictif-assez-long");
  vi.stubEnv("BLUSH_ACCES_LIBRE", "invite@blush.test");
  vi.stubEnv("BLUSH_BETA_FERMEE", beta);
};
const WHOP = { WHOP_API_KEY: "cle_fictive", WHOP_WEBHOOK_SECRET: "ws_fictif", WHOP_ACCOUNT_ID: "biz_fictif", WHOP_PRODUCT_ID: "prod_fictif" };
const whop = (present: boolean) => {
  for (const [cle, valeur] of Object.entries(WHOP)) vi.stubEnv(cle, present ? valeur : undefined);
};
const captcha = (present: boolean) => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", present ? "0x4AAAAAAAsecret-fictif" : undefined);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", present ? "0x4AAAAAAAcle-publique-fictive" : undefined);
};

/** L’éditeur fictif du cas, posé par vues() sur le contenu rechargé (celui que lisent le serveur et le proxy). */
let editeurFictif: Partial<Editeur> | null = null;
/** Un éditeur fictif, le nom et l’email toujours là ; `siret` : son immatriculation, sans adresse. */
const editeur = (siret: boolean) => {
  editeurFictif = { nom: "Exemple", adresse: "", pays: "", immatriculation: siret ? "SIRET 000 000 000 00000" : "", email: "bonjour@exemple.test" };
};

/** Une requête du navigateur pour `chemin`, sans session. */
const requete = (chemin: string) => new NextRequest(`https://www.askblush.com${chemin}`, { headers: { host: "www.askblush.com" } });
/** Où le proxy envoie cette requête : sa variante, ou le chemin lui-même quand il la laisse passer. */
const servi = (r: Response, chemin: string) => (isRewrite(r as NextResponse) ? new URL(getRewrittenUrl(r as NextResponse)!).pathname : chemin);

/** Ce que voient, pour la configuration posée, le serveur et le proxy (les modules chargés à neuf). */
async function vues() {
  vi.resetModules();
  if (editeurFictif) Object.assign((await import("@/contenu/mentions-legales")).EDITEUR, editeurFictif);
  const { env, peutEntrer } = await import("@/server/env");
  const { betaFermee } = await import("@/server/drapeaux");
  const { proxy } = await import("@/proxy");
  return {
    serveur: env().BLUSH_BETA_FERMEE,
    entreSansInvitation: peutEntrer("inconnu@exemple.test"),
    proxy: betaFermee(),
    commencer: servi(proxy(requete("/commencer")), "/commencer"),
    captures: servi(proxy(requete("/importer/captures")), "/importer/captures"),
  };
}

beforeEach(() => {
  vi.doMock("@/server/alertes", () => ({ alerter: vi.fn(async () => {}) }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  editeurFictif = null;
  vi.doUnmock("@/server/alertes");
});

describe("le serveur et le proxy voient la même bêta", () => {
  const cas: { nom: string; poser: () => void; fermee: boolean }[] = [
    { nom: "production, tout est là, écrite ouverte", poser: () => (production("0"), whop(true), captcha(true), editeur(true)), fermee: false },
    { nom: "production, écrite fermée", poser: () => (production("1"), whop(true), captcha(true), editeur(true)), fermee: true },
    { nom: "production ouverte sans Whop", poser: () => (production("0"), whop(false), captcha(true), editeur(true)), fermee: true },
    { nom: "production ouverte sans le CAPTCHA", poser: () => (production("0"), whop(true), captcha(false), editeur(true)), fermee: true },
    { nom: "production ouverte, l’éditeur sans adresse ni immatriculation", poser: () => (production("0"), whop(true), captcha(true), editeur(false)), fermee: true },
    { nom: "production ouverte sans rien de ce qu’il faut", poser: () => (production("0"), whop(false), captcha(false), editeur(false)), fermee: true },
    {
      nom: "préversion ouverte, sans rien de ce qu’il faut",
      poser: () => (production("0"), vi.stubEnv("VERCEL_ENV", "preview"), whop(false), captcha(false), editeur(false)),
      fermee: false,
    },
    { nom: "hors de Vercel (le dev, les tests), ouverte", poser: () => (vi.stubEnv("BLUSH_BETA_FERMEE", "0"), editeur(false)), fermee: false },
    { nom: "hors de Vercel, fermée", poser: () => (vi.stubEnv("BLUSH_BETA_FERMEE", "1"), editeur(true)), fermee: true },
  ];

  it.each(cas)("$nom", async ({ poser, fermee }) => {
    poser();
    const v = await vues();
    expect(v).toEqual({
      serveur: fermee,
      entreSansInvitation: !fermee,
      proxy: fermee,
      commencer: fermee ? "/commencer/fermee" : "/commencer",
      captures: fermee ? "/importer/captures/fermee" : "/importer/captures",
    });
  });
});
