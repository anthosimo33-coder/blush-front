import { describe, expect, it, vi } from "vitest";
import { ErreurDOutil, corrigerLesTypes, jetonPorteur, resultatTexte, traiterMessage, validerArguments, type ServeurMcp } from "@/server/mcp/protocole";

/*
 * Le protocole MCP, sans base ni réseau (src/server/mcp/protocole.ts) : l’initialisation, la liste des outils (tous en
 * lecture seule), leurs appels et leurs erreurs, les notifications. Les vrais outils, avec la base : tests/mcp.test.ts.
 */

const SCHEMA = { type: "object", properties: { jours: { type: "integer", enum: [1, 7, 30], description: "" } }, additionalProperties: false } as const;
const appeler = vi.fn(async (nom: string, args: Record<string, unknown>) => {
  if (nom === "refus") throw new ErreurDOutil("Pas comme ça.");
  if (nom === "panne") throw new Error("connexion à la base perdue : un email@blush.test");
  return resultatTexte(JSON.stringify(args));
});
const serveur: ServeurMcp = {
  info: { name: "blush", version: "1.0.0" },
  instructions: "Lis le pilotage.",
  outils: ["lire", "refus", "panne"].map((name) => ({ name, title: name, description: name, inputSchema: SCHEMA })),
  appeler,
};
const envoyer = (msg: unknown, signaler?: (e: unknown) => void) => traiterMessage(serveur, msg, signaler);

describe("le protocole", () => {
  it("initialize rend la version demandée si elle est connue, sinon la plus récente, et les consignes", async () => {
    expect(await envoyer({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: serveur.info, instructions: "Lis le pilotage." },
    });
    expect(
      ((await envoyer({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }))?.result as { protocolVersion: string }).protocolVersion,
    ).toBe("2025-06-18");
  });

  it("tools/list : chaque outil en lecture seule, sans rien hors de BLUSH", async () => {
    const r = (await envoyer({ jsonrpc: "2.0", id: "a", method: "tools/list" }))?.result as { tools: { annotations: unknown }[] };
    expect(r.tools).toHaveLength(3);
    for (const o of r.tools) expect(o.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  });

  it("une notification, ou une réponse du client, n’attend rien ; ping répond vide", async () => {
    expect(await envoyer({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await envoyer({ jsonrpc: "2.0", id: 9, result: {} })).toBeNull();
    expect(await envoyer({ jsonrpc: "2.0", id: 3, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
  });

  it("un message qui n’en est pas un, une méthode inconnue : des erreurs JSON-RPC", async () => {
    expect((await envoyer({ id: 1, method: "ping" }))?.error?.code).toBe(-32600);
    expect((await envoyer({ jsonrpc: "2.0", id: 1 }))?.error?.code).toBe(-32600);
    expect((await envoyer({ jsonrpc: "2.0", id: 1, method: "resources/list" }))?.error?.code).toBe(-32601);
    expect((await envoyer({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ecrire" } }))?.error?.code).toBe(-32602);
  });
});

describe("les appels d’outils", () => {
  const appel = (name: string, args?: unknown) => envoyer({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

  it("les arguments vérifiés passent à l’outil, un entier venu en texte retrouve son type", async () => {
    expect((await appel("lire", { jours: "30" }))?.result).toEqual(resultatTexte('{"jours":30}'));
    expect((await appel("lire"))?.result).toEqual(resultatTexte("{}"));
  });

  it("un argument faux est un résultat en erreur, que le modèle lit pour corriger son appel", async () => {
    expect((await appel("lire", { jours: 5 }))?.result).toEqual(resultatTexte("« jours » doit valoir : 1, 7, 30.", true));
    expect((await appel("lire", { semaines: 2 }))?.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("Argument inconnu") }] });
    expect((await appel("lire", { jours: 7.5 }))?.result).toMatchObject({ isError: true });
  });

  it("un refus d’outil se dit tel quel ; une panne, sans rien d’interne, et signalée", async () => {
    expect((await appel("refus"))?.result).toEqual(resultatTexte("Pas comme ça.", true));
    const signaler = vi.fn();
    const r = await envoyer({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "panne" } }, signaler);
    expect(r?.result).toEqual(resultatTexte("Erreur interne de l’outil.", true));
    expect(JSON.stringify(r)).not.toContain("email");
    expect(signaler).toHaveBeenCalledOnce();
  });
});

describe("les morceaux", () => {
  it("validerArguments : requis, texte, bornes", () => {
    const schema = {
      type: "object",
      properties: { nom: { type: "string", enum: ["a"], description: "" }, n: { type: "integer", minimum: 1, maximum: 3, description: "" } },
      required: ["nom"],
      additionalProperties: false,
    } as const;
    expect(validerArguments(schema, {})).toContain("requis");
    expect(validerArguments(schema, { nom: 1 })).toContain("du texte");
    expect(validerArguments(schema, { nom: "b" })).toContain("doit valoir");
    expect(validerArguments(schema, { nom: "a", n: 0 })).toContain("≥ 1");
    expect(validerArguments(schema, { nom: "a", n: 4 })).toContain("≤ 3");
    expect(validerArguments(schema, { nom: "a", n: null })).toBeNull();
    expect(corrigerLesTypes(schema, { nom: "7", n: " 2 " })).toEqual({ nom: "7", n: 2 });
  });

  it("le jeton porteur d’un en-tête Authorization", () => {
    expect(jetonPorteur("Bearer blat_abc")).toBe("blat_abc");
    expect(jetonPorteur("bearer  blat_abc ")).toBe("blat_abc");
    expect(jetonPorteur("Basic xyz")).toBeNull();
    expect(jetonPorteur(null)).toBeNull();
  });
});
