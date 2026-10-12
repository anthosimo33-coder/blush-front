import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La configuration (src/server/env.ts) : les listes d’emails lues une fois par le schéma, l’adresse du site et
 * l’expéditeur par défaut, et les garde-fous de la production (audit S-23) : une variable oubliée lors d’un ménage
 * refuse le service au lieu d’ouvrir la bêta, de tout offrir à tous ou d’arrêter la purge sans bruit. env() garde ses
 * variables au premier appel : chaque cas recharge le module après avoir posé les siennes. Sans base.
 */
const charger = async () => {
  vi.resetModules();
  return import("@/server/env");
};

/* Ce que la production a toujours (Vercel, ses clés), pour ne tester que ce qui manque ou ce qui est refusé */
const production = () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BLUSH_IA_FACTICE", "0");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
  vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
  vi.stubEnv("BLUSH_BETA_FERMEE", "1");
  vi.stubEnv("CRON_SECRET", "un-secret-fictif-assez-long");
  vi.stubEnv("BLUSH_ACCES_LIBRE", "invite@blush.test");
};

/** Les quatre variables de Whop : toutes, ou aucune. */
const WHOP = ["WHOP_API_KEY", "WHOP_WEBHOOK_SECRET", "WHOP_ACCOUNT_ID", "WHOP_PRODUCT_ID"] as const;
/** Whop configuré, avec des valeurs fictives (sauf celles de `sauf`). */
const whop = (...sauf: (typeof WHOP)[number][]) => {
  const valeurs = { WHOP_API_KEY: "cle_fictive", WHOP_WEBHOOK_SECRET: "ws_fictif", WHOP_ACCOUNT_ID: "biz_fictif", WHOP_PRODUCT_ID: "prod_fictif" };
  for (const v of WHOP) vi.stubEnv(v, sauf.includes(v) ? undefined : valeurs[v]);
};

