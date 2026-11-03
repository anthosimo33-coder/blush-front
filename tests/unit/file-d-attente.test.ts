import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { etatDeLaFile, prendrePlace } from "../../scripts/file-d-attente.mjs";

/*
 * La file d’attente des suites lourdes (scripts/file-d-attente.mjs) : une place à la fois, le premier arrivé servi le
 * premier, les places et les tickets d’un processus mort repris, et la commande qui rend sa place et son code de sortie.
 * Chaque test a son propre dossier de file, jamais celui du poste.
 */
const SCRIPT = fileURLToPath(new URL("../../scripts/file-d-attente.mjs", import.meta.url));
const dossierNeuf = () => mkdtempSync(join(tmpdir(), "file-d-attente-"));
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le numéro d’un processus qui a déjà fini : sa place, s’il en laisse une, est à reprendre. */
function pidMort(): number {
  const fini = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(fini.stdout);
}

describe("la file d’attente des suites lourdes", () => {
  it("une seule place : la deuxième suite attend que la première rende la sienne", { timeout: 20_000 }, async () => {
    const dossier = dossierNeuf();
    const rendreA = await prendrePlace({ dossier, quoi: "A" });
    let bServie = false;
    const b = prendrePlace({ dossier, quoi: "B" }).then((rendre) => {
      bServie = true;
      return rendre;
    });
    await attendre(2500);
    expect(bServie).toBe(false);
    expect(etatDeLaFile({ dossier })).toMatchObject({ places: [{ quoi: "A" }], tickets: [{ quoi: "B" }] });
    rendreA();
    const rendreB = await b;
    expect(etatDeLaFile({ dossier }).places.map((p) => p.quoi)).toEqual(["B"]);
    rendreB();
    expect(readdirSync(dossier)).toEqual([]);
  });

  it("premier arrivé, premier servi : B, arrivée avant C, passe avant elle", { timeout: 20_000 }, async () => {
    const dossier = dossierNeuf();
    const rendreA = await prendrePlace({ dossier, quoi: "A" });
    const ordre: string[] = [];
    const b = prendrePlace({ dossier, quoi: "B" }).then((r) => (ordre.push("B"), r));
    await attendre(20);
    const c = prendrePlace({ dossier, quoi: "C" }).then((r) => (ordre.push("C"), r));
    await attendre(1500);
    rendreA();
    const rendreB = await b;
    await attendre(2500);
    expect(ordre).toEqual(["B"]);
    rendreB();
    (await c)();
    expect(ordre).toEqual(["B", "C"]);
  });

  it("deux places (BLUSH_FILE_PLACES=2) : deux suites tournent ensemble", { timeout: 10_000 }, async () => {
    const dossier = dossierNeuf();
    const [rendreA, rendreB] = await Promise.all([prendrePlace({ dossier, places: 2, quoi: "A" }), prendrePlace({ dossier, places: 2, quoi: "B" })]);
    expect(etatDeLaFile({ dossier }).places).toHaveLength(2);
    rendreA();
    rendreB();
  });

  it("une place ou un ticket laissés par un processus mort (Ctrl-C brutal, poste redémarré) ne bloquent pas la file", { timeout: 10_000 }, async () => {
    const dossier = dossierNeuf();
    const mort = pidMort();
    writeFileSync(join(dossier, "place-0"), JSON.stringify({ pid: mort, depuis: Date.now(), quoi: "npm run e2e", ou: "/ailleurs" }));
    writeFileSync(join(dossier, `ticket-1-${mort}`), JSON.stringify({ pid: mort, depuis: 1, quoi: "npm run check", ou: "/ailleurs" }));
    const rendre = await prendrePlace({ dossier, quoi: "moi" });
    expect(etatDeLaFile({ dossier })).toMatchObject({ places: [{ quoi: "moi", pid: process.pid }], tickets: [] });
    rendre();
  });

  it("la commande : elle tourne avec sa place, sort avec son propre code et rend la place ; une suite lancée de l’intérieur n’attend pas", { timeout: 20_000 }, async () => {
    const dossier = dossierNeuf();
    const env = { ...process.env, BLUSH_FILE_DOSSIER: dossier, BLUSH_SANS_FILE: "", CI: "", BLUSH_FILE_TENUE: "" };
    const code = `const { readdirSync } = require("node:fs"); process.stdout.write(JSON.stringify({ places: readdirSync(${JSON.stringify(dossier)}).filter((n) => n.startsWith("place-")).length, tenue: process.env.BLUSH_FILE_TENUE })); process.exit(3);`;
    const fini = await new Promise<{ code: number | null; sortie: string }>((resolve) => {
      const enfant = spawn(process.execPath, [SCRIPT, "--", process.execPath, "-e", code], { env });
      let sortie = "";
      enfant.stdout.on("data", (d) => (sortie += d));
      enfant.on("exit", (c) => resolve({ code: c, sortie }));
    });
    expect(fini.code).toBe(3);
    expect(JSON.parse(fini.sortie)).toEqual({ places: 1, tenue: "1" });
    expect(readdirSync(dossier)).toEqual([]);
  });

  it("sans file : BLUSH_SANS_FILE=1 et la CI passent même quand la place est prise", { timeout: 10_000 }, async () => {
    const dossier = dossierNeuf();
    const rendre = await prendrePlace({ dossier, quoi: "une longue suite" });
    for (const reglage of [{ BLUSH_SANS_FILE: "1" }, { CI: "true" }]) {
      const fini = spawnSync(process.execPath, [SCRIPT, "--", process.execPath, "-e", "process.exit(0)"], {
        env: { ...process.env, BLUSH_FILE_DOSSIER: dossier, BLUSH_FILE_TENUE: "", BLUSH_SANS_FILE: "", CI: "", ...reglage },
        timeout: 5000,
      });
      expect(fini.status).toBe(0);
    }
    rendre();
  });
});
