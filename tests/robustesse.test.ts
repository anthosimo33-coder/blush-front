import { gzipSync } from "node:zlib";
import { and, eq, inArray, sql } from "drizzle-orm";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import type { DonneesVerdict } from "@/server/stockage/types";
import { compteDe, preparerCode, prendreCode, type Utilisateur } from "@/server/auth";
import { dechiffrer, jeton } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { ouvrirLeRapport } from "@/server/donnees";
import { depuisFichier, depuisPaquet, ErreurImport } from "@/server/import";
import { fournisseurFactice, REFUS_FACTICE } from "@/server/ia/factice";
import { retenir } from "@/server/memoire-groupee";
import { planifier, prendre } from "@/server/taches";
import { echange } from "./aide/fabriques";
import { avecFactice, compteDeTest, debloquerLaConv, histoireLue, ligneEnBase } from "./aide/fixtures";

const lancerApres = async () => {
  while (apres.length) await apres.shift()!();
};

/**
 * Le modèle factice, avec un verdict changé (l’alerte, le mode sobre) ; le modèle factice n’écrit pas de rapport
 * sobre : `refuserRapport` le fait refuser.
 */
const facticeAvec =
  ({ verdict, refuserRapport = false }: { verdict: Record<string, unknown>; refuserRapport?: boolean }) =>
  (req: Requete) => {
    if (refuserRapport && req.tache === "05-rapport") return REFUS_FACTICE;
    const s = fournisseurFactice(req);
    return req.tache === "04-verdict" && s && typeof s === "object" ? { ...s, ...verdict } : s;
  };

let u: Utilisateur;
beforeAll(async () => {
  u = await compteDeTest("robuste");
});

/** Une conv importée, rattachée au compte gratuit du fichier (ou à `compte`), « Qui es-tu ? » rempli, son verdict lu. */
const lue = async (f: string, compte = u) => (await histoireLue(compte, f)).id;

