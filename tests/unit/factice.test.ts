import { APIUserAbortError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
/* Le budget de l’IA lit la base : ici, sans base, tout le monde paie, personne n’est arrêté */
vi.mock("@/server/budget", () => ({ controlerBudget: async () => null }));
import type { Requete } from "@prompts/lib/contextes";
import { Etape05, Maj07, Sortie01, Sortie04, Sortie05, Sortie06, Sortie07, Sortie10 } from "@prompts/lib/schemas";
import { appeler } from "@/server/ia/claude";
import { FACTICE, fournisseurFactice, iaFactice, REFUS_FACTICE, type EtapeDuModele, type RequeteFactice } from "@/server/ia/factice";
import { ALERTE_FACTICE, REFUS_FACTICE as REFUS_DES_E2E } from "../e2e/aide/exports";

/*
 * Le modèle factice (src/server/ia/factice.ts), sans base : chacune de ses sorties passe le schéma de sa tâche (sinon
 * appeler la rejouerait en silence, comme une sortie illisible), et l’étape demandée lui arrive par appeler, pas par le
 * libellé de la demande. Les conv sont inventées : douze lignes au format de la conversation.
 */

const LIGNES = Array.from({ length: 12 }, (_, k) => `m${String(k + 1).padStart(4, "0")} 2026-09-0${1 + (k % 9)} mar. 20:${String(10 + k).padStart(2, "0")} ${k % 2 ? "Inès" : "Hugo"} : message ${k + 1}`);
const CONV = LIGNES.join("\n");
const IDS = new Set(LIGNES.map((l) => l.slice(0, 5)));

/** Une requête d’une tâche, sur la conv inventée, avec une demande en dernier bloc. */
const requete = (tache: Requete["tache"], demande = "La demande.", conv = CONV): Requete => ({ tache, blocs: [{ texte: conv, cache: true }, { texte: demande }] });
const avec = (req: Requete, etape: EtapeDuModele): RequeteFactice => ({ ...req, etape });

/** Les identifiants cités, où qu’ils soient dans la sortie : tous existent dans la conv. */
const cites = (sortie: unknown): string[] => JSON.stringify(sortie).match(/"m\d{4}"/g)?.map((m) => m.slice(1, -1)) ?? [];

describe("le modèle factice : des sorties qui passent leur schéma", () => {
  const CAS: [quoi: string, req: RequeteFactice, schema: z.ZodType][] = [
    ["la lecture de captures", { tache: "01-captures", blocs: [{ texte: "<histoire>\naujourd’hui : mer. 2026-09-09\n</histoire>" }, { image: { media: "image/png", base64: "AA==" } }] }, Sortie01],
    ["le verdict", requete("04-verdict"), Sortie04],
    ["le verdict d’une alerte", requete("04-verdict", "La demande.", `${CONV}\n${FACTICE.alerte}`), Sortie04],
    ["le plan du rapport", avec(requete("05-rapport"), "plan"), Etape05],
    ["les chapitres 1 à 4", avec(requete("05-rapport"), "chapitres 1 à 4"), Etape05],
    ["les chapitres 5 à 8", avec(requete("05-rapport"), "chapitres 5 à 8"), Etape05],
    ["le rapport sobre d’une alerte", requete("05-rapport", `${CONV}\n${FACTICE.alerte}`), Sortie05],
    ["le vocal", requete("06-vocal"), Sortie06],
    ["la création de la mémoire", requete("07-memoire"), Sortie07],
    ["la mise à jour de la mémoire", avec(requete("07-memoire", "m0013 2026-09-10 jeu. --:-- profil de Inès : Étudiante\nMoment : la mise à jour."), "mise à jour"), Maj07],
    ["le chat", requete("10-chat", "Hugo (à toi) : je lui envoie quoi ?"), Sortie10],
  ];

  it.each(CAS)("%s", (_, req, schema) => {
    const sortie = fournisseurFactice(req);
    expect(schema.safeParse(sortie).error).toBeUndefined();
    /* Ses preuves sont de vrais identifiants de la conv (ou la ligne de profil de la demande) */
    for (const id of cites(sortie)) expect(IDS.has(id) || id === "m0013").toBe(true);
  });

  it("l’étape choisit la sortie : le plan, chaque moitié, la mise à jour (sans elle, les chapitres 5 à 8 et la création)", () => {
    const rapport = requete("05-rapport", "Étape : le plan. Remplis seulement `plan`.");
    /* Le libellé de la demande ne compte plus : seule l’étape */
    expect(Etape05.parse(fournisseurFactice(rapport)).plan).toBeNull();
    expect(Etape05.parse(fournisseurFactice(avec(rapport, "plan"))).plan?.chapitres).toHaveLength(8);
    expect(Etape05.parse(fournisseurFactice(avec(rapport, "chapitres 1 à 4"))).chapitres?.map((c) => c.numero)).toEqual([1, 2, 3, 4]);
    expect(Etape05.parse(fournisseurFactice(avec(rapport, "chapitres 5 à 8"))).chapitres?.map((c) => c.numero)).toEqual([5, 6, 7, 8]);
    expect(Etape05.parse(fournisseurFactice(rapport)).chapitres?.map((c) => c.numero)).toEqual([5, 6, 7, 8]);
    const memoire = requete("07-memoire", "Moment : la mise à jour.");
    expect(Sortie07.safeParse(fournisseurFactice(memoire)).success).toBe(true);
    expect(Maj07.parse(fournisseurFactice(avec(memoire, "mise à jour"))).faits_ajoutes[0]).toMatchObject({ section: "notes" });
  });

  it("la ligne de profil d’une mise à jour devient une info de sa fiche, avec sa preuve", () => {
    const maj = Maj07.parse(fournisseurFactice(avec(requete("07-memoire", "m0013 2026-09-10 jeu. --:-- profil de Inès : Étudiante en droit\nMoment : la mise à jour."), "mise à jour")));
    expect(maj.faits_ajoutes).toContainEqual({ section: "infos", texte: "Étudiante en droit", preuves: ["m0013"] });
  });

  it("les déclencheurs : le refus du verdict, le refus du chat (dans son dernier message seulement)", () => {
    expect(fournisseurFactice(requete("04-verdict", "La demande.", `${CONV}\n${FACTICE.refus}`))).toBe(REFUS_FACTICE);
    expect(fournisseurFactice(requete("10-chat", `Hugo (à toi) : ${FACTICE.refus} tu lis ses messages ?`))).toBe(REFUS_FACTICE);
    expect(fournisseurFactice(requete("10-chat", `Hugo (à toi) : ${FACTICE.refus}\nHugo (à toi) : et sinon ?`))).not.toBe(REFUS_FACTICE);
  });

  it("les déclencheurs des tests de bout en bout sont les mêmes textes", () => {
    expect(ALERTE_FACTICE).toBe(FACTICE.alerte);
    expect(REFUS_DES_E2E).toBe(FACTICE.refus);
  });
});

describe("appeler en mode factice", () => {
  it("est le mode des tests (BLUSH_IA_FACTICE=1, vitest.config.mts)", () => {
    expect(iaFactice()).toBe(true);
  });

  it("passe l’étape au modèle factice : le plan, puis une moitié", async () => {
    const req = requete("05-rapport");
    expect((await appeler(req, Etape05, { etape: "plan" })).sortie?.plan).not.toBeNull();
    expect((await appeler(req, Etape05, { etape: "chapitres 1 à 4" })).sortie?.chapitres?.[0].numero).toBe(1);
  });

  it("un appel déjà arrêté lève l’erreur d’abandon du SDK, comme en vrai", async () => {
    const abandon = new AbortController();
    abandon.abort();
    await expect(appeler(requete("04-verdict"), Sortie04, { signal: abandon.signal })).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it("une sortie qui ne passe pas son schéma n’est pas une sortie", async () => {
    expect((await appeler(requete("04-verdict"), z.object({ autre: z.string() }))).sortie).toBeNull();
  });
});
