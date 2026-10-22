import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarteTemoignage, enCitation } from "@/components/temoignages/CarteTemoignage";
import { AVIS_DU_HAUT, TEMOIGNAGES, TESTIMONIALS } from "@/contenu/landing";

describe("les témoignages (la maquette A1)", () => {
  it("leur phrase en grand et le passage surligné sont des morceaux de leur avis, mot pour mot", () => {
    expect(TESTIMONIALS.length).toBeGreaterThan(0);
    for (const t of TESTIMONIALS) {
      expect(t.text, `${t.name} : sa phrase en grand`).toContain(t.citation);
      expect(t.text, `${t.name} : son passage surligné`).toContain(t.surligne);
    }
  });

  it("sur le paywall, l’avis mis en premier selon le titre du haut est un vrai avis de la liste", () => {
    for (const [genre, nom] of Object.entries(AVIS_DU_HAUT))
      expect(
        TESTIMONIALS.map((t) => t.name),
        `${genre} : ${nom}`,
      ).toContain(nom);
  });

  it("la phrase en grand : une majuscule, un point au bout s’il manque, entre guillemets", () => {
    expect(enCitation("aujourd’hui on est ensemble.")).toBe("«\u00a0Aujourd’hui on est ensemble.\u00a0»");
    expect(enCitation("Ça m’a fait mal de le voir noir sur blanc")).toBe("«\u00a0Ça m’a fait mal de le voir noir sur blanc.\u00a0»");
    expect(enCitation("tu l’as vu\u00a0?")).toBe("«\u00a0Tu l’as vu\u00a0?\u00a0»");
  });

  it("la carte : ce que BLUSH a vu, la phrase, l’avis entier avec son passage surligné, son prénom et sa situation", () => {
    const t = TESTIMONIALS[0]!;
    const { container } = render(<CarteTemoignage t={t} />);
    expect(screen.getByText(TEMOIGNAGES.aVu)).toBeTruthy();
    expect(screen.getByText(t.vu)).toBeTruthy();
    /* Telle quelle, insécables comprises (sans la normalisation des espaces de getByText) */
    expect(screen.getByText(enCitation(t.citation), { normalizer: (texte) => texte })).toBeTruthy();
    expect(container.querySelector("blockquote")?.textContent).toBe(t.text);
    expect(container.querySelector("mark")?.textContent).toBe(t.surligne);
    expect(screen.getByText(t.name)).toBeTruthy();
    expect(screen.getByText(t.label)).toBeTruthy();
  });

  it("un passage introuvable : l’avis reste tel quel, sans rien de surligné", () => {
    const t = { ...TESTIMONIALS[0]!, surligne: "une phrase qu’elle n’a pas écrite" };
    const { container } = render(<CarteTemoignage t={t} />);
    expect(container.querySelector("blockquote")?.textContent).toBe(t.text);
    expect(container.querySelector("mark")).toBeNull();
  });

  it("sa photo dans le rond quand il l’a donnée (un fichier de public/avis/), son initiale sinon", () => {
    for (const t of TESTIMONIALS.filter((t) => t.photo)) {
      expect(t.photo, `${t.name} : sa photo`).toMatch(/^\/avis\/[a-z-]+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", t.photo!)), `${t.name} : ${t.photo} existe`).toBe(true);
    }
    const t = { ...TESTIMONIALS[0]!, photo: "/avis/mattheo.webp" };
    const avec = render(<CarteTemoignage t={t} />);
    expect(avec.container.querySelector("figcaption img")?.getAttribute("src")).toBe("/avis/mattheo.webp");
    avec.unmount();
    const sans = render(<CarteTemoignage t={{ ...t, photo: undefined }} />);
    expect(sans.container.querySelector("figcaption img")).toBeNull();
    expect(sans.container.querySelector("figcaption")?.textContent).toContain(t.name.charAt(0));
  });
});
