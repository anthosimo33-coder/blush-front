import { ESLint } from "eslint";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Les règles d’eslint.config.mjs propres à BLUSH, essayées sur des sources écrites ici : un glob renommé, des blocs
 * réordonnés ou une règle redonnée plus bas les couperaient sans bruit, et `eslint .` resterait vert. Chaque source est
 * lue comme si elle était à ce chemin. Un chemin de src doit être celui d’un fichier qui existe : les règles des promesses
 * y lisent les types du projet, et un fichier inconnu de tsconfig ne se lirait pas (regles le refuse en le disant).
 */
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: join(__dirname, "..") });
});

/** Les règles qu’une source enfreint à ce chemin. */
async function regles(chemin: string, source: string) {
  if (chemin.startsWith("src/") && !existsSync(join(__dirname, "..", chemin))) throw new Error(`${chemin} n’existe pas : prendre un fichier de src qui existe`);
  const resultat = (await eslint.lintText(source, { filePath: join(__dirname, "..", chemin) }))[0]!;
  return resultat.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe("les règles du lint", { timeout: 60_000 }, () => {
  it("le navigateur ne lit pas le serveur : par l’alias, en chemin relatif ou par import(), d’un écran ou de tout composant", async () => {
    expect(await regles("src/components/ui/Button.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    /* Même un composant serveur de la coque (PageDeConv) : il passe par src/services/serveur.ts */
    expect(await regles("src/components/shell/PageDeConv.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/app/rapport/Partage.tsx", `"use client";\nimport { rapportDe } from "../../server/donnees";\nexport const x = rapportDe;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/lib/format.ts", `export const x = () => import("@/server/db");\n`)).toEqual(["no-restricted-syntax"]);
  });

  it("un `import type` du serveur, une page, serveur.ts et next/server passent", async () => {
    expect(await regles("src/app/admin/AdminScreen.tsx", `import type { Stats } from "@/server/stats";\nexport type S = Stats;\n`)).toEqual([]);
    expect(await regles("src/services/serveur.ts", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual([]);
    expect(await regles("src/app/rapport/(rapport)/page.tsx", `import { rapportDe } from "@/server/donnees";\nexport const x = rapportDe;\n`)).toEqual([]);
    expect(await regles("src/lib/format.ts", `import { NextResponse } from "next/server";\nexport const x = NextResponse;\n`)).toEqual([]);
  });

  it("le serveur ne passe pas par la couche du navigateur (sauf ses types)", async () => {
    expect(await regles("src/server/stats.ts", `import { getReport } from "@/services/api";\nexport const x = getReport;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import { readJourney } from "../state/journey";\nexport const x = readJourney;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import type { SuiviChat } from "@/services/api";\nexport type R = SuiviChat;\n`)).toEqual([]);
  });

  it("process.env seulement dans env.ts et drapeaux.ts, sauf NODE_ENV ; libre hors de src", async () => {
    for (const chemin of ["src/app/rapport/(rapport)/page.tsx", "src/server/stats.ts", "src/proxy.ts", "src/components/ui/Button.tsx"]) {
      expect(await regles(chemin, `export const x = process.env.BLUSH_URL;\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `export const x = { ...process.env };\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `export const x = process.env.NODE_ENV === "production";\n`), chemin).toEqual([]);
    }
    expect(await regles("src/server/stats.ts", `export const { VERCEL } = process.env;\n`)).toEqual(["no-restricted-syntax"]);
    for (const chemin of ["src/server/env.ts", "src/server/drapeaux.ts", "scripts/essai.mjs", "tests/essai.test.ts", "next.config.ts"]) {
      expect(await regles(chemin, `export const x = process.env.BLUSH_URL;\n`), chemin).toEqual([]);
    }
  });

  it("chiffrer et déchiffrer seulement par le coffre : par l’alias, en chemin relatif ou d’un coup (`* as`)", async () => {
    expect(await regles("src/server/stats.ts", `import { dechiffrer } from "./chiffrement";\nexport const x = dechiffrer;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/server/ia/voix.ts", `import { chiffrerOctets } from "../chiffrement";\nexport const x = chiffrerOctets;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/api/rapport/route.ts", `import { chiffrer } from "@/server/chiffrement";\nexport const x = chiffrer;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/rapport/(rapport)/page.tsx", `import * as c from "../../server/chiffrement";\nexport const x = c;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/apercu/page.tsx", `import { dechiffrerOctets } from "@/server/chiffrement";\nexport const x = dechiffrerOctets;\n`)).toEqual(["no-restricted-imports"]);
    /* Ajoutés à chiffrement.ts plus tard : seuls ses empreintes et ses jetons sont permis hors du coffre */
    expect(await regles("src/server/stats.ts", `import { dechiffrerSansForme } from "./chiffrement";\nexport const x = dechiffrerSansForme;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `export { dechiffrer } from "./chiffrement";\n`)).toEqual(["no-restricted-imports"]);
  });

  it("ni par un import() dynamique de chiffrement.ts, même pour une empreinte", async () => {
    expect(await regles("src/server/stats.ts", `export const x = async () => (await import("./chiffrement")).dechiffrer;\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("src/app/api/rapport/route.ts", `export const x = () => import("@/server/chiffrement");\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("src/server/env.ts", `export const x = () => import("./chiffrement").then((c) => c.empreinte);\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("src/server/stats.ts", `export const x = () => import("./chiffres");\n`)).toEqual([]);
  });

  it("le coffre chiffre, et lui seul ; les empreintes et les jetons restent libres", async () => {
    expect(await regles("src/server/coffre.ts", `import { chiffrer, dechiffrer } from "./chiffrement";\nexport const x = [chiffrer, dechiffrer];\n`)).toEqual([]);
    expect(await regles("src/server/stats.ts", `import { empreinte, jeton } from "./chiffrement";\nexport const x = [empreinte, jeton];\n`)).toEqual([]);
    expect(await regles("src/server/auth.ts", `import { empreinte, jeton, memeEmpreinte } from "./chiffrement";\nexport const x = [empreinte, jeton, memeEmpreinte];\n`)).toEqual([]);
    /* Les trois dernières routes qui déchiffraient elles-mêmes passent par le dépôt : plus aucune exception */
    expect(await regles("src/app/api/fiche/route.ts", `import { dechiffrer } from "@/server/chiffrement";\nexport const x = dechiffrer;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/api/partage/image/route.ts", `import { dechiffrer } from "@/server/chiffrement";\nexport const x = dechiffrer;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/api/vocal/chat/[id]/route.ts", `import { dechiffrerOctets } from "@/server/chiffrement";\nexport const x = dechiffrerOctets;\n`)).toEqual(["no-restricted-imports"]);
    for (const chemin of ["src/server/attente.ts", "src/server/ajouts.ts", "src/app/api/vocal/audio/route.ts"]) {
      expect(await regles(chemin, `import { chiffrer } from "./chiffrement";\nexport const x = chiffrer;\n`), chemin).toEqual(["no-restricted-imports"]);
    }
    expect(await regles("src/server/coffre.ts", `import { x } from "@/mocks";\nexport const y = x;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/apercu/page.tsx", `import { x } from "@/mocks";\nexport const y = x;\n`)).toEqual([]);
  });

  it("ni la base ni drizzle-orm dans src/app : les routes et les pages passent par src/server", async () => {
    for (const chemin of ["src/app/api/rapport/route.ts", "src/app/ouvrir/[id]/route.ts", "src/app/rapport/(rapport)/page.tsx", "src/app/apercu/page.tsx"]) {
      expect(await regles(chemin, `import { db } from "@/server/db";\nexport const x = db;\n`), chemin).toEqual(["no-restricted-imports"]);
      expect(await regles(chemin, `import { eq } from "drizzle-orm";\nexport const x = eq;\n`), chemin).toEqual(["no-restricted-imports"]);
      expect(await regles(chemin, `import { pgTable } from "drizzle-orm/pg-core";\nexport const x = pgTable;\n`), chemin).toEqual(["no-restricted-imports"]);
    }
    expect(await regles("src/app/api/rapport/route.ts", `import { schema } from "../../../server/db";\nexport const x = schema;\n`)).toEqual(["no-restricted-imports"]);
    expect(await regles("src/app/api/rapport/route.ts", `import { users } from "@/server/db/schema";\nexport const x = users;\n`)).toEqual(["no-restricted-imports"]);
    /* Le serveur, lui, lit la base ; une route garde ses autres modules (le dépôt, les données des écrans) */
    expect(await regles("src/server/depot.ts", `import { eq } from "drizzle-orm";\nimport { db } from "./db";\nexport const x = [eq, db];\n`)).toEqual([]);
    expect(await regles("src/app/api/rapport/route.ts", `import { ligneRapport } from "@/server/depot";\nexport const x = ligneRapport;\n`)).toEqual([]);
    expect(await regles("src/app/api/rapport/route.ts", `import { dbg } from "@/server/dbg";\nexport const x = dbg;\n`)).toEqual([]);
  });

  it("ni par un import() dynamique de la base ou de drizzle-orm dans src/app ; le serveur, si", async () => {
    for (const chemin of ["src/app/api/rapport/route.ts", "src/app/ouvrir/[id]/route.ts", "src/app/rapport/(rapport)/page.tsx", "src/app/rapport/Partage.tsx"]) {
      expect(await regles(chemin, `export const x = async () => (await import("@/server/db")).db;\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `export const x = () => import("drizzle-orm");\n`), chemin).toEqual(["no-restricted-syntax"]);
    }
    expect(await regles("src/app/api/rapport/route.ts", `export const x = () => import("../../../server/db/schema");\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("src/server/stats.ts", `export const x = () => import("drizzle-orm");\n`)).toEqual([]);
    expect(await regles("src/app/api/rapport/route.ts", `export const x = () => import("@/server/depot");\n`)).toEqual([]);
  });

  it("hors du serveur, le contrat (src/types/api.ts) ne s’importe qu’en `import type` : ni ses schémas, ni par import()", async () => {
    for (const chemin of ["src/app/rapport/Partage.tsx", "src/app/rapport/(rapport)/page.tsx", "src/services/api.ts", "src/lib/format.ts", "src/components/ui/Button.tsx"]) {
      expect(await regles(chemin, `import { ROUTES } from "@/types/api";\nexport const x = ROUTES;\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `export { ROUTES } from "@/types/api";\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `import "@/types/api";\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `export const x = () => import("@/types/api");\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `import type { Routes } from "@/types/api";\nexport type R = Routes;\n`), chemin).toEqual([]);
      expect(await regles(chemin, `import { type Routes, type CibleImage } from "@/types/api";\nexport type R = [Routes, CibleImage];\n`), chemin).toEqual([]);
    }
    expect(await regles("src/app/rapport/Partage.tsx", `import { ROUTES } from "../../types/api";\nexport const x = ROUTES;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    /* Le serveur et les routes lisent ses schémas */
    for (const chemin of ["src/server/stats.ts", "src/app/api/rapport/route.ts"]) {
      expect(await regles(chemin, `import { ROUTES } from "@/types/api";\nexport const x = ROUTES;\n`), chemin).toEqual([]);
    }
  });

  it("pas de console dans src : le serveur écrit au journal, le navigateur par tracer ; les aperçus, scripts/ et tests/ restent libres", async () => {
    for (const chemin of ["src/server/stats.ts", "src/server/ia/voix.ts", "src/app/api/rapport/route.ts", "src/app/rapport/Partage.tsx", "src/components/ui/Button.tsx", "src/lib/format.ts", "src/proxy.ts"]) {
      expect(await regles(chemin, `export const f = () => console.log("x");\n`), chemin).toEqual(["no-console"]);
      expect(await regles(chemin, `export const f = () => console.error("x");\n`), chemin).toEqual(["no-console"]);
    }
    /* Le journal du serveur et la trace du navigateur sont les deux seuls à écrire dans la console */
    for (const chemin of ["src/server/journal.ts", "src/lib/tracer.ts", "src/app/apercu/page.tsx", "scripts/essai.mjs", "tests/essai.test.ts"]) {
      expect(await regles(chemin, `export const f = () => console.warn("x");\n`), chemin).toEqual([]);
    }
  });

  it("une valeur levée n’est jamais supposée Error : ni `as Error`, ni `<Error>e`, ni `.catch((e: Error) =>`, ni le rejet de `.then` ; nomErreur et journalErreur, si", async () => {
    for (const chemin of ["src/server/stats.ts", "src/server/env.ts", "src/app/api/rapport/route.ts", "src/app/rapport/Partage.tsx", "src/components/ui/Button.tsx"]) {
      expect(await regles(chemin, `export const f = (e: unknown) => (e as Error).name;\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `export const f = (p: Promise<void>) => p.catch((e: Error) => e.name);\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `import { nomErreur } from "@/lib/tracer";\nexport const f = (p: Promise<void>) => p.catch((e: unknown) => nomErreur(e));\n`), chemin).toEqual([]);
    }
    /* Les autres façons de le supposer : une sous-classe, un type de Node, une union, une intersection, `<Error>e`, le rejet de `.then` */
    for (const source of [
      "export const f = (e: unknown) => (e as TypeError).name;",
      "export const f = (e: unknown) => (e as NodeJS.ErrnoException).code;",
      "export const f = (e: unknown) => (e as Error | undefined)?.name;",
      "export const f = (e: unknown) => (e as Error & { code?: string }).code;",
      "export const f = (e: unknown) => (<Error>e).name;",
      "export const f = (p: Promise<void>) => p.then(() => 1, (e: Error) => e.name);",
      "export const f = (p: Promise<void>) => p.then(undefined, (e: Error) => e.name);",
    ]) {
      expect(await regles("src/server/stats.ts", `${source}\n`), source).toEqual(["no-restricted-syntax"]);
    }
    /* Une Error construite ici passe, comme une valeur résolue nommée ainsi (le premier argument de `.then`) */
    expect(await regles("src/server/stats.ts", `export const e: Error = new Error("x");\n`)).toEqual([]);
    expect(await regles("src/server/stats.ts", `export const f = (p: Promise<Error>) => p.then((e: Error) => e.name);\n`)).toEqual([]);
  });

  it("enLocal (le texte en clair, en local) ne s’importe que dans email.ts et alertes.ts ; le reste du journal, partout côté serveur", async () => {
    for (const [chemin, source] of <[string, string][]>[
      ["src/server/stats.ts", `import { enLocal } from "./journal";\nexport const f = (email: string) => enLocal(email);\n`],
      ["src/server/ia/voix.ts", `import { enLocal } from "../journal";\nexport const f = (email: string) => enLocal(email);\n`],
      ["src/app/api/rapport/route.ts", `import { enLocal } from "@/server/journal";\nexport const f = (email: string) => enLocal(email);\n`],
      ["src/app/rapport/(rapport)/page.tsx", `import { enLocal } from "@/server/journal";\nexport const f = (email: string) => enLocal(email);\n`],
    ]) {
      expect(await regles(chemin, source), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
    }
    for (const chemin of ["src/server/email.ts", "src/server/alertes.ts"]) {
      expect(await regles(chemin, `import { enLocal } from "./journal";\nexport const f = (sujet: string) => enLocal(sujet);\n`), chemin).toEqual([]);
    }
    expect(await regles("src/server/stats.ts", `import { journal } from "./journal";\nexport const f = () => journal("x");\n`)).toEqual([]);
    /* La liste du serveur reste en place dans email.ts et alertes.ts */
    expect(await regles("src/server/email.ts", `import { useJourney } from "@/state/journey";\nexport const x = useJourney;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
  });

  it("ni `as CSSProperties`, ni l’appli dans le sous-module des prompts", async () => {
    expect(await regles("src/components/ui/Button.tsx", `import type { CSSProperties } from "react";\nexport const s = { color: "red" } as CSSProperties;\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("prompts/lib/essai.ts", `import { NBSP } from "@/lib/format";\nexport const x = NBSP;\n`)).toEqual(["no-restricted-imports"]);
  });

  it("une promesse n’est jamais oubliée, ni passée là où rien ne l’attend : dans tout src, navigateur compris", async () => {
    for (const chemin of ["src/server/stats.ts", "src/app/api/rapport/route.ts", "src/lib/format.ts", "src/components/ui/Button.tsx", "src/app/rapport/Partage.tsx"]) {
      expect(await regles(chemin, `export function f(p: () => Promise<void>) {\n  p();\n}\n`), chemin).toEqual(["@typescript-eslint/no-floating-promises"]);
      expect(await regles(chemin, `export const f = (xs: number[], p: (x: number) => Promise<void>) => xs.forEach(p);\n`), chemin).toEqual(["@typescript-eslint/no-misused-promises"]);
      /* Attendue, ou laissée exprès (`void`) : elle passe */
      expect(await regles(chemin, `export async function f(p: () => Promise<void>) {\n  await p();\n  void p();\n}\n`), chemin).toEqual([]);
    }
    /* Une fonction async sur un attribut d’événement : React n’attend pas sa promesse */
    expect(await regles("src/app/rapport/Partage.tsx", `export const B = ({ f }: { f: () => Promise<void> }) => <button type="button" onClick={f} />;\n`)).toEqual(["@typescript-eslint/no-misused-promises"]);
  });

  it("une couleur qui a son token ne s’écrit pas en hex : classe, valeur arbitraire, gabarit ou texte JSX ; les dessins et marque.ts le peuvent", async () => {
    for (const [chemin, source] of <[string, string][]>[
      ["src/app/rapport/Partage.tsx", `export const c = "rounded-full bg-[#D9D6CF]";\n`],
      ["src/components/ui/Button.tsx", `export const c = "#d9d6cfcc";\n`],
      ["src/lib/format.ts", "export const c = (x: number) => `0 0 ${x}px #D9D6CF`;\n"],
      ["src/server/stats.ts", `export const c = { couleur: "#121214" };\n`],
      ["src/app/rapport/Partage.tsx", `export const T = () => <p>#121214</p>;\n`],
    ]) {
      expect(await regles(chemin, source), source).toEqual(["blush/couleur-en-jeton"]);
    }
    /* Un hex sans token (une marque, une maquette), un id (« #12C08A1 » n’est pas une couleur), la classe ou la variable du token */
    expect(await regles("src/app/rapport/Partage.tsx", `export const c = ["bg-[#E8358A]", "#12C08A1", "bg-disabled", "var(--ink)"];\n`)).toEqual([]);
    for (const chemin of ["src/server/marque.ts", "src/components/brand/objects3d.tsx", "src/app/app/accueil/mouvement/vol.ts", "src/app/app/accueil/mouvement/fete.ts"]) {
      expect(await regles(chemin, `export const c = "#121214";\n`), chemin).toEqual([]);
    }
  });

  it("les textes des prompts ne s’importent que dans claude.ts", async () => {
    for (const [chemin, source] of <[string, string][]>[
      ["src/server/stats.ts", `import { TEXTES } from "./ia/textes.generated";\nexport const t = TEXTES;\n`],
      ["src/server/ia/voix.ts", `import { TEXTES } from "./textes.generated";\nexport const t = TEXTES;\n`],
      ["src/app/api/rapport/route.ts", `import { TEXTES } from "@/server/ia/textes.generated";\nexport const t = TEXTES;\n`],
      ["src/app/apercu/page.tsx", `import { TEXTES } from "@/server/ia/textes.generated";\nexport const t = TEXTES;\n`],
      ["src/server/coffre.ts", `import { TEXTES } from "./ia/textes.generated";\nexport const t = TEXTES;\n`],
    ]) {
      expect(await regles(chemin, source), chemin).toEqual(["no-restricted-imports"]);
    }
    expect(await regles("src/server/ia/claude.ts", `import { TEXTES } from "./textes.generated";\nexport const t = TEXTES;\n`)).toEqual([]);
    /* Le reste de la liste tient dans claude.ts */
    expect(await regles("src/server/ia/claude.ts", `import { dechiffrer } from "../chiffrement";\nexport const x = dechiffrer;\n`)).toEqual(["no-restricted-imports"]);
  });
});
