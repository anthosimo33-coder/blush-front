import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

/*
 * Les fichiers des tests, sans base : les convs des évals telles que les envoie le navigateur, et le paquet qu’il
 * prépare, relu. Les deux projets de vitest.config.mts peuvent s’en servir (tests/aide/fixtures.ts, lui, ouvre la base).
 * Les convs des évals sont dans le sous-module privé (prompts/evals/convs) : un test les lit, il ne les recopie jamais.
 */

const CONVS = "prompts/evals/convs";

/** Le texte d’une conv des évals. */
export const texteDeConv = (nom: string) => readFileSync(`${CONVS}/${nom}`, "utf8");

/** Une conv des évals en fichier, octet pour octet, comme l’envoie le navigateur (un export WhatsApp en .txt). */
export const convDeTest = (nom: string) => new File([readFileSync(`${CONVS}/${nom}`)], nom, { type: "text/plain" });

/* Le paquet de src/services/preparer-export.ts, vérifié comme le relit le serveur (Paquet, src/server/histoires.ts) */
const Paquet = z.object({ nom: z.string(), parties: z.array(z.object({ nom: z.string(), contenu: z.string() })), coupe: z.boolean().optional() });

/** Le paquet préparé par le navigateur (du JSON compressé), relu et vérifié : ses fichiers, et s’il a été coupé. */
export const lirePaquet = async (paquet: Blob) => Paquet.parse(JSON.parse(gunzipSync(Buffer.from(await paquet.arrayBuffer())).toString("utf8")));
