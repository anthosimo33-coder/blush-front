import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAS_DE_REPONSE } from "@/app/apercu/demander/bornes";
import { POST } from "@/app/apercu/demander/route";

/*
 * Le vrai chat de l’aperçu (src/app/apercu/demander/route.ts), outil de l’équipe en local : il appelle le vrai modèle
 * avec la clé du poste. Il ne répond qu’à ce poste (l’hôte demandé, et l’origine de la page), et refuse une question ou
 * un fil hors bornes avant de rien lancer. Sa configuration (BLUSH_DEMANDER) pointe ici un faux lanceur, écrit dans un
 * dossier temporaire : il rend, comme le vrai, une ligne `@@BLUSH@@` suivie de sa réponse, ici les arguments et la clé
 * qu’il a reçus. Le contrôle d’hôte n’arrête que les navigateurs (src/lib/hote-local.ts) : un client qui écrit ses
 * en-têtes passe, d’où l’écoute sur ce poste seulement (scripts/developper.mjs).
 */
let dossier: string;

/** Le faux lanceur des prompts : ce qu’il a reçu, en réponse. */
const LANCEUR = `console.log("du bruit avant");
console.log("@@BLUSH@@" + JSON.stringify({ kind: "bubbles", bubbles: [], args: process.argv.slice(2), cle: process.env.ANTHROPIC_API_KEY }));`;

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
function demande(corps: unknown, { hote = "localhost:3000", origine = `http://${hote}`, entetes = {} }: { hote?: string; origine?: string; entetes?: Record<string, string> } = {}) {
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

  it("une demande de ce poste : le lanceur reçoit la question rognée, le fil et la clé, et sa réponse revient telle quelle", async () => {
    const history = [
      { from: "toi", text: "elle pense quoi ?" },
      { from: "blush", text: "elle hésite / on se voit ?" },
    ];
    const r = await POST(demande({ text: "  et là ?  ", history }, { hote: "127.0.0.1:3000" }));
    expect(r.status).toBe(200);
    const { args, cle } = (await r.json()) as { args: string[]; cle: string };
    expect(args.slice(0, 5)).toEqual(["10", "--cas-perso", "cas.json", "--memoire", "memoire.json"]);
    expect(args[args.indexOf("--demande") + 1]).toBe("et là ?");
    expect(JSON.parse(args[args.indexOf("--historique") + 1])).toEqual(history);
    expect(cle).toBe("une-cle-de-test");
  });

  it("sans fil, il part vide ; un lanceur qui ne répond pas : BLUSH le dit, en 200", async () => {
    const { args } = (await (await POST(demande({ text: "salut" }))).json()) as { args: string[] };
    expect(JSON.parse(args[args.indexOf("--historique") + 1])).toEqual([]);
    configurer("absent.mjs");
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await POST(demande({ text: "salut" }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual(PAS_DE_REPONSE);
      expect(erreur).toHaveBeenCalled();
    } finally {
      erreur.mockRestore();
    }
  });
});
