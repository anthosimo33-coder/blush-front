import { describe, expect, it } from "vitest";
import { appliquerMaj, noterAlerteDuChat, origineDeLAlerte } from "@prompts/lib/memoire";
import { Sortie04, Sortie05, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { memoireDeSecours, remplacerLeSecours } from "@/server/secours";
import type { DonneesMemoire } from "@/server/stockage/types";
import { chapitre, maj, memoire } from "../aide/fabriques";

/*
 * La mémoire de secours (src/server/secours.ts) : ce que le chat lit quand la vraie mémoire manque, tiré du verdict et du
 * rapport sans appel au modèle, puis remplacé par la vraie. Sans la base. Les textes sont inventés.
 */

const verdict = (v: Partial<Verdict> = {}): Verdict =>
  Sortie04.parse({
    alerte: null,
    mode_sobre: false,
    emoji: "🔥",
    court: "Elle te teste, et elle aime ça.",
    titre: "Ça chauffe",
    sous_titre: null,
    preuves: ["m0003", "m9999"],
    confiance: "probable",
    confiance_texte: null,
    niveau: "voit",
    niveau_pourquoi: "Vus deux fois.",
    tendance: "↗",
    prochain_pas: "Propose-lui un verre jeudi.",
    devinette: null,
    titres: null,
    ...v,
  });

const item = (i: { titre?: string; texte?: string; quand?: string; cote?: "toi" | "autre"; preuves?: string[] }) => ({
  titre: i.titre ?? null,
  texte: i.texte ?? null,
  quand: i.quand ?? null,
  tag: null,
  cote: i.cote ?? null,
  preuves: i.preuves ?? [],
});

const rapport = (r: Partial<Rapport> = {}): Rapport =>
  Sortie05.parse({
    alerte: null,
    mode_sobre: false,
    decouvertes: [],
    these: "Une drague lente, qu’elle mène.",
    chapitres: [
      chapitre(1, {
        blocs: [
          {
            type: "frise",
            texte: null,
            preuves: [],
            titre: null,
            niveau: null,
            items: [item({ titre: "Premier verre", quand: "21 avril", preuves: ["m0003"] }), item({ texte: "sans date" })],
          },
          {
            type: "duo",
            texte: null,
            preuves: [],
            titre: null,
            niveau: null,
            items: [item({ texte: "Elle relance quand tu te tais.", cote: "autre", preuves: ["m0005", "m8888"] }), item({ texte: "Tu réponds vite.", cote: "toi" })],
          },
        ],
      }),
    ],
    sobre: null,
    ...r,
  });

const LIGNES = new Map([
  ["m0003", "Elle : on se voit ?"],
  ["m0005", "Elle : t’es où ?"],
  ["m0007", "Toi : rien à voir"],
]);

describe("la mémoire de secours", () => {
  it("se tire du verdict et du rapport : où ils en sont, les moments, leurs manières, le prochain pas, le niveau", () => {
    const m = memoireDeSecours({ verdict: verdict(), rapport: rapport(), lignes: LIGNES, suivant: 42, jour: "2026-10-13" });
    expect(m.secours).toBe(true);
    expect(m.suivant).toBe(42);
    expect(m.etat.memoire.ou_on_en_est).toBe("Une drague lente, qu’elle mène. Elle te teste, et elle aime ça. ↗");
    expect(m.etat.memoire.moments).toEqual([{ quand: "21 avril", quoi: "Premier verre", preuves: ["m0003"] }]);
    /* Une preuve qui n’est pas dans la conv tombe */
    expect(m.etat.memoire.son_mode).toEqual([{ texte: "Elle relance quand tu te tais.", preuves: ["m0005"] }]);
    expect(m.etat.memoire.ton_mode).toEqual([{ texte: "Tu réponds vite.", preuves: [] }]);
    expect(m.etat.memoire.conseils).toEqual([{ quand: "2026-10-13", conseil: "Propose-lui un verre jeudi.", suite: "en_attente", resultat: null }]);
    expect(m.etat.niveau).toEqual({ niveau: "voit", tendance: "↗", pourquoi: "Vus deux fois.", preuves: ["m0003"] });
    /* Sa fiche reste vide : le verdict parle d’eux deux, pas d’elle */
    expect(m.etat.fiche).toEqual({ portrait: "", phrase: "", phrase_courte: "", faits: [] });
    /* La banque de messages : ceux qu’elle cite, une fois chacun */
    expect(m.lignes).toEqual([
      ["m0003", "Elle : on se voit ?"],
      ["m0005", "Elle : t’es où ?"],
    ]);
  });

  it("sans rapport encore (débloqué, en train de s’écrire), ni conv : le verdict seul, sans citation", () => {
    const m = memoireDeSecours({ verdict: verdict({ tendance: null, prochain_pas: null }), rapport: null, lignes: new Map(), suivant: 1, jour: "2026-10-13" });
    expect(m.etat.memoire.ou_on_en_est).toBe("Elle te teste, et elle aime ça.");
    expect(m.etat.memoire.moments).toEqual([]);
    expect(m.etat.memoire.conseils).toEqual([]);
    expect(m.etat.niveau?.preuves).toEqual([]);
    expect(m.lignes).toEqual([]);
  });

  it("garde l’alerte du verdict ou du rapport, la règle de l’âge d’abord : un rapport en « detresse » ne cache pas un verdict « mineur »", () => {
    const sources = { lignes: LIGNES, suivant: 1, jour: "2026-10-13" };
    expect(memoireDeSecours({ ...sources, verdict: verdict({ alerte: "danger" }), rapport: null }).etat.alerte).toBe("danger");
    expect(memoireDeSecours({ ...sources, verdict: verdict(), rapport: rapport({ alerte: "detresse" }) }).etat.alerte).toBe("detresse");
    expect(memoireDeSecours({ ...sources, verdict: verdict({ alerte: "mineur", mode_sobre: true }), rapport: rapport({ alerte: "detresse" }) }).etat.alerte).toBe("mineur");
    expect(memoireDeSecours({ ...sources, verdict: verdict({ alerte: "detresse" }), rapport: rapport({ alerte: "mineur" }) }).etat.alerte).toBe("mineur");
    expect(memoireDeSecours({ ...sources, verdict: verdict(), rapport: rapport() }).etat.alerte).toBeNull();
  });
});

describe("la vraie mémoire, à la place de celle de secours", () => {
  type Fait = DonneesMemoire["etat"]["fiche"]["faits"][number];
  const fait = (texte: string): Fait => ({ section: "infos", texte, preuves: [], statut: "garde" });
  const reelle: DonneesMemoire = {
    etat: memoire({ fiche: { faits: [fait("Elle fait du piano"), fait("Elle a un chat")] } }),
    lignes: [["m0003", "Elle : on se voit ?"]],
    suivant: 30,
  };

  it("prend toute la place quand il n’a rien corrigé, sans faire reculer le prochain identifiant", () => {
    const secours = memoireDeSecours({ verdict: verdict(), rapport: null, lignes: LIGNES, suivant: 35, jour: "2026-10-13" });
    expect(remplacerLeSecours(secours, reelle)).toEqual({ ...reelle, suivant: 35 });
  });

  it("garde ce qu’il a corrigé dans sa fiche entre-temps : ses faits ajoutés, sans ceux qu’il a retirés", () => {
    const base = memoireDeSecours({ verdict: verdict(), rapport: null, lignes: LIGNES, suivant: 1, jour: "2026-10-13" });
    const secours: DonneesMemoire = {
      ...base,
      etat: { ...base.etat, fiche: { ...base.etat.fiche, faits: [fait("Elle part à Lyon"), fait("Elle a un chat")] } },
      editions: { parToi: ["Elle part à Lyon", "Elle a un chat"], supprimees: ["Elle fait du piano"] },
    };
    const m = remplacerLeSecours(secours, reelle);
    expect(m.secours).toBeUndefined();
    expect(m.etat.fiche.faits.map((f) => f.texte)).toEqual(["Elle a un chat", "Elle part à Lyon"]);
    expect(m.editions).toEqual(secours.editions);
    expect(m.etat.memoire).toEqual(reelle.etat.memoire);
  });

  /*
   * L’alerte de la mémoire de secours (du verdict, ou notée par une réponse du chat) reste quand la vraie la remplace
   * sans l’avoir lue, la règle de l’âge d’abord (reunirLesAlertes)
   */
  it("garde l’alerte de la mémoire de secours, celle que le chat y a notée comprise, sans cacher la règle de l’âge", () => {
    const base = memoireDeSecours({ verdict: verdict(), rapport: null, lignes: LIGNES, suivant: 1, jour: "2026-10-13" });
    const enAlerte = (alerte: DonneesMemoire["etat"]["alerte"]): DonneesMemoire => ({ ...base, etat: { ...base.etat, alerte } });
    const reelleEn = (alerte: DonneesMemoire["etat"]["alerte"]): DonneesMemoire => ({ ...reelle, etat: { ...reelle.etat, alerte } });
    expect(remplacerLeSecours(enAlerte("mineur"), reelle).etat.alerte).toBe("mineur");
    expect(remplacerLeSecours(enAlerte("danger"), reelleEn("detresse")).etat.alerte).toBe("danger");
    expect(remplacerLeSecours(enAlerte(null), reelleEn("danger")).etat.alerte).toBe("danger");
    /* Avec ses corrections de fiche aussi */
    const corrigee = { ...enAlerte("mineur"), editions: { parToi: [], supprimees: [] } };
    expect(remplacerLeSecours(corrigee, reelleEn("detresse")).etat.alerte).toBe("mineur");
    /* Sans alerte de part et d’autre : la vraie, telle quelle */
    expect(remplacerLeSecours(enAlerte(null), reelle).etat).toEqual(reelle.etat);
  });

  /*
   * Une alerte qu’une réponse du chat a notée pendant le secours (noterAlerteDuChat) reste à trancher : la vraie mémoire,
   * qui ne l’a pas lue, ne la confirme pas ; la mise à jour suivante la confirmera ou l’effacera, et celle de la lecture
   * reste dessous
   */
  it("garde à trancher l’alerte venue du chat pendant le secours, la sienne lue dessous", () => {
    const base = memoireDeSecours({ verdict: verdict(), rapport: null, lignes: LIGNES, suivant: 1, jour: "2026-10-13" });
    const vue = { ...base, etat: noterAlerteDuChat(base.etat, "mineur") };
    const reelleEn = (alerte: DonneesMemoire["etat"]["alerte"]): DonneesMemoire => ({ ...reelle, etat: { ...reelle.etat, alerte } });
    expect(origineDeLAlerte(vue.etat)).toBe("chat");
    for (const lue of [null, "detresse", "danger"] as const) {
      const m = remplacerLeSecours(vue, reelleEn(lue));
      expect(m.etat.alerte).toBe("mineur");
      expect(origineDeLAlerte(m.etat)).toBe("chat");
      /* Effacée par la mise à jour : il reste l’alerte de la vraie mémoire */
      expect(appliquerMaj(m.etat, maj({ alerte_du_chat: "effacee" })).alerte).toBe(lue);
    }
    /* Une alerte de la lecture des deux côtés reste lue */
    const lue = { ...base, etat: { ...base.etat, alerte: "detresse" as const } };
    expect(remplacerLeSecours(lue, reelleEn("danger")).etat).toMatchObject({ alerte: "danger" });
    expect(origineDeLAlerte(remplacerLeSecours(lue, reelleEn("danger")).etat)).toBe("lecture");
  });
});
