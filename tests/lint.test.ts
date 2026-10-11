import { ESLint } from "eslint";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Les règles d’eslint.config.mjs propres à BLUSH, essayées sur des sources écrites ici : un glob renommé, des blocs
 * réordonnés ou une règle redonnée plus bas les couperaient sans bruit, et `eslint .` resterait vert. Chaque source est
 * lue comme si elle était à ce chemin ; un fichier du serveur doit exister, car ses règles lisent les types du projet.
 */
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: join(__dirname, "..") });
});

/** Les règles qu’une source enfreint à ce chemin. */
async function regles(chemin: string, source: string) {
  const [resultat] = await eslint.lintText(source, { filePath: join(__dirname, "..", chemin) });
  return resultat.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe("les règles du lint", { timeout: 60_000 }, () => {
  it("le navigateur ne lit pas le serveur : par l’alias, en chemin relatif ou par import(), d’un écran ou de tout composant", async () => {
    expect(await regles("src/components/ui/Essai.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    /* Même un composant serveur de la coque (PageDeConv) : il passe par src/services/serveur.ts */
    expect(await regles("src/components/shell/PageDeConv.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/app/rapport/Essai.tsx", `"use client";\nimport { rapportDe } from "../../server/donnees";\nexport const x = rapportDe;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/lib/essai.ts", `export const x = () => import("@/server/db");\n`)).toEqual(["no-restricted-syntax"]);
  });

  it("un `import type` du serveur, une page, serveur.ts et next/server passent", async () => {
    expect(await regles("src/app/admin/Essai.tsx", `import type { Stats } from "@/server/stats";\nexport type S = Stats;\n`)).toEqual([]);
    expect(await regles("src/services/serveur.ts", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual([]);
    expect(await regles("src/app/rapport/page.tsx", `import { rapportDe } from "@/server/donnees";\nexport const x = rapportDe;\n`)).toEqual([]);
    expect(await regles("src/lib/essai.ts", `import { NextResponse } from "next/server";\nexport const x = NextResponse;\n`)).toEqual([]);
  });

  it("le serveur ne passe pas par la couche du navigateur (sauf ses types)", async () => {
    expect(await regles("src/server/stats.ts", `import { getReport } from "@/services/api";\nexport const x = getReport;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import { readJourney } from "../state/journey";\nexport const x = readJourney;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import type { ReportPayload } from "@/services/api";\nexport type R = ReportPayload;\n`)).toEqual([]);
  });

  it("process.env seulement dans env.ts et drapeaux.ts, sauf NODE_ENV ; libre hors de src", async () => {
    for (const chemin of ["src/app/rapport/page.tsx", "src/server/stats.ts", "src/proxy.ts", "src/components/ui/Essai.tsx"]) {
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
    expect(await regles("src/app/rapport/page.tsx", `import * as c from "../../server/chiffrement";\nexport const x = c;\n`)).toEqual(["no-restricted-imports"]);
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
    for (const chemin of ["src/app/api/rapport/route.ts", "src/app/ouvrir/[id]/route.ts", "src/app/rapport/page.tsx", "src/app/apercu/page.tsx"]) {
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
    for (const chemin of ["src/app/api/rapport/route.ts", "src/app/ouvrir/[id]/route.ts", "src/app/rapport/page.tsx", "src/app/rapport/Essai.tsx"]) {
      expect(await regles(chemin, `export const x = async () => (await import("@/server/db")).db;\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `export const x = () => import("drizzle-orm");\n`), chemin).toEqual(["no-restricted-syntax"]);
    }
    expect(await regles("src/app/api/rapport/route.ts", `export const x = () => import("../../../server/db/schema");\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("src/server/stats.ts", `export const x = () => import("drizzle-orm");\n`)).toEqual([]);
    expect(await regles("src/app/api/rapport/route.ts", `export const x = () => import("@/server/depot");\n`)).toEqual([]);
  });

  it("hors du serveur, le contrat (src/types/api.ts) ne s’importe qu’en `import type` : ni ses schémas, ni par import()", async () => {
    for (const chemin of ["src/app/rapport/Essai.tsx", "src/app/rapport/page.tsx", "src/services/api.ts", "src/lib/essai.ts", "src/components/ui/Essai.tsx"]) {
      expect(await regles(chemin, `import { ROUTES } from "@/types/api";\nexport const x = ROUTES;\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `export { ROUTES } from "@/types/api";\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `import "@/types/api";\n`), chemin).toEqual(["@typescript-eslint/no-restricted-imports"]);
      expect(await regles(chemin, `export const x = () => import("@/types/api");\n`), chemin).toEqual(["no-restricted-syntax"]);
      expect(await regles(chemin, `import type { Routes } from "@/types/api";\nexport type R = Routes;\n`), chemin).toEqual([]);
      expect(await regles(chemin, `import { type Routes, type CibleImage } from "@/types/api";\nexport type R = [Routes, CibleImage];\n`), chemin).toEqual([]);
    }
    expect(await regles("src/app/rapport/Essai.tsx", `import { ROUTES } from "../../types/api";\nexport const x = ROUTES;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    /* Le serveur et les routes lisent ses schémas */
    for (const chemin of ["src/server/stats.ts", "src/app/api/rapport/route.ts"]) {
      expect(await regles(chemin, `import { ROUTES } from "@/types/api";\nexport const x = ROUTES;\n`), chemin).toEqual([]);
    }
  });

  it("ni `as CSSProperties`, ni l’appli dans le sous-module des prompts", async () => {
    expect(await regles("src/components/ui/Essai.tsx", `import type { CSSProperties } from "react";\nexport const s = { color: "red" } as CSSProperties;\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("prompts/lib/essai.ts", `import { NBSP } from "@/lib/format";\nexport const x = NBSP;\n`)).toEqual(["no-restricted-imports"]);
  });
});
