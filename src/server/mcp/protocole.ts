/*
 * Le protocole MCP (Model Context Protocol), en module pur : sans base ni réseau, testé seul
 * (tests/unit/mcp-protocole.test.ts). La route (src/app/api/mcp) ne fait que lui passer le message reçu et les outils.
 * Repris de celui de Jarvia, qui marche avec Claude.
 *
 * Le transport « Streamable HTTP », sans état : chaque POST porte un message JSON-RPC, la réponse revient en JSON dans
 * le même échange. Ni flux SSE (GET répond 405) ni session : le serveur n’a rien à pousser de lui-même, ses outils
 * répondent sans notifier. La spécification autorise cette forme, et c’est celle qu’une fonction de Vercel sert sans
 * connexion longue. Un seul message par requête : les lots (tableaux) ont quitté le protocole en 2025-06-18.
 */

import type { ReponseRpc } from "@/types/api";

/** Les versions du protocole comprises, la plus récente d’abord. */
const VERSIONS_DU_PROTOCOLE = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** Les codes d’erreur de JSON-RPC 2.0. */
const RPC = { REQUETE_INVALIDE: -32600, METHODE_INCONNUE: -32601, PARAMETRES_INVALIDES: -32602 } as const;

/** Le morceau de JSON Schema dont se servent les outils, et le seul que valide validerArguments. */
export type SchemaDArgument =
  { type: "string"; description: string; enum?: readonly string[] } | { type: "integer"; description: string; enum?: readonly number[]; minimum?: number; maximum?: number };

/** Les arguments d’un outil : un objet, sans champ en plus. */
export type SchemaDesArguments = { type: "object"; properties: Record<string, SchemaDArgument>; required?: readonly string[]; additionalProperties: false };

/** Un outil, tel que tools/list le décrit. Tous lisent : aucun ne change rien (readOnlyHint, ajouté par tools/list). */
export type OutilMcp = { name: string; title: string; description: string; inputSchema: SchemaDesArguments };

/** Ce que rend un outil : du texte (du JSON, pour les chiffres) ; `isError` : un refus que le modèle lit et corrige. */
export type ResultatDOutil = { content: { type: "text"; text: string }[]; isError?: true };

/** Le serveur, déjà résolu pour la personne connectée : son nom, ses consignes, ses outils. */
export type ServeurMcp = {
  info: { name: string; version: string };
  instructions: string;
  outils: readonly OutilMcp[];
  appeler(nom: string, args: Record<string, unknown>): Promise<ResultatDOutil>;
};

type IdRpc = ReponseRpc["id"];

/** Un refus d’outil : son message va tel quel au modèle (un argument hors des bornes, une période inconnue). */
export class ErreurDOutil extends Error {}

export const resultatTexte = (texte: string, erreur = false): ResultatDOutil =>
  erreur ? { content: [{ type: "text", text: texte }], isError: true } : { content: [{ type: "text", text: texte }] };

/**
 * Rend leur type aux entiers venus en texte (« 7 ») : un connecteur garde parfois en cache un schéma d’outil périmé, et
 * envoie alors en texte un argument qu’il ne connaît pas (vu chez Jarvia). Seuls les textes sans ambiguïté changent ; le
 * reste passe tel quel à validerArguments, qui le refuse.
 */
export function corrigerLesTypes(schema: SchemaDesArguments, args: Record<string, unknown>): Record<string, unknown> {
  const corriges: Record<string, unknown> = { ...args };
  for (const [nom, valeur] of Object.entries(args)) {
    if (schema.properties[nom]?.type === "integer" && typeof valeur === "string" && /^-?\d+$/.test(valeur.trim())) corriges[nom] = Number(valeur.trim());
  }
  return corriges;
}

