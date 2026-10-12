import { beforeAll, describe, expect, it, vi } from "vitest";
import { blocAjout, messagesDeLExport, messagesDesCaptures, numeroter, type Ajout } from "@prompts/lib/ajouts";
import type { Message } from "@prompts/lib/conv";
import type { Requete } from "@prompts/lib/contextes";
import { estLigneProfil } from "@prompts/lib/ligne";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import { ajouterALaFiche, depuisCaptures, depuisExport, majEnCours, resumeAjout } from "@/server/ajouts";
import { repondre } from "@/server/chat";
import { historique } from "@/server/historique";
import { ficheDe, memoireDe } from "@/server/donnees";
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
import { avecFactice, compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

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
  return m;
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
    expect(blocAjout(a, 2)[0]).toBe("[… 1 messages plus anciens …]");
    expect(resumeAjout(a, "captures", 2)).toBe("(2 captures\u00a0: 3 nouveaux messages, son profil)");

    /* À l’affichage : son profil n’est pas une bulle, mais il est la source d’une info de sa fiche */
    const lignes = new Map(a.lignes.map((l) => [l.slice(0, 5), l]));
    expect(messagesAffiches(lignes, "Hugo").has("m1077")).toBe(false);
    expect(messagesAffiches(lignes, "Hugo").get("m1076")).toMatchObject({ from: "elle", caption: "Sophie · 14/03 18:40" });
    const etat = memoire({ fiche: { faits: [{ section: "infos", texte: "24 ans", preuves: ["m1077"], statut: "nouveau" }] } });
    expect(faitsAffiches(etat, lignes)[0]).toMatchObject({ sourceLabel: "son profil · 15 mars", sources: ["capture"] });
  });

  it("des captures : ce qui est avant le dernier message lu ne revient pas (le jour même, on garde)", () => {
    const c = captures({
      autre: "Sophie",
      blocs: [
        { repere: { date: "2026-03-10", heure: "09:00" }, messages: [msg("autre", "vieux")] },
        { repere: { date: "2026-03-12", heure: "23:30" }, messages: [msg("moi", "le soir même")] },
        { repere: { date: "2026-03-14", heure: "18:40" }, messages: [msg("autre", "ça va mieux")] },
      ],
    });
    expect(messagesDesCaptures(c, h, { aujourdhui: "2026-03-15", apres: fin01 }).map((m) => [m.role, m.texte])).toEqual([
      ["toi", "le soir même"],
      ["autre", "ça va mieux"],
    ]);
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
    expect(majMemoire).toBe(true);
    const chat = derniere("10-chat");
    expect(chat).toContain(`→ ${ajout.lignes[2]}`);
    expect(chat).toContain("Hugo (à toi) : ça veut dire quoi ? je lui réponds quoi ?");
    expect((await historique(id)).echanges.at(-1)?.mine).toBe("(ton export\u00a0: 3 nouveaux messages)");

    await executerChaine(id);
    expect(derniere("07-memoire")).toContain(`ajouté à la conv :\n${ajout.lignes.join("\n")}`);

    /* Le même export, renvoyé : le curseur a avancé, rien de neuf */
    await expect(depuisExport(await ligneEnBase(id), (await memoireDe(id))!, { appli: "whatsapp", texte: `${texte01}\n${suite}` })).rejects.toMatchObject({ code: "rien_de_neuf" });
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
