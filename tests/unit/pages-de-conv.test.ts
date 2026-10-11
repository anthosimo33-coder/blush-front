import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PageDeConv } from "@/components/shell/PageDeConv";
import { PoseConv } from "@/components/shell/PoseConv";
import type { Account } from "@/types/api";

/*
 * Les pages d’une conv (src/components/shell/PageDeConv.tsx) : chacune rend son écran dans <PageDeConv>, qui pose la conv
 * qu’elle montre. Une page qui l’oublierait enverrait ses gestes (supprimer, écrire à BLUSH, corriger sa fiche) vers la
 * conv du cookie, peut-être celle d’un autre onglet. Puis PageDeConv lui-même, rendu sans Next : le serveur est simulé.
 */

/* Ce que le serveur rend pour la page (pageDeConv, src/services/serveur.ts) */
const page = vi.hoisted(() => ({ id: null as string | null, compte: null as Account | null }));
vi.mock("@/services/serveur", () => ({ pageDeConv: async () => page }));

const RACINE = join(__dirname, "../..");
/* Les dossiers des pages d’une conv : l’accueil et sa fiche, le rapport, la lecture, « Mon compte » */
const DOSSIERS = ["src/app/app", "src/app/rapport", "src/app/lecture", "src/app/compte"];
/* « Tes convs » montre toutes les convs du compte, pas une seule : elle ne pose rien */
const HORS_CONV = ["src/app/app/convs/page.tsx"];

const pagesDe = (dossier: string) =>
  readdirSync(join(RACINE, dossier), { recursive: true, encoding: "utf8" })
    .filter((f) => f.split(sep).at(-1) === "page.tsx")
    .map((f) =>
      relative(RACINE, join(RACINE, dossier, f))
        .split(sep)
        .join("/"),
    );
const PAGES = DOSSIERS.flatMap(pagesDe).filter((p) => !HORS_CONV.includes(p));

describe("les pages d’une conv passent par PageDeConv", () => {
  it("les pages trouvées : au moins les huit connues (le test ne passe pas à vide)", () => {
    expect(PAGES).toEqual(
      expect.arrayContaining([
        "src/app/app/page.tsx",
        "src/app/app/fiche/page.tsx",
        "src/app/compte/page.tsx",
        "src/app/lecture/page.tsx",
        "src/app/rapport/(rapport)/page.tsx",
        "src/app/rapport/debloque/page.tsx",
        "src/app/rapport/question/page.tsx",
        "src/app/rapport/verdict/page.tsx",
      ]),
    );
  });

  it.each(PAGES)("%s rend son écran dans <PageDeConv>", (page) => {
    const source = readFileSync(join(RACINE, page), "utf8");
    expect(source).toContain(`import { PageDeConv } from "@/components/shell/PageDeConv";`);
    /* Le retour de la page est enveloppé : <PageDeConv> ouvre le JSX rendu, et le ferme */
    expect(source).toMatch(/return \(\n\s*<PageDeConv rendu=\{rendu\}>\n[\s\S]*\n\s*<\/PageDeConv>\n\s*\);\n\}\n?$/);
    /* Et c’est son seul JSX rendu : pas de `return <X />` plus tôt qui sauterait PageDeConv (redirect() n’en rend pas) */
    expect(source.match(/return\s*\(?\s*</g)).toHaveLength(1);
  });

  it.each(PAGES)("%s prend l’heure du rendu en tête, avant ses lectures", (page) => {
    const corps = readFileSync(join(RACINE, page), "utf8").split("export default async function Page")[1] ?? "";
    const heure = corps.indexOf("const rendu = heureDuRendu();");
    expect(heure).toBeGreaterThan(-1);
    /* Prise après une lecture, elle daterait le compte (et la donnée de l’écran) trop tard : sa fraîcheur partirait de là */
    expect(heure).toBeLessThan(corps.indexOf("await "));
  });

  it("personne d’autre ne pose la conv de la page à la main", () => {
    const fichiers = readdirSync(join(RACINE, "src"), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join("src", f).split(sep).join("/"));
    const poseurs = fichiers.filter((f) => /poserConvDeLaPage|<PoseConv\b/.test(readFileSync(join(RACINE, f), "utf8")));
    /* La session (qui la garde), PoseConv (qui la pose), PageDeConv (qui le rend). Lire le compte de la page n’en est pas */
    expect(poseurs.sort()).toEqual(["src/components/shell/PageDeConv.tsx", "src/components/shell/PoseConv.tsx", "src/services/session.ts"]);
  });
});

describe("PageDeConv", () => {
  it("pose la conv de la requête et le compte rendu, l’heure du rendu, puis rend son écran", async () => {
    const compte: Account = {
      email: "lea@blush.test",
      subscription: { plan: "rapport", priceLabel: "", renewLabel: "", stopLabel: "", active: true, paused: false },
      storyDeleted: false,
    };
    Object.assign(page, { id: "conv-a", compte });
    /* L’heure du rendu vient de la page (prise avant ses lectures) : PageDeConv la passe telle quelle */
    const rendu = (await PageDeConv({ rendu: 1234, children: "l’écran" })) as ReactElement<{ id: string | null; compte: Account | null; rendu: number; children: string }>;
    expect(isValidElement(rendu)).toBe(true);
    expect(rendu.type).toBe(PoseConv);
    expect(rendu.props).toMatchObject({ id: "conv-a", compte, rendu: 1234, children: "l’écran" });
  });

  it("sans conv ni compte : rien à poser, l’écran est rendu quand même", async () => {
    Object.assign(page, { id: null, compte: null });
    const rendu = (await PageDeConv({ rendu: 1234, children: "l’écran" })) as ReactElement<{ id: string | null; compte: Account | null }>;
    expect(rendu.props).toMatchObject({ id: null, compte: null, children: "l’écran" });
  });
});