/** Les arguments suivent-ils le schéma de l’outil ? Le premier problème, lisible par le modèle (qui corrige son appel), ou null. */
export function validerArguments(schema: SchemaDesArguments, args: Record<string, unknown>): string | null {
  for (const cle of schema.required ?? []) if (args[cle] === undefined || args[cle] === null) return `Argument requis manquant : « ${cle} ».`;
  for (const [nom, valeur] of Object.entries(args)) {
    const def = schema.properties[nom];
    if (!def) return `Argument inconnu : « ${nom} ». Arguments possibles : ${Object.keys(schema.properties).join(", ") || "aucun"}.`;
    if (valeur === undefined || valeur === null) continue;
    if (def.type === "string") {
      if (typeof valeur !== "string") return `« ${nom} » doit être du texte.`;
      if (def.enum && !def.enum.includes(valeur)) return `« ${nom} » doit valoir : ${def.enum.join(", ")}.`;
    } else {
      if (typeof valeur !== "number" || !Number.isInteger(valeur)) return `« ${nom} » doit être un nombre entier.`;
      if (def.enum && !def.enum.includes(valeur)) return `« ${nom} » doit valoir : ${def.enum.join(", ")}.`;
      if (def.minimum !== undefined && valeur < def.minimum) return `« ${nom} » doit être ≥ ${def.minimum}.`;
      if (def.maximum !== undefined && valeur > def.maximum) return `« ${nom} » doit être ≤ ${def.maximum}.`;
    }
  }
  return null;
}

const reponse = (id: IdRpc, result: unknown): ReponseRpc => ({ jsonrpc: "2.0", id, result });
const erreur = (id: IdRpc, code: number, message: string): ReponseRpc => ({ jsonrpc: "2.0", id, error: { code, message } });
const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Traite un message JSON-RPC. null : rien à répondre, une notification (sans `id` : initialized, cancelled…) ou la
 * réponse du client à une requête du serveur (il n’en fait pas). Une erreur levée par un outil devient un résultat en
 * erreur : un refus (ErreurDOutil) avec son message, le reste sans rien d’interne. `signaler` reçoit ce reste.
 */
export async function traiterMessage(serveur: ServeurMcp, msg: unknown, signaler: (e: unknown) => void = () => {}): Promise<ReponseRpc | null> {
  if (!estObjet(msg) || msg.jsonrpc !== "2.0") return erreur(null, RPC.REQUETE_INVALIDE, "Message JSON-RPC 2.0 attendu.");
  const id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  if (typeof msg.method !== "string") {
    /* Une réponse du client (result ou error, sans method) : rien à renvoyer */
    return msg.id !== undefined && ("result" in msg || "error" in msg) ? null : erreur(id, RPC.REQUETE_INVALIDE, "Champ « method » manquant.");
  }
  if (msg.id === undefined) return null;
  const params = estObjet(msg.params) ? msg.params : {};
  switch (msg.method) {
    case "initialize": {
      const version = VERSIONS_DU_PROTOCOLE.find((v) => v === params.protocolVersion) ?? VERSIONS_DU_PROTOCOLE[0];
      return reponse(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: serveur.info, instructions: serveur.instructions });
    }
    case "ping":
      return reponse(id, {});
    case "tools/list":
      /* Tous en lecture seule, et rien hors de BLUSH : Claude peut les appeler sans demander */
      return reponse(id, {
        tools: serveur.outils.map((o) => ({
          name: o.name,
          title: o.title,
          description: o.description,
          inputSchema: o.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const outil = serveur.outils.find((o) => o.name === params.name);
      if (!outil) return erreur(id, RPC.PARAMETRES_INVALIDES, `Outil inconnu : ${String(params.name)}.`);
      const args = corrigerLesTypes(outil.inputSchema, estObjet(params.arguments) ? params.arguments : {});
      /* Une erreur d’outil, pas de protocole : le modèle lit le message et corrige son appel */
      const invalide = validerArguments(outil.inputSchema, args);
      if (invalide) return reponse(id, resultatTexte(invalide, true));
      try {
        return reponse(id, await serveur.appeler(outil.name, args));
      } catch (e) {
        if (e instanceof ErreurDOutil) return reponse(id, resultatTexte(e.message, true));
        signaler(e);
        return reponse(id, resultatTexte("Erreur interne de l’outil.", true));
      }
    }
  }
  return erreur(id, RPC.METHODE_INCONNUE, `Méthode non prise en charge : ${msg.method}.`);
}

/** Le jeton d’un en-tête `Authorization: Bearer …`, ou null. */
export function jetonPorteur(entete: string | null): string | null {
  return entete?.match(/^\s*Bearer\s+(\S+)\s*$/i)?.[1] ?? null;
}
