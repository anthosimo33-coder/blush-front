import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Editeur } from "@/contenu/mentions-legales";
import { CLES_DE_TEST_TURNSTILE } from "@/lib/captcha";

/*
 * La configuration (src/server/env.ts) : les listes d’emails lues une fois par le schéma, l’adresse du site et
 * l’expéditeur par défaut, et les garde-fous de la production (audit S-23) : une variable oubliée lors d’un ménage
 * refuse le service au lieu d’ouvrir la bêta, de tout offrir à tous ou d’arrêter la purge sans bruit ; ce qui manque à
 * l’ouverture au public (le paiement, le CAPTCHA, l’identité de l’éditeur) garde la bêta fermée, sans panne, et prévient
 * l’équipe. env() garde ses variables au premier appel : chaque cas recharge le module après avoir posé les siennes. Sans
 * base : l’alerte par mail est simulée (alertes.ts).
 */
/** L’éditeur fictif du cas (editeur(), plus bas), ou null : celui de src/contenu/mentions-legales.ts. */
let editeurFictif: Partial<Editeur> | null = null;

const charger = async () => {
  vi.resetModules();
  /* L’éditeur fictif du cas, posé sur l’instance neuve du contenu : celle qu’env() va lire (plus sûr qu’un mock refait) */
  if (editeurFictif) Object.assign((await import("@/contenu/mentions-legales")).EDITEUR, editeurFictif);
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

/* Les clés du CAPTCHA de la production (fictives : pas celles de test, qu’elle refuse) */
const captcha = () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAAsecret-fictif");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAAcle-publique-fictive");
};

/**
 * L’identité de l’éditeur, le temps d’un cas, fictive (jamais celle de src/contenu/mentions-legales.ts) : `complete`, le
 * nom, un SIRET et l’email, sans adresse (ce qui suffit pour ouvrir) ; sinon le nom et l’email seuls (il manque
 * l’adresse ou l’immatriculation). Posée par charger() sur le module rechargé, retirée après chaque cas.
 */
const editeur = (complete = true) => {
  editeurFictif = { nom: "Exemple", adresse: "", pays: "", immatriculation: complete ? "SIRET 000 000 000 00000" : "", email: "bonjour@exemple.test" };
};

/** L’alerte par mail à l’équipe (src/server/alertes.ts), simulée : env() la charge à la demande. Neuve à chaque cas. */
type Alerter = (sujet: string, lignes: string[], options?: { importante?: boolean }) => Promise<void>;
let alerter: Mock<Alerter>;

