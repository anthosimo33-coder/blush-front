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
    expect(await regles("src/app/rapport/Essai.tsx", `"use client";\nimport { db } from "../../server/db";\nexport const x = db;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/lib/essai.ts", `export const x = () => import("@/server/db");\n`)).toEqual(["no-restricted-syntax"]);
  });

  it("un `import type` du serveur, une page, ConvDeLaPage et next/server passent", async () => {
    expect(await regles("src/app/admin/Essai.tsx", `import type { Stats } from "@/server/stats";\nexport type S = Stats;\n`)).toEqual([]);
    expect(await regles("src/components/shell/ConvDeLaPage.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual([]);
    expect(await regles("src/app/rapport/page.tsx", `import { db } from "@/server/db";\nexport const x = db;\n`)).toEqual([]);
    expect(await regles("src/lib/essai.ts", `import { NextResponse } from "next/server";\nexport const x = NextResponse;\n`)).toEqual([]);
  });

  it("le serveur ne passe pas par la couche du navigateur (sauf ses types)", async () => {
    expect(await regles("src/server/stats.ts", `import { getReport } from "@/services/api";\nexport const x = getReport;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import { readJourney } from "../state/journey";\nexport const x = readJourney;\n`)).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(await regles("src/server/stats.ts", `import type { ReportPayload } from "@/services/api";\nexport type R = ReportPayload;\n`)).toEqual([]);
  });

  it("ni `as CSSProperties`, ni l’appli dans le sous-module des prompts", async () => {
    expect(await regles("src/components/ui/Essai.tsx", `import type { CSSProperties } from "react";\nexport const s = { color: "red" } as CSSProperties;\n`)).toEqual(["no-restricted-syntax"]);
    expect(await regles("prompts/lib/essai.ts", `import { NBSP } from "@/lib/format";\nexport const x = NBSP;\n`)).toEqual(["no-restricted-imports"]);
  });
});
