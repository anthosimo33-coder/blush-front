import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAS_DE_REPONSE } from "@/app/apercu/demander/bornes";
import { POST } from "@/app/apercu/demander/route";
import type { BlushAnswer } from "@/types";

/*
 * Le vrai chat de l’aperçu (src/app/apercu/demander/route.ts), outil de l’équipe en local : il appelle le vrai modèle
 * avec la clé du poste. Il ne répond qu’à ce poste (l’hôte demandé, et l’origine de la page), et refuse une question ou
 * un fil hors bornes avant de rien lancer. Sa configuration (BLUSH_DEMANDER) pointe ici un faux lanceur, écrit dans un
 * dossier temporaire : il rend, comme le vrai, une ligne `@@BLUSH@@` suivie de sa réponse brute (ReponseDemandee,
 * prompts/lib/apercu.ts), dont la bulle dit les arguments et la clé qu’il a reçus ; la route la met en bulles comme
 * l’appli (src/server/ecrans). Des exemples inventés : Tom demande, Léa a écrit. Le contrôle d’hôte n’arrête que les navigateurs (src/lib/hote-local.ts) : un client qui écrit ses
 * en-têtes passe, d’où l’écoute sur ce poste seulement (scripts/developper.mjs).
 */
let dossier: string;

/**
 * Le code de la réponse d’un faux lanceur (ReponseDemandee) : une bulle du chat (prompt 10) qui cite le message m0001,
 * et dont le texte est l’expression `texte` ; « null » : pas de sortie lisible.
 */
const reponse = (texte: string) => `{
  prenom: "Tom",
  sortie: ${texte} === null ? null : { alerte: null, type: "question", coup: null, mode: "jeu", confiance: "probable", lecture: [{ texte: ${texte}, preuves: ["m0001"] }], a_envoyer: null, question: null, reaction: null, pourquoi: null, niveau_atteint: null, mode_vocal: null, dit: null, moment: "aucun", prenom_autre: null },
  lignes: [["m0001", "m0001 2026-03-02 lun. 23:41 Léa : on se voit samedi ?"]],
}`;
/** Le faux lanceur des prompts : ce qu’il a reçu (ses arguments, la clé), dans sa bulle. */
const LANCEUR = `console.log("du bruit avant");
console.log("@@BLUSH@@" + JSON.stringify(${reponse("JSON.stringify({ args: process.argv.slice(2), cle: process.env.ANTHROPIC_API_KEY })")}));`;
/** Ce que le faux lanceur a reçu, relu dans la bulle de la réponse. */
const recu = async (r: Response) => JSON.parse(((await r.json()) as BlushAnswer).bubbles[0]!.text) as { args: string[]; cle: string };

/** La configuration de l’aperçu, son lanceur `lanceur` (un fichier du dossier temporaire). */
function configurer(lanceur: string) {
  const config = join(dossier, "config.json");
  writeFileSync(config, JSON.stringify({ lanceur: join(dossier, lanceur), cas: "cas.json", memoire: "memoire.json", cle: join(dossier, "cle") }));
  vi.stubEnv("BLUSH_DEMANDER", config);
}

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "blush-demander-"));
  writeFileSync(join(dossier, "lanceur.mjs"), LANCEUR);
  writeFileSync(join(dossier, "cle"), "une-cle-de-test\n");
  configurer("lanceur.mjs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dossier, { recursive: true, force: true });
});

