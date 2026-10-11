import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Les lignes du journal que laissent les pannes du serveur (src/server/journal.ts), là où une erreur s’écrivait avec son
 * message : un compteur que la base refuse (compteurs.ts), une transcription que le réseau coupe (ia/transcription.ts).
 * Sans base ni prestataire : la base rejette, le réseau aussi. Chaque ligne dit l’événement, le nom et le code de
 * l’erreur, jamais son message (qui cite un email).
 */
vi.mock("@/server/db", async (original) => ({
  ...(await original<typeof import("@/server/db")>()),
  db: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () =>
          Promise.reject(Object.assign(new Error("Failed query: insert into counters\nparams: lea@exemple.test"), { name: "DrizzleQueryError", cause: Object.assign(new Error("lea@exemple.test"), { code: "57P01" }) })),
      }),
    }),
  }),
}));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  /* iaFactice lit l’env() de son module, pas celui-ci : on le remplace aussi */
  return { ...o, env: () => ({ ...o.env(), BLUSH_IA_FACTICE: false, MISTRAL_API_KEY: "cle-fictive" }), iaFactice: () => false };
});

import { CLES, compter } from "@/server/compteurs";
import { ErreurTache } from "@/server/erreurs";
import { transcrire } from "@/server/ia/transcription";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Les lignes écrites par console.error pendant `f`, lues en JSON, et leur texte brut. */
async function lignesDe(f: () => Promise<unknown>): Promise<{ lignes: Record<string, unknown>[]; brut: string }> {
  const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
  await f();
  const brut = erreur.mock.calls.map((c) => String(c[0])).join("\n");
  return { lignes: erreur.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>), brut };
}

describe("les pannes du serveur, au journal", () => {
  it("un compteur que la base refuse : une ligne (la clé, le nom et le code de l’erreur), sans le message, et rien ne fait échouer l’appelant", async () => {
    const { lignes, brut } = await lignesDe(() => expect(compter(CLES.partageOuvert)).resolves.toBeUndefined());
    expect(lignes).toEqual([{ evenement: "compteur non noté", niveau: "erreur", cle: CLES.partageOuvert, erreur: "DrizzleQueryError", cause: "Error", codeCause: "57P01" }]);
    expect(brut).not.toContain("exemple.test");
  });

  it("une transcription que le réseau coupe : ErreurTache « transcription », et une ligne avec le nom et le code de la panne", async () => {
    const coupure = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ETIMEDOUT pour lea@exemple.test"), { code: "UND_ERR_CONNECT_TIMEOUT" }) });
    vi.stubGlobal("fetch", () => Promise.reject(coupure));
    const fichier = new File([new Uint8Array(8)], "vocal.webm", { type: "audio/webm" });
    let levee: unknown;
    const { lignes, brut } = await lignesDe(() => transcrire({ duree: 2, fichier }).catch((e: unknown) => (levee = e)));
    expect(levee).toBeInstanceOf(ErreurTache);
    expect((levee as ErreurTache).code).toBe("transcription");
    expect(lignes).toEqual([
      { evenement: "transcription en échec", niveau: "erreur", prestataire: "mistral", statut: 0, panne: "reseau", erreur: "TypeError", cause: "Error", codeCause: "UND_ERR_CONNECT_TIMEOUT" },
    ]);
    expect(brut).not.toContain("exemple.test");
  });

  it("une transcription refusée par le prestataire : son statut, le même champ qu’une panne (un nombre)", async () => {
    vi.stubGlobal("fetch", async () => new Response("quota", { status: 429 }));
    const fichier = new File([new Uint8Array(8)], "vocal.webm", { type: "audio/webm" });
    const { lignes } = await lignesDe(() => expect(transcrire({ duree: 2, fichier })).rejects.toBeInstanceOf(ErreurTache));
    expect(lignes).toEqual([{ evenement: "transcription en échec", niveau: "erreur", prestataire: "mistral", statut: 429 }]);
  });
});