/** Tout ce que l’ouverture au public exige, en production : Whop, le CAPTCHA, l’éditeur, et la bêta écrite à 0. */
const ouverte = () => {
  production();
  vi.stubEnv("BLUSH_BETA_FERMEE", "0");
  whop();
  captcha();
  editeur();
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
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "BLUSH_MAILS_PAR_JOUR",
  ])
    vi.stubEnv(v, undefined);
  alerter = vi.fn<Alerter>(async () => {});
  vi.doMock("@/server/alertes", () => ({ alerter }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  editeurFictif = null;
  vi.doUnmock("@/server/alertes");
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

describe("le CAPTCHA et le quota des mails", () => {
  it("les deux clés du CAPTCHA vont ensemble, partout : l’une sans l’autre, env() refuse", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", CLES_DE_TEST_TURNSTILE.secretes[0]);
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/NEXT_PUBLIC_TURNSTILE_SITE_KEY manque/);
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", CLES_DE_TEST_TURNSTILE.publiques[0]);
    await expect(charger().then(({ env }) => env())).rejects.toThrow(/TURNSTILE_SECRET_KEY manque/);
    /* Ensemble : les clés de test passent hors de la production (le dev, les tests de bout en bout) */
    vi.stubEnv("TURNSTILE_SECRET_KEY", CLES_DE_TEST_TURNSTILE.secretes[0]);
    expect((await charger()).env().TURNSTILE_SECRET_KEY).toBe(CLES_DE_TEST_TURNSTILE.secretes[0]);
  });

  it("BLUSH_MAILS_PAR_JOUR : 100 par défaut, un entier de 100 au moins", async () => {
    expect((await charger()).env().BLUSH_MAILS_PAR_JOUR).toBe(100);
    vi.stubEnv("BLUSH_MAILS_PAR_JOUR", "3000");
    expect((await charger()).env().BLUSH_MAILS_PAR_JOUR).toBe(3000);
    for (const mauvais of ["50", "120.5", "beaucoup"]) {
      vi.stubEnv("BLUSH_MAILS_PAR_JOUR", mauvais);
      await expect(
        charger().then(({ env }) => env()),
        mauvais,
      ).rejects.toThrow("BLUSH_MAILS_PAR_JOUR");
    }
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
    /* Écrite exprès à 0, la bêta ouverte est un choix (avec Whop, le CAPTCHA et l’éditeur : plus bas) */
    ouverte();
    expect((await charger()).env().BLUSH_BETA_FERMEE).toBe(false);
  });

  describe("le verrou de l’ouverture : sans le paiement, le CAPTCHA ou l’identité de l’éditeur, la bêta reste fermée, sans panne", () => {
    /** Les lignes du journal sur la bêta gardée fermée (console.warn : le niveau alerte). */
    let journal: () => string[];
    beforeEach(() => {
      const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
      journal = () => avertir.mock.calls.map(([ligne]) => String(ligne)).filter((l) => l.includes("bêta ouverte demandée mais gardée fermée"));
    });

    /**
     * env() d’une instance neuve, lue deux fois (la seconde ne refait rien) : la bêta est-elle fermée, et que disent le
     * journal et l’alerte de l’instance ? Jamais une erreur. L’alerte part après coup : on attend son import.
     */
    const lire = async () => {
      const avant = { journal: journal().length, alertes: alerter.mock.calls.length };
      const { env, peutEntrer } = await charger();
      const fermee = env().BLUSH_BETA_FERMEE;
      expect(env().BLUSH_BETA_FERMEE).toBe(fermee);
      expect(peutEntrer("inconnu@exemple.test")).toBe(!fermee);
      await vi.dynamicImportSettled();
      await new Promise((fin) => setTimeout(fin, 0));
      return { fermee, journal: journal().slice(avant.journal), alertes: alerter.mock.calls.slice(avant.alertes) };
    };
    const sansWhop = () => whop(...WHOP);
    const sansCaptcha = () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", undefined);
    };

    it("tout est là : elle s’ouvre, sans rien dire", async () => {
      ouverte();
      expect(await lire()).toEqual({ fermee: false, journal: [], alertes: [] });
    });

    it("chaque manque, seul : fermée, une ligne au journal et une alerte importante qui le nomment", async () => {
      const cas: [string, () => void, string][] = [
        ["sans Whop", sansWhop, "le paiement (Whop, aucune de ses variables WHOP_API_KEY, WHOP_WEBHOOK_SECRET, WHOP_ACCOUNT_ID, WHOP_PRODUCT_ID)"],
        ["sans le CAPTCHA", sansCaptcha, "le CAPTCHA (TURNSTILE_SECRET_KEY)"],
        ["l’éditeur sans adresse ni immatriculation", () => editeur(false), "l’identité de l’éditeur (src/contenu/mentions-legales.ts, il manque adresse ou immatriculation)"],
      ];
      for (const [nom, manquer, manque] of cas) {
        ouverte();
        manquer();
        const lu = await lire();
        expect(lu.fermee, nom).toBe(true);
        expect(lu.journal, nom).toHaveLength(1);
        expect(JSON.parse(lu.journal[0]!), nom).toMatchObject({ niveau: "alerte", manque1: manque });
        expect(lu.alertes, nom).toHaveLength(1);
        const [sujet, lignes, options] = lu.alertes[0]!;
        expect([sujet, options], nom).toEqual(["bêta restée fermée", { importante: true }]);
        expect(lignes, nom).toContain(`- ${manque}`);
        editeurFictif = null;
      }
    });

    it("les trois d’un coup : une seule alerte par instance, qui les dit tous ; une autre instance prévient à son tour", async () => {
      ouverte();
      sansWhop();
      sansCaptcha();
      editeur(false);
      const lu = await lire();
      expect(lu.fermee).toBe(true);
      expect(Object.keys(JSON.parse(lu.journal[0]!))).toEqual(expect.arrayContaining(["manque1", "manque2", "manque3"]));
      expect(lu.alertes).toHaveLength(1);
      expect(lu.alertes[0]![1].filter((l) => l.startsWith("- "))).toHaveLength(3);
      /* Une autre instance (le module rechargé) : sa propre alerte, une seule (le budget des alertes borne le reste) */
      expect((await lire()).alertes).toHaveLength(1);
    });

    it("l’éditeur d’une micro-entreprise (le nom, un SIRET, l’email, sans adresse) suffit ; le nom et l’email seuls, non", async () => {
      ouverte();
      editeur(true);
      expect((await lire()).fermee).toBe(false);
      editeur(false);
      expect((await lire()).fermee).toBe(true);
    });

    it("fermée exprès (BLUSH_BETA_FERMEE=1) ou hors de la production : rien n’est exigé, rien n’est dit", async () => {
      ouverte();
      sansWhop();
      sansCaptcha();
      editeur(false);
      vi.stubEnv("BLUSH_BETA_FERMEE", "1");
      expect(await lire()).toEqual({ fermee: true, journal: [], alertes: [] });
      /* Une préversion ouverte (et le dev, les tests) : ouverte, comme avant */
      vi.stubEnv("BLUSH_BETA_FERMEE", "0");
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(await lire()).toEqual({ fermee: false, journal: [], alertes: [] });
    });

    it("une configuration dangereuse reste refusée, même quand l’ouverture manque aussi de quelque chose", async () => {
      ouverte();
      sansCaptcha();
      vi.stubEnv("CRON_SECRET", undefined);
      await expect(charger().then(({ env }) => env())).rejects.toThrow(/Configuration refusée en production : CRON_SECRET manque/);
      vi.stubEnv("CRON_SECRET", "un-secret-fictif-assez-long");
      whop("WHOP_PRODUCT_ID");
      await expect(charger().then(({ env }) => env())).rejects.toThrow(/Whop à moitié configuré/);
      expect(alerter).not.toHaveBeenCalled();
    });
  });

  it("les clés de test de Cloudflare y sont refusées, même bêta fermée : elles ne protègent rien", async () => {
    production();
    vi.stubEnv("TURNSTILE_SECRET_KEY", CLES_DE_TEST_TURNSTILE.secretes[0]);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", CLES_DE_TEST_TURNSTILE.publiques[0]);
    const message = await charger()
      .then(({ env }) => env())
      .then(
        () => "",
        (e: Error) => e.message,
      );
    expect(message).toContain("TURNSTILE_SECRET_KEY est une clé de test de Cloudflare");
    expect(message).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY est une clé de test de Cloudflare");
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
