import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import type { Verdict } from "@prompts/lib/schemas";
import { CHAPITRES_PAYANTS, titreDAttente } from "@/contenu/chapitres";
import { chiffrer } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { rapportDe } from "@/server/donnees";
import { histoireOuverte } from "@/server/histoires";
import { fournisseurFactice } from "@/server/ia/factice";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { avecFactice, compteDeTest, histoireLue, type Importee } from "./aide/fixtures";

/*
 * Les titres des chapitres fermés, de bout en bout (prompts/lib/titres.ts) : le verdict les écrit (le modèle factice,
 * FACTICE.titres), le code les vérifie sur la conv et les garde, le rapport gratuit les montre sur les chapitres fermés,
 * et le rapport débloqué les porte, imposés au plan et aux chapitres. Un verdict d’avant les titres, ou un titre qui
 * ne passe pas, garde les titres d’attente.
 */

/** Le prénom de l’autre personne de la conv (« Qui es-tu ? » par défaut : l’utilisateur est le premier participant). */
const autreDe = (imp: Importee) => imp.meta.participants[1]!.prenom;

/** Le verdict gardé d’une histoire, déchiffré. */
const verdictGarde = async (id: string) => coffre.lire("verdicts.data", (await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id)))[0]!.data);

/** Les titres des chapitres payants (2 à 8) tels que le rapport les montre au compte, et ceux de son sommaire. */
async function titresAffiches(u: Parameters<typeof rapportDe>[1], id: string) {
  const r = (await rapportDe((await histoireOuverte(u, { affichee: id }))!, u))!;
  const payants = r.report.chapters.filter((c) => c.number > 1);
  return { titres: payants.map((c) => c.title), sommaire: payants.map((c) => c.tocTitle), fermes: payants.every((c) => c.locked) };
}

describe("les titres des chapitres fermés", () => {
  it("un compte gratuit : le verdict les écrit, le code les garde, les chapitres fermés les montrent (au sommaire aussi)", async () => {
    const u = await compteDeTest("titres-gratuit");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    const promis = Object.values(FACTICE.titres(autreDe(imp)));
    expect((await verdictGarde(imp.id)).sortie.titres).toEqual(FACTICE.titres(autreDe(imp)));
    expect(await titresAffiches(u, imp.id)).toEqual({ titres: promis, sommaire: promis, fermes: true });
  });

  it("le rapport débloqué les garde : imposés au plan, puis à chaque chapitre écrit, le titre court du plan au sommaire", async () => {
    const u = await compteDeTest("titres-debloque", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    const promis = Object.values(FACTICE.titres(autreDe(imp)));
    const [ligne] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, imp.id));
    /* Le plan gardé (que les deux moitiés ont reçu) et la sortie du rapport : les titres promis, au mot près */
    expect(
      coffre
        .lire("reports.plan", ligne!.plan!)
        .chapitres.filter((c) => c.numero > 1)
        .map((c) => c.titre),
    ).toEqual(promis);
    const donnees = coffre.lire("reports.data", ligne!.data!);
    expect(donnees.sortie.chapitres?.filter((c) => c.numero > 1).map((c) => c.titre)).toEqual(promis);
    /* Le modèle factice écrit « Chapitre N » : ce sont bien les titres du verdict qui restent, son titre court au sommaire */
    expect(await titresAffiches(u, imp.id)).toEqual({ titres: promis, sommaire: CHAPITRES_PAYANTS.map(FACTICE.titreCourt), fermes: false });
  });

  it("un titre qui cite ce qu’aucun message ne dit est vidé : son chapitre seul garde son titre d’attente", async () => {
    const u = await compteDeTest("titres-invente");
    const invente = (req: Requete) => {
      const s = fournisseurFactice(req);
      if (req.tache !== "04-verdict") return s;
      const v = s as Verdict;
      return { ...v, titres: { ...v.titres!, coince: "Ton « je t’aime pour toujours » du dimanche" } };
    };
    const imp = await avecFactice(invente, () => histoireLue(u, "06-elle-hesite.txt"));
    const autre = autreDe(imp);
    expect((await verdictGarde(imp.id)).sortie.titres?.coince).toBe("");
    const { titres } = await titresAffiches(u, imp.id);
    expect(titres).toEqual(CHAPITRES_PAYANTS.map((n, k) => (n === 4 ? titreDAttente(4, autre) : Object.values(FACTICE.titres(autre))[k])));
  });

  it("un verdict d’avant les titres (gardé sans eux) : les titres d’attente", async () => {
    const u = await compteDeTest("titres-ancien");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    /* Le verdict tel que le gardait l’appli avant le 13 octobre : sans le champ `titres` */
    const { sortie, scores } = await verdictGarde(imp.id);
    const ancienne: Partial<Verdict> = { ...sortie };
    delete ancienne.titres;
    await db()
      .update(schema.verdicts)
      .set({ data: chiffrer({ sortie: ancienne, scores }) })
      .where(eq(schema.verdicts.storyId, imp.id));
    const attente = CHAPITRES_PAYANTS.map((n) => titreDAttente(n, autreDe(imp)));
    expect(await titresAffiches(u, imp.id)).toEqual({ titres: attente, sommaire: attente, fermes: true });
  });

  it("une alerte du mode sobre (la règle de l’âge) : aucun titre gardé, ni montré", async () => {
    const u = await compteDeTest("titres-alerte");
    /* Le modèle lève une alerte, mais écrit quand même des titres : le code les retire. Le rapport doux suit (FACTICE.alerte) */
    const alerte = (req: Requete) => {
      if (req.tache === "04-verdict") return { ...(fournisseurFactice(req) as Verdict), alerte: "mineur" };
      return fournisseurFactice({ ...req, blocs: [...req.blocs, { texte: FACTICE.alerte }] });
    };
    const imp = await avecFactice(alerte, () => histoireLue(u, "06-elle-hesite.txt"));
    expect((await verdictGarde(imp.id)).sortie).toMatchObject({ mode_sobre: true, titres: null });
    const r = (await rapportDe((await histoireOuverte(u, { affichee: imp.id }))!, u))!;
    expect(JSON.stringify(r)).not.toContain(FACTICE.titres(autreDe(imp)).autre);
  });
});
