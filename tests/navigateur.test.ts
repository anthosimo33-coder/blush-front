import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Ce que les navigateurs remontent (src/server/navigateur.ts) : leurs erreurs et leur vitesse, par leurs routes, comme
 * src/lib/sentinelle.tsx les envoie. Les alertes de l’équipe relevées au lieu de partir. Chaque test a ses adresses IP ;
 * les lignes écrites sont effacées à la fin.
 */
const alertes = vi.hoisted(() => [] as { sujet: string; lignes: string[] }[]);
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[]) => void alertes.push({ sujet, lignes }),
}));

import { POST as postErreur } from "@/app/api/navigateur/erreur/route";
import { POST as postMesures } from "@/app/api/navigateur/mesures/route";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { LIMITES } from "@/server/limites";
import { familleDe, masquer, santeDesNavigateurs, sourceDeLAppli } from "@/server/navigateur";
import { purger } from "@/server/purge";

const n = Date.now();
let k = 0;
const nouvelleIp = () => `10.${(n >> 16) % 250}.${(n >> 8) % 250}.${++k}`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
/* Un mot à soi dans chaque message, en lettres (le masquage efface les longs nombres) : les lignes de ce lancement se retrouvent, et s’effacent à la fin */
const MARQUE = `essai${[...String(n)].map((c) => "abcdefghij"[Number(c)]).join("")}`;

const envoyer = (route: typeof postErreur, chemin: string, corps: unknown, ip = nouvelleIp(), ua = IPHONE) =>
  route(
    new Request(`http://localhost${chemin}`, {
      method: "POST",
      body: JSON.stringify(corps),
      headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip, "content-type": "application/json", "user-agent": ua },
    }),
  );

const nosErreurs = async () => (await db().select().from(schema.erreursNavigateur)).filter((e) => e.message.includes(MARQUE));

beforeEach(async () => {
  alertes.length = 0;
  await db()
    .delete(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte("limite:alertes:navigateur")));
});
afterAll(async () => {
  const lignes = await nosErreurs();
  if (lignes.length)
    await db()
      .delete(schema.erreursNavigateur)
      .where(
        inArray(
          schema.erreursNavigateur.signature,
          lignes.map((l) => l.signature),
        ),
      );
  await db().delete(schema.mesuresNavigateur).where(eq(schema.mesuresNavigateur.etape, "partage"));
});

describe("ce qui désigne quelqu’un ne reste pas", () => {
  it("masquer : les emails, les longs nombres, les identifiants et les paramètres d’une adresse ; coupé", () => {
    expect(masquer("échec pour lea.martin@exemple.fr au 0612345678, histoire 1b4e28ba-2fa1-11d2-883f-0016d3cca427 sur /rapport?moi=lea")).toBe(
      "échec pour ‹email› au ‹n›, histoire ‹id› sur /rapport",
    );
    expect(masquer("x".repeat(500))).toHaveLength(300);
  });

  it("la source : un fichier de l’appli seulement ; la famille du navigateur, jamais son User-Agent", () => {
    expect(sourceDeLAppli("https://www.askblush.com/_next/static/chunks/0a1b.js:1:2345")).toBe("/_next/static/chunks/0a1b.js:1:2345");
    expect(sourceDeLAppli("chrome-extension://abc/script.js:1:2")).toBeNull();
    expect(familleDe(IPHONE)).toBe("iphone");
    expect(familleDe(`${IPHONE} Instagram 300.0`)).toBe("iphone-appli");
    expect(familleDe("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile")).toBe("android");
    expect(familleDe("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("ordinateur");
    expect(familleDe(null)).toBe("autre");
  });
});

describe("POST /api/navigateur/erreur", () => {
  it("note l’erreur masquée, compte les suivantes sur la même ligne, et ne prévient l’équipe qu’à la première du jour", async () => {
    const corps = { nom: "TypeError", message: `${MARQUE} : lecture impossible pour lea@exemple.fr`, source: "https://x/_next/static/chunks/ab12.js:1:99", etape: "chat" };
    for (let i = 0; i < 3; i++) expect(await (await envoyer(postErreur, "/api/navigateur/erreur", corps)).json()).toEqual({ ok: true });
    const [ligne, ...autres] = await nosErreurs();
    expect(autres).toHaveLength(0);
    expect(ligne).toMatchObject({
      nom: "TypeError",
      message: `${MARQUE} : lecture impossible pour ‹email›`,
      source: "/_next/static/chunks/ab12.js:1:99",
      etape: "chat",
      famille: "iphone",
      fois: 3,
    });
    expect(alertes.map((a) => a.sujet)).toEqual(["erreur dans un navigateur"]);
    expect(alertes[0]!.lignes.join(" ")).not.toContain("lea@exemple.fr");
  });

  it("un corps hors contrat est refusé ; au-delà de sa limite, une adresse n’est plus écoutée, sans le dire", async () => {
    expect((await envoyer(postErreur, "/api/navigateur/erreur", { nom: "E", message: "m", etape: "nulle-part" })).status).toBe(422);
    const ip = nouvelleIp();
    for (let i = 0; i < LIMITES.erreurNavigateurParIp.max + 2; i++)
      await envoyer(postErreur, "/api/navigateur/erreur", { nom: "RangeError", message: `${MARQUE} limite ${i % 2 ? "a" : "b"}`, etape: "compte" }, ip);
    const lignes = (await nosErreurs()).filter((e) => e.nom === "RangeError");
    expect(lignes.reduce((s, l) => s + l.fois, 0)).toBe(LIMITES.erreurNavigateurParIp.max);
  });
});

describe("POST /api/navigateur/mesures et le bloc d’/admin", () => {
  it("note chaque mesure ; /admin lit le 75e centile d’un écran à partir de 5 pages, et les erreurs les plus fréquentes", async () => {
    for (let i = 1; i <= 8; i++)
      expect(
        (
          await envoyer(postMesures, "/api/navigateur/mesures", {
            etape: "partage",
            mobile: true,
            mesures: [
              { metrique: "TTFB", valeur: i * 100 },
              { metrique: "LCP", valeur: i * 1000 },
              { metrique: "CLS", valeur: 0.05 },
            ],
          })
        ).status,
      ).toBe(200);
    expect((await envoyer(postMesures, "/api/navigateur/mesures", { etape: "partage", mobile: true, mesures: [{ metrique: "LCP", valeur: -1 }] })).status).toBe(422);
    const s = await santeDesNavigateurs(1);
    const partage = s.vitesse.find((v) => v.etape === "partage" && v.mobile);
    expect(partage).toMatchObject({ pages: 8, LCP: 6250, TTFB: 625, CLS: 0.05 });
    expect(s.erreurs.some((e) => e.message.includes(MARQUE))).toBe(true);
  });

  it("la purge de la nuit efface ce qui a plus de 30 jours", async () => {
    const vieux = new Date(Date.now() - 31 * 86400e3);
    const [m] = await db().insert(schema.mesuresNavigateur).values({ etape: "partage", mobile: false, metrique: "LCP", valeur: 1, le: vieux }).returning();
    await db()
      .insert(schema.erreursNavigateur)
      .values({ jour: "2026-01-01", signature: `vieille-${n}`, nom: "E", message: `${MARQUE} vieille`, etape: "autre", famille: "autre", derniereLe: vieux });
    await purger();
    expect(await db().select().from(schema.mesuresNavigateur).where(eq(schema.mesuresNavigateur.id, m!.id))).toHaveLength(0);
    expect((await nosErreurs()).some((e) => e.signature === `vieille-${n}`)).toBe(false);
  });
});
