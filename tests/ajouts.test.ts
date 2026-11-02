import { beforeAll, describe, expect, it, vi } from "vitest";
import { blocAjout, messagesDeLExport, messagesDesCaptures, numeroter, type Ajout } from "@prompts/lib/ajouts";
import type { Message } from "@prompts/lib/conv";
import type { Requete } from "@prompts/lib/contextes";
import { estLigneProfil } from "@prompts/lib/ligne";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import { ajouterALaFiche, depuisCaptures, depuisExport, lireLus, majEnCours, resumeAjout } from "@/server/ajouts";
import { retenir, sansAttendre } from "@/server/memoire-groupee";
import { repondre } from "@/server/chat";
import { historique } from "@/server/historique";
import { ficheDe, memoireDe } from "@/server/donnees";
import { contexteDe, fuseauDe, importer, metaDe } from "@/server/histoires";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { TETE_DU_RAPPEL } from "@prompts/lib/ligne";
import { jourDans } from "@/lib/jours";
import { fournisseurFactice, refusFactice } from "@/server/ia/factice";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { reponseErreur } from "@/server/http";
import { problemeAjout } from "@/lib/messages-erreur";
import { ErreurApi } from "@/types/erreurs-api";
import { transcrire } from "@/server/ia/transcription";
import { executerChaine } from "@/server/pipeline";
import { faitsAffiches } from "@/server/ecrans/fiche";
import { messagesAffiches } from "@/server/ecrans/messages";
import { captures, memoire, msg } from "./aide/fabriques";
import { texteDeConv } from "./aide/fichiers";
import { accordDeTest, avecFactice, compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

const texte01 = texteDeConv("01-a-deux-doigts.txt");
const h = { utilisateur: { prenom: "Hugo", pronom: "il" as const, nomExport: "Hugo" }, autre: { prenom: "Sophie", pronom: "elle" as const, nomExport: "Sophie" } };
/* La suite de leur conv, après l’import : un message de lui, puis deux d’elle */
const suite = ["[14/03/2026 10:02:11] Hugo: alors cette semaine ?", "[14/03/2026 18:40:00] Sophie: ça va mieux", "[14/03/2026 18:40:30] Sophie: samedi ça te dit toujours ?"].join(
  "\n",
);
/* Le dernier message de la conv 01 : « je suis crevée cette semaine, on verra » */
const fin01 = Date.UTC(2026, 2, 12, 22, 51, 36);
/** Les messages d’un nouvel export, d’après la conv 01 : ceux d’après son dernier message lu. */
function nouveaux(texte: string): Message[] {
  const m = messagesDeLExport(texte, h, fin01);
  if (typeof m === "string") throw new Error(`export refusé : ${m}`);
  return m.nouveaux;
}

describe("lib/ajouts", () => {
  it("un nouvel export : seulement les messages d’après le dernier lu, et seulement leur conv", () => {
    const m = nouveaux(`${texte01}\n${suite}`);
    expect(m.map((x) => [x.role, x.texte])).toEqual([
      ["toi", "alors cette semaine ?"],
      ["autre", "ça va mieux"],
      ["autre", "samedi ça te dit toujours ?"],
    ]);
    /* Son nom d’affichage a changé : on la retrouve par son prénom */
    expect(nouveaux(`${texte01}\n${suite}`.replaceAll("] Sophie:", "] Sophie 🌸:")).map((x) => x.role)).toEqual(["toi", "autre", "autre"]);
    expect(messagesDeLExport(texteDeConv("02-reciproque.txt"), h, fin01)).toBe("autre_conv");
  });

  it("numérote à la suite, marque sa dernière rafale, et range son profil à part", () => {
    const m = nouveaux(`${texte01}\n${suite}`);
    const a = numeroter(m, ["24 ans, étudiante en droit"], h, { debut: 1074, aujourdhui: "2026-03-15" });
    expect(a.lignes).toEqual([
      "m1074 2026-03-14 sam. 10:02 Hugo : alors cette semaine ?",
      "m1075 2026-03-14 sam. 18:40 Sophie : ça va mieux",
      "m1076 2026-03-14 sam. 18:40 Sophie : samedi ça te dit toujours ?",
      "m1077 2026-03-15 dim. --:-- profil de Sophie : 24 ans, étudiante en droit",
    ]);
    expect(a.cibles).toEqual(["m1075", "m1076"]);
    expect(a.lignes.map(estLigneProfil)).toEqual([false, false, false, true]);
    expect(blocAjout(a).map((l) => l.slice(0, 8))).toEqual(["  m1074 ", "→ m1075 ", "→ m1076 ", "  m1077 "]);
    expect(blocAjout(a, 2)[0]).toBe("[… 1 message plus ancien …]");
    expect(resumeAjout(a, "captures", 2)).toBe("(2 captures\u00a0: 3 nouveaux messages, son profil)");

    /* À l’affichage : son profil n’est pas une bulle, mais il est la source d’une info de sa fiche */
    const lignes = new Map(a.lignes.map((l) => [l.slice(0, 5), l]));
    expect(messagesAffiches(lignes, "Hugo").has("m1077")).toBe(false);
    expect(messagesAffiches(lignes, "Hugo").get("m1076")).toMatchObject({ from: "elle", caption: "Sophie · 14/03 18:40" });
    const etat = memoire({ fiche: { faits: [{ section: "infos", texte: "24 ans", preuves: ["m1077"], statut: "nouveau" }] } });
    expect(faitsAffiches(etat, lignes)[0]).toMatchObject({ sourceLabel: "son profil · 15 mars", sources: ["capture"] });
  });

  it("des captures : ce qui est avant le dernier message lu n’est pas nouveau (le jour même, on garde), et ne revient que sans rien de neuf", () => {
    const c = captures({
      autre: "Sophie",
      blocs: [
        { repere: { date: "2026-03-10", heure: "09:00" }, messages: [msg("autre", "vieux")] },
        { repere: { date: "2026-03-12", heure: "23:30" }, messages: [msg("moi", "le soir même")] },
        { repere: { date: "2026-03-14", heure: "18:40" }, messages: [msg("autre", "ça va mieux")] },
      ],
    });
    const { nouveaux, remontres } = messagesDesCaptures(c, h, { aujourdhui: "2026-03-15", apres: fin01 });
    expect(nouveaux.map((m) => [m.role, m.texte])).toEqual([
      ["toi", "le soir même"],
      ["autre", "ça va mieux"],
    ]);
    expect(remontres).toEqual([]);
    /* Les mêmes captures sans leur suite : rien de neuf, l’échange plus ancien qu’il remontre */
    const seul = captures({ autre: "Sophie", blocs: [{ repere: { date: "2026-03-10", heure: "09:00" }, messages: [msg("autre", "vieux")] }] });
    const rappel = messagesDesCaptures(seul, h, { aujourdhui: "2026-03-15", apres: fin01 });
    expect([rappel.nouveaux, rappel.remontres.map((m) => [m.role, m.texte]), rappel.dejaLus]).toEqual([[], [["autre", "vieux"]], false]);
  });
});

/*
 * Chaque test part de sa conv lue : aucun ne dépend de ce qu’un autre a ajouté (un export, des captures, un échange), et
 * chacun passe seul comme dans n’importe quel ordre. Ceux qui regardent la suite d’un export la font dans leur beforeAll.
 */
describe("après l’import : le chat et sa fiche", () => {
  const requetes: Requete[] = [];
  const derniere = (tache: Requete["tache"]) =>
    requetes
      .filter((r) => r.tache === tache)
      .at(-1)!
      .blocs.flatMap((b) => ("texte" in b ? [b.texte] : []))
      .join("\n");
  const image = { media: "image/jpeg" as const, base64: "AAAA" };
  /** Une conv lue par un compte neuf, ses convs débloquées (Hugo et Sophie, la conv 01) : son id. */
  const convLue = async () => (await histoireLue(await compteDeTest("ajouts", "debloque"), "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  /** Le numéro d’une ligne ajoutée (« m1074 … » : 1074). */
  const numero = (ligne: string) => Number(/^m(\d+) /.exec(ligne)?.[1]);

  /* Les requêtes au modèle (factice) pendant les tests, pour lire ce qu’il reçoit */
  facticePourChaqueTest((req) => (requetes.push(req), fournisseurFactice(req)));

  it("un nouvel export dans le chat : ses messages marqués, l’historique résumé, la mémoire qui les relit", async () => {
    const id = await convLue();
    const memoire = (await memoireDe(id))!;
    const ajout = await depuisExport(await ligneEnBase(id), memoire, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    expect(ajout.messages).toBe(3);
    expect(numero(ajout.lignes[0]!)).toBe(memoire.suivant);

    const { reponse, majMemoire } = await repondre(await ligneEnBase(id), memoire, "", { ajout, affiche: resumeAjout(ajout, "export", 1) });
    expect(reponse.kind).toBe("bubbles");
    /* Trois messages : le fil du chat les garde, la mémoire les relira quand le chat se calme */
    expect(majMemoire).toBe(false);
    const chat = derniere("10-chat");
    expect(chat).toContain(`→ ${ajout.lignes[2]}`);
    expect(chat).toContain("Hugo (à toi) : ça veut dire quoi ? je lui réponds quoi ?");
    expect((await historique(id)).echanges.at(-1)?.mine).toBe("(ton export\u00a0: 3 nouveaux messages)");

    await sansAttendre(id);
    await executerChaine(id);
    expect(derniere("07-memoire")).toContain(`ajouté à la conv :\n${ajout.lignes.join("\n")}`);

    /* Le même export, renvoyé : le curseur a avancé, rien de neuf */
    await expect(depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` })).rejects.toMatchObject({ code: "rien_de_neuf" });
  });

  it("le message suivant peut citer un message de l’envoi d’avant, que la mémoire n’a pas encore relu : un seul appel, la citation montrée", async () => {
    const id = await convLue();
    const memoire = (await memoireDe(id))!;
    const ajout = await depuisExport(await ligneEnBase(id), memoire, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    await repondre(await ligneEnBase(id), memoire, "", { ajout, affiche: resumeAjout(ajout, "export", 1) });
    /* Sa mise à jour n’est pas passée : la mémoire ne connaît pas la ligne que le modèle cite, seul le fil la remontre */
    const citee = ajout.lignes.at(-1)!;
    const cite = /^m\d+/.exec(citee)![0];
    expect(new Map((await memoireDe(id))!.lignes).has(cite)).toBe(false);
    let appels = 0;
    const { reponse } = await avecFactice(
      (req) => {
        if (req.tache !== "10-chat") return fournisseurFactice(req);
        appels++;
        return { ...(fournisseurFactice(req) as Record<string, unknown>), lecture: [{ texte: "elle te relance", preuves: [cite] }] };
      },
      async () => repondre(await ligneEnBase(id), (await memoireDe(id))!, "et son dernier message ?"),
    );
    expect(appels).toBe(1);
    expect(reponse.kind === "bubbles" && reponse.bubbles.map((b) => [b.text, b.messages?.length ?? 0])).toEqual([["elle te relance", 1]]);
  });

  describe("après un nouvel export, envoyé dans le chat puis relu par la mémoire", () => {
    let id = "";
    /** L’export ajouté par le beforeAll : ses lignes, numérotées à la suite de la conv. */
    let exporte: Ajout;
    beforeAll(async () => {
      id = await convLue();
      const memoire = (await memoireDe(id))!;
      exporte = await depuisExport(await ligneEnBase(id), memoire, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
      await repondre(await ligneEnBase(id), memoire, "", { ajout: exporte, affiche: resumeAjout(exporte, "export", 1) });
      await executerChaine(id);
    });

    it("le message suivant garde dans le fil les messages qu’il avait envoyés", async () => {
      await repondre(await ligneEnBase(id), (await memoireDe(id))!, "je lui dis oui direct ?");
      expect(derniere("10-chat")).toContain(`  ${exporte.lignes.at(-1)}\nHugo (à toi) : ça veut dire quoi ?`);
    });

    it("des captures : leurs messages et son profil, numérotés à la suite de l’export", async () => {
      const ajout = await depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]);
      expect(ajout.messages).toBe(FACTICE.messagesCaptures);
      expect(ajout.profil).toBe(1);
      expect(numero(ajout.lignes[0]!)).toBe(numero(exporte.lignes.at(-1)!) + 1);
      expect(derniere("01-captures")).toContain("autre personne : Sophie");
    });

    it("des captures que le modèle refuse de lire : le refus (que le chat et la fiche savent dire), jamais « capture »", async () => {
      const lire = async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]);
      const refus = await avecFactice(() => refusFactice("cyber"), lire).catch((e: unknown) => e);
      expect(refus).toMatchObject({ code: "refus:cyber" });
      /* Ce que la route en répond (POST /api/fiche : reponseErreur), lu par le navigateur : l’écran de la fiche dit le refus, pas un bug */
      const r = reponseErreur(refus);
      const { erreur } = (await r.json()) as { erreur: "refus" };
      expect([r.status, erreur]).toEqual([502, "refus"]);
      expect(problemeAjout(new ErreurApi(erreur, r.status))).toBe("refus");
      /* Illisible : « capture » */
      await expect(avecFactice(() => ({ rien: "de lisible" }), lire)).rejects.toMatchObject({ code: "capture" });
    });
  });

  it("pour sa fiche : la réponse part avec ce qui a été lu, puis son profil devient une info, avec sa source", async () => {
    const id = await convLue();
    const avant = new Set((await ficheDe(await ligneEnBase(id))).facts.map((f) => f.text));
    const ajout = await depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]);
    const r = await ajouterALaFiche(await ligneEnBase(id), ajout);
    /* La réponse n’attend pas la mémoire : son profil est « en cours d’ajout », la fiche dit qu’elle se met à jour */
    expect(r).toMatchObject({ added: [], pending: { profile: [FACTICE.profil], messages: ajout.messages }, fiche: { updating: true } });
    expect(r.fiche.facts.length).toBe(avant.size);
    expect(await majEnCours(id)).toBe(true);
    /* Après la réponse, la mise à jour tourne : la fiche relue a l’info, avec sa source */
    while (apres.length) await apres.shift()!();
    expect(await majEnCours(id)).toBe(false);
    const fiche = await ficheDe(await ligneEnBase(id));
    expect(fiche.facts.find((f) => f.text === FACTICE.profil)).toMatchObject({ sourceLabel: expect.stringMatching(/^son profil · /), sources: ["capture"] });
    expect(fiche.facts.length).toBeGreaterThan(avant.size);
  });

  it("un vocal est transcrit (ici, le modèle factice), puis lu comme un message", async () => {
    const id = await convLue();
    const t = await transcrire({ duree: 1, fichier: new File([new Uint8Array(16)], "vocal.ogg", { type: "audio/ogg" }) });
    expect(t).toContain("samedi");
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, `(vocal) ${t}`);
    expect(derniere("10-chat")).toContain(`Hugo (à toi) : (vocal) ${t}`);
  });
});

/*
 * Le curseur des ajouts (src/server/ajouts.ts, noterLAjout) : un export le fait avancer une fois sa réponse gardée,
 * jamais avant (une panne laisserait le même export refusé) ; des captures jamais (partielles, à l’heure près), mais
 * leurs messages deviennent reconnaissables : la même capture renvoyée ne se relit pas.
 */
describe("le curseur des ajouts", () => {
  /** Une conv lue par un compte neuf (Hugo et Sophie, la conv 01) : son id. */
  const convLue = async () => (await histoireLue(await compteDeTest("curseur", "debloque"), "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  /* Une capture du 15 mars, après la suite de l’export (le 14) : avant le correctif, elle faisait passer le curseur au 15 */
  const capture15 = captures({ autre: "Sophie", blocs: [{ repere: { date: "2026-03-15", heure: "09:10" }, messages: [msg("autre", "bien dormi ?"), msg("moi", "oui et toi")] }] });
  const lireCapture15 = (req: Requete) => (req.tache === "01-captures" ? capture15 : fournisseurFactice(req));
  const image = { media: "image/jpeg" as const, base64: "AAAA" };

  it("des captures ne font pas avancer le curseur : l’export d’après apporte ce qu’elles ne montraient pas", async () => {
    const id = await convLue();
    const ajout = await avecFactice(lireCapture15, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    expect(ajout.messages).toBe(2);
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "captures", 1) });
    const exporte = await depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    expect(exporte.messages).toBe(3);
  });

  it("la même capture renvoyée : rien de neuf", async () => {
    const id = await convLue();
    const ajout = await avecFactice(lireCapture15, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "captures", 1) });
    await expect(avecFactice(lireCapture15, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]))).rejects.toMatchObject({ code: "rien_de_neuf" });
  });

  it("une panne avant la réponse : le curseur n’a pas bougé, le même export se relit", async () => {
    const id = await convLue();
    const ajout = await depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    const panne = (req: Requete) => {
      if (req.tache === "10-chat") throw new Error("panne du modèle");
      return fournisseurFactice(req);
    };
    await expect(
      avecFactice(panne, async () => repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "export", 1) })),
    ).rejects.toThrow();
    const encore = await depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    expect(encore.messages).toBe(3);
  });

  /** Les captures factices de la fin de la conv 01 (« on se fait le libanais ce week-end ? » puis « je suis crevée… », le 12 mars), et d’une suite. */
  const finDe01 = (suite: ["moi" | "autre", string][] = [], repere: { date: string; heure: string | null } | null = null) =>
    captures({
      autre: "Sophie",
      blocs: [
        { repere, messages: [msg("moi", "on se fait le libanais ce week-end ?"), msg("autre", "je suis crevée cette semaine, on verra")] },
        ...(suite.length ? [{ repere: { date: "2026-03-14", heure: "10:00" }, messages: suite.map(([de, t]) => msg(de, t)) }] : []),
      ],
    });
  const lireAvec = (c: ReturnType<typeof captures>) => (req: Requete) => (req.tache === "01-captures" ? c : fournisseurFactice(req));

  it("la lecture garde ses derniers messages, leur empreinte et leur heure : une capture de la fin ne les relit pas", async () => {
    const id = await convLue();
    const lus = lireLus(contexteDe(await ligneEnBase(id))!.lus)!;
    expect(lus.length).toBeGreaterThan(0);
    expect(lus.every((e) => /^[\w-]{12}$/.test(e.cle) && e.heure === "exacte")).toBe(true);
    /* À la minute : le dernier, « je suis crevée… », à 22:51:36 */
    expect(lus.at(-1)!.t).toBe(Date.UTC(2026, 2, 12, 22, 51));
    const ajout = await avecFactice(lireAvec(finDe01([["autre", "bien dormi ?"]])), async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    expect([ajout.messages, ajout.rappel]).toEqual([1, 0]);
  });

  it("une capture déjà lue, renvoyée avec une question : elle part, comme un échange qu’il remontre ; sans question, ou sur sa fiche, « rien de neuf »", async () => {
    const id = await convLue();
    const lire = lireAvec(finDe01());
    await expect(avecFactice(lire, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]))).rejects.toMatchObject({ code: "rien_de_neuf" });
    const ajout = await avecFactice(lire, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image], { question: true }));
    expect([ajout.messages, ajout.rappel, ajout.cibles]).toEqual([0, 2, []]);
    const requetes: Requete[] = [];
    await avecFactice(
      (req) => (requetes.push(req), fournisseurFactice(req)),
      async () => repondre(await ligneEnBase(id), (await memoireDe(id))!, "elle veut dire quoi là ?", { ajout, affiche: resumeAjout(ajout, "captures", 1) }),
    );
    expect(texteDuChat(requetes)).toContain(`(${TETE_DU_RAPPEL})`);
    /* La mémoire a déjà lu cet échange : elle ne le reçoit pas une deuxième fois */
    const retenus = (
      await db()
        .select({ input: schema.tasks.input })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")))
    ).flatMap((t) => (t.input ? coffre.lire("tasks.input", t.input) : []));
    expect(retenus.some((e) => e.rappel || e.lignes?.length)).toBe(false);
    expect(resumeAjout(ajout, "captures", 1)).toBe("(ta capture\u00a0: un échange déjà lu)");
  });

  it("sur sa fiche, les messages lus sont notés une fois l’ajout gardé : la même capture n’apporte plus rien", async () => {
    const id = await convLue();
    const lire = lireAvec(
      finDe01([
        ["autre", "bien dormi ?"],
        ["moi", "oui et toi"],
      ]),
    );
    const ajout = await avecFactice(lire, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    expect(ajout.messages).toBe(2);
    await ajouterALaFiche(await ligneEnBase(id), ajout);
    await expect(avecFactice(lire, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]))).rejects.toMatchObject({ code: "rien_de_neuf" });
    await sansAttendre(id);
  });

  /** Une conv lue comme avant le 2 novembre : importée le 12 mars à minuit (heure de Paris), son contexte sans `lus`, son curseur à `dernier`. */
  const convDAvant = async (dernier: number) => {
    const id = await convLue();
    const ancien = { ...contexteDe(await ligneEnBase(id))!, dernier };
    delete ancien.lus;
    delete ancien.vuJusqua;
    await db()
      .update(schema.stories)
      .set({ context: coffre.ecrire("stories.context", ancien), createdAt: new Date("2026-03-12T23:00:00Z") })
      .where(eq(schema.stories.id, id));
    return id;
  };

  it("une conv lue avant le 2 novembre, dont des captures avaient avancé le curseur : l’export d’après repart de son import", async () => {
    /* L’ancien code : une capture du 15 mars avait posé le curseur au 15 (une capture n’a pas de secondes) */
    const id = await convDAvant(Date.UTC(2026, 2, 15, 9, 10));
    const exporte = await depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    expect(exporte.messages).toBe(3);
  });

  it("une conv lue avant le 2 novembre dont un export ajouté a posé le curseur (à la seconde) : il est gardé", async () => {
    const id = await convDAvant(Date.UTC(2026, 2, 15, 9, 10, 42));
    await expect(depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` })).rejects.toMatchObject({ code: "rien_de_neuf" });
  });

  it("un export sans rien de neuf (des captures avaient tout apporté) est noté quand même : son curseur, ses messages à la minute", async () => {
    const id = await convLue();
    const exporte = await depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` });
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout: exporte, affiche: resumeAjout(exporte, "export", 1) });
    const ajout = await avecFactice(lireCapture15, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "captures", 1) });
    const complet = `${texte01}\n${suite}\n[15/03/2026 09:10:12] Sophie: bien dormi ?\n[15/03/2026 09:12:40] Hugo: oui et toi`;
    await expect(depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: complet })).rejects.toMatchObject({ code: "rien_de_neuf" });
    const c = contexteDe(await ligneEnBase(id))!;
    expect(c.dernier).toBe(Date.UTC(2026, 2, 15, 9, 12, 40));
    expect(
      lireLus(c.lus)!
        .slice(-2)
        .map((e) => e.heure),
    ).toEqual(["exacte", "exacte"]);
  });

  it("ce qu’un ajout fait lire s’écrit avec l’échange, sous le même verrou : si ça échoue, l’échange n’est pas retenu (H2)", async () => {
    const id = await convLue();
    const taches = async () =>
      (
        await db()
          .select({ id: schema.tasks.id })
          .from(schema.tasks)
          .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")))
      ).length;
    const avant = await taches();
    const echec = async () => {
      throw new Error("échec de la note");
    };
    await expect(retenir(id, { date: "2026-03-15", dit: "test", reponse: [] }, { neuf: true, maintenant: false, ensuite: echec })).rejects.toThrow("échec de la note");
    expect(await taches()).toBe(avant);
  });

  it("une date lue dans le futur ne fige pas ce qui est lu : la capture d’aujourd’hui reste nouvelle", async () => {
    const id = await convLue();
    const futur = captures({ autre: "Sophie", blocs: [{ repere: { date: "2099-12-31", heure: "08:15" }, messages: [msg("autre", "bien rentré ?"), msg("moi", "oui")] }] });
    const ajout = await avecFactice(lireAvec(futur), async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    await repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "captures", 1) });
    expect(contexteDe(await ligneEnBase(id))!.vuJusqua).toBeLessThan(Date.UTC(2099, 0, 1));
    const aujourdhui = jourDans("Europe/Paris", new Date());
    const ce = captures({ autre: "Sophie", blocs: [{ repere: { date: aujourdhui, heure: "00:01" }, messages: [msg("autre", "tu fais quoi samedi ?")] }] });
    const suivant = await avecFactice(lireAvec(ce), async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    expect([suivant.messages, suivant.rappel]).toEqual([1, 0]);
  });

  /** Le texte de la dernière requête au chat parmi `requetes`. */
  const texteDuChat = (requetes: Requete[]) =>
    requetes
      .filter((r) => r.tache === "10-chat")
      .at(-1)!
      .blocs.flatMap((b) => ("texte" in b ? [b.texte] : []))
      .join("\n");

  it("un échange plus ancien qu’il remontre sans un mot : « ça veut dire quoi ? », sans réponse à lui écrire", async () => {
    const id = await convLue();
    /* Une capture du 5 mars, avant la fin de la conv lue (le 12) et absente d’elle : rien de neuf, un rappel */
    const capture5 = captures({
      autre: "Sophie",
      blocs: [{ repere: { date: "2026-03-05", heure: "21:10" }, messages: [msg("autre", "t’as pensé à moi ?"), msg("moi", "grave")] }],
    });
    const requetes: Requete[] = [];
    const lire = (req: Requete) => (requetes.push(req), req.tache === "01-captures" ? capture5 : fournisseurFactice(req));
    const ajout = await avecFactice(lire, async () => depuisCaptures(await ligneEnBase(id), (await memoireDe(id))!, [image]));
    expect([ajout.messages, ajout.rappel]).toEqual([0, 2]);
    await avecFactice(lire, async () => repondre(await ligneEnBase(id), (await memoireDe(id))!, "", { ajout, affiche: resumeAjout(ajout, "captures", 1) }));
    expect(texteDuChat(requetes)).toMatch(/^Hugo \(à toi\) : ça veut dire quoi \?$/m);
    /* La mémoire, elle, ne l’avait pas lu : elle le reçoit, compté comme un échange plus ancien */
    const retenus = (
      await db()
        .select({ input: schema.tasks.input })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")))
    ).flatMap((t) => (t.input ? coffre.lire("tasks.input", t.input) : []));
    expect(retenus.find((e) => e.rappel)).toMatchObject({ rappel: 2, lignes: ajout.lignes });
  });

  it("le fuseau du téléphone : la conv le garde à l’import (Paris à défaut), le chat compte son « aujourd’hui » à son heure", async () => {
    const lu = { appli: "whatsapp" as const, nom: "Discussion WhatsApp avec Léa.txt", texte: "[05/09/2026 10:00:00] Tom: salut\n[05/09/2026 10:01:00] Léa: hello" };
    const ici = await importer({ ...lu, fuseau: "America/Martinique" }, accordDeTest());
    const sans = await importer(lu, accordDeTest());
    creees.histoires.push(ici.id, sans.id);
    expect(fuseauDe(metaDe(await ligneEnBase(ici.id)))).toBe("America/Martinique");
    expect(fuseauDe(metaDe(await ligneEnBase(sans.id)))).toBe("Europe/Paris");

    /*
     * Un téléphone dont le jour n’est pas celui de Paris, à l’heure où le test passe : Kiritimati (UTC+14) a déjà changé
     * de jour l’après-midi à Paris, Pago Pago (UTC−11) pas encore le matin ; l’un des deux, toujours
     */
    const id = await convLue();
    const requetes: Requete[] = [];
    const avant = new Date();
    const fuseau = ["Pacific/Kiritimati", "Pacific/Pago_Pago"].find((f) => jourDans(f, avant) !== jourDans("Europe/Paris", avant))!;
    await avecFactice(
      (req) => (requetes.push(req), fournisseurFactice(req)),
      async () => repondre(await ligneEnBase(id), (await memoireDe(id))!, "salut", undefined, { fuseau }),
    );
    const apres = new Date();
    const jour = /^aujourd’hui : (\d{4}-\d{2}-\d{2})/m.exec(texteDuChat(requetes))?.[1];
    expect([jourDans(fuseau, avant), jourDans(fuseau, apres)]).toContain(jour);
    /* Sauf s’il a passé minuit à Paris pendant l’appel : le jour de Paris a pu rejoindre celui du téléphone */
    if (jourDans("Europe/Paris", avant) === jourDans("Europe/Paris", apres)) expect(jour).not.toBe(jourDans("Europe/Paris", avant));
  });
});