beforeEach(() => {
  for (const v of [
    "VERCEL",
    "VERCEL_ENV",
    "BLUSH_URL",
    "BLUSH_EMAIL_FROM",
    "BLUSH_ACCES_LIBRE",
    "BLUSH_ADMINS",
    "BLUSH_BETA_FERMEE",
    "CRON_SECRET",
    "BLUSH_BOITE_MAILS",
    "BLUSH_PAIEMENT_FACTICE",
    ...WHOP,
    "WHOP_BAC_A_SABLE",
  ])
    vi.stubEnv(v, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("les listes d’emails, lues une fois par le schéma", () => {
  it("BLUSH_ACCES_LIBRE : sans espaces, en minuscules, sans case vide ; un email s’y compare sans la casse", async () => {
    vi.stubEnv("BLUSH_ACCES_LIBRE", " Lea@Exemple.fr , tom@exemple.fr,, ");
    const { env, accesLibre, peutEntrer } = await charger();
    expect(env().BLUSH_ACCES_LIBRE).toEqual(["lea@exemple.fr", "tom@exemple.fr"]);
    expect(accesLibre("LEA@exemple.fr")).toBe(true);
    expect(accesLibre("noe@exemple.fr")).toBe(false);
    /* Bêta ouverte par défaut, hors production : tout le monde entre */
    expect(peutEntrer("noe@exemple.fr")).toBe(true);
  });

  it("BLUSH_ACCES_LIBRE=* (en dev) : tout le monde est de l’équipe, et en bêta fermée tout le monde entre", async () => {
    vi.stubEnv("BLUSH_ACCES_LIBRE", " * ");
    vi.stubEnv("BLUSH_BETA_FERMEE", "1");
    const { env, accesLibre, peutEntrer } = await charger();
    expect(env().BLUSH_ACCES_LIBRE).toBe("*");
    expect(accesLibre("qui@exemple.fr")).toBe(true);
    expect(peutEntrer("qui@exemple.fr")).toBe(true);
  });

  it("sans BLUSH_ACCES_LIBRE : personne, et en bêta fermée personne n’entre", async () => {
    vi.stubEnv("BLUSH_BETA_FERMEE", "1");
    const { env, accesLibre, peutEntrer } = await charger();
    expect(env().BLUSH_ACCES_LIBRE).toEqual([]);
    expect(accesLibre("qui@exemple.fr")).toBe(false);
    expect(peutEntrer("qui@exemple.fr")).toBe(false);
  });

  it("BLUSH_ADMINS ouvre /admin ; sans elle, ce sont les emails de BLUSH_ALERTES ; vide, personne", async () => {
    vi.stubEnv("BLUSH_ALERTES", "Equipe@Blush.test, nuit@blush.test");
    let m = await charger();
    expect(m.env().BLUSH_ALERTES).toEqual(["equipe@blush.test", "nuit@blush.test"]);
    expect(m.estAdmin("EQUIPE@blush.test")).toBe(true);

    vi.stubEnv("BLUSH_ADMINS", "patron@blush.test");
    m = await charger();
    expect(m.estAdmin("patron@blush.test")).toBe(true);
    expect(m.estAdmin("equipe@blush.test")).toBe(false);

    vi.stubEnv("BLUSH_ADMINS", "");
    m = await charger();
    expect(m.estAdmin("equipe@blush.test")).toBe(false);
  });

  it("sans BLUSH_ALERTES : une liste vide (aucune alerte ne part)", async () => {
    vi.stubEnv("BLUSH_ALERTES", undefined);
    const { env } = await charger();
    expect(env().BLUSH_ALERTES).toEqual([]);
  });
});

describe("les défauts écrits une fois", () => {
  it("l’expéditeur des mails, sur le domaine vérifié", async () => {
    const { env } = await charger();
    expect(env().BLUSH_EMAIL_FROM).toBe("BLUSH <bonjour@askblush.com>");
  });

  it("URL_SITE : BLUSH_URL, ou l’adresse du site en ligne (même mal formée : env() le dit)", async () => {
    expect((await charger()).URL_SITE).toBe("https://www.askblush.com");
    vi.stubEnv("BLUSH_URL", "https://essai.blush.test");
    expect((await charger()).URL_SITE).toBe("https://essai.blush.test");
    vi.stubEnv("BLUSH_URL", "pas une adresse");
    const { URL_SITE, env } = await charger();
    expect(URL_SITE).toBe("https://www.askblush.com");
    expect(() => env()).toThrow("BLUSH_URL");
  });
});

describe("les garde-fous de la production", () => {
  it("la configuration de la production passe", async () => {
    production();
    const { env } = await charger();
    expect(env().BLUSH_BETA_FERMEE).toBe(true);
  });

  it("BLUSH_BETA_FERMEE doit y être écrite : son défaut ouvrirait la bêta", async () => {
    production();
    vi.stubEnv("BLUSH_BETA_FERMEE", undefined);
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/Configuration refusée en production : BLUSH_BETA_FERMEE manque/);
    /* Écrite exprès à 0, la bêta ouverte est un choix */
    vi.stubEnv("BLUSH_BETA_FERMEE", "0");
    expect((await charger()).env().BLUSH_BETA_FERMEE).toBe(false);
  });

  it("CRON_SECRET est exigé : sans lui, la purge de nuit ne tournerait jamais", async () => {
    production();
    vi.stubEnv("CRON_SECRET", undefined);
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/CRON_SECRET manque/);
  });

  it("BLUSH_ACCES_LIBRE=* est refusée : tout offert à tout le monde", async () => {
    production();
    vi.stubEnv("BLUSH_ACCES_LIBRE", "*");
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/BLUSH_ACCES_LIBRE=\* est refusée/);
  });

  it("tous les refus d’un coup, dans un seul message", async () => {
    production();
    vi.stubEnv("BLUSH_BETA_FERMEE", undefined);
    vi.stubEnv("CRON_SECRET", undefined);
    vi.stubEnv("BLUSH_ACCES_LIBRE", "*");
    const message = await charger()
      .then(({ env }) => env())
      .then(
        () => "",
        (e: Error) => e.message,
      );
    for (const variable of ["BLUSH_BETA_FERMEE", "CRON_SECRET", "BLUSH_ACCES_LIBRE"]) expect(message).toContain(variable);
  });

  it("une préversion, le dev et les tests n’ont pas ces exigences", async () => {
    production();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("BLUSH_BETA_FERMEE", undefined);
    vi.stubEnv("CRON_SECRET", undefined);
    vi.stubEnv("BLUSH_ACCES_LIBRE", "*");
    const { env } = await charger();
    expect(env().BLUSH_BETA_FERMEE).toBe(false);
    expect(env().BLUSH_ACCES_LIBRE).toBe("*");
  });

  it("le modèle factice qui traîne sur Vercel : ignoré, et dit dans les logs", async () => {
    production();
    vi.stubEnv("BLUSH_IA_FACTICE", "1");
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { env } = await charger();
    expect(env().BLUSH_IA_FACTICE).toBe(false);
    expect(avertir).toHaveBeenCalledWith(expect.stringContaining(`"variable":"BLUSH_IA_FACTICE"`));
  });

  it("Whop à moitié configuré : refusé (les quatre variables, ou aucune) ; le bac à sable aussi", async () => {
    production();
    whop("WHOP_WEBHOOK_SECRET", "WHOP_PRODUCT_ID");
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/Whop à moitié configuré : WHOP_WEBHOOK_SECRET, WHOP_PRODUCT_ID manque/);
    whop();
    expect((await charger()).paiementWhop()).toEqual({ cle: "cle_fictive", secret: "ws_fictif", compte: "biz_fictif", produit: "prod_fictif", bacASable: false });
    vi.stubEnv("WHOP_BAC_A_SABLE", "1");
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/WHOP_BAC_A_SABLE=1 est refusée/);
    /* Sans aucune : le paiement n’est pas branché (« bientot »), la production tourne */
    vi.stubEnv("WHOP_BAC_A_SABLE", undefined);
    whop(...WHOP);
    expect((await charger()).paiementWhop()).toBeNull();
  });

  it("le faux Whop sur Vercel : refusé, en ligne comme en préversion", async () => {
    production();
    vi.stubEnv("BLUSH_PAIEMENT_FACTICE", "1");
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/BLUSH_PAIEMENT_FACTICE est refusée sur Vercel/);
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/BLUSH_PAIEMENT_FACTICE est refusée sur Vercel/);
  });

  it("hors de la production : Whop à moitié configuré compte pour rien, le faux Whop s’allume ; les identifiants de Whop sont vérifiés", async () => {
    whop("WHOP_API_KEY");
    let m = await charger();
    expect([m.paiementWhop(), m.paiementFactice()]).toEqual([null, false]);
    vi.stubEnv("BLUSH_PAIEMENT_FACTICE", "1");
    expect((await charger()).paiementFactice()).toBe(true);
    whop();
    vi.stubEnv("WHOP_ACCOUNT_ID", "pas_un_compte");
    m = await charger();
    expect(() => m.env()).toThrow("WHOP_ACCOUNT_ID");
  });
});