/** Une demande de la page de l’aperçu, servie sous `hote` (son origine la suit, sauf `origine` donnée). */
function demande(
  corps: unknown,
  { hote = "localhost:3000", origine = `http://${hote}`, entetes = {} }: { hote?: string; origine?: string; entetes?: Record<string, string> } = {},
) {
  return new Request(`http://${hote}/apercu/demander`, {
    method: "POST",
    headers: { host: hote, origin: origine, "content-type": "application/json", ...entetes },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

const statut = async (req: Request) => (await POST(req)).status;

describe("/apercu/demander : ce poste seulement", () => {
  it("sans BLUSH_DEMANDER, il n’existe pas", async () => {
    vi.stubEnv("BLUSH_DEMANDER", "");
    expect(await statut(demande({ text: "salut" }))).toBe(404);
  });

  it("un navigateur qui demande un autre hôte (un appareil du Wi-Fi, un domaine qui pointe sur le poste) : refusé", async () => {
    expect(await statut(demande({ text: "salut" }, { hote: "192.168.1.20:3000" }))).toBe(403);
    expect(await statut(demande({ text: "salut" }, { hote: "mon-mac.local:3000" }))).toBe(403);
    /* DNS rebinding : la page et l’hôte demandé sont du même site, qui n’est pas ce poste */
    expect(await statut(demande({ text: "salut" }, { hote: "attaquant.example:3000" }))).toBe(403);
    /* Derrière un relais qui dit un autre hôte */
    expect(await statut(demande({ text: "salut" }, { entetes: { "x-forwarded-host": "attaquant.example" } }))).toBe(403);
  });

  it("une page d’un autre site, même sur ce poste : refusé", async () => {
    expect(await statut(demande({ text: "salut" }, { origine: "https://attaquant.example" }))).toBe(403);
  });

  it("une question vide, trop longue, ou un fil trop long ou mal formé : 400, rien ne part", async () => {
    for (const hote of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) expect(await statut(demande({ text: "   " }, { hote }))).toBe(400);
    expect(await statut(demande({ text: "a".repeat(4001) }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: Array.from({ length: 7 }, () => ({ from: "toi", text: "et là ?" })) }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: [{ from: "elle", text: "coucou" }] }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: [{ from: "blush", text: "a".repeat(4001) }] }))).toBe(400);
    expect(await statut(demande("pas du json"))).toBe(400);
  });

  it("une demande de ce poste : le lanceur reçoit la question rognée, le fil et la clé, et sa réponse revient en bulles", async () => {
    const history = [
      { from: "toi", text: "elle pense quoi ?" },
      { from: "blush", text: "elle hésite / on se voit ?" },
    ];
    const r = await POST(demande({ text: "  et là ?  ", history }, { hote: "127.0.0.1:3000" }));
    expect(r.status).toBe(200);
    const { args, cle } = await recu(r.clone());
    /* Le message cité, comme l’appli le montre : de l’autre, daté */
    expect(((await r.json()) as BlushAnswer).bubbles[0]!.messages).toEqual([{ from: "elle", text: "on se voit samedi ?", caption: "Léa · 02/03 23:41" }]);
    expect(args.slice(0, 5)).toEqual(["10", "--cas-perso", "cas.json", "--memoire", "memoire.json"]);
    expect(args[args.indexOf("--demande") + 1]).toBe("et là ?");
    expect(JSON.parse(args[args.indexOf("--historique") + 1]!)).toEqual(history);
    expect(cle).toBe("une-cle-de-test");
  });

  it("sans fil, il part vide ; un lanceur qui ne répond pas, ou sans réponse lisible : BLUSH le dit, en 200", async () => {
    const { args } = await recu(await POST(demande({ text: "salut" })));
    expect(JSON.parse(args[args.indexOf("--historique") + 1]!)).toEqual([]);
    writeFileSync(join(dossier, "muet.mjs"), `console.log("@@BLUSH@@" + JSON.stringify(${reponse("null")}));`);
    writeFileSync(join(dossier, "illisible.mjs"), `console.log("@@BLUSH@@{ pas du json");`);
    /* Un ancien lanceur (lancer.mjs), qui rendait la réponse déjà en bulles */
    writeFileSync(join(dossier, "ancien.mjs"), `console.log("@@BLUSH@@" + JSON.stringify({ kind: "bubbles", bubbles: [{ text: "salut" }] }));`);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const lanceur of ["absent.mjs", "muet.mjs", "illisible.mjs", "ancien.mjs"]) {
        configurer(lanceur);
        const r = await POST(demande({ text: "salut" }));
        expect(r.status, lanceur).toBe(200);
        expect(await r.json(), lanceur).toEqual(PAS_DE_REPONSE);
      }
      expect(erreur).toHaveBeenCalledTimes(4);
      /* Une réponse d’un autre format dit pourquoi : le lanceur à changer */
      expect(erreur.mock.calls.slice(2).map(([m]) => String(m).startsWith("format de lanceur inconnu"))).toEqual([true, true]);
    } finally {
      erreur.mockRestore();
    }
  });
});