describe("le code de connexion", () => {
  const email = `robuste-code-${Date.now()}@blush.test`;
  afterAll(async () => {
    await db().delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
    await db().delete(schema.users).where(eq(schema.users.email, email));
  });
  /* Un code neuf, dans un navigateur à lui (le jeton de son cookie) */
  const nouveauCode = async () => {
    const navigateur = jeton();
    return { navigateur, code: (await preparerCode(email, navigateur, { envoye: true }))! };
  };
  /* Le code tapé : bon, le compte s’ouvre (comme /api/auth/verifier) */
  const entrer = async (navigateur: string, code: string) => ((await prendreCode(email, code, { navigateur, ip: "198.51.100.7" })) === "bon" ? compteDe(email) : null);

  it("ne laisse pas passer plus de 5 essais, même envoyés en même temps", async () => {
    const { navigateur, code } = await nouveauCode();
    await Promise.all(Array.from({ length: 20 }, (_, k) => entrer(navigateur, String(200000 + k))));
    const c = (await db().select().from(schema.loginCodes).where(eq(schema.loginCodes.email, email)))[0]!;
    expect(c.attempts).toBe(5);
    /* Le bon code ne marche plus : les essais sont épuisés */
    expect(await entrer(navigateur, code)).toBeNull();
  });

  it("ne sert qu’une fois : deux bons essais en même temps, une seule session", async () => {
    const { navigateur, code } = await nouveauCode();
    const r = await Promise.all([entrer(navigateur, code), entrer(navigateur, code)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});

describe("les tâches d’une histoire", () => {
  it("une étape planifiée deux fois en même temps n’existe qu’une fois", async () => {
    const id = await lue("02-reciproque.txt");
    const [a, b] = await Promise.all([planifier(id, "rapport_plan"), planifier(id, "rapport_plan")]);
    expect(a).toBe(b);
    const enAttente = await db()
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan"), inArray(schema.tasks.status, ["attente", "en_cours"])));
    expect(enAttente).toHaveLength(1);
  });

  it("jamais deux étapes d’une même histoire en même temps", async () => {
    const id = await lue("03-elle-s-eloigne.txt");
    const t1 = (await retenir(id, echange(1), { neuf: true, maintenant: true })).id!;
    expect(await prendre(t1)).not.toBeNull();
    /* La première prise, l’échange suivant en ouvre une autre (les mises à jour de la mémoire ne passent pas par l’index) */
    const t2 = (await retenir(id, echange(2), { neuf: true, maintenant: true })).id!;
    expect(t2).not.toBe(t1);
    expect(await prendre(t2)).toBeNull();
    /* La première abandonnée (battement périmé) : la seconde peut partir */
    await db()
      .update(schema.tasks)
      .set({ heartbeatAt: sql`now() - interval '10 minutes'` })
      .where(eq(schema.tasks.id, t1));
    expect(await prendre(t2)).not.toBeNull();
  });
});

describe("le mode sobre", () => {
  const sortie = async (id: string) => dechiffrer<DonneesVerdict>((await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id)))[0]!.data).sortie;
  const plans = async (id: string) =>
    db()
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan")));

  it("n’existe pas sans alerte, même si le modèle le demande (un rejet : le rapport complet, payant)", async () => {
    const id = await avecFactice(facticeAvec({ verdict: { mode_sobre: true, alerte: null } }), () => lue("04-ghosting.txt"));
    expect((await sortie(id)).mode_sobre).toBe(false);
    /* Compte gratuit : pas de rapport offert */
    expect(await plans(id)).toHaveLength(0);
  });

  it("suit toujours une alerte de la règle de l’âge, même si le modèle l’oublie (le rapport doux, offert)", async () => {
    const id = await avecFactice(facticeAvec({ verdict: { mode_sobre: false, alerte: "mineur" }, refuserRapport: true }), () => lue("05-insiste-apres-un-non.txt"));
    expect((await sortie(id)).mode_sobre).toBe(true);
    expect(await plans(id)).toHaveLength(1);
  });

  it.each(["danger", "detresse"] as const)(
    "n’existe plus pour une alerte %s, même si le modèle le demande (21 et 22 octobre 2026 : le rapport complet, payant)",
    async (alerte) => {
      const id = await avecFactice(facticeAvec({ verdict: { mode_sobre: true, alerte } }), () => lue("04-ghosting.txt"));
      expect(await sortie(id)).toMatchObject({ alerte, mode_sobre: false });
      /* Compte gratuit : pas de rapport offert */
      expect(await plans(id)).toHaveLength(0);
    },
  );
});

describe("l’accès donné après le verdict", () => {
  it("lance le rapport à l’ouverture, puis la mémoire, sans passer par « Débloquer »", async () => {
    /* Un compte à lui : sa conv se débloque pendant le test */
    const compte = await compteDeTest("robuste-acces");
    const id = await lue("06-elle-hesite.txt", compte);
    await debloquerLaConv(id);
    const avant = await ouvrirLeRapport(await ligneEnBase(id), compte);
    expect(avant?.generating).toBe(true);
    await lancerApres();
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, id));
    expect(r?.data).not.toBeNull();
    const taches = await db().select({ kind: schema.tasks.kind, status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.storyId, id));
    expect(taches.find((t) => t.kind === "memoire")?.status).toBe("fini");
  });
});

/* Fabriquer ces archives (des dizaines de Mo) prend plusieurs secondes sur une machine de la CI chargée : plus que les 5 s par défaut */
const ARCHIVE_MS = 30_000;

describe("une archive piégée", () => {
  it("est refusée sans être décompressée en entier (paquet gzip)", { timeout: ARCHIVE_MS }, async () => {
    const piege = new File([gzipSync(Buffer.alloc(41 * 1024 * 1024))], "export.json.gz");
    await expect(depuisPaquet(piege)).rejects.toBeInstanceOf(ErreurImport);
  });

  it("est refusée quand ses fichiers dépassent la taille d’une conv, ensemble (zip)", { timeout: ARCHIVE_MS }, async () => {
    const gros = new Uint8Array(15 * 1024 * 1024);
    const zip = zipSync({ "message_1.html": gros, "message_2.html": gros, "message_3.html": gros });
    await expect(depuisFichier(new File([zip], "export.zip"))).rejects.toBeInstanceOf(ErreurImport);
  });
});
